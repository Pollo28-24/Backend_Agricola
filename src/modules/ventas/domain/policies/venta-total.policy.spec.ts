import { Prisma } from '@prisma/client';
import { VentaTotalPolicy } from './venta-total.policy';
import { DomainError } from '../../../../common/errors/domain.error';
import { CodigoError } from '../../../../common/errors/codigos-error.enum';

describe('VentaTotalPolicy', () => {
  const policy = new VentaTotalPolicy();

  it('permite una diferencia de hasta 0.05 (tolerancia exacta)', () => {
    // subtotal = 100.00, descuento = 0, impuesto = 0 => calculado = 100.00
    // total declarado = 100.05 => diff = 0.05 <= 0.05
    expect(() =>
      policy.assertTotalValido({
        total: new Prisma.Decimal('100.05'),
        descuento: new Prisma.Decimal('0'),
        impuesto: new Prisma.Decimal('0'),
        renglones: [
          {
            cantidad: new Prisma.Decimal('10'),
            precioUnitario: new Prisma.Decimal('10.00'),
          },
        ],
      }),
    ).not.toThrow();
  });

  it('rechaza una diferencia de 0.051 (excede tolerancia)', () => {
    // subtotal = 100.00, total declarado = 100.051 => diff = 0.051 > 0.05
    expect(() =>
      policy.assertTotalValido({
        total: new Prisma.Decimal('100.051'),
        descuento: new Prisma.Decimal('0'),
        impuesto: new Prisma.Decimal('0'),
        renglones: [
          {
            cantidad: new Prisma.Decimal('10'),
            precioUnitario: new Prisma.Decimal('10.00'),
          },
        ],
      }),
    ).toThrow(DomainError);

    try {
      policy.assertTotalValido({
        total: new Prisma.Decimal('100.051'),
        descuento: new Prisma.Decimal('0'),
        impuesto: new Prisma.Decimal('0'),
        renglones: [
          {
            cantidad: new Prisma.Decimal('10'),
            precioUnitario: new Prisma.Decimal('10.00'),
          },
        ],
      });
    } catch (err) {
      expect((err as { code: string }).code).toBe(
        CodigoError.TOTAL_NO_COINCIDE,
      );
    }
  });

  it('calcula 0.1 x 3 sin error de precisión binaria (IEEE-754)', () => {
    // 3 renglones de cantidad = 1 y precio = 0.1 => subtotal = 0.3 exacto en Decimal
    expect(() =>
      policy.assertTotalValido({
        total: new Prisma.Decimal('0.30'),
        descuento: new Prisma.Decimal('0'),
        impuesto: new Prisma.Decimal('0'),
        renglones: [
          {
            cantidad: new Prisma.Decimal('1'),
            precioUnitario: new Prisma.Decimal('0.1'),
          },
          {
            cantidad: new Prisma.Decimal('1'),
            precioUnitario: new Prisma.Decimal('0.1'),
          },
          {
            cantidad: new Prisma.Decimal('1'),
            precioUnitario: new Prisma.Decimal('0.1'),
          },
        ],
      }),
    ).not.toThrow();
  });

  it('aplica descuento e impuesto correctamente (total = subtotal - descuento + impuesto)', () => {
    // subtotal = 100.00, descuento = 10.00, impuesto = 14.40 => calculado = 104.40
    expect(() =>
      policy.assertTotalValido({
        total: new Prisma.Decimal('104.40'),
        descuento: new Prisma.Decimal('10.00'),
        impuesto: new Prisma.Decimal('14.40'),
        renglones: [
          {
            cantidad: new Prisma.Decimal('2'),
            precioUnitario: new Prisma.Decimal('50.00'),
          },
        ],
      }),
    ).not.toThrow();
  });

  it('rechaza si impuesto > total (impuesto no puede superar el total pagable)', () => {
    expect(() =>
      policy.assertTotalValido({
        total: new Prisma.Decimal('50.00'),
        descuento: new Prisma.Decimal('60.00'),
        impuesto: new Prisma.Decimal('60.00'), // impuesto 60 > total 50
        renglones: [
          {
            cantidad: new Prisma.Decimal('1'),
            precioUnitario: new Prisma.Decimal('50.00'),
          },
        ],
      }),
    ).toThrow(DomainError);

    try {
      policy.assertTotalValido({
        total: new Prisma.Decimal('50.00'),
        descuento: new Prisma.Decimal('0'),
        impuesto: new Prisma.Decimal('50.01'),
        renglones: [
          {
            cantidad: new Prisma.Decimal('1'),
            precioUnitario: new Prisma.Decimal('50.00'),
          },
        ],
      });
    } catch (err) {
      const domErr = err as { code: string; message: string };
      expect(domErr.code).toBe(CodigoError.TOTAL_NO_COINCIDE);
      expect(domErr.message).toContain('impuesto no puede ser mayor');
    }
  });

  it('rechaza total negativo', () => {
    expect(() =>
      policy.assertTotalValido({
        total: new Prisma.Decimal('-10.00'),
        descuento: new Prisma.Decimal('0'),
        impuesto: new Prisma.Decimal('0'),
        renglones: [
          {
            cantidad: new Prisma.Decimal('1'),
            precioUnitario: new Prisma.Decimal('10.00'),
          },
        ],
      }),
    ).toThrow(DomainError);
  });

  it('rechaza renglones vacíos o que excedan 50', () => {
    expect(() =>
      policy.assertTotalValido({
        total: new Prisma.Decimal('100.00'),
        descuento: new Prisma.Decimal('0'),
        impuesto: new Prisma.Decimal('0'),
        renglones: [],
      }),
    ).toThrow(DomainError);

    const cincuentaYUnRenglones = Array.from({ length: 51 }, () => ({
      cantidad: new Prisma.Decimal('1'),
      precioUnitario: new Prisma.Decimal('10.00'),
    }));

    expect(() =>
      policy.assertTotalValido({
        total: new Prisma.Decimal('510.00'),
        descuento: new Prisma.Decimal('0'),
        impuesto: new Prisma.Decimal('0'),
        renglones: cincuentaYUnRenglones,
      }),
    ).toThrow(DomainError);
  });
});
