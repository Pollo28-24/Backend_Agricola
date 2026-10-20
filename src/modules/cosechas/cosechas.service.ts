import { HttpStatus, Injectable } from '@nestjs/common';
import { AccionAuditoria, EstadoCiclo, Prisma } from '@prisma/client';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../prisma/audit.service';
import { CicloCapturaPolicy } from '../../common/domain/policies/ciclo-captura.policy';
import { RecordWindowValidator } from '../../common/domain/validators/record-window.validator';
import { UnidadPesoPolicy } from '../../common/domain/policies/unidad-peso.policy';
import { CicloBalanceMasaPolicy } from '../../common/domain/policies/ciclo-balance-masa.policy';
import { CosechaIntegridadPolicy } from './domain/policies/cosecha-integridad.policy';
import {
  bloquearCicloParaCaptura,
  calcularBalanceMasaKg,
} from '../../common/utils/ciclo-balance.util';
import { COSECHA_SELECTS } from './queries/cosecha-selects.constant';
import {
  CosechaMapper,
  CosechaConRelacionesDetalle,
} from './mappers/cosecha.mapper';
import { CreateCosechaDto } from './dto/create-cosecha.dto';
import { UpdateCosechaDto } from './dto/update-cosecha.dto';
import { FiltroCosechaDto } from './dto/filtro-cosecha.dto';
import { CosechaResponseDto } from './dto/cosecha-response.dto';
import { CosechaDetalleResponseDto } from './dto/cosecha-detalle-response.dto';
import { PaginatedResponseDto } from '../../common/dto/paginated-response.dto';
import { DomainError } from '../../common/errors/domain.error';
import { CodigoError } from '../../common/errors/codigos-error.enum';
import { FechaUtil } from '../../common/utils/fechas';

dayjs.extend(utc);

@Injectable()
export class CosechasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly cyclePolicy: CicloCapturaPolicy,
    private readonly windowValidator: RecordWindowValidator,
    private readonly unidadPesoPolicy: UnidadPesoPolicy,
    private readonly balancePolicy: CicloBalanceMasaPolicy,
    private readonly integridadPolicy: CosechaIntegridadPolicy,
  ) {}

  // =====================================================================
  // 1. CREACIÓN DE COSECHA
  // =====================================================================

  async crearCosecha(
    empresaId: number,
    usuarioId: number,
    dto: CreateCosechaDto,
  ): Promise<CosechaResponseDto> {
    const fechaOperativa = this.parsearFecha(dto.fecha);

    const cantidadDec = new Prisma.Decimal(dto.cantidad);
    if (cantidadDec.lte(0)) {
      throw new DomainError(
        CodigoError.PETICION_INVALIDA,
        'La cantidad de cosecha debe ser estrictamente mayor a 0 (RN-026)',
        HttpStatus.BAD_REQUEST,
      );
    }

    // Validar unidad de medida y que sea de tipo PESO (RN-069)
    const unidad = await this.prisma.unidadMedida.findUnique({
      where: { id: dto.unidadId },
      select: COSECHA_SELECTS.UNIDAD_VALIDACION,
    });

    if (!unidad) {
      throw new DomainError(
        CodigoError.RECURSO_NO_ENCONTRADO,
        'Unidad de medida no encontrada',
        HttpStatus.NOT_FOUND,
      );
    }

    this.unidadPesoPolicy.assertUnidadEsDePeso({ unidad });

    return this.prisma.$transaction(async (tx) => {
      // 1. Bloqueo pesimista del ciclo (orden único: ciclo primero)
      const ciclo = await bloquearCicloParaCaptura(tx, dto.cicloId, empresaId);

      // 2. Validar estado de ciclo para cosechas (rechaza PLANIFICADO, FINALIZADO, CANCELADO)
      this.cyclePolicy.assertCaptureAllowed(
        { estado: ciclo.estado },
        'cosecha',
      );
      this.cyclePolicy.assertFechaCoherente(ciclo, fechaOperativa, 'cosecha');

      // 3. Crear cosecha
      const nuevaCosecha = await tx.cosecha.create({
        data: {
          cicloId: dto.cicloId,
          unidadId: dto.unidadId,
          creadoPorId: usuarioId,
          fecha: fechaOperativa,
          cantidad: cantidadDec,
          calidad: dto.calidad,
          observaciones: dto.observaciones ?? null,
        },
      });

      // 4. Auditar atómicamente en la misma transacción
      await this.auditService.registrar(
        {
          entidad: 'Cosecha',
          entidadId: nuevaCosecha.id,
          accion: AccionAuditoria.CREAR,
          empresaId,
          usuarioId,
          valoresNuevos: {
            id: nuevaCosecha.id,
            cicloId: nuevaCosecha.cicloId,
            cantidad: nuevaCosecha.cantidad.toString(),
            calidad: nuevaCosecha.calidad,
            fecha: dto.fecha,
          },
        },
        tx,
      );

      return CosechaMapper.toResponseDto(nuevaCosecha);
    });
  }

  // =====================================================================
  // 2. LISTADO CON SCOPED VISIBILITY
  // =====================================================================

  async listarCosechas(
    empresaId: number,
    usuarioId: number,
    tienePermisoAdministrar: boolean,
    filtro: FiltroCosechaDto,
  ): Promise<PaginatedResponseDto<CosechaResponseDto>> {
    const page = filtro.page && filtro.page > 0 ? filtro.page : 1;
    const limit =
      filtro.limit && filtro.limit > 0 ? Math.min(filtro.limit, 100) : 20;
    const skip = (page - 1) * limit;

    const where: Prisma.CosechaWhereInput = {
      deletedAt: null,
      ciclo: { empresaId, deletedAt: null },
    };

    if (!tienePermisoAdministrar) {
      where.creadoPorId = usuarioId;
    }

    if (filtro.cicloId) {
      where.cicloId = filtro.cicloId;
    }

    if (filtro.calidad) {
      where.calidad = filtro.calidad;
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

    const [total, registros] = await Promise.all([
      this.prisma.cosecha.count({ where }),
      this.prisma.cosecha.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ fecha: 'desc' }, { id: 'desc' }],
      }),
    ]);

    return {
      data: registros.map((c) => CosechaMapper.toResponseDto(c)),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // =====================================================================
  // 3. DETALLE CON SCOPED VISIBILITY
  // =====================================================================

  async obtenerCosechaPorId(
    empresaId: number,
    usuarioId: number,
    tienePermisoAdministrar: boolean,
    id: number,
  ): Promise<CosechaDetalleResponseDto> {
    const cosecha = (await this.prisma.cosecha.findFirst({
      where: {
        id,
        deletedAt: null,
        ciclo: { empresaId, deletedAt: null },
      },
      include: COSECHA_SELECTS.DETALLE_RELACIONES,
    })) as CosechaConRelacionesDetalle | null;

    if (!cosecha) {
      throw new DomainError(
        CodigoError.RECURSO_NO_ENCONTRADO,
        'Cosecha no encontrada en su empresa (RN-068)',
        HttpStatus.NOT_FOUND,
      );
    }

    if (!tienePermisoAdministrar && cosecha.creadoPorId !== usuarioId) {
      throw new DomainError(
        CodigoError.RECURSO_NO_ENCONTRADO,
        'Cosecha no encontrada en su empresa (RN-068)',
        HttpStatus.NOT_FOUND,
      );
    }

    const mermasCount = await this.prisma.merma.count({
      where: { cosechaId: id, deletedAt: null },
    });

    return CosechaMapper.toDetalleResponseDto(cosecha, mermasCount);
  }

  // =====================================================================
  // 4. ACTUALIZACIÓN CON FUSIÓN Y VALIDACIÓN DE BALANCE BAJO LOCK
  // =====================================================================

  async actualizarCosecha(
    empresaId: number,
    usuarioId: number,
    tienePermisoAdministrar: boolean,
    id: number,
    dto: UpdateCosechaDto,
  ): Promise<CosechaResponseDto> {
    // 1. Leer registro para conocer cicloId
    const cosechaExistente = await this.prisma.cosecha.findFirst({
      where: {
        id,
        deletedAt: null,
        ciclo: { empresaId, deletedAt: null },
      },
    });

    if (!cosechaExistente) {
      throw new DomainError(
        CodigoError.RECURSO_NO_ENCONTRADO,
        'Cosecha no encontrada en su empresa (RN-068)',
        HttpStatus.NOT_FOUND,
      );
    }

    // 2. Validar gobernanza temporal y autoría
    this.windowValidator.assertEdicionPermitida({
      createdAt: cosechaExistente.createdAt,
      creadoPorId: cosechaExistente.creadoPorId,
      usuarioId,
      tienePermisoAdministrar,
      nombreEntidad: 'cosecha',
    });

    // Fusión de valores
    const fechaFusionada = dto.fecha
      ? this.parsearFecha(dto.fecha)
      : cosechaExistente.fecha;

    const cantidadFusionada = dto.cantidad
      ? new Prisma.Decimal(dto.cantidad)
      : cosechaExistente.cantidad;

    if (cantidadFusionada.lte(0)) {
      throw new DomainError(
        CodigoError.PETICION_INVALIDA,
        'La cantidad de cosecha debe ser estrictamente mayor a 0 (RN-026)',
        HttpStatus.BAD_REQUEST,
      );
    }

    const unidadIdFusionada = dto.unidadId ?? cosechaExistente.unidadId;

    if (dto.unidadId) {
      const unidad = await this.prisma.unidadMedida.findUnique({
        where: { id: dto.unidadId },
        select: COSECHA_SELECTS.UNIDAD_VALIDACION,
      });
      if (!unidad) {
        throw new DomainError(
          CodigoError.RECURSO_NO_ENCONTRADO,
          'Unidad de medida no encontrada',
          HttpStatus.NOT_FOUND,
        );
      }
      this.unidadPesoPolicy.assertUnidadEsDePeso({ unidad });
    }

    return this.prisma.$transaction(async (tx) => {
      // 3. Bloquear ciclo
      const ciclo = await bloquearCicloParaCaptura(
        tx,
        cosechaExistente.cicloId,
        empresaId,
      );

      // 4. Releer registro bajo el lock (404 si fue eliminado entretanto)
      const cosechaLock = await tx.cosecha.findFirst({
        where: { id, deletedAt: null },
      });
      if (!cosechaLock) {
        throw new DomainError(
          CodigoError.RECURSO_NO_ENCONTRADO,
          'Cosecha no encontrada bajo el bloqueo del ciclo',
          HttpStatus.NOT_FOUND,
        );
      }

      this.cyclePolicy.assertCaptureAllowed(
        { estado: ciclo.estado },
        'cosecha',
      );
      if (dto.fecha) {
        this.cyclePolicy.assertFechaCoherente(ciclo, fechaFusionada, 'cosecha');
      }

      // 5. Aplicar mutación
      const cosechaActualizada = await tx.cosecha.update({
        where: { id },
        data: {
          fecha: fechaFusionada,
          cantidad: cantidadFusionada,
          unidadId: unidadIdFusionada,
          calidad: dto.calidad ?? undefined,
          observaciones:
            dto.observaciones !== undefined ? dto.observaciones : undefined,
        },
      });

      // 6. Validar balance de masa (RN-032 / RN-070): la transacción ve su propia actualización
      const balance = await calcularBalanceMasaKg(tx, cosechaExistente.cicloId);
      this.balancePolicy.assertBalanceValido(balance);
      this.balancePolicy.assertVendidoNoExcedeNetos(
        balance,
        CodigoError.KG_VENDIDOS_EXCEDEN_NETOS,
      );

      // 7. Auditar
      await this.auditService.registrar(
        {
          entidad: 'Cosecha',
          entidadId: id,
          accion: AccionAuditoria.ACTUALIZAR,
          empresaId,
          usuarioId,
          valoresAnteriores: {
            cantidad: cosechaExistente.cantidad.toString(),
            fecha: FechaUtil.toDateOnly(cosechaExistente.fecha),
          },
          valoresNuevos: {
            cantidad: cosechaActualizada.cantidad.toString(),
            fecha: FechaUtil.toDateOnly(cosechaActualizada.fecha),
          },
        },
        tx,
      );

      return CosechaMapper.toResponseDto(cosechaActualizada);
    });
  }

  // =====================================================================
  // 5. ELIMINACIÓN DE COSECHA (SOFT DELETE) - EXCLUSIVO ADMIN
  // =====================================================================

  async eliminarCosecha(
    empresaId: number,
    usuarioId: number,
    tienePermisoAdministrar: boolean,
    id: number,
  ): Promise<{ message: string }> {
    this.windowValidator.assertEliminacionPermitida({
      tienePermisoAdministrar,
      nombreEntidadPlural: 'cosechas',
    });

    const cosechaExistente = await this.prisma.cosecha.findFirst({
      where: {
        id,
        deletedAt: null,
        ciclo: { empresaId, deletedAt: null },
      },
    });

    if (!cosechaExistente) {
      throw new DomainError(
        CodigoError.RECURSO_NO_ENCONTRADO,
        'Cosecha no encontrada en su empresa (RN-068)',
        HttpStatus.NOT_FOUND,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      // Bloquear ciclo
      const ciclo = await bloquearCicloParaCaptura(
        tx,
        cosechaExistente.cicloId,
        empresaId,
      );

      // Releer cosecha bajo el lock
      const cosechaLock = await tx.cosecha.findFirst({
        where: { id, deletedAt: null },
      });
      if (!cosechaLock) {
        throw new DomainError(
          CodigoError.RECURSO_NO_ENCONTRADO,
          'Cosecha no encontrada bajo el bloqueo',
          HttpStatus.NOT_FOUND,
        );
      }

      this.cyclePolicy.assertCaptureAllowed(
        { estado: ciclo.estado },
        'cosecha',
      );

      // RN-050: verificar mermas y ventas vinculadas directamente
      const [mermasCount, ventasCount] = await Promise.all([
        tx.merma.count({
          where: { cosechaId: id, deletedAt: null },
        }),
        tx.detalleVenta.count({
          where: {
            cosechaId: id,
            venta: {
              estado: { not: 'CANCELADA' },
              deletedAt: null,
            },
          },
        }),
      ]);
      this.integridadPolicy.assertEliminacionPermitida({
        cosechaId: id,
        mermasVinculadasCount: mermasCount,
        ventasVinculadasCount: ventasCount,
      });

      // Soft delete
      await tx.cosecha.update({
        where: { id },
        data: { deletedAt: new Date() },
      });

      // Revalidar balance global (RN-032 / RN-070): al borrar la cosecha, ¿mermas poscosecha o ventas exceden cosecha restante?
      const balance = await calcularBalanceMasaKg(tx, cosechaExistente.cicloId);
      this.balancePolicy.assertBalanceValido(balance);
      this.balancePolicy.assertVendidoNoExcedeNetos(
        balance,
        CodigoError.KG_VENDIDOS_EXCEDEN_NETOS,
      );

      await this.auditService.registrar(
        {
          entidad: 'Cosecha',
          entidadId: id,
          accion: AccionAuditoria.ELIMINAR,
          empresaId,
          usuarioId,
          valoresAnteriores: {
            id,
            cantidad: cosechaExistente.cantidad.toString(),
            cicloId: cosechaExistente.cicloId,
          },
        },
        tx,
      );

      return { message: 'Cosecha eliminada exitosamente' };
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
