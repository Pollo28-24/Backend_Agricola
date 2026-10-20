import { HttpStatus } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CicloBalanceMasaPolicy } from './ciclo-balance-masa.policy';
import { DomainError } from '../../errors/domain.error';
import { CodigoError } from '../../errors/codigos-error.enum';

describe('CicloBalanceMasaPolicy (RN-031 / RN-032)', () => {
  let policy: CicloBalanceMasaPolicy;

  beforeEach(() => {
    policy = new CicloBalanceMasaPolicy();
  });

  it('debe aprobar cuando la merma poscosecha es menor que la cosecha', () => {
    expect(() =>
      policy.assertBalanceValido({
        kgCosechados: new Prisma.Decimal('1000.000'),
        kgMermaPoscosecha: new Prisma.Decimal('50.000'),
      }),
    ).not.toThrow();
  });

  it('debe aprobar cuando la merma poscosecha es exactamente igual a la cosecha total', () => {
    expect(() =>
      policy.assertBalanceValido({
        kgCosechados: new Prisma.Decimal('500.000'),
        kgMermaPoscosecha: new Prisma.Decimal('500.000'),
      }),
    ).not.toThrow();
  });

  it('debe rechazar con MERMA_EXCEDE_COSECHA (409) cuando la merma excede por 0.001 kg', () => {
    expect(() =>
      policy.assertBalanceValido({
        kgCosechados: new Prisma.Decimal('500.000'),
        kgMermaPoscosecha: new Prisma.Decimal('500.001'),
      }),
    ).toThrow(
      new DomainError(
        CodigoError.MERMA_EXCEDE_COSECHA,
        'La merma poscosecha acumulada (500.001 kg) excede la producción cosechada total (500.000 kg) en el ciclo (RN-032)',
        HttpStatus.CONFLICT,
      ),
    );
  });

  it('debe calcular conversiones complejas exactas (410 cajas x factor 20 = 8200 kg exactos)', () => {
    const cajas = new Prisma.Decimal('410');
    const factor = new Prisma.Decimal('20');
    const totalKg = cajas.mul(factor); // 8200 exactos

    expect(totalKg.toString()).toBe('8200');

    expect(() =>
      policy.assertBalanceValido({
        kgCosechados: totalKg,
        kgMermaPoscosecha: new Prisma.Decimal('8200.000'),
      }),
    ).not.toThrow();
  });

  it('debe operar con Prisma.Decimal sin error de coma flotante IEEE 754 (0.1 x 3 sin residuos)', () => {
    const cantidad = new Prisma.Decimal('3');
    const factor = new Prisma.Decimal('0.1');
    const totalKg = cantidad.mul(factor); // 0.3 exacto

    expect(() =>
      policy.assertBalanceValido({
        kgCosechados: new Prisma.Decimal('0.300'),
        kgMermaPoscosecha: totalKg,
      }),
    ).not.toThrow();
  });

  describe('assertVendidoNoExcedeNetos (RN-027 / RN-070)', () => {
    it('debe aprobar cuando kgVendidos es menor que kgNetos', () => {
      expect(() =>
        policy.assertVendidoNoExcedeNetos({
          kgVendidos: new Prisma.Decimal('400.000'),
          kgNetos: new Prisma.Decimal('500.000'),
        }),
      ).not.toThrow();
    });

    it('debe aprobar cuando kgVendidos es exactamente igual a kgNetos', () => {
      expect(() =>
        policy.assertVendidoNoExcedeNetos({
          kgVendidos: new Prisma.Decimal('500.000'),
          kgNetos: new Prisma.Decimal('500.000'),
        }),
      ).not.toThrow();
    });

    it('debe rechazar con VENTA_EXCEDE_DISPONIBLE (409) por defecto al crear/editar venta (RN-027)', () => {
      expect(() =>
        policy.assertVendidoNoExcedeNetos({
          kgVendidos: new Prisma.Decimal('500.001'),
          kgNetos: new Prisma.Decimal('500.000'),
        }),
      ).toThrow(
        new DomainError(
          CodigoError.VENTA_EXCEDE_DISPONIBLE,
          'La venta acumulada (500.001 kg) excede la producción neta disponible (500.000 kg) en el ciclo (RN-027)',
          HttpStatus.CONFLICT,
        ),
      );
    });

    it('debe rechazar con KG_VENDIDOS_EXCEDEN_NETOS (409) al reducir cosecha o añadir merma (RN-070)', () => {
      expect(() =>
        policy.assertVendidoNoExcedeNetos(
          {
            kgVendidos: new Prisma.Decimal('300.000'),
            kgNetos: new Prisma.Decimal('200.000'),
          },
          CodigoError.KG_VENDIDOS_EXCEDEN_NETOS,
        ),
      ).toThrow(
        new DomainError(
          CodigoError.KG_VENDIDOS_EXCEDEN_NETOS,
          'La operación deja los kg vendidos acumulados (300.000 kg) por encima de los kg netos producidos (200.000 kg) en el ciclo (RN-070)',
          HttpStatus.CONFLICT,
        ),
      );
    });
  });
});
