import { HttpStatus, Injectable } from '@nestjs/common';
import { AccionAuditoria, Prisma } from '@prisma/client';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../prisma/audit.service';
import { CicloCapturaPolicy } from '../../common/domain/policies/ciclo-captura.policy';
import { RecordWindowValidator } from '../../common/domain/validators/record-window.validator';
import { UnidadPesoPolicy } from '../../common/domain/policies/unidad-peso.policy';
import { CicloBalanceMasaPolicy } from '../../common/domain/policies/ciclo-balance-masa.policy';
import { MermaCosechaPolicy } from './domain/policies/merma-cosecha.policy';
import {
  bloquearCicloParaCaptura,
  calcularBalanceMasaKg,
} from '../../common/utils/ciclo-balance.util';
import { MERMA_SELECTS } from './queries/merma-selects.constant';
import { MermaMapper, MermaConRelacionesDetalle } from './mappers/merma.mapper';
import { CreateMermaDto } from './dto/create-merma.dto';
import { UpdateMermaDto } from './dto/update-merma.dto';
import { FiltroMermaDto } from './dto/filtro-merma.dto';
import { MermaResponseDto } from './dto/merma-response.dto';
import { MermaDetalleResponseDto } from './dto/merma-detalle-response.dto';
import { PaginatedResponseDto } from '../../common/dto/paginated-response.dto';
import { DomainError } from '../../common/errors/domain.error';
import { CodigoError } from '../../common/errors/codigos-error.enum';
import { FechaUtil } from '../../common/utils/fechas';

dayjs.extend(utc);

@Injectable()
export class MermasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly cyclePolicy: CicloCapturaPolicy,
    private readonly windowValidator: RecordWindowValidator,
    private readonly unidadPesoPolicy: UnidadPesoPolicy,
    private readonly balancePolicy: CicloBalanceMasaPolicy,
    private readonly mermaCosechaPolicy: MermaCosechaPolicy,
  ) {}

  // =====================================================================
  // 1. CREACIÓN DE MERMA
  // =====================================================================

  async crearMerma(
    empresaId: number,
    usuarioId: number,
    dto: CreateMermaDto,
  ): Promise<MermaResponseDto> {
    const fechaOperativa = this.parsearFecha(dto.fecha);

    const cantidadDec = new Prisma.Decimal(dto.cantidad);
    if (cantidadDec.lte(0)) {
      throw new DomainError(
        CodigoError.PETICION_INVALIDA,
        'La cantidad de merma debe ser estrictamente mayor a 0 (RN-026)',
        HttpStatus.BAD_REQUEST,
      );
    }

    // Validar motivo y unidad de medida
    const [motivo, unidad, cosecha] = await Promise.all([
      this.prisma.motivoMerma.findFirst({
        where: { id: dto.motivoId, activo: true },
        select: MERMA_SELECTS.MOTIVO_VALIDACION,
      }),
      this.prisma.unidadMedida.findUnique({
        where: { id: dto.unidadId },
        select: MERMA_SELECTS.UNIDAD_VALIDACION,
      }),
      dto.cosechaId
        ? this.prisma.cosecha.findFirst({
            where: {
              id: dto.cosechaId,
              deletedAt: null,
              ciclo: { empresaId, deletedAt: null },
            },
            select: MERMA_SELECTS.COSECHA_VALIDACION,
          })
        : null,
    ]);

    if (!motivo) {
      throw new DomainError(
        CodigoError.RECURSO_NO_ENCONTRADO,
        'Motivo de merma no encontrado o inactivo',
        HttpStatus.NOT_FOUND,
      );
    }

    if (!unidad) {
      throw new DomainError(
        CodigoError.RECURSO_NO_ENCONTRADO,
        'Unidad de medida no encontrada',
        HttpStatus.NOT_FOUND,
      );
    }

    this.unidadPesoPolicy.assertUnidadEsDePeso({ unidad });

    if (dto.cosechaId && !cosecha) {
      throw new DomainError(
        CodigoError.RECURSO_NO_ENCONTRADO,
        'Cosecha de origen no encontrada en su empresa (RN-068)',
        HttpStatus.NOT_FOUND,
      );
    }

    this.mermaCosechaPolicy.assertCosechaPerteneceAlCiclo({
      mermaCicloId: dto.cicloId,
      cosecha,
    });

    return this.prisma.$transaction(async (tx) => {
      // 1. Bloquear ciclo
      const ciclo = await bloquearCicloParaCaptura(tx, dto.cicloId, empresaId);

      this.cyclePolicy.assertCaptureAllowed({ estado: ciclo.estado }, 'merma');
      this.cyclePolicy.assertFechaCoherente(ciclo, fechaOperativa, 'merma');

      // 2. Insertar merma
      const nuevaMerma = await tx.merma.create({
        data: {
          cicloId: dto.cicloId,
          motivoId: dto.motivoId,
          unidadId: dto.unidadId,
          cosechaId: dto.cosechaId ?? null,
          creadoPorId: usuarioId,
          fecha: fechaOperativa,
          cantidad: cantidadDec,
          etapa: dto.etapa,
          observaciones: dto.observaciones ?? null,
        },
      });

      // 3. Revalidar balance de masa (RN-032 / RN-070): la tx ve su propia inserción
      const balance = await calcularBalanceMasaKg(tx, dto.cicloId);
      this.balancePolicy.assertBalanceValido(balance);
      this.balancePolicy.assertVendidoNoExcedeNetos(
        balance,
        CodigoError.KG_VENDIDOS_EXCEDEN_NETOS,
      );

      // 4. Auditar
      await this.auditService.registrar(
        {
          entidad: 'Merma',
          entidadId: nuevaMerma.id,
          accion: AccionAuditoria.CREAR,
          empresaId,
          usuarioId,
          valoresNuevos: {
            id: nuevaMerma.id,
            cicloId: nuevaMerma.cicloId,
            cantidad: nuevaMerma.cantidad.toString(),
            etapa: nuevaMerma.etapa,
            fecha: dto.fecha,
          },
        },
        tx,
      );

      return MermaMapper.toResponseDto(nuevaMerma);
    });
  }

  // =====================================================================
  // 2. LISTADO CON SCOPED VISIBILITY
  // =====================================================================

  async listarMermas(
    empresaId: number,
    usuarioId: number,
    tienePermisoAdministrar: boolean,
    filtro: FiltroMermaDto,
  ): Promise<PaginatedResponseDto<MermaResponseDto>> {
    const page = filtro.page && filtro.page > 0 ? filtro.page : 1;
    const limit =
      filtro.limit && filtro.limit > 0 ? Math.min(filtro.limit, 100) : 20;
    const skip = (page - 1) * limit;

    const where: Prisma.MermaWhereInput = {
      deletedAt: null,
      ciclo: { empresaId, deletedAt: null },
    };

    if (!tienePermisoAdministrar) {
      where.creadoPorId = usuarioId;
    }

    if (filtro.cicloId) {
      where.cicloId = filtro.cicloId;
    }

    if (filtro.motivoId) {
      where.motivoId = filtro.motivoId;
    }

    if (filtro.etapa) {
      where.etapa = filtro.etapa;
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
      this.prisma.merma.count({ where }),
      this.prisma.merma.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ fecha: 'desc' }, { id: 'desc' }],
      }),
    ]);

    return {
      data: registros.map((m) => MermaMapper.toResponseDto(m)),
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

  async obtenerMermaPorId(
    empresaId: number,
    usuarioId: number,
    tienePermisoAdministrar: boolean,
    id: number,
  ): Promise<MermaDetalleResponseDto> {
    const merma = (await this.prisma.merma.findFirst({
      where: {
        id,
        deletedAt: null,
        ciclo: { empresaId, deletedAt: null },
      },
      include: MERMA_SELECTS.DETALLE_RELACIONES,
    })) as MermaConRelacionesDetalle | null;

    if (!merma) {
      throw new DomainError(
        CodigoError.RECURSO_NO_ENCONTRADO,
        'Merma no encontrada en su empresa (RN-068)',
        HttpStatus.NOT_FOUND,
      );
    }

    if (!tienePermisoAdministrar && merma.creadoPorId !== usuarioId) {
      throw new DomainError(
        CodigoError.RECURSO_NO_ENCONTRADO,
        'Merma no encontrada en su empresa (RN-068)',
        HttpStatus.NOT_FOUND,
      );
    }

    return MermaMapper.toDetalleResponseDto(merma);
  }

  // =====================================================================
  // 4. ACTUALIZACIÓN CON FUSIÓN Y VALIDACIÓN DE BALANCE BAJO LOCK
  // =====================================================================

  async actualizarMerma(
    empresaId: number,
    usuarioId: number,
    tienePermisoAdministrar: boolean,
    id: number,
    dto: UpdateMermaDto,
  ): Promise<MermaResponseDto> {
    const mermaExistente = await this.prisma.merma.findFirst({
      where: {
        id,
        deletedAt: null,
        ciclo: { empresaId, deletedAt: null },
      },
    });

    if (!mermaExistente) {
      throw new DomainError(
        CodigoError.RECURSO_NO_ENCONTRADO,
        'Merma no encontrada en su empresa (RN-068)',
        HttpStatus.NOT_FOUND,
      );
    }

    this.windowValidator.assertEdicionPermitida({
      createdAt: mermaExistente.createdAt,
      creadoPorId: mermaExistente.creadoPorId,
      usuarioId,
      tienePermisoAdministrar,
      nombreEntidad: 'merma',
    });

    // Fusión de campos
    const fechaFusionada = dto.fecha
      ? this.parsearFecha(dto.fecha)
      : mermaExistente.fecha;

    const cantidadFusionada = dto.cantidad
      ? new Prisma.Decimal(dto.cantidad)
      : mermaExistente.cantidad;

    if (cantidadFusionada.lte(0)) {
      throw new DomainError(
        CodigoError.PETICION_INVALIDA,
        'La cantidad de merma debe ser estrictamente mayor a 0 (RN-026)',
        HttpStatus.BAD_REQUEST,
      );
    }

    const unidadIdFusionada = dto.unidadId ?? mermaExistente.unidadId;
    const etapaFusionada = dto.etapa ?? mermaExistente.etapa;

    if (dto.unidadId) {
      const unidad = await this.prisma.unidadMedida.findUnique({
        where: { id: dto.unidadId },
        select: MERMA_SELECTS.UNIDAD_VALIDACION,
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

    if (dto.motivoId) {
      const motivo = await this.prisma.motivoMerma.findFirst({
        where: { id: dto.motivoId, activo: true },
        select: MERMA_SELECTS.MOTIVO_VALIDACION,
      });
      if (!motivo) {
        throw new DomainError(
          CodigoError.RECURSO_NO_ENCONTRADO,
          'Motivo de merma no encontrado o inactivo',
          HttpStatus.NOT_FOUND,
        );
      }
    }

    if (dto.cosechaId !== undefined && dto.cosechaId !== null) {
      const cosecha = await this.prisma.cosecha.findFirst({
        where: {
          id: dto.cosechaId,
          deletedAt: null,
          ciclo: { empresaId, deletedAt: null },
        },
        select: MERMA_SELECTS.COSECHA_VALIDACION,
      });
      if (!cosecha) {
        throw new DomainError(
          CodigoError.RECURSO_NO_ENCONTRADO,
          'Cosecha de origen no encontrada en su empresa (RN-068)',
          HttpStatus.NOT_FOUND,
        );
      }
      this.mermaCosechaPolicy.assertCosechaPerteneceAlCiclo({
        mermaCicloId: mermaExistente.cicloId,
        cosecha,
      });
    }

    return this.prisma.$transaction(async (tx) => {
      // Bloqueo del ciclo
      const ciclo = await bloquearCicloParaCaptura(
        tx,
        mermaExistente.cicloId,
        empresaId,
      );

      // Releer merma bajo el lock
      const mermaLock = await tx.merma.findFirst({
        where: { id, deletedAt: null },
      });
      if (!mermaLock) {
        throw new DomainError(
          CodigoError.RECURSO_NO_ENCONTRADO,
          'Merma no encontrada bajo el bloqueo del ciclo',
          HttpStatus.NOT_FOUND,
        );
      }

      this.cyclePolicy.assertCaptureAllowed({ estado: ciclo.estado }, 'merma');
      if (dto.fecha) {
        this.cyclePolicy.assertFechaCoherente(ciclo, fechaFusionada, 'merma');
      }

      const mermaActualizada = await tx.merma.update({
        where: { id },
        data: {
          fecha: fechaFusionada,
          cantidad: cantidadFusionada,
          unidadId: unidadIdFusionada,
          etapa: etapaFusionada,
          motivoId: dto.motivoId ?? undefined,
          cosechaId: dto.cosechaId !== undefined ? dto.cosechaId : undefined,
          observaciones:
            dto.observaciones !== undefined ? dto.observaciones : undefined,
        },
      });

      // Validar balance de masa (RN-032 / RN-070)
      const balance = await calcularBalanceMasaKg(tx, mermaExistente.cicloId);
      this.balancePolicy.assertBalanceValido(balance);
      this.balancePolicy.assertVendidoNoExcedeNetos(
        balance,
        CodigoError.KG_VENDIDOS_EXCEDEN_NETOS,
      );

      await this.auditService.registrar(
        {
          entidad: 'Merma',
          entidadId: id,
          accion: AccionAuditoria.ACTUALIZAR,
          empresaId,
          usuarioId,
          valoresAnteriores: {
            cantidad: mermaExistente.cantidad.toString(),
            etapa: mermaExistente.etapa,
            fecha: FechaUtil.toDateOnly(mermaExistente.fecha),
          },
          valoresNuevos: {
            cantidad: mermaActualizada.cantidad.toString(),
            etapa: mermaActualizada.etapa,
            fecha: FechaUtil.toDateOnly(mermaActualizada.fecha),
          },
        },
        tx,
      );

      return MermaMapper.toResponseDto(mermaActualizada);
    });
  }

  // =====================================================================
  // 5. ELIMINACIÓN DE MERMA (SOFT DELETE) - EXCLUSIVO ADMIN
  // =====================================================================

  async eliminarMerma(
    empresaId: number,
    usuarioId: number,
    tienePermisoAdministrar: boolean,
    id: number,
  ): Promise<{ message: string }> {
    this.windowValidator.assertEliminacionPermitida({
      tienePermisoAdministrar,
      nombreEntidadPlural: 'mermas',
    });

    const mermaExistente = await this.prisma.merma.findFirst({
      where: {
        id,
        deletedAt: null,
        ciclo: { empresaId, deletedAt: null },
      },
    });

    if (!mermaExistente) {
      throw new DomainError(
        CodigoError.RECURSO_NO_ENCONTRADO,
        'Merma no encontrada en su empresa (RN-068)',
        HttpStatus.NOT_FOUND,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      // Bloquear ciclo
      const ciclo = await bloquearCicloParaCaptura(
        tx,
        mermaExistente.cicloId,
        empresaId,
      );

      // Releer merma bajo lock
      const mermaLock = await tx.merma.findFirst({
        where: { id, deletedAt: null },
      });
      if (!mermaLock) {
        throw new DomainError(
          CodigoError.RECURSO_NO_ENCONTRADO,
          'Merma no encontrada bajo el bloqueo',
          HttpStatus.NOT_FOUND,
        );
      }

      this.cyclePolicy.assertCaptureAllowed({ estado: ciclo.estado }, 'merma');

      await tx.merma.update({
        where: { id },
        data: { deletedAt: new Date() },
      });

      await this.auditService.registrar(
        {
          entidad: 'Merma',
          entidadId: id,
          accion: AccionAuditoria.ELIMINAR,
          empresaId,
          usuarioId,
          valoresAnteriores: {
            id,
            cantidad: mermaExistente.cantidad.toString(),
            cicloId: mermaExistente.cicloId,
          },
        },
        tx,
      );

      return { message: 'Merma eliminada exitosamente' };
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
