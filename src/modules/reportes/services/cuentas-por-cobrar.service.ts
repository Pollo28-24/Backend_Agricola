import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { FiltroCuentasPorCobrarDto } from '../dto/filtro-cuentas-por-cobrar.dto';
import {
  CuentasPorCobrarResponseDto,
  ResumenCuentasPorCobrarDto,
} from '../dto/cuentas-por-cobrar-response.dto';
import {
  CuentasPorCobrarMapper,
  FilaCuentaPorCobrarRaw,
} from '../mappers/cuentas-por-cobrar.mapper';
import {
  VentaEstadoCobroPolicy,
  EstadoCobro,
} from '../../../common/domain/policies/venta-estado-cobro.policy';
import { PaginationUtil } from '../../../common/utils/pagination.util';
import { ReporteFormatoUtil } from '../../../common/utils/reporte-formato.util';

@Injectable()
export class CuentasPorCobrarService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Obtiene la cartera de cuentas por cobrar paginada y sus métricas agregadas (Hito 9B / ADR-010).
   *
   * Garantías:
   * 1. Aislamiento estricto multiempresa vía cp.empresaId.
   * 2. Exclusión de ventas canceladas y registros con deletedAt.
   * 3. Evaluación de estado de cobro con paridad estricta a VentaEstadoCobroPolicy.
   * 4. Reloj inyectable de fecha de corte 'hoy' (default: America/Mexico_City).
   */
  async obtenerCuentasPorCobrar(
    empresaId: number,
    filtro: FiltroCuentasPorCobrarDto,
  ): Promise<CuentasPorCobrarResponseDto> {
    const hoy = filtro.hoy ?? VentaEstadoCobroPolicy.obtenerHoyMexico();
    const page = filtro.page && filtro.page > 0 ? filtro.page : 1;
    const limit =
      filtro.limit && filtro.limit > 0 ? Math.min(filtro.limit, 100) : 10;
    const skip = (page - 1) * limit;

    // 1. Construcción dinámica de fragmentos WHERE parametrizados
    const whereConditions: Prisma.Sql[] = [
      Prisma.sql`cp.empresaId = ${empresaId}`,
      Prisma.sql`cp.deletedAt IS NULL`,
      Prisma.sql`v.deletedAt IS NULL`,
      Prisma.sql`v.estado != 'CANCELADA'`,
      Prisma.sql`cl.deletedAt IS NULL`,
    ];

    if (filtro.clienteId) {
      whereConditions.push(Prisma.sql`v.clienteId = ${filtro.clienteId}`);
    }

    if (filtro.estadoCobro) {
      switch (filtro.estadoCobro) {
        case EstadoCobro.PAGADA:
          whereConditions.push(
            Prisma.sql`COALESCE(cb.totalCobrado, 0) >= v.total`,
          );
          break;
        case EstadoCobro.PARCIAL:
          whereConditions.push(
            Prisma.sql`COALESCE(cb.totalCobrado, 0) > 0 AND COALESCE(cb.totalCobrado, 0) < v.total`,
          );
          break;
        case EstadoCobro.VENCIDA:
          whereConditions.push(
            Prisma.sql`COALESCE(cb.totalCobrado, 0) = 0 AND v.fechaLimitePago IS NOT NULL AND v.fechaLimitePago < ${hoy}`,
          );
          break;
        case EstadoCobro.PENDIENTE:
          whereConditions.push(
            Prisma.sql`COALESCE(cb.totalCobrado, 0) = 0 AND (v.fechaLimitePago IS NULL OR v.fechaLimitePago >= ${hoy})`,
          );
          break;
        default:
          break;
      }
    } else {
      // Por defecto: ventas con saldo pendiente por cobrar
      whereConditions.push(Prisma.sql`v.total > COALESCE(cb.totalCobrado, 0)`);
    }

    if (filtro.vencida !== undefined) {
      if (filtro.vencida) {
        whereConditions.push(
          Prisma.sql`v.total > COALESCE(cb.totalCobrado, 0) AND v.fechaLimitePago IS NOT NULL AND v.fechaLimitePago < ${hoy}`,
        );
      } else {
        whereConditions.push(
          Prisma.sql`NOT (v.total > COALESCE(cb.totalCobrado, 0) AND v.fechaLimitePago IS NOT NULL AND v.fechaLimitePago < ${hoy})`,
        );
      }
    }

    const whereSql = Prisma.join(whereConditions, ' AND ');

    // 2. Consulta de conteo total para paginación
    const countQuery = Prisma.sql`
      SELECT COUNT(*) AS total
      FROM venta v
      JOIN ciclo_produccion cp ON cp.id = v.cicloId
      JOIN cliente cl ON cl.id = v.clienteId
      LEFT JOIN (
        SELECT ventaId, SUM(monto) AS totalCobrado
        FROM cobro_venta
        WHERE deletedAt IS NULL
        GROUP BY ventaId
      ) cb ON cb.ventaId = v.id
      WHERE ${whereSql}
    `;

    const countResult: Array<{ total: bigint | number }> =
      await this.prisma.$queryRaw(countQuery);
    const total = Number(countResult[0]?.total ?? 0);

    // 3. Consulta agregada del resumen global de cuentas por cobrar
    const resumenQuery = Prisma.sql`
      SELECT
        COALESCE(SUM(GREATEST(0, v.total - COALESCE(cb.totalCobrado, 0))), 0) AS totalPorCobrar,
        COALESCE(SUM(CASE
          WHEN v.fechaLimitePago IS NOT NULL AND v.fechaLimitePago < ${hoy} AND v.total > COALESCE(cb.totalCobrado, 0)
          THEN GREATEST(0, v.total - COALESCE(cb.totalCobrado, 0))
          ELSE 0
        END), 0) AS totalVencido,
        COALESCE(SUM(CASE
          WHEN (v.fechaLimitePago IS NULL OR v.fechaLimitePago >= ${hoy}) AND v.total > COALESCE(cb.totalCobrado, 0)
          THEN GREATEST(0, v.total - COALESCE(cb.totalCobrado, 0))
          ELSE 0
        END), 0) AS totalVigente,
        COUNT(DISTINCT CASE
          WHEN v.fechaLimitePago IS NOT NULL AND v.fechaLimitePago < ${hoy} AND v.total > COALESCE(cb.totalCobrado, 0)
          THEN v.clienteId
          ELSE NULL
        END) AS totalClientesMorosos
      FROM venta v
      JOIN ciclo_produccion cp ON cp.id = v.cicloId AND cp.empresaId = ${empresaId} AND cp.deletedAt IS NULL
      JOIN cliente cl ON cl.id = v.clienteId AND cl.deletedAt IS NULL
      LEFT JOIN (
        SELECT ventaId, SUM(monto) AS totalCobrado
        FROM cobro_venta
        WHERE deletedAt IS NULL
        GROUP BY ventaId
      ) cb ON cb.ventaId = v.id
      WHERE v.deletedAt IS NULL
        AND v.estado != 'CANCELADA'
        AND v.total > COALESCE(cb.totalCobrado, 0)
        ${filtro.clienteId ? Prisma.sql`AND v.clienteId = ${filtro.clienteId}` : Prisma.empty}
    `;

    const resumenRows: Array<{
      totalPorCobrar: Prisma.Decimal | string | number;
      totalVencido: Prisma.Decimal | string | number;
      totalVigente: Prisma.Decimal | string | number;
      totalClientesMorosos: bigint | number;
    }> = await this.prisma.$queryRaw(resumenQuery);

    const rowResumen = resumenRows[0];
    const resumen: ResumenCuentasPorCobrarDto = {
      totalPorCobrar:
        ReporteFormatoUtil.formatearImporte(rowResumen?.totalPorCobrar) ??
        '0.00',
      totalVencido:
        ReporteFormatoUtil.formatearImporte(rowResumen?.totalVencido) ?? '0.00',
      totalVigente:
        ReporteFormatoUtil.formatearImporte(rowResumen?.totalVigente) ?? '0.00',
      totalClientesMorosos: Number(rowResumen?.totalClientesMorosos ?? 0),
    };

    if (total === 0) {
      return {
        data: [],
        resumen,
        meta: PaginationUtil.crearMeta(page, limit, 0),
      };
    }

    // 4. Consulta paginada de registros
    const dataQuery = Prisma.sql`
      SELECT
        v.id AS ventaId,
        v.numeroFactura AS folio,
        v.clienteId,
        cl.nombre AS clienteNombre,
        v.cicloId,
        v.fecha AS fechaVenta,
        v.fechaLimitePago AS fechaVencimiento,
        v.total,
        COALESCE(cb.totalCobrado, 0) AS cobrado,
        v.estado AS estadoVenta
      FROM venta v
      JOIN ciclo_produccion cp ON cp.id = v.cicloId
      JOIN cliente cl ON cl.id = v.clienteId
      LEFT JOIN (
        SELECT ventaId, SUM(monto) AS totalCobrado
        FROM cobro_venta
        WHERE deletedAt IS NULL
        GROUP BY ventaId
      ) cb ON cb.ventaId = v.id
      WHERE ${whereSql}
      ORDER BY (v.fechaLimitePago IS NULL) ASC, v.fechaLimitePago ASC, v.id DESC
      LIMIT ${limit} OFFSET ${skip}
    `;

    const rows: FilaCuentaPorCobrarRaw[] =
      await this.prisma.$queryRaw(dataQuery);

    const data = rows.map((r) => CuentasPorCobrarMapper.toItemDto(r, hoy));

    return {
      data,
      resumen,
      meta: PaginationUtil.crearMeta(page, limit, total),
    };
  }
}
