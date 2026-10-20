import { HttpStatus, Injectable } from '@nestjs/common';
import { AccionAuditoria, Prisma } from '@prisma/client';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../prisma/audit.service';
import { CicloCapturaPolicy } from '../actividades/domain/policies/ciclo-captura.policy';
import { GastoToleranciaPolicy } from './domain/policies/gasto-tolerancia.policy';
import { GastoActividadPolicy } from './domain/policies/gasto-actividad.policy';
import { GastoWindowValidator } from './domain/validators/gasto-window.validator';
import { GastoMapper, GastoConRelacionesDetalle } from './mappers/gasto.mapper';
import { GASTO_SELECTS } from './queries/gasto-selects.constant';
import { CreateGastoDto } from './dto/create-gasto.dto';
import { UpdateGastoDto } from './dto/update-gasto.dto';
import { FiltroGastoDto } from './dto/filtro-gasto.dto';
import { GastoResponseDto } from './dto/gasto-response.dto';
import { GastoDetalleResponseDto } from './dto/gasto-detalle-response.dto';
import { PaginatedResponseDto } from '../../common/dto/paginated-response.dto';
import { DomainError } from '../../common/errors/domain.error';
import { CodigoError } from '../../common/errors/codigos-error.enum';
import { FechaUtil } from '../../common/utils/fechas';
import { bloquearCicloParaCaptura } from '../../common/utils/ciclo-balance.util';

dayjs.extend(utc);

@Injectable()
export class GastosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly cyclePolicy: CicloCapturaPolicy,
    private readonly toleranciaPolicy: GastoToleranciaPolicy,
    private readonly actividadPolicy: GastoActividadPolicy,
    private readonly windowValidator: GastoWindowValidator,
  ) {}

  // =====================================================================
  // 1. CREACIÓN DE GASTO OPERATIVO
  // =====================================================================

  async crearGasto(
    empresaId: number,
    usuarioId: number,
    dto: CreateGastoDto,
  ): Promise<GastoResponseDto> {
    const fechaOperativa = this.parsearFecha(dto.fecha);

    // Preparar valores Decimal
    const totalDec = new Prisma.Decimal(dto.total);
    if (totalDec.lte(0)) {
      throw new DomainError(
        CodigoError.PETICION_INVALIDA,
        'El total del gasto debe ser estrictamente mayor a 0 (RN-020)',
        HttpStatus.BAD_REQUEST,
      );
    }

    const cantidadDec = dto.cantidad ? new Prisma.Decimal(dto.cantidad) : null;
    const costoUnitarioDec = dto.costoUnitario
      ? new Prisma.Decimal(dto.costoUnitario)
      : null;
    const impuestoDec = dto.impuesto ? new Prisma.Decimal(dto.impuesto) : null;

    // Regla de unidadId si hay cantidad (RN-024 / A7)
    if (cantidadDec !== null && !dto.unidadId) {
      throw new DomainError(
        CodigoError.PETICION_INVALIDA,
        'La unidad de medida (unidadId) es obligatoria cuando se especifica una cantidad (RN-024)',
        HttpStatus.BAD_REQUEST,
      );
    }

    // Validar regla de comprobante RN-045 (pura)
    this.toleranciaPolicy.assertToleranciaValida({
      total: totalDec,
      cantidad: cantidadDec,
      costoUnitario: costoUnitarioDec,
      impuesto: impuestoDec,
    });

    // Validar entidades vinculadas (A5: consultas directas con 404 ante ids ajenos o inexistentes)
    const [ciclo, categoria, proveedor, actividad, unidad] = await Promise.all([
      this.prisma.cicloProduccion.findFirst({
        where: { id: dto.cicloId, empresaId, deletedAt: null },
        select: GASTO_SELECTS.CICLO_VALIDACION,
      }),
      this.prisma.categoriaGasto.findFirst({
        where: {
          id: dto.categoriaId,
          OR: [{ empresaId }, { empresaId: null }],
          activo: true,
        },
        select: GASTO_SELECTS.CATEGORIA_VALIDACION,
      }),
      dto.proveedorId
        ? this.prisma.proveedor.findFirst({
            where: { id: dto.proveedorId, empresaId, deletedAt: null },
            select: GASTO_SELECTS.PROVEEDOR_VALIDACION,
          })
        : null,
      dto.actividadId
        ? this.prisma.actividad.findFirst({
            where: {
              id: dto.actividadId,
              deletedAt: null,
              ciclo: { empresaId, deletedAt: null },
            },
            select: GASTO_SELECTS.ACTIVIDAD_VALIDACION,
          })
        : null,
      dto.unidadId
        ? this.prisma.unidadMedida.findUnique({
            where: { id: dto.unidadId },
            select: GASTO_SELECTS.UNIDAD_VALIDACION,
          })
        : null,
    ]);

    if (!ciclo) {
      throw new DomainError(
        CodigoError.RECURSO_NO_ENCONTRADO,
        'Ciclo de producción no encontrado en su empresa (RN-068)',
        HttpStatus.NOT_FOUND,
      );
    }

    if (!categoria) {
      throw new DomainError(
        CodigoError.RECURSO_NO_ENCONTRADO,
        'Categoría de gasto no encontrada o inactiva (RN-068)',
        HttpStatus.NOT_FOUND,
      );
    }

    if (dto.proveedorId && !proveedor) {
      throw new DomainError(
        CodigoError.RECURSO_NO_ENCONTRADO,
        'Proveedor no encontrado en su empresa (RN-068)',
        HttpStatus.NOT_FOUND,
      );
    }

    if (dto.actividadId && !actividad) {
      throw new DomainError(
        CodigoError.RECURSO_NO_ENCONTRADO,
        'Actividad agrícola no encontrada en su empresa (RN-068)',
        HttpStatus.NOT_FOUND,
      );
    }

    if (dto.unidadId && !unidad) {
      throw new DomainError(
        CodigoError.RECURSO_NO_ENCONTRADO,
        'Unidad de medida no encontrada',
        HttpStatus.NOT_FOUND,
      );
    }

    // Validar políticas de dominio de Ciclo y Actividad
    this.cyclePolicy.assertCaptureAllowed(ciclo);
    this.cyclePolicy.assertFechaCoherente(ciclo, fechaOperativa, 'gasto');
    this.actividadPolicy.assertActividadPerteneceAlCiclo({
      gastoCicloId: dto.cicloId,
      actividad,
    });

    // Transaccionar: crear y auditar atómicamente
    return this.prisma.$transaction(async (tx) => {
      // Bloquear ciclo para captura mediante SELECT ... FOR UPDATE (C5)
      const cicloTx = await bloquearCicloParaCaptura(
        tx,
        dto.cicloId,
        empresaId,
      );
      this.cyclePolicy.assertCaptureAllowed({ estado: cicloTx.estado });

      const nuevoGasto = await tx.gasto.create({
        data: {
          cicloId: dto.cicloId,
          categoriaId: dto.categoriaId,
          proveedorId: dto.proveedorId ?? null,
          actividadId: dto.actividadId ?? null,
          unidadId: dto.unidadId ?? null,
          creadoPorId: usuarioId,
          fecha: fechaOperativa,
          descripcion: dto.descripcion ?? null,
          cantidad: cantidadDec ?? new Prisma.Decimal(1),
          costoUnitario: costoUnitarioDec ?? totalDec,
          impuesto: impuestoDec ?? new Prisma.Decimal(0),
          total: totalDec,
          numeroComprobante: dto.numeroComprobante ?? null,
        },
      });

      await this.auditService.registrar(
        {
          entidad: 'Gasto',
          entidadId: nuevoGasto.id,
          accion: AccionAuditoria.CREAR,
          empresaId,
          usuarioId,
          valoresNuevos: {
            id: nuevoGasto.id,
            cicloId: nuevoGasto.cicloId,
            categoriaId: nuevoGasto.categoriaId,
            total: nuevoGasto.total.toString(),
            fecha: dto.fecha,
          },
        },
        tx,
      );

      return GastoMapper.toResponseDto(nuevoGasto);
    });
  }

  // =====================================================================
  // 2. LISTADO DE GASTOS CON SCOPED VISIBILITY Y FILTROS
  // =====================================================================

  async listarGastos(
    empresaId: number,
    usuarioId: number,
    tienePermisoEditarTodos: boolean,
    filtro: FiltroGastoDto,
  ): Promise<PaginatedResponseDto<GastoResponseDto>> {
    const page = filtro.page && filtro.page > 0 ? filtro.page : 1;
    const limit =
      filtro.limit && filtro.limit > 0 ? Math.min(filtro.limit, 100) : 20;
    const skip = (page - 1) * limit;

    const where: Prisma.GastoWhereInput = {
      deletedAt: null,
      ciclo: { empresaId, deletedAt: null },
    };

    // A3: Scoped visibility (CAPTURISTA solo ve sus propios gastos)
    if (!tienePermisoEditarTodos) {
      where.creadoPorId = usuarioId;
    }

    if (filtro.cicloId) {
      where.cicloId = filtro.cicloId;
    }

    if (filtro.categoriaId) {
      where.categoriaId = filtro.categoriaId;
    }

    if (filtro.proveedorId) {
      where.proveedorId = filtro.proveedorId;
    }

    if (filtro.actividadId) {
      where.actividadId = filtro.actividadId;
    }

    if (filtro.fechaDesde || filtro.fechaHasta) {
      where.fecha = {};
      if (filtro.fechaDesde) {
        where.fecha.gte = this.parsearFecha(filtro.fechaDesde);
      }
      if (filtro.fechaHasta) {
        where.fecha.lte = this.parsearFecha(filtro.fechaHasta);
      }
    }

    if (filtro.q) {
      where.OR = [
        { descripcion: { contains: filtro.q } },
        { numeroComprobante: { contains: filtro.q } },
      ];
    }

    const [total, registros] = await Promise.all([
      this.prisma.gasto.count({ where }),
      this.prisma.gasto.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ fecha: 'desc' }, { id: 'desc' }],
      }),
    ]);

    return {
      data: registros.map((g) => GastoMapper.toResponseDto(g)),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // =====================================================================
  // 3. OBTENER DETALLE POR ID CON SCOPED VISIBILITY
  // =====================================================================

  async obtenerGastoPorId(
    empresaId: number,
    usuarioId: number,
    tienePermisoEditarTodos: boolean,
    id: number,
  ): Promise<GastoDetalleResponseDto> {
    const gasto = (await this.prisma.gasto.findFirst({
      where: {
        id,
        deletedAt: null,
        ciclo: { empresaId, deletedAt: null },
      },
      include: GASTO_SELECTS.DETALLE_RELACIONES,
    })) as GastoConRelacionesDetalle | null;

    if (!gasto) {
      throw new DomainError(
        CodigoError.RECURSO_NO_ENCONTRADO,
        'Gasto no encontrado en su empresa (RN-068)',
        HttpStatus.NOT_FOUND,
      );
    }

    // A3: Scoped visibility (CAPTURISTA ajeno recibe 404)
    if (!tienePermisoEditarTodos && gasto.creadoPorId !== usuarioId) {
      throw new DomainError(
        CodigoError.RECURSO_NO_ENCONTRADO,
        'Gasto no encontrado en su empresa (RN-068)',
        HttpStatus.NOT_FOUND,
      );
    }

    return GastoMapper.toDetalleResponseDto(gasto);
  }

  // =====================================================================
  // 4. ACTUALIZACIÓN CON FUSIÓN DE VALORES (A4)
  // =====================================================================

  async actualizarGasto(
    empresaId: number,
    usuarioId: number,
    tienePermisoAdministrar: boolean,
    tienePermisoEditarTodos: boolean,
    id: number,
    dto: UpdateGastoDto,
  ): Promise<GastoResponseDto> {
    const gastoExistente = await this.prisma.gasto.findFirst({
      where: {
        id,
        deletedAt: null,
        ciclo: { empresaId, deletedAt: null },
      },
      include: {
        ciclo: { select: GASTO_SELECTS.CICLO_VALIDACION },
      },
    });

    if (!gastoExistente) {
      throw new DomainError(
        CodigoError.RECURSO_NO_ENCONTRADO,
        'Gasto no encontrado en su empresa (RN-068)',
        HttpStatus.NOT_FOUND,
      );
    }

    // Validar ventana de edición y permisos de autoría (RN-062)
    this.windowValidator.assertEdicionPermitida({
      createdAt: gastoExistente.createdAt,
      creadoPorId: gastoExistente.creadoPorId,
      usuarioId,
      tienePermisoAdministrar,
      tienePermisoEditarTodos,
    });

    // Validar estado del ciclo
    this.cyclePolicy.assertCaptureAllowed(gastoExistente.ciclo);

    // Fusión de fecha
    const fechaFusionada = dto.fecha
      ? this.parsearFecha(dto.fecha)
      : gastoExistente.fecha;

    if (dto.fecha) {
      this.cyclePolicy.assertFechaCoherente(
        gastoExistente.ciclo,
        fechaFusionada,
        'gasto',
      );
    }

    // Fusión de montos y desglose aritmético
    const totalFusionado = dto.total
      ? new Prisma.Decimal(dto.total)
      : gastoExistente.total;

    if (totalFusionado.lte(0)) {
      throw new DomainError(
        CodigoError.PETICION_INVALIDA,
        'El total del gasto debe ser estrictamente mayor a 0 (RN-020)',
        HttpStatus.BAD_REQUEST,
      );
    }

    const cantidadFusionada =
      dto.cantidad !== undefined
        ? dto.cantidad !== null
          ? new Prisma.Decimal(dto.cantidad)
          : null
        : gastoExistente.cantidad;

    const costoUnitarioFusionado =
      dto.costoUnitario !== undefined
        ? dto.costoUnitario !== null
          ? new Prisma.Decimal(dto.costoUnitario)
          : null
        : gastoExistente.costoUnitario;

    const impuestoFusionado =
      dto.impuesto !== undefined
        ? dto.impuesto !== null
          ? new Prisma.Decimal(dto.impuesto)
          : null
        : gastoExistente.impuesto;

    // Si hay cantidad fusionada, debe existir unidadId
    const unidadIdFusionado =
      dto.unidadId !== undefined ? dto.unidadId : gastoExistente.unidadId;

    if (cantidadFusionada !== null && !unidadIdFusionado) {
      throw new DomainError(
        CodigoError.PETICION_INVALIDA,
        'La unidad de medida es obligatoria cuando se especifica una cantidad (RN-024)',
        HttpStatus.BAD_REQUEST,
      );
    }

    // Revalidar RN-045 con los valores fusionados
    this.toleranciaPolicy.assertToleranciaValida({
      total: totalFusionado,
      cantidad: cantidadFusionada,
      costoUnitario: costoUnitarioFusionado,
      impuesto: impuestoFusionado,
    });

    // Validar relaciones modificadas
    if (dto.categoriaId) {
      const categoria = await this.prisma.categoriaGasto.findFirst({
        where: {
          id: dto.categoriaId,
          OR: [{ empresaId }, { empresaId: null }],
          activo: true,
        },
        select: GASTO_SELECTS.CATEGORIA_VALIDACION,
      });
      if (!categoria) {
        throw new DomainError(
          CodigoError.RECURSO_NO_ENCONTRADO,
          'Categoría de gasto no encontrada o inactiva (RN-068)',
          HttpStatus.NOT_FOUND,
        );
      }
    }

    if (dto.proveedorId) {
      const proveedor = await this.prisma.proveedor.findFirst({
        where: { id: dto.proveedorId, empresaId, deletedAt: null },
        select: GASTO_SELECTS.PROVEEDOR_VALIDACION,
      });
      if (!proveedor) {
        throw new DomainError(
          CodigoError.RECURSO_NO_ENCONTRADO,
          'Proveedor no encontrado en su empresa (RN-068)',
          HttpStatus.NOT_FOUND,
        );
      }
    }

    if (dto.actividadId) {
      const actividad = await this.prisma.actividad.findFirst({
        where: {
          id: dto.actividadId,
          deletedAt: null,
          ciclo: { empresaId, deletedAt: null },
        },
        select: GASTO_SELECTS.ACTIVIDAD_VALIDACION,
      });
      if (!actividad) {
        throw new DomainError(
          CodigoError.RECURSO_NO_ENCONTRADO,
          'Actividad agrícola no encontrada en su empresa (RN-068)',
          HttpStatus.NOT_FOUND,
        );
      }
      this.actividadPolicy.assertActividadPerteneceAlCiclo({
        gastoCicloId: gastoExistente.cicloId,
        actividad,
      });
    }

    if (dto.unidadId) {
      const unidad = await this.prisma.unidadMedida.findUnique({
        where: { id: dto.unidadId },
        select: GASTO_SELECTS.UNIDAD_VALIDACION,
      });
      if (!unidad) {
        throw new DomainError(
          CodigoError.RECURSO_NO_ENCONTRADO,
          'Unidad de medida no encontrada',
          HttpStatus.NOT_FOUND,
        );
      }
    }

    // Persistir y auditar transaccionalmente
    return this.prisma.$transaction(async (tx) => {
      // Bloquear ciclo para captura mediante SELECT ... FOR UPDATE (C5)
      const cicloTx = await bloquearCicloParaCaptura(
        tx,
        gastoExistente.cicloId,
        empresaId,
      );

      // Releer el gasto dentro de la transacción bajo el lock
      const gastoTx = await tx.gasto.findFirst({
        where: { id, deletedAt: null, ciclo: { empresaId, deletedAt: null } },
      });
      if (!gastoTx) {
        throw new DomainError(
          CodigoError.RECURSO_NO_ENCONTRADO,
          'Gasto no encontrado en su empresa (RN-068)',
          HttpStatus.NOT_FOUND,
        );
      }
      this.cyclePolicy.assertCaptureAllowed({ estado: cicloTx.estado });

      const dataToUpdate: Prisma.GastoUpdateInput = {};
      if (dto.categoriaId !== undefined) {
        dataToUpdate.categoria = { connect: { id: dto.categoriaId } };
      }
      if (dto.fecha !== undefined) {
        dataToUpdate.fecha = fechaFusionada;
      }
      if (dto.descripcion !== undefined) {
        dataToUpdate.descripcion = dto.descripcion;
      }
      if (dto.total !== undefined) {
        dataToUpdate.total = totalFusionado;
      }
      if (dto.cantidad !== undefined) {
        dataToUpdate.cantidad = cantidadFusionada ?? new Prisma.Decimal(1);
      }
      if (dto.costoUnitario !== undefined) {
        dataToUpdate.costoUnitario = costoUnitarioFusionado ?? totalFusionado;
      }
      if (dto.impuesto !== undefined) {
        dataToUpdate.impuesto = impuestoFusionado ?? new Prisma.Decimal(0);
      }
      if (dto.numeroComprobante !== undefined) {
        dataToUpdate.numeroComprobante = dto.numeroComprobante;
      }
      if (dto.proveedorId !== undefined) {
        dataToUpdate.proveedor =
          dto.proveedorId === null
            ? { disconnect: true }
            : { connect: { id: dto.proveedorId } };
      }
      if (dto.actividadId !== undefined) {
        dataToUpdate.actividad =
          dto.actividadId === null
            ? { disconnect: true }
            : { connect: { id: dto.actividadId } };
      }
      if (dto.unidadId !== undefined) {
        dataToUpdate.unidad =
          dto.unidadId === null
            ? { disconnect: true }
            : { connect: { id: dto.unidadId } };
      }

      const gastoActualizado = await tx.gasto.update({
        where: { id },
        data: dataToUpdate,
      });

      await this.auditService.registrar(
        {
          entidad: 'Gasto',
          entidadId: id,
          accion: AccionAuditoria.ACTUALIZAR,
          empresaId,
          usuarioId,
          valoresAnteriores: {
            total: gastoExistente.total.toString(),
            fecha: FechaUtil.toDateOnly(gastoExistente.fecha),
            categoriaId: gastoExistente.categoriaId,
          },
          valoresNuevos: {
            total: gastoActualizado.total.toString(),
            fecha: FechaUtil.toDateOnly(gastoActualizado.fecha),
            categoriaId: gastoActualizado.categoriaId,
          },
        },
        tx,
      );

      return GastoMapper.toResponseDto(gastoActualizado);
    });
  }

  // =====================================================================
  // 5. ELIMINACIÓN DE GASTO (SOFT DELETE) - EXCLUSIVO ADMIN (A2)
  // =====================================================================

  async eliminarGasto(
    empresaId: number,
    usuarioId: number,
    tienePermisoAdministrar: boolean,
    id: number,
  ): Promise<{ message: string }> {
    // A2: Solo ADMIN con registro:administrar puede eliminar gastos
    this.windowValidator.assertEliminacionPermitida({
      tienePermisoAdministrar,
    });

    const gasto = await this.prisma.gasto.findFirst({
      where: {
        id,
        deletedAt: null,
        ciclo: { empresaId, deletedAt: null },
      },
      include: {
        ciclo: { select: GASTO_SELECTS.CICLO_VALIDACION },
      },
    });

    if (!gasto) {
      throw new DomainError(
        CodigoError.RECURSO_NO_ENCONTRADO,
        'Gasto no encontrado en su empresa (RN-068)',
        HttpStatus.NOT_FOUND,
      );
    }

    this.cyclePolicy.assertCaptureAllowed(gasto.ciclo);

    return this.prisma.$transaction(async (tx) => {
      // Bloquear ciclo para captura mediante SELECT ... FOR UPDATE (C5)
      const cicloTx = await bloquearCicloParaCaptura(
        tx,
        gasto.cicloId,
        empresaId,
      );

      // Releer el gasto dentro de la transacción bajo el lock
      const gastoTx = await tx.gasto.findFirst({
        where: { id, deletedAt: null, ciclo: { empresaId, deletedAt: null } },
      });
      if (!gastoTx) {
        throw new DomainError(
          CodigoError.RECURSO_NO_ENCONTRADO,
          'Gasto no encontrado en su empresa (RN-068)',
          HttpStatus.NOT_FOUND,
        );
      }
      this.cyclePolicy.assertCaptureAllowed({ estado: cicloTx.estado });

      await tx.gasto.update({
        where: { id },
        data: { deletedAt: new Date() },
      });

      await this.auditService.registrar(
        {
          entidad: 'Gasto',
          entidadId: id,
          accion: AccionAuditoria.ELIMINAR,
          empresaId,
          usuarioId,
          valoresAnteriores: {
            id: gasto.id,
            total: gasto.total.toString(),
            cicloId: gasto.cicloId,
          },
        },
        tx,
      );

      return { message: 'Gasto eliminado exitosamente' };
    });
  }

  // =====================================================================
  // HELPERS
  // =====================================================================

  private parsearFecha(fechaStr: string): Date {
    const parsed = dayjs.utc(fechaStr, 'YYYY-MM-DD', true);
    if (!parsed.isValid()) {
      throw new DomainError(
        CodigoError.PETICION_INVALIDA,
        `Formato de fecha inválido: ${fechaStr}. Debe ser YYYY-MM-DD`,
        HttpStatus.BAD_REQUEST,
      );
    }
    return parsed.toDate();
  }
}
