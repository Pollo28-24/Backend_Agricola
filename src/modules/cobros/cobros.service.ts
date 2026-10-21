import { HttpStatus, Injectable } from '@nestjs/common';
import { AccionAuditoria, EstadoVenta, Prisma } from '@prisma/client';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../prisma/audit.service';
import { CicloCapturaPolicy } from '../../common/domain/policies/ciclo-captura.policy';
import { VentaEstadoCobroPolicy } from '../../common/domain/policies/venta-estado-cobro.policy';
import { bloquearCicloParaCaptura } from '../../common/utils/ciclo-balance.util';
import { bloquearVentaParaModificacion } from '../../common/utils/venta-lock.util';
import { DomainError } from '../../common/errors/domain.error';
import { CodigoError } from '../../common/errors/codigos-error.enum';
import { FechaUtil } from '../../common/utils/fechas';
import { CreateCobroDto } from './dto/create-cobro.dto';
import { FiltroCobroDto } from './dto/filtro-cobro.dto';
import { CobroResponseDto } from './dto/cobro-response.dto';
import { CobroDetalleResponseDto } from './dto/cobro-detalle-response.dto';
import { PaginatedResponseDto } from '../../common/dto/paginated-response.dto';
import { CobroMapper } from './mappers/cobro.mapper';

dayjs.extend(utc);

@Injectable()
export class CobrosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly cicloCapturaPolicy: CicloCapturaPolicy,
  ) {}

  // =====================================================================
  // 1. REGISTRAR COBRO (RN-054, RN-071, RN-073)
  // =====================================================================

  async registrarCobro(
    empresaId: number,
    usuarioId: number,
    ventaId: number,
    dto: CreateCobroDto,
  ): Promise<CobroResponseDto> {
    // 1. Leer venta preliminar fuera de la transacción para obtener cicloId
    //    sin inicializar prematuramente el snapshot MVCC en tx antes del lock.
    const ventaPrevia = await this.prisma.venta.findFirst({
      where: {
        id: ventaId,
        deletedAt: null,
        ciclo: { empresaId, deletedAt: null },
      },
      select: { id: true, cicloId: true },
    });

    if (!ventaPrevia) {
      throw new DomainError(
        CodigoError.RECURSO_NO_ENCONTRADO,
        'Venta no encontrada',
        HttpStatus.NOT_FOUND,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      // 2. Bloquear ciclo (orden institucional único: ciclo primero)
      const ciclo = await bloquearCicloParaCaptura(
        tx,
        ventaPrevia.cicloId,
        empresaId,
      );

      // 3. Validar ciclo de vida para cobro (Tabla 2.6: ACTIVO, SUSPENDIDO, FINALIZADO permitidos; PLANIFICADO y CANCELADO rechazan)
      this.cicloCapturaPolicy.assertCaptureAllowed(
        { estado: ciclo.estado },
        'cobro',
      );

      // 4. Bloquear venta y RELEER datos bajo el lock
      const ventaBloqueada = await bloquearVentaParaModificacion(
        tx,
        ventaId,
        empresaId,
      );

      // 5. Venta CANCELADA no admite cobros nuevos
      if (ventaBloqueada.estado === EstadoVenta.CANCELADA) {
        throw new DomainError(
          CodigoError.VENTA_YA_CANCELADA,
          'No se pueden registrar cobros en una venta cancelada',
          HttpStatus.CONFLICT,
        );
      }

      // 6. Validar fecha del cobro (supuesto ADR-009: fecha >= venta.fecha y fecha <= hoy México)
      const fechaCobroStr = dto.fecha;
      const fechaVentaStr = VentaEstadoCobroPolicy.normalizarFecha(
        ventaBloqueada.fecha,
      );
      const hoyMexico = VentaEstadoCobroPolicy.obtenerHoyMexico();

      if (
        (fechaVentaStr && fechaCobroStr < fechaVentaStr) ||
        fechaCobroStr > hoyMexico
      ) {
        throw new DomainError(
          CodigoError.FECHA_COBRO_INVALIDA,
          'La fecha del cobro no puede ser anterior a la fecha de la venta ni posterior al día de hoy',
          HttpStatus.BAD_REQUEST,
        );
      }

      // 7. Suma de cobros vigentes con aggregate (sin SQL crudo)
      const sumaVigentesAgg = await tx.cobroVenta.aggregate({
        where: {
          ventaId,
          deletedAt: null,
        },
        _sum: {
          monto: true,
        },
      });
      const sumaVigentes =
        sumaVigentesAgg._sum.monto ?? new Prisma.Decimal('0.00');

      // 8. Validar que sumaVigentes + monto <= venta.total (RN-054)
      const montoCobro = new Prisma.Decimal(dto.monto);
      if (sumaVigentes.plus(montoCobro).greaterThan(ventaBloqueada.total)) {
        throw new DomainError(
          CodigoError.COBRO_EXCEDE_TOTAL,
          'El monto del cobro excede el saldo pendiente de la venta',
          HttpStatus.CONFLICT,
        );
      }

      // 9. Insertar cobro
      const fechaOperativa = dayjs.utc(dto.fecha, 'YYYY-MM-DD', true).toDate();
      const nuevoCobro = await tx.cobroVenta.create({
        data: {
          ventaId,
          registradoPorId: usuarioId,
          fecha: fechaOperativa,
          monto: montoCobro,
          metodo: dto.metodo,
          referencia: dto.referencia ?? null,
        },
        include: {
          registradoPor: {
            select: { id: true, nombre: true },
          },
        },
      });

      // 10. Auditar atómicamente CREAR en la misma transacción
      await this.auditService.registrar(
        {
          entidad: 'CobroVenta',
          entidadId: nuevoCobro.id,
          accion: AccionAuditoria.CREAR,
          empresaId,
          usuarioId,
          valoresNuevos: {
            id: nuevoCobro.id,
            ventaId: nuevoCobro.ventaId,
            fecha: dto.fecha,
            monto: dto.monto,
            metodo: nuevoCobro.metodo,
            referencia: nuevoCobro.referencia,
          },
        },
        tx,
      );

      return CobroMapper.toResponseDto(nuevoCobro);
    });
  }

  // =====================================================================
  // 2. ANULAR COBRO (RN-063, INMUTABILIDAD Y ANULACIÓN LÓGICA)
  // =====================================================================

  async anularCobro(
    empresaId: number,
    usuarioId: number,
    id: number,
  ): Promise<CobroResponseDto> {
    // 1. Leer cobro con aislamiento por venta.ciclo.empresaId fuera de la transacción para obtener ventaId y cicloId
    //    sin inicializar prematuramente el snapshot MVCC en tx antes del lock.
    const cobroPrevio = await this.prisma.cobroVenta.findFirst({
      where: {
        id,
        venta: {
          ciclo: { empresaId, deletedAt: null },
        },
      },
      select: {
        id: true,
        ventaId: true,
        venta: { select: { cicloId: true } },
      },
    });

    if (!cobroPrevio) {
      throw new DomainError(
        CodigoError.RECURSO_NO_ENCONTRADO,
        'Cobro no encontrado',
        HttpStatus.NOT_FOUND,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      // 2. Bloquear ciclo
      const ciclo = await bloquearCicloParaCaptura(
        tx,
        cobroPrevio.venta.cicloId,
        empresaId,
      );

      // 3. Validar ciclo de vida (Tabla 2.6: CANCELADO da CICLO_CERRADO)
      this.cicloCapturaPolicy.assertCaptureAllowed(
        { estado: ciclo.estado },
        'cobro',
      );

      // 4. Bloquear venta
      await bloquearVentaParaModificacion(tx, cobroPrevio.ventaId, empresaId);

      // 5. RELEER el cobro bajo el lock
      const cobroActual = await tx.cobroVenta.findUnique({
        where: { id },
        include: {
          registradoPor: { select: { id: true, nombre: true } },
        },
      });

      if (!cobroActual) {
        throw new DomainError(
          CodigoError.RECURSO_NO_ENCONTRADO,
          'Cobro no encontrado',
          HttpStatus.NOT_FOUND,
        );
      }

      if (cobroActual.deletedAt !== null) {
        throw new DomainError(
          CodigoError.COBRO_YA_ANULADO,
          'El cobro ya se encuentra anulado',
          HttpStatus.CONFLICT,
        );
      }

      // 6. Anulación lógica atómica (deletedAt = ahora con condición deletedAt IS NULL)
      const ahora = new Date();
      const updateResult = await tx.cobroVenta.updateMany({
        where: { id, deletedAt: null },
        data: { deletedAt: ahora },
      });

      if (updateResult.count === 0) {
        throw new DomainError(
          CodigoError.COBRO_YA_ANULADO,
          'El cobro ya se encuentra anulado',
          HttpStatus.CONFLICT,
        );
      }

      const cobroAnulado = await tx.cobroVenta.update({
        where: { id },
        data: { deletedAt: ahora },
        include: {
          registradoPor: { select: { id: true, nombre: true } },
        },
      });

      // 7. Auditar ELIMINAR en la misma transacción
      await this.auditService.registrar(
        {
          entidad: 'CobroVenta',
          entidadId: id,
          accion: AccionAuditoria.ELIMINAR,
          empresaId,
          usuarioId,
          valoresAnteriores: {
            id: cobroActual.id,
            ventaId: cobroActual.ventaId,
            fecha: FechaUtil.toDateOnly(cobroActual.fecha),
            monto: cobroActual.monto.toString(),
            metodo: cobroActual.metodo,
            referencia: cobroActual.referencia,
            createdAt: cobroActual.createdAt,
          },
          valoresNuevos: {
            deletedAt: ahora,
          },
        },
        tx,
      );

      return CobroMapper.toResponseDto(cobroAnulado);
    });
  }

  // =====================================================================
  // 3. DETALLE DE COBRO (GET /cobros/:id)
  // =====================================================================

  async obtenerCobroPorId(
    empresaId: number,
    id: number,
  ): Promise<CobroDetalleResponseDto> {
    const cobro = await this.prisma.cobroVenta.findFirst({
      where: {
        id,
        venta: {
          ciclo: { empresaId, deletedAt: null },
        },
      },
      include: {
        registradoPor: { select: { id: true, nombre: true } },
        venta: {
          select: {
            id: true,
            total: true,
            estado: true,
            fechaLimitePago: true,
          },
        },
      },
    });

    if (!cobro) {
      throw new DomainError(
        CodigoError.RECURSO_NO_ENCONTRADO,
        'Cobro no encontrado',
        HttpStatus.NOT_FOUND,
      );
    }

    const cobrosVigentesAgg = await this.prisma.cobroVenta.aggregate({
      where: {
        ventaId: cobro.ventaId,
        deletedAt: null,
      },
      _sum: {
        monto: true,
      },
    });

    return CobroMapper.toDetalleResponseDto(
      cobro,
      cobrosVigentesAgg._sum.monto ?? new Prisma.Decimal('0.00'),
    );
  }

  // =====================================================================
  // 4. LISTADO DE COBROS DE UNA VENTA (GET /ventas/:ventaId/cobros)
  // =====================================================================

  async listarCobrosDeVenta(
    empresaId: number,
    ventaId: number,
    filtro: FiltroCobroDto,
  ): Promise<PaginatedResponseDto<CobroResponseDto>> {
    // Validar aislamiento de la venta
    const venta = await this.prisma.venta.findFirst({
      where: {
        id: ventaId,
        deletedAt: null,
        ciclo: { empresaId, deletedAt: null },
      },
      select: { id: true },
    });

    if (!venta) {
      throw new DomainError(
        CodigoError.RECURSO_NO_ENCONTRADO,
        'Venta no encontrada',
        HttpStatus.NOT_FOUND,
      );
    }

    const page = filtro.page && filtro.page > 0 ? filtro.page : 1;
    const limit =
      filtro.limit && filtro.limit > 0 ? Math.min(filtro.limit, 100) : 20;
    const skip = (page - 1) * limit;

    const where: Prisma.CobroVentaWhereInput = {
      ventaId,
    };

    if (!filtro.incluirAnulados) {
      where.deletedAt = null;
    }

    const [total, registros] = await Promise.all([
      this.prisma.cobroVenta.count({ where }),
      this.prisma.cobroVenta.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ fecha: 'desc' }, { id: 'desc' }],
        include: {
          registradoPor: { select: { id: true, nombre: true } },
        },
      }),
    ]);

    return {
      data: registros.map((c) => CobroMapper.toResponseDto(c)),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}
