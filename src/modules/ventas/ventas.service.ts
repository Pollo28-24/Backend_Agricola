import { HttpStatus, Injectable } from '@nestjs/common';
import { AccionAuditoria, EstadoVenta, Prisma } from '@prisma/client';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../prisma/audit.service';
import { CicloCapturaPolicy } from '../../common/domain/policies/ciclo-captura.policy';
import { UnidadPesoPolicy } from '../../common/domain/policies/unidad-peso.policy';
import { CicloBalanceMasaPolicy } from '../../common/domain/policies/ciclo-balance-masa.policy';
import { VentaTotalPolicy } from './domain/policies/venta-total.policy';
import {
  bloquearCicloParaCaptura,
  calcularBalanceMasaKg,
} from '../../common/utils/ciclo-balance.util';
import { bloquearVentaParaModificacion } from '../../common/utils/venta-lock.util';
import { VENTA_SELECTS } from './queries/venta-selects.constant';
import { VentaMapper } from './mappers/venta.mapper';
import { CreateVentaDto } from './dto/create-venta.dto';
import { UpdateVentaDto } from './dto/update-venta.dto';
import { FiltroVentaDto } from './dto/filtro-venta.dto';
import { VentaResponseDto } from './dto/venta-response.dto';
import { PaginatedResponseDto } from '../../common/dto/paginated-response.dto';
import { DomainError } from '../../common/errors/domain.error';
import { CodigoError } from '../../common/errors/codigos-error.enum';
import { FechaUtil } from '../../common/utils/fechas';

dayjs.extend(utc);

@Injectable()
export class VentasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly cicloCapturaPolicy: CicloCapturaPolicy,
    private readonly unidadPesoPolicy: UnidadPesoPolicy,
    private readonly ventaTotalPolicy: VentaTotalPolicy,
    private readonly balancePolicy: CicloBalanceMasaPolicy,
  ) {}

  // =====================================================================
  // 1. CREACIÓN DE VENTA (RN-027, RN-044, RN-052, RN-053, RN-069)
  // =====================================================================

  async crearVenta(
    empresaId: number,
    usuarioId: number,
    dto: CreateVentaDto,
  ): Promise<VentaResponseDto> {
    const fechaOperativa = this.parsearFecha(dto.fecha);

    return this.prisma.$transaction(async (tx) => {
      // 1. Bloqueo pesimista del ciclo (orden único: ciclo primero)
      const ciclo = await bloquearCicloParaCaptura(tx, dto.cicloId, empresaId);

      // 2. Validar ciclo de vida (rechaza PLANIFICADO con CICLO_NO_ACTIVO, FINALIZADO/CANCELADO con CICLO_CERRADO)
      this.cicloCapturaPolicy.assertCaptureAllowed(
        { estado: ciclo.estado },
        'venta',
      );
      this.cicloCapturaPolicy.assertFechaCoherente(
        ciclo,
        fechaOperativa,
        'venta',
      );

      // 3. Validar referencias
      // a) Cliente
      const cliente = await tx.cliente.findFirst({
        where: { id: dto.clienteId, empresaId, deletedAt: null },
        select: VENTA_SELECTS.CLIENTE_VALIDACION,
      });
      if (!cliente) {
        throw new DomainError(
          CodigoError.RECURSO_NO_ENCONTRADO,
          'Cliente no encontrado o no pertenece a la empresa',
          HttpStatus.NOT_FOUND,
        );
      }
      if (!cliente.activo) {
        throw new DomainError(
          CodigoError.CLIENTE_NO_ACTIVO,
          'El cliente seleccionado no se encuentra activo para nuevas ventas',
          HttpStatus.BAD_REQUEST,
        );
      }

      // b) Unidades de medida y cosechas de renglones
      await this.validarRenglones(tx, dto.cicloId, empresaId, dto.renglones);

      // 4. Validar cuadratura del total (RN-052)
      this.ventaTotalPolicy.assertTotalValido({
        total: new Prisma.Decimal(dto.total),
        descuento: dto.descuento
          ? new Prisma.Decimal(dto.descuento)
          : new Prisma.Decimal('0'),
        impuesto: dto.impuesto
          ? new Prisma.Decimal(dto.impuesto)
          : new Prisma.Decimal('0'),
        renglones: dto.renglones.map((r) => ({
          cantidad: new Prisma.Decimal(r.cantidad),
          precioUnitario: new Prisma.Decimal(r.precioUnitario),
        })),
      });

      // 5. Escribir venta y renglones
      const nuevaVenta = await tx.venta.create({
        data: {
          cicloId: dto.cicloId,
          clienteId: dto.clienteId,
          creadoPorId: usuarioId,
          fecha: fechaOperativa,
          numeroFactura: dto.numeroFactura ?? null,
          descuento: new Prisma.Decimal(dto.descuento ?? '0'),
          impuesto: new Prisma.Decimal(dto.impuesto ?? '0'),
          total: new Prisma.Decimal(dto.total),
          fechaLimitePago: dto.fechaLimitePago
            ? this.parsearFecha(dto.fechaLimitePago)
            : null,
          estado: EstadoVenta.REGISTRADA,
          notas: dto.notas ?? null,
          detalles: {
            create: dto.renglones.map((r) => ({
              cosechaId: r.cosechaId ?? null,
              unidadId: r.unidadId,
              calidad: r.calidad,
              cantidad: new Prisma.Decimal(r.cantidad),
              precioUnitario: new Prisma.Decimal(r.precioUnitario),
            })),
          },
        },
        include: {
          cliente: { select: { id: true, nombre: true } },
          detalles: {
            include: {
              unidad: { select: { id: true, nombre: true, codigo: true } },
            },
          },
        },
      });

      // 6. Recalcular balance de masa y validar que kgVendidos <= kgNetos (RN-027)
      const balance = await calcularBalanceMasaKg(tx, dto.cicloId);
      this.balancePolicy.assertVendidoNoExcedeNetos(
        balance,
        CodigoError.VENTA_EXCEDE_DISPONIBLE,
      );

      // 7. Auditar atómicamente en la misma transacción
      await this.auditService.registrar(
        {
          entidad: 'Venta',
          entidadId: nuevaVenta.id,
          accion: AccionAuditoria.CREAR,
          empresaId,
          usuarioId,
          valoresNuevos: {
            id: nuevaVenta.id,
            cicloId: nuevaVenta.cicloId,
            clienteId: nuevaVenta.clienteId,
            fecha: dto.fecha,
            total: nuevaVenta.total.toString(),
            descuento: nuevaVenta.descuento.toString(),
            impuesto: nuevaVenta.impuesto.toString(),
            numeroFactura: nuevaVenta.numeroFactura,
            notas: nuevaVenta.notas,
            fechaLimitePago: dto.fechaLimitePago ?? null,
            renglones: nuevaVenta.detalles.map((d) => ({
              id: d.id,
              cosechaId: d.cosechaId,
              unidadId: d.unidadId,
              calidad: d.calidad,
              cantidad: d.cantidad.toString(),
              precioUnitario: d.precioUnitario.toString(),
            })),
          },
        },
        tx,
      );

      return VentaMapper.toResponseDto(nuevaVenta);
    });
  }

  // =====================================================================
  // 2. ACTUALIZACIÓN DE VENTA (REEMPLAZO ATÓMICO TOTAL DE RENGLONES)
  // =====================================================================

  async actualizarVenta(
    id: number,
    empresaId: number,
    usuarioId: number,
    dto: UpdateVentaDto,
  ): Promise<VentaResponseDto> {
    // 1. Obtener cicloId fuera de la transacción para no fijar snapshot MVCC en tx antes del lock
    const ventaPrevia = await this.prisma.venta.findFirst({
      where: {
        id,
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
      // 2. Bloqueo del ciclo (orden estricto institucional: ciclo primero)
      const ciclo = await bloquearCicloParaCaptura(
        tx,
        ventaPrevia.cicloId,
        empresaId,
      );

      // 3. Bloqueo pesimista de la venta con JOIN de ciclo y empresaId
      await bloquearVentaParaModificacion(tx, id, empresaId);

      // 4. Releer la venta completa bajo el lock
      const ventaActual = await tx.venta.findUnique({
        where: { id },
        include: {
          cliente: true,
          ciclo: true,
          detalles: {
            include: {
              unidad: { select: { id: true, nombre: true, codigo: true } },
            },
          },
        },
      });

      if (
        !ventaActual ||
        ventaActual.deletedAt !== null ||
        ventaActual.ciclo.empresaId !== empresaId
      ) {
        throw new DomainError(
          CodigoError.RECURSO_NO_ENCONTRADO,
          'Venta no encontrada',
          HttpStatus.NOT_FOUND,
        );
      }

      if (ventaActual.estado === EstadoVenta.CANCELADA) {
        throw new DomainError(
          CodigoError.VENTA_YA_CANCELADA,
          'No se puede editar una venta en estado CANCELADA',
          HttpStatus.CONFLICT,
        );
      }

      // 5. Validar ciclo de vida
      this.cicloCapturaPolicy.assertCaptureAllowed(
        { estado: ciclo.estado },
        'venta',
      );

      // 6. Fusionar cabecera existente con payload
      const fechaOperativa = dto.fecha
        ? this.parsearFecha(dto.fecha)
        : ventaActual.fecha;
      if (dto.fecha) {
        this.cicloCapturaPolicy.assertFechaCoherente(
          ciclo,
          fechaOperativa,
          'venta',
        );
      }

      let clienteIdFinal = ventaActual.clienteId;
      if (dto.clienteId && dto.clienteId !== ventaActual.clienteId) {
        const nuevoCliente = await tx.cliente.findFirst({
          where: { id: dto.clienteId, empresaId, deletedAt: null },
          select: VENTA_SELECTS.CLIENTE_VALIDACION,
        });
        if (!nuevoCliente) {
          throw new DomainError(
            CodigoError.RECURSO_NO_ENCONTRADO,
            'Cliente no encontrado o no pertenece a la empresa',
            HttpStatus.NOT_FOUND,
          );
        }
        if (!nuevoCliente.activo) {
          throw new DomainError(
            CodigoError.CLIENTE_NO_ACTIVO,
            'El cliente seleccionado no se encuentra activo',
            HttpStatus.BAD_REQUEST,
          );
        }
        clienteIdFinal = dto.clienteId;
      }

      const totalFinal =
        dto.total !== undefined
          ? new Prisma.Decimal(dto.total)
          : ventaActual.total;
      const descuentoFinal =
        dto.descuento !== undefined
          ? new Prisma.Decimal(dto.descuento)
          : ventaActual.descuento;
      const impuestoFinal =
        dto.impuesto !== undefined
          ? new Prisma.Decimal(dto.impuesto)
          : ventaActual.impuesto;

      // Determinar renglones a validar para cuadratura RN-052
      const tienenNuevosRenglones = dto.renglones && dto.renglones.length > 0;
      if (tienenNuevosRenglones) {
        await this.validarRenglones(
          tx,
          ventaActual.cicloId,
          empresaId,
          dto.renglones!,
        );
      }

      const renglonesParaCuadratura = tienenNuevosRenglones
        ? dto.renglones!.map((r) => ({
            cantidad: new Prisma.Decimal(r.cantidad),
            precioUnitario: new Prisma.Decimal(r.precioUnitario),
          }))
        : ventaActual.detalles.map((d) => ({
            cantidad: d.cantidad,
            precioUnitario: d.precioUnitario,
          }));

      // SIEMPRE revalidar RN-052 con valores fusionados
      this.ventaTotalPolicy.assertTotalValido({
        total: totalFinal,
        descuento: descuentoFinal,
        impuesto: impuestoFinal,
        renglones: renglonesParaCuadratura,
      });

      // Validar que nuevoTotal >= Σ cobros vigentes (RN-054, RN-071)
      const cobrosVigentesAgg = tx.cobroVenta
        ? await tx.cobroVenta.aggregate({
            where: { ventaId: id, deletedAt: null },
            _sum: { monto: true },
          })
        : null;
      const sumaCobrosVigentes =
        cobrosVigentesAgg?._sum?.monto ?? new Prisma.Decimal('0.00');
      if (totalFinal.lessThan(sumaCobrosVigentes)) {
        throw new DomainError(
          CodigoError.COBRO_EXCEDE_TOTAL,
          'El total de la venta no puede ser menor a la suma de cobros vigentes registrados',
          HttpStatus.CONFLICT,
        );
      }

      // Snapshot anterior completo para auditoría (cabecera + renglones)
      const snapshotAnterior = {
        id: ventaActual.id,
        clienteId: ventaActual.clienteId,
        fecha: FechaUtil.toDateOnly(ventaActual.fecha),
        total: ventaActual.total.toString(),
        descuento: ventaActual.descuento.toString(),
        impuesto: ventaActual.impuesto.toString(),
        numeroFactura: ventaActual.numeroFactura,
        notas: ventaActual.notas,
        fechaLimitePago: ventaActual.fechaLimitePago
          ? FechaUtil.toDateOnly(ventaActual.fechaLimitePago)
          : null,
        renglones: ventaActual.detalles.map((d) => ({
          id: d.id,
          cosechaId: d.cosechaId,
          unidadId: d.unidadId,
          calidad: d.calidad,
          cantidad: d.cantidad.toString(),
          precioUnitario: d.precioUnitario.toString(),
        })),
      };

      // 7. Si vienen renglones: reemplazo atómico total
      if (tienenNuevosRenglones) {
        await tx.detalleVenta.deleteMany({
          where: { ventaId: id },
        });

        await tx.detalleVenta.createMany({
          data: dto.renglones!.map((r) => ({
            ventaId: id,
            cosechaId: r.cosechaId ?? null,
            unidadId: r.unidadId,
            calidad: r.calidad,
            cantidad: new Prisma.Decimal(r.cantidad),
            precioUnitario: new Prisma.Decimal(r.precioUnitario),
          })),
        });
      }

      // 8. Actualizar cabecera
      const ventaActualizada = await tx.venta.update({
        where: { id },
        data: {
          clienteId: clienteIdFinal,
          fecha: fechaOperativa,
          numeroFactura:
            dto.numeroFactura !== undefined
              ? dto.numeroFactura
              : ventaActual.numeroFactura,
          descuento: descuentoFinal,
          impuesto: impuestoFinal,
          total: totalFinal,
          fechaLimitePago:
            dto.fechaLimitePago !== undefined
              ? dto.fechaLimitePago
                ? this.parsearFecha(dto.fechaLimitePago)
                : null
              : ventaActual.fechaLimitePago,
          notas: dto.notas !== undefined ? dto.notas : ventaActual.notas,
        },
        include: {
          cliente: { select: { id: true, nombre: true } },
          detalles: {
            include: {
              unidad: { select: { id: true, nombre: true, codigo: true } },
            },
          },
        },
      });

      // 9. Recalcular balance de masa y validar que kgVendidos <= kgNetos (RN-027)
      const balance = await calcularBalanceMasaKg(tx, ventaActual.cicloId);
      this.balancePolicy.assertVendidoNoExcedeNetos(
        balance,
        CodigoError.VENTA_EXCEDE_DISPONIBLE,
      );

      // 10. Auditar con snapshot completo de valores anteriores y nuevos (incluyendo renglones)
      const snapshotNuevo = {
        id: ventaActualizada.id,
        clienteId: ventaActualizada.clienteId,
        fecha: FechaUtil.toDateOnly(ventaActualizada.fecha),
        total: ventaActualizada.total.toString(),
        descuento: ventaActualizada.descuento.toString(),
        impuesto: ventaActualizada.impuesto.toString(),
        numeroFactura: ventaActualizada.numeroFactura,
        notas: ventaActualizada.notas,
        fechaLimitePago: ventaActualizada.fechaLimitePago
          ? FechaUtil.toDateOnly(ventaActualizada.fechaLimitePago)
          : null,
        renglones: ventaActualizada.detalles.map((d) => ({
          id: d.id,
          cosechaId: d.cosechaId,
          unidadId: d.unidadId,
          calidad: d.calidad,
          cantidad: d.cantidad.toString(),
          precioUnitario: d.precioUnitario.toString(),
        })),
      };

      await this.auditService.registrar(
        {
          entidad: 'Venta',
          entidadId: id,
          accion: AccionAuditoria.ACTUALIZAR,
          empresaId,
          usuarioId,
          valoresAnteriores: snapshotAnterior,
          valoresNuevos: snapshotNuevo,
        },
        tx,
      );

      return VentaMapper.toResponseDto(ventaActualizada, sumaCobrosVigentes);
    });
  }

  // =====================================================================
  // 3. CANCELACIÓN DE VENTA (RN-055, SIN DELETE, LIBERA MASA)
  // =====================================================================

  async cancelarVenta(
    id: number,
    empresaId: number,
    usuarioId: number,
  ): Promise<VentaResponseDto> {
    // 1. Obtener cicloId fuera de la transacción para no fijar snapshot MVCC en tx antes del lock
    const ventaPrevia = await this.prisma.venta.findFirst({
      where: {
        id,
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

      // 3. Bloquear venta
      await bloquearVentaParaModificacion(tx, id, empresaId);

      // 4. Releer venta
      const ventaActual = await tx.venta.findUnique({
        where: { id },
        include: {
          cliente: { select: { id: true, nombre: true } },
          detalles: {
            include: {
              unidad: { select: { id: true, nombre: true, codigo: true } },
            },
          },
        },
      });

      if (!ventaActual || ventaActual.deletedAt !== null) {
        throw new DomainError(
          CodigoError.RECURSO_NO_ENCONTRADO,
          'Venta no encontrada',
          HttpStatus.NOT_FOUND,
        );
      }

      // Validar ciclo de vida
      this.cicloCapturaPolicy.assertCaptureAllowed(
        { estado: ciclo.estado },
        'venta',
      );

      if (ventaActual.estado === EstadoVenta.CANCELADA) {
        throw new DomainError(
          CodigoError.VENTA_YA_CANCELADA,
          'La venta ya se encuentra cancelada',
          HttpStatus.CONFLICT,
        );
      }

      // 5. Actualizar a CANCELADA sin tocar renglones ni cobros (RN-055)
      const ventaCancelada = await tx.venta.update({
        where: { id },
        data: { estado: EstadoVenta.CANCELADA },
        include: {
          cliente: { select: { id: true, nombre: true } },
          detalles: {
            include: {
              unidad: { select: { id: true, nombre: true, codigo: true } },
            },
          },
        },
      });

      // 6. Auditar ACTUALIZAR
      await this.auditService.registrar(
        {
          entidad: 'Venta',
          entidadId: id,
          accion: AccionAuditoria.ACTUALIZAR,
          empresaId,
          usuarioId,
          valoresAnteriores: { estado: ventaActual.estado },
          valoresNuevos: { estado: EstadoVenta.CANCELADA },
        },
        tx,
      );

      const cobrosCancelacionAgg = tx.cobroVenta
        ? await tx.cobroVenta.aggregate({
            where: { ventaId: id, deletedAt: null },
            _sum: { monto: true },
          })
        : null;

      return VentaMapper.toResponseDto(
        ventaCancelada,
        cobrosCancelacionAgg?._sum?.monto ?? new Prisma.Decimal('0.00'),
      );
    });
  }

  // =====================================================================
  // 4. OBTENER DETALLE (GET /ventas/:id)
  // =====================================================================

  async obtenerVentaPorId(
    id: number,
    empresaId: number,
  ): Promise<VentaResponseDto> {
    const venta = await this.prisma.venta.findFirst({
      where: {
        id,
        deletedAt: null,
        ciclo: { empresaId, deletedAt: null },
      },
      include: {
        cliente: { select: { id: true, nombre: true } },
        detalles: {
          include: {
            unidad: { select: { id: true, nombre: true, codigo: true } },
          },
        },
      },
    });

    if (!venta) {
      throw new DomainError(
        CodigoError.RECURSO_NO_ENCONTRADO,
        'Venta no encontrada',
        HttpStatus.NOT_FOUND,
      );
    }

    const cobrosDetalleAgg = this.prisma.cobroVenta
      ? await this.prisma.cobroVenta.aggregate({
          where: { ventaId: id, deletedAt: null },
          _sum: { monto: true },
        })
      : null;

    return VentaMapper.toResponseDto(
      venta,
      cobrosDetalleAgg?._sum?.monto ?? new Prisma.Decimal('0.00'),
    );
  }

  // =====================================================================
  // 5. LISTADO PAGINADO (GET /ventas)
  // =====================================================================

  async listarVentas(
    empresaId: number,
    filtro: FiltroVentaDto,
  ): Promise<PaginatedResponseDto<VentaResponseDto>> {
    const page = filtro.page && filtro.page > 0 ? filtro.page : 1;
    const limit =
      filtro.limit && filtro.limit > 0 ? Math.min(filtro.limit, 100) : 20;
    const skip = (page - 1) * limit;

    const where: Prisma.VentaWhereInput = {
      deletedAt: null,
      ciclo: { empresaId, deletedAt: null },
    };

    if (filtro.cicloId) {
      where.cicloId = filtro.cicloId;
    }

    if (filtro.clienteId) {
      where.clienteId = filtro.clienteId;
    }

    if (filtro.estado) {
      where.estado = filtro.estado;
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
      this.prisma.venta.count({ where }),
      this.prisma.venta.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ fecha: 'desc' }, { id: 'desc' }],
        include: {
          cliente: { select: { id: true, nombre: true } },
          detalles: {
            include: {
              unidad: { select: { id: true, nombre: true, codigo: true } },
            },
          },
        },
      }),
    ]);

    const ventaIds = registros.map((v) => v.id);
    const cobrosPorVenta =
      ventaIds.length > 0 && this.prisma.cobroVenta
        ? await this.prisma.cobroVenta.groupBy({
            by: ['ventaId'],
            where: {
              ventaId: { in: ventaIds },
              deletedAt: null,
            },
            _sum: {
              monto: true,
            },
          })
        : [];

    const cobrosMap = new Map<number, Prisma.Decimal>();
    for (const c of cobrosPorVenta) {
      if (c._sum.monto) {
        cobrosMap.set(c.ventaId, c._sum.monto);
      }
    }

    return {
      data: registros.map((v) =>
        VentaMapper.toResponseDto(
          v,
          cobrosMap.get(v.id) ?? new Prisma.Decimal('0.00'),
        ),
      ),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // =====================================================================
  // MÉTODOS AUXILIARES Y PRIVADOS
  // =====================================================================

  private async validarRenglones(
    tx: Prisma.TransactionClient,
    cicloId: number,
    empresaId: number,
    renglones: Array<{
      unidadId: number;
      calidad: any;
      cantidad: string;
      precioUnitario: string;
      cosechaId?: number;
    }>,
  ): Promise<void> {
    // 1. Validar unidades
    const unidadIds = Array.from(new Set(renglones.map((r) => r.unidadId)));
    const unidades = await tx.unidadMedida.findMany({
      where: { id: { in: unidadIds } },
      select: VENTA_SELECTS.UNIDAD_VALIDACION,
    });

    if (unidades.length !== unidadIds.length) {
      throw new DomainError(
        CodigoError.RECURSO_NO_ENCONTRADO,
        'Una o más unidades de medida no existen en el sistema',
        HttpStatus.NOT_FOUND,
      );
    }

    for (const u of unidades) {
      this.unidadPesoPolicy.assertUnidadEsDePeso({ unidad: u });
    }

    // 2. Validar cosechas referenciadas
    const cosechaIds = Array.from(
      new Set(
        renglones
          .filter((r) => r.cosechaId !== undefined && r.cosechaId !== null)
          .map((r) => r.cosechaId!),
      ),
    );

    if (cosechaIds.length > 0) {
      const cosechas = await tx.cosecha.findMany({
        where: { id: { in: cosechaIds } },
        select: VENTA_SELECTS.COSECHA_VALIDACION,
      });

      if (cosechas.length !== cosechaIds.length) {
        throw new DomainError(
          CodigoError.RECURSO_NO_ENCONTRADO,
          'Una o más cosechas referenciadas no existen',
          HttpStatus.NOT_FOUND,
        );
      }

      for (const c of cosechas) {
        if (c.deletedAt !== null || c.ciclo.empresaId !== empresaId) {
          throw new DomainError(
            CodigoError.RECURSO_NO_ENCONTRADO,
            'Cosecha no encontrada o no pertenece a la empresa',
            HttpStatus.NOT_FOUND,
          );
        }
        if (c.cicloId !== cicloId) {
          throw new DomainError(
            CodigoError.COSECHA_DE_OTRO_CICLO,
            'La cosecha referenciada no pertenece al ciclo de producción de la venta (RN-053)',
            HttpStatus.BAD_REQUEST,
          );
        }
      }
    }
  }

  private parsearFecha(fechaStr: string): Date {
    return dayjs.utc(fechaStr, 'YYYY-MM-DD', true).toDate();
  }
}
