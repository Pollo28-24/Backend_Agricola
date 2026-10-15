import { Prisma } from '@prisma/client';

export class MoneyUtil {
  public static readonly TOLERANCIA_CENTAVOS = new Prisma.Decimal('0.05');

  public static toDecimal(val: number | string | Prisma.Decimal): Prisma.Decimal {
    if (val instanceof Prisma.Decimal) return val;
    return new Prisma.Decimal(val);
  }

  public static sonEquivalentesConTolerancia(
    montoA: Prisma.Decimal | number | string,
    montoB: Prisma.Decimal | number | string,
    tolerancia: Prisma.Decimal = MoneyUtil.TOLERANCIA_CENTAVOS,
  ): boolean {
    const a = MoneyUtil.toDecimal(montoA);
    const b = MoneyUtil.toDecimal(montoB);
    const diff = a.minus(b).abs();
    return diff.lessThanOrEqualTo(tolerancia);
  }

  public static redondear(
    monto: Prisma.Decimal | number | string,
    decimales = 2,
  ): Prisma.Decimal {
    const d = MoneyUtil.toDecimal(monto);
    return d.toDecimalPlaces(decimales, Prisma.Decimal.ROUND_HALF_UP);
  }

  public static formatString(
    monto: Prisma.Decimal | number | string,
    decimales = 2,
  ): string {
    return MoneyUtil.redondear(monto, decimales).toFixed(decimales);
  }
}
