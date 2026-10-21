import { Prisma } from '@prisma/client';

export enum EstadoCobro {
  PENDIENTE = 'PENDIENTE',
  PARCIAL = 'PARCIAL',
  PAGADA = 'PAGADA',
  VENCIDA = 'VENCIDA',
  CANCELADA = 'CANCELADA',
}

export interface CalculoEstadoCobroParams {
  total: Prisma.Decimal | string | number;
  totalCobrado: Prisma.Decimal | string | number;
  estadoVenta: string;
  fechaLimitePago?: Date | string | null;
  hoy?: string; // YYYY-MM-DD inyectable para pruebas (RN-073)
}

export interface ResultadoEstadoCobro {
  estadoCobro: EstadoCobro;
  saldoPendiente: string;
  vencida: boolean;
}

export class VentaEstadoCobroPolicy {
  /**
   * Obtiene la fecha actual en America/Mexico_City en formato YYYY-MM-DD (RN-073).
   */
  static obtenerHoyMexico(): string {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Mexico_City',
    }).format(new Date());
  }

  /**
   * Normaliza una fecha (Date o string) a string YYYY-MM-DD para comparación lexicográfica.
   */
  static normalizarFecha(fecha?: Date | string | null): string | null {
    if (!fecha) {
      return null;
    }
    if (fecha instanceof Date) {
      return fecha.toISOString().slice(0, 10);
    }
    if (typeof fecha === 'string') {
      return fecha.slice(0, 10);
    }
    return null;
  }

  /**
   * Deriva el estado de cobro, saldo pendiente y bandera de vencida según RN-055, RN-056 y RN-073.
   * Regla maestra 2.5:
   * - CANCELADA: estado CANCELADA, saldo "0.00", vencida false
   * - No cancelada:
   *   - Σ >= total -> PAGADA, saldo "0.00", vencida false
   *   - 0 < Σ < total -> PARCIAL, saldo (total - Σ), vencida (hoy > fechaLimitePago)
   *   - Σ = 0 -> si (hoy > fechaLimitePago) VENCIDA, si no PENDIENTE; vencida (hoy > fechaLimitePago)
   */
  static calcularEstadoCobro(
    params: CalculoEstadoCobroParams,
  ): ResultadoEstadoCobro {
    const { total, totalCobrado, estadoVenta, fechaLimitePago } = params;
    const hoy = params.hoy ?? VentaEstadoCobroPolicy.obtenerHoyMexico();

    // 1. Venta CANCELADA (RN-055)
    if (estadoVenta === 'CANCELADA') {
      return {
        estadoCobro: EstadoCobro.CANCELADA,
        saldoPendiente: '0.00',
        vencida: false,
      };
    }

    const cero = new Prisma.Decimal('0.00');
    const totalDec =
      total instanceof Prisma.Decimal
        ? total
        : new Prisma.Decimal(String(total));
    const cobradoDec =
      totalCobrado instanceof Prisma.Decimal
        ? totalCobrado
        : new Prisma.Decimal(String(totalCobrado));

    // Saldo = max(0, total - cobrado)
    let saldo = totalDec.minus(cobradoDec);
    if (saldo.isNegative()) {
      saldo = cero;
    }
    const saldoPendiente = saldo.toFixed(2);

    const fechaLimiteStr =
      VentaEstadoCobroPolicy.normalizarFecha(fechaLimitePago);
    const estaPasadaDeFecha = fechaLimiteStr !== null && hoy > fechaLimiteStr;
    const tieneSaldo = saldo.greaterThan(cero);

    // Bandera aditiva vencida: no cancelada, saldo > 0, fecha límite definida y pasada
    const vencida = tieneSaldo && estaPasadaDeFecha;

    // 2. Estado derivado
    if (cobradoDec.greaterThanOrEqualTo(totalDec)) {
      return {
        estadoCobro: EstadoCobro.PAGADA,
        saldoPendiente: '0.00',
        vencida: false,
      };
    }

    if (cobradoDec.greaterThan(cero) && cobradoDec.lessThan(totalDec)) {
      // Un cobro parcial NUNCA es VENCIDA (tabla del maestro)
      return {
        estadoCobro: EstadoCobro.PARCIAL,
        saldoPendiente,
        vencida,
      };
    }

    // Σ = 0
    if (estaPasadaDeFecha) {
      return {
        estadoCobro: EstadoCobro.VENCIDA,
        saldoPendiente,
        vencida: true,
      };
    }

    return {
      estadoCobro: EstadoCobro.PENDIENTE,
      saldoPendiente,
      vencida: false,
    };
  }
}
