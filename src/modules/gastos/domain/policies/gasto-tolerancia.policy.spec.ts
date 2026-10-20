import { HttpStatus } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { GastoToleranciaPolicy } from './gasto-tolerancia.policy';
import { DomainError } from '../../../../common/errors/domain.error';
import { CodigoError } from '../../../../common/errors/codigos-error.enum';

describe('GastoToleranciaPolicy (RN-045)', () => {
  let policy: GastoToleranciaPolicy;

  beforeEach(() => {
    policy = new GastoToleranciaPolicy();
  });

  it('debe aprobar cuando la diferencia aritmética es exactamente 0', () => {
    // 10 * 15.50 + 20.00 = 175.00
    expect(() =>
      policy.assertToleranciaValida({
        total: new Prisma.Decimal('175.00'),
        cantidad: new Prisma.Decimal('10.000'),
        costoUnitario: new Prisma.Decimal('15.50'),
        impuesto: new Prisma.Decimal('20.00'),
      }),
    ).not.toThrow();
  });

  it('debe aprobar cuando la diferencia es exactamente 0.05 centavos (límite superior)', () => {
    // Calculado: 10 * 10 = 100. Total ingresado: 100.05 -> dif = 0.05
    expect(() =>
      policy.assertToleranciaValida({
        total: new Prisma.Decimal('100.05'),
        cantidad: new Prisma.Decimal('10'),
        costoUnitario: new Prisma.Decimal('10'),
        impuesto: new Prisma.Decimal('0'),
      }),
    ).not.toThrow();

    // Calculado: 100. Total ingresado: 99.95 -> dif = 0.05
    expect(() =>
      policy.assertToleranciaValida({
        total: new Prisma.Decimal('99.95'),
        cantidad: new Prisma.Decimal('10'),
        costoUnitario: new Prisma.Decimal('10'),
        impuesto: new Prisma.Decimal('0'),
      }),
    ).not.toThrow();
  });

  it('debe fallar con TOTAL_NO_COINCIDE cuando la diferencia es 0.06 centavos', () => {
    // Calculado: 100. Total ingresado: 100.06 -> dif = 0.06
    expect(() =>
      policy.assertToleranciaValida({
        total: new Prisma.Decimal('100.06'),
        cantidad: new Prisma.Decimal('10'),
        costoUnitario: new Prisma.Decimal('10'),
        impuesto: new Prisma.Decimal('0'),
      }),
    ).toThrow(
      new DomainError(
        CodigoError.TOTAL_NO_COINCIDE,
        'El total del gasto (100.06) no coincide con el cálculo del comprobante (100). La diferencia máxima permitida es de 0.05 (RN-045)',
        HttpStatus.BAD_REQUEST,
      ),
    );
  });

  it('debe asumir impuesto = 0 cuando el impuesto es nulo o indefinido (A1)', () => {
    // 5 * 20 = 100. Total: 100. Impuesto omitido -> pasa sin error
    expect(() =>
      policy.assertToleranciaValida({
        total: new Prisma.Decimal('100.00'),
        cantidad: new Prisma.Decimal('5'),
        costoUnitario: new Prisma.Decimal('20'),
        impuesto: null,
      }),
    ).not.toThrow();
  });

  it('debe evitar el error clásico de coma flotante IEEE 754 (0.1 x 3 sin residuos binarios)', () => {
    // En JS estándar: 0.1 * 3 = 0.30000000000000004
    // Con Prisma.Decimal: '0.1' * '3' = '0.3' exacto
    expect(() =>
      policy.assertToleranciaValida({
        total: new Prisma.Decimal('0.30'),
        cantidad: new Prisma.Decimal('3'),
        costoUnitario: new Prisma.Decimal('0.10'),
        impuesto: new Prisma.Decimal('0'),
      }),
    ).not.toThrow();
  });

  it('debe rechazar con 400 cuando viene cantidad pero falta costoUnitario (A1)', () => {
    expect(() =>
      policy.assertToleranciaValida({
        total: new Prisma.Decimal('500.00'),
        cantidad: new Prisma.Decimal('5'),
        costoUnitario: null,
      }),
    ).toThrow(
      new DomainError(
        CodigoError.PETICION_INVALIDA,
        'La cantidad y el costo unitario deben proporcionarse ambos o ninguno (RN-045)',
        HttpStatus.BAD_REQUEST,
      ),
    );
  });

  it('debe rechazar con 400 cuando viene costoUnitario pero falta cantidad (A1)', () => {
    expect(() =>
      policy.assertToleranciaValida({
        total: new Prisma.Decimal('500.00'),
        cantidad: null,
        costoUnitario: new Prisma.Decimal('100'),
      }),
    ).toThrow(
      new DomainError(
        CodigoError.PETICION_INVALIDA,
        'La cantidad y el costo unitario deben proporcionarse ambos o ninguno (RN-045)',
        HttpStatus.BAD_REQUEST,
      ),
    );
  });

  it('debe aprobar si no se especifica ni cantidad ni costoUnitario', () => {
    expect(() =>
      policy.assertToleranciaValida({
        total: new Prisma.Decimal('500.00'),
        cantidad: null,
        costoUnitario: null,
      }),
    ).not.toThrow();
  });
});
