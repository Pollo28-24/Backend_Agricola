import { HttpStatus, Injectable } from '@nestjs/common';
import { AccionAuditoria, Prisma } from '@prisma/client';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../prisma/audit.service';
import { CicloCapturaPolicy } from './domain/policies/ciclo-captura.policy';
import { ActividadWindowValidator } from './domain/validators/actividad-window.validator';
import { ActividadOwnershipValidator } from './domain/validators/actividad-ownership.validator';
import { ActividadMapper, ActividadConRelacionesDetalle } from './mappers/actividad.mapper';
import { ACTIVIDAD_CONSTANTS } from './constants/actividad.constants';
import { ACTIVIDAD_SELECTS } from './queries/actividad-selects.constant';
import { CreateActividadDto } from './dto/create-actividad.dto';
import { UpdateActividadDto } from './dto/update-actividad.dto';
import { FiltroActividadDto } from './dto/filtro-actividad.dto';
import { ActividadResponseDto } from './dto/actividad-response.dto';
import { ActividadDetalleResponseDto } from './dto/actividad-detalle-response.dto';
import { PaginatedResponseDto } from '../../common/dto/paginated-response.dto';
import { DomainError } from '../../common/errors/domain.error';
import { CodigoError } from '../../common/errors/codigos-error.enum';
import { FechaUtil } from '../../common/utils/fechas';

dayjs.extend(utc);

@Injectable()
export class ActividadesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly cyclePolicy: CicloCapturaPolicy,
    private readonly windowValidator: ActividadWindowValidator,
    private readonly ownershipValidator: ActividadOwnershipValidator,
  ) {}

  // =====================================================================
  // 1. CREACIÓN (CASO DE USO: REGISTRAR LABOR AGRÍCOLA)
  // =====================================================================

  async crearActividad(
    empresaId: number,
    usuarioId: number,
    dto: CreateActividadDto,
  ): Promise<ActividadResponseDto> {
    const fechaOperativa = this.parsearFecha(dto.fecha);

    // PASO 1: LEER CON SELECTS PROYECTADOS
    const [ciclo, tipoActividad, responsable] = await Promise.all([
      this.prisma.cicloProduccion.findFirst({
        where: { id: dto.cicloId, empresaId, deletedAt: null },
        select: ACTIVIDAD_SELECTS.CICLO_VALIDACION,
      }),
      this.prisma.tipoActividad.findFirst({
        where: { id: dto.tipoActividadId },
        select: ACTIVIDAD_SELECTS.TIPO_ACTIVIDAD_VALIDACION,
      }),
      dto.responsableId
        ? this.prisma.usuario.findFirst({
            where: { id: dto.responsableId, empresaId, deletedAt: null },
            select: ACTIVIDAD_SELECTS.RESPONSABLE_VALIDACION,
          })
        : null,
    ]);

    // PASO 2: VALIDAR DOMINIO PURO
    this.ownershipValidator.assertPertenenciaEmpresa({
      empresaIdToken: empresaId,
      ciclo,
      tipoActividad,
      responsable,
    });
    this.cyclePolicy.assertCaptureAllowed(ciclo!);
    this.cyclePolicy.assertFechaCoherente(ciclo!, fechaOperativa, 'actividad');

    // PASO 3 Y 4: TRANSACCIONAR, PERSISTIR Y AUDITAR
    return this.prisma.$transaction(async (tx) => {
      const actividad = await tx.actividad.create({
        data: {
          cicloId: dto.cicloId,
          tipoActividadId: dto.tipoActividadId,
          responsableId: dto.responsableId ?? null,
          creadoPorId: usuarioId,
          fecha: fechaOperativa,
          descripcion: dto.descripcion ?? null,
          horasTrabajadas: dto.horasTrabajadas ? new Prisma.Decimal(dto.horasTrabajadas) : null,
        },
      });

      await this.auditService.registrar(
        {
          empresaId,
          usuarioId,
          entidad: 'actividad',
          entidadId: actividad.id,
          accion: AccionAuditoria.CREAR,
          valoresNuevos: {
            cicloId: actividad.cicloId,
            tipoActividadId: actividad.tipoActividadId,
            responsableId: actividad.responsableId,
            fecha: dto.fecha,
            horasTrabajadas: dto.horasTrabajadas ?? null,
          },
        },
        tx,
      );

      return ActividadMapper.toResponseDto(actividad);
    });
  }

  // =====================================================================
  // 2. CONSULTAS (CASO DE USO: LISTADO Y DETALLE)
  // =====================================================================

  async listarActividades(
    empresaId: number,
    filtro: FiltroActividadDto,
  ): Promise<PaginatedResponseDto<ActividadResponseDto>> {
    const page = filtro.page && filtro.page > 0 ? Number(filtro.page) : 1;
    const limit =
      filtro.limit && filtro.limit > 0
        ? Math.min(Number(filtro.limit), ACTIVIDAD_CONSTANTS.PAGINACION_MAX_LIMIT)
        : ACTIVIDAD_CONSTANTS.PAGINACION_DEFAULT_LIMIT;
    const skip = (page - 1) * limit;

    const where: Prisma.ActividadWhereInput = {
      ciclo: { empresaId, deletedAt: null },
      deletedAt: null,
    };

    if (filtro.cicloId) where.cicloId = filtro.cicloId;
    if (filtro.tipoActividadId) where.tipoActividadId = filtro.tipoActividadId;
    if (filtro.responsableId) where.responsableId = filtro.responsableId;
    if (filtro.fechaDesde) {
      where.fecha = {
        ...(typeof where.fecha === 'object' ? where.fecha : {}),
        gte: this.parsearFecha(filtro.fechaDesde),
      };
    }
    if (filtro.fechaHasta) {
      where.fecha = {
        ...(typeof where.fecha === 'object' ? where.fecha : {}),
        lte: this.parsearFecha(filtro.fechaHasta),
      };
    }
    if (filtro.q && filtro.q.trim()) {
      where.descripcion = { contains: filtro.q.trim() };
    }

    const [total, items] = await Promise.all([
      this.prisma.actividad.count({ where }),
      this.prisma.actividad.findMany({
        where,
        orderBy: [{ fecha: 'desc' }, { id: 'desc' }],
        skip,
        take: limit,
      }),
    ]);

    const totalPages = Math.ceil(total / limit) || 1;

    return {
      data: items.map((a) => ActividadMapper.toResponseDto(a)),
      meta: { total, page, limit, totalPages },
    };
  }

  async obtenerActividadPorId(
    empresaId: number,
    id: number,
  ): Promise<ActividadDetalleResponseDto> {
    const actividad = await this.prisma.actividad.findFirst({
      where: {
        id,
        ciclo: { empresaId, deletedAt: null },
        deletedAt: null,
      },
      include: ACTIVIDAD_SELECTS.DETALLE_RELACIONES,
    });

    if (!actividad) {
      throw new DomainError(
        CodigoError.RECURSO_NO_ENCONTRADO,
        `Actividad con ID ${id} no encontrada en su empresa`,
        HttpStatus.NOT_FOUND,
      );
    }

    const gastosVinculadosCount = await this.prisma.gasto.count({
      where: { actividadId: id, deletedAt: null },
    });

    return ActividadMapper.toDetalleResponseDto(
      actividad as unknown as ActividadConRelacionesDetalle,
      gastosVinculadosCount,
    );
  }

  // =====================================================================
  // 3. ACTUALIZACIÓN (CASO DE USO: CORRECCIÓN EN VENTANA 48H)
  // =====================================================================

  async actualizarActividad(
    empresaId: number,
    usuarioId: number,
    tienePermisoAdministrar: boolean,
    id: number,
    dto: UpdateActividadDto,
  ): Promise<ActividadResponseDto> {
    // PASO 1: LEER
    const actividadActual = await this.prisma.actividad.findFirst({
      where: {
        id,
        ciclo: { empresaId, deletedAt: null },
        deletedAt: null,
      },
      include: {
        ciclo: { select: ACTIVIDAD_SELECTS.CICLO_VALIDACION },
      },
    });

    if (!actividadActual) {
      throw new DomainError(
        CodigoError.RECURSO_NO_ENCONTRADO,
        `Actividad con ID ${id} no encontrada en su empresa`,
        HttpStatus.NOT_FOUND,
      );
    }

    // PASO 2: VALIDAR DOMINIO PURO
    this.cyclePolicy.assertCaptureAllowed(actividadActual.ciclo);
    this.windowValidator.assertEdicionPermitida({
      createdAt: actividadActual.createdAt,
      creadoPorId: actividadActual.creadoPorId,
      usuarioId,
      tienePermisoAdministrar,
    });

    if (dto.tipoActividadId) {
      const tipo = await this.prisma.tipoActividad.findFirst({
        where: { id: dto.tipoActividadId },
        select: ACTIVIDAD_SELECTS.TIPO_ACTIVIDAD_VALIDACION,
      });
      if (!tipo) {
        throw new DomainError(CodigoError.RECURSO_NO_ENCONTRADO, 'El tipo de actividad especificado no existe', HttpStatus.NOT_FOUND);
      }
      if (!tipo.activo) {
        throw new DomainError(CodigoError.CONFLICTO, 'El tipo de actividad especificado se encuentra inactivo', HttpStatus.CONFLICT);
      }
    }

    if (dto.responsableId) {
      const resp = await this.prisma.usuario.findFirst({
        where: { id: dto.responsableId, empresaId, deletedAt: null },
        select: ACTIVIDAD_SELECTS.RESPONSABLE_VALIDACION,
      });
      if (!resp) {
        throw new DomainError(CodigoError.RECURSO_NO_ENCONTRADO, 'El usuario responsable asignado no pertenece a su empresa (RN-068)', HttpStatus.NOT_FOUND);
      }
      if (!resp.activo) {
        throw new DomainError(CodigoError.CONFLICTO, 'El usuario responsable asignado se encuentra inactivo', HttpStatus.CONFLICT);
      }
    }

    let nuevaFecha: Date | undefined;
    if (dto.fecha) {
      nuevaFecha = this.parsearFecha(dto.fecha);
      this.cyclePolicy.assertFechaCoherente(actividadActual.ciclo, nuevaFecha, 'actividad');
    }

    // PASO 3 Y 4: TRANSACCIONAR, PERSISTIR Y AUDITAR
    return this.prisma.$transaction(async (tx) => {
      const dataUpdate: Prisma.ActividadUpdateInput = {};
      if (dto.tipoActividadId) dataUpdate.tipoActividad = { connect: { id: dto.tipoActividadId } };
      if (dto.responsableId !== undefined) {
        dataUpdate.responsable = dto.responsableId ? { connect: { id: dto.responsableId } } : { disconnect: true };
      }
      if (nuevaFecha) dataUpdate.fecha = nuevaFecha;
      if (dto.descripcion !== undefined) dataUpdate.descripcion = dto.descripcion;
      if (dto.horasTrabajadas !== undefined) {
        dataUpdate.horasTrabajadas = dto.horasTrabajadas ? new Prisma.Decimal(dto.horasTrabajadas) : null;
      }

      const actualizada = await tx.actividad.update({
        where: { id },
        data: dataUpdate,
      });

      await this.auditService.registrar(
        {
          empresaId,
          usuarioId,
          entidad: 'actividad',
          entidadId: id,
          accion: AccionAuditoria.ACTUALIZAR,
          valoresAnteriores: {
            tipoActividadId: actividadActual.tipoActividadId,
            responsableId: actividadActual.responsableId,
            fecha: FechaUtil.toDateOnly(actividadActual.fecha),
            horasTrabajadas: actividadActual.horasTrabajadas?.toString() ?? null,
            descripcion: actividadActual.descripcion,
          },
          valoresNuevos: {
            tipoActividadId: actualizada.tipoActividadId,
            responsableId: actualizada.responsableId,
            fecha: FechaUtil.toDateOnly(actualizada.fecha),
            horasTrabajadas: actualizada.horasTrabajadas?.toString() ?? null,
            descripcion: actualizada.descripcion,
          },
        },
        tx,
      );

      return ActividadMapper.toResponseDto(actualizada);
    });
  }

  // =====================================================================
  // 4. ELIMINACIÓN (CASO DE USO: SOFT DELETE BAJO RN-046 Y RN-062)
  // =====================================================================

  async eliminarActividad(
    empresaId: number,
    usuarioId: number,
    tienePermisoAdministrar: boolean,
    id: number,
  ): Promise<{ message: string }> {
    return this.prisma.$transaction(async (tx) => {
      // PASO 1: LEER
      const actividad = await tx.actividad.findFirst({
        where: {
          id,
          ciclo: { empresaId, deletedAt: null },
          deletedAt: null,
        },
        include: {
          ciclo: { select: { id: true, estado: true } },
        },
      });

      if (!actividad) {
        throw new DomainError(
          CodigoError.RECURSO_NO_ENCONTRADO,
          `Actividad con ID ${id} no encontrada en su empresa`,
          HttpStatus.NOT_FOUND,
        );
      }

      // PASO 2: VALIDAR DOMINIO PURO
      this.cyclePolicy.assertCaptureAllowed(actividad.ciclo);
      this.windowValidator.assertEdicionPermitida({
        createdAt: actividad.createdAt,
        creadoPorId: actividad.creadoPorId,
        usuarioId,
        tienePermisoAdministrar,
      });

      // Validar gastos activos vinculados
      const gastosActivosCount = await tx.gasto.count({
        where: { actividadId: id, deletedAt: null },
      });

      if (gastosActivosCount > 0) {
        throw new DomainError(
          CodigoError.CONFLICTO,
          `No se puede eliminar la actividad porque tiene ${gastosActivosCount} gasto(s) activo(s) vinculado(s) (RN-046)`,
          HttpStatus.CONFLICT,
        );
      }

      // PASO 3 Y 4: PERSISTIR Y AUDITAR
      await tx.actividad.update({
        where: { id },
        data: { deletedAt: new Date() },
      });

      await this.auditService.registrar(
        {
          empresaId,
          usuarioId,
          entidad: 'actividad',
          entidadId: id,
          accion: AccionAuditoria.ELIMINAR,
          valoresAnteriores: {
            id: actividad.id,
            cicloId: actividad.cicloId,
            tipoActividadId: actividad.tipoActividadId,
            fecha: FechaUtil.toDateOnly(actividad.fecha),
          },
        },
        tx,
      );

      return { message: 'Actividad eliminada exitosamente' };
    });
  }

  // =====================================================================
  // AUXILIAR PRIVADO
  // =====================================================================

  private parsearFecha(fechaStr: string): Date {
    return dayjs.utc(fechaStr, 'YYYY-MM-DD').toDate();
  }
}
