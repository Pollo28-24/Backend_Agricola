import { Prisma } from '@prisma/client';

export type ValorDecimalEntrada =
  Prisma.Decimal | string | number | bigint | null | undefined;

/**
 * Utilidad institucional para formateo numérico y redondeo en reportes (RN-066).
 *
 * Reglas de negocio:
 * 1. Importes y porcentajes a 2 decimales.
 * 2. Cantidades de peso (kg) a 3 decimales.
 * 3. Rendimiento, superficie y horas a 2 decimales.
 * 4. Redondeo estricto Prisma.Decimal.ROUND_HALF_UP (e.g. -0.005 -> -0.01; 0.005 -> 0.01).
 * 5. Valores nulos, indefinidos, vacíos o NaN se preservan como null (nunca 0 inventado ni NaN).
 * 6. BigInt y number son sanitizados y convertidos de forma segura sin pérdida de precisión.
 */
export class ReporteFormatoUtil {
  /**
   * Formatea un valor numérico/decimal con la cantidad de decimales y redondeo HALF_UP especificados.
   * Retorna null si la entrada es nula, indefinida, vacía, infinita o inválida.
   */
  public static formatearDecimal(
    val: ValorDecimalEntrada,
    decimales: number,
  ): string | null {
    if (val === null || val === undefined) {
      return null;
    }

    let valStr: string;

    if (typeof val === 'bigint') {
      valStr = val.toString();
    } else if (typeof val === 'number') {
      if (!Number.isFinite(val)) {
        return null;
      }
      valStr = val.toString();
    } else if (val instanceof Prisma.Decimal) {
      valStr = val.toString();
    } else if (typeof val === 'string') {
      valStr = val.trim();
      if (!valStr) {
        return null;
      }
    } else {
      return null;
    }

    try {
      const dec = new Prisma.Decimal(valStr);
      if (dec.isNaN()) {
        return null;
      }
      return dec
        .toDecimalPlaces(decimales, Prisma.Decimal.ROUND_HALF_UP)
        .toFixed(decimales);
    } catch {
      return null;
    }
  }

  /**
   * Importes monetarios a 2 decimales (costoTotal, ingresos, totalFacturado, cobrado, ganancia, porCobrar, monto, costoPorHectarea, costoPorKg, precioPromedioKg).
   */
  public static formatearImporte(val: ValorDecimalEntrada): string | null {
    return this.formatearDecimal(val, 2);
  }

  /**
   * Cantidades de masa (kg) a 3 decimales (kgCosechados, kgMermaPoscosecha, kgMermaCampo, kgNetos, kgVendidos, kgDisponibles, kgMerma).
   */
  public static formatearKg(val: ValorDecimalEntrada): string | null {
    return this.formatearDecimal(val, 3);
  }

  /**
   * Porcentajes a 2 decimales (margenPct, roiPct, mermaPct, porcentaje).
   */
  public static formatearPorcentaje(val: ValorDecimalEntrada): string | null {
    return this.formatearDecimal(val, 2);
  }

  /**
   * Rendimiento agrícola (kg/ha) a 2 decimales.
   */
  public static formatearRendimiento(val: ValorDecimalEntrada): string | null {
    return this.formatearDecimal(val, 2);
  }

  /**
   * Superficie sembrada (ha) a 2 decimales.
   */
  public static formatearSuperficie(val: ValorDecimalEntrada): string | null {
    return this.formatearDecimal(val, 2);
  }

  /**
   * Horas trabajadas a 2 decimales.
   */
  public static formatearHoras(val: ValorDecimalEntrada): string | null {
    return this.formatearDecimal(val, 2);
  }
}
