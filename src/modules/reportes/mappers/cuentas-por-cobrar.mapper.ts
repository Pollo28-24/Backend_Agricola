import { Prisma } from '@prisma/client';
import {
  ReporteFormatoUtil,
  ValorDecimalEntrada,
} from '../../../common/utils/reporte-formato.util';
import { VentaEstadoCobroPolicy } from '../../../common/domain/policies/venta-estado-cobro.policy';
import {
  CuentaPorCobrarItemDto,
  ResumenCuentasPorCobrarDto,
} from '../dto/cuentas-por-cobrar-response.dto';

export interface FilaCuentaPorCobrarRaw {
  ventaId: number;
  folio: string | null;
  clienteId: number;
  clienteNombre: string;
  cicloId: number;
  fechaVenta: Date | string;
  fechaVencimiento: Date | string | null;
  total: ValorDecimalEntrada;
  cobrado: ValorDecimalEntrada;
  estadoVenta: string;
}

export class CuentasPorCobrarMapper {
  /**
   * Mapea una fila cruda a un item del DTO de Cuentas por Cobrar.
   */
  public static toItemDto(
    fila: FilaCuentaPorCobrarRaw,
    hoy: string,
  ): CuentaPorCobrarItemDto {
    const totalDec = new Prisma.Decimal(
      fila.total !== null && fila.total !== undefined
        ? String(fila.total)
        : '0.00',
    );
    const cobradoDec = new Prisma.Decimal(
      fila.cobrado !== null && fila.cobrado !== undefined
        ? String(fila.cobrado)
        : '0.00',
    );

    const saldoCalculado = totalDec.minus(cobradoDec);
    const saldoFinal = saldoCalculado.isNegative()
      ? new Prisma.Decimal('0.00')
      : saldoCalculado;

    const fechaVentaStr = VentaEstadoCobroPolicy.normalizarFecha(
      fila.fechaVenta,
    )!;
    const fechaVencimientoStr = VentaEstadoCobroPolicy.normalizarFecha(
      fila.fechaVencimiento,
    );

    const resultadoPolicy = VentaEstadoCobroPolicy.calcularEstadoCobro({
      total: totalDec,
      totalCobrado: cobradoDec,
      estadoVenta: fila.estadoVenta,
      fechaLimitePago: fechaVencimientoStr,
      hoy,
    });

    let diasVencimiento: number | null = null;
    if (fechaVencimientoStr) {
      const msDia = 24 * 60 * 60 * 1000;
      const [yHoy, mHoy, dHoy] = hoy.split('-').map(Number);
      const [yVenc, mVenc, dVenc] = fechaVencimientoStr.split('-').map(Number);
      const utcHoy = Date.UTC(yHoy, mHoy - 1, dHoy);
      const utcVenc = Date.UTC(yVenc, mVenc - 1, dVenc);
      diasVencimiento = Math.round((utcHoy - utcVenc) / msDia);
    }

    return {
      ventaId: fila.ventaId,
      folio: fila.folio,
      clienteId: fila.clienteId,
      clienteNombre: fila.clienteNombre,
      cicloId: fila.cicloId,
      fechaVenta: fechaVentaStr,
      fechaVencimiento: fechaVencimientoStr,
      montoTotal: ReporteFormatoUtil.formatearImporte(totalDec) ?? '0.00',
      montoCobrado: ReporteFormatoUtil.formatearImporte(cobradoDec) ?? '0.00',
      montoPendiente: ReporteFormatoUtil.formatearImporte(saldoFinal) ?? '0.00',
      diasVencimiento,
      estadoCobro: resultadoPolicy.estadoCobro,
      vencida: resultadoPolicy.vencida,
    };
  }

  /**
   * Genera el resumen financiero global de cuentas por cobrar.
   */
  public static toResumenDto(
    items: CuentaPorCobrarItemDto[],
  ): ResumenCuentasPorCobrarDto {
    let sumPorCobrar = new Prisma.Decimal(0);
    let sumVencido = new Prisma.Decimal(0);
    let sumVigente = new Prisma.Decimal(0);
    const clientesMorosos = new Set<number>();

    for (const it of items) {
      const saldo = new Prisma.Decimal(it.montoPendiente);
      sumPorCobrar = sumPorCobrar.plus(saldo);

      if (it.vencida) {
        sumVencido = sumVencido.plus(saldo);
        clientesMorosos.add(it.clienteId);
      } else {
        sumVigente = sumVigente.plus(saldo);
      }
    }

    return {
      totalPorCobrar:
        ReporteFormatoUtil.formatearImporte(sumPorCobrar) ?? '0.00',
      totalVencido: ReporteFormatoUtil.formatearImporte(sumVencido) ?? '0.00',
      totalVigente: ReporteFormatoUtil.formatearImporte(sumVigente) ?? '0.00',
      totalClientesMorosos: clientesMorosos.size,
    };
  }
}
