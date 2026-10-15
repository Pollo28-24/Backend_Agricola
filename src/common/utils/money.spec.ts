import { Prisma } from '@prisma/client';
import { MoneyUtil } from './money';

describe('MoneyUtil', () => {
  it('debe convertir number, string y Decimal a Prisma.Decimal', () => {
    expect(MoneyUtil.toDecimal(10.5)).toBeInstanceOf(Prisma.Decimal);
    expect(MoneyUtil.toDecimal('10.50')).toBeInstanceOf(Prisma.Decimal);
    expect(MoneyUtil.toDecimal(new Prisma.Decimal(10.5))).toBeInstanceOf(
      Prisma.Decimal,
    );
  });

  it('debe validar tolerancia de 0.05 centavos correctamente (RN-045 y RN-052)', () => {
    // Diferencia menor o igual a 0.05
    expect(MoneyUtil.sonEquivalentesConTolerancia(100.0, 100.04)).toBe(true);
    expect(MoneyUtil.sonEquivalentesConTolerancia(100.0, 100.05)).toBe(true);
    expect(MoneyUtil.sonEquivalentesConTolerancia(100.0, 99.95)).toBe(true);

    // Diferencia mayor a 0.05
    expect(MoneyUtil.sonEquivalentesConTolerancia(100.0, 100.06)).toBe(false);
    expect(MoneyUtil.sonEquivalentesConTolerancia(100.0, 99.94)).toBe(false);
  });

  it('debe redondear mitades hacia arriba (ROUND_HALF_UP)', () => {
    const red = MoneyUtil.redondear(10.4878, 2);
    expect(red.toNumber()).toBe(10.49);

    const redProm = MoneyUtil.redondear(14.7561, 2);
    expect(redProm.toNumber()).toBe(14.76);
  });

  it('debe formatear a string con decimales exactos', () => {
    expect(MoneyUtil.formatString(100, 2)).toBe('100.00');
    expect(MoneyUtil.formatString('10.4878', 2)).toBe('10.49');
  });
});
