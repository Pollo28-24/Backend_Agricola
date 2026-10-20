import { HttpStatus } from '@nestjs/common';
import { EstadoCiclo, Prisma } from '@prisma/client';
import {
  bloquearCicloParaCaptura,
  calcularBalanceMasaKg,
} from './ciclo-balance.util';
import { CodigoError } from '../errors/codigos-error.enum';
import { DomainError } from '../errors/domain.error';

describe('ciclo-balance.util', () => {
  describe('bloquearCicloParaCaptura', () => {
    it('ejecuta SELECT ... FOR UPDATE con empresaId, deletedAt IS NULL y nombres físicos reales', async () => {
      const mockRaw = jest.fn().mockResolvedValue([
        {
          id: 1,
          empresaId: 10,
          estado: EstadoCiclo.ACTIVO,
          fechaInicio: new Date('2026-01-01'),
        },
      ]);

      const tx = {
        $queryRaw: mockRaw,
      } as unknown as Prisma.TransactionClient;

      const resultado = await bloquearCicloParaCaptura(tx, 1, 10);

      expect(mockRaw).toHaveBeenCalledTimes(1);
      const mockCalls = mockRaw.mock.calls as unknown as Array<
        [{ strings: string[] }]
      >;
      const queryParam = mockCalls[0][0];
      const sqlString = queryParam.strings.join('?');
      expect(sqlString).toContain('FROM ciclo_produccion');
      expect(sqlString).toContain('empresaId = ?');
      expect(sqlString).toContain('deletedAt IS NULL');
      expect(sqlString).toContain('FOR UPDATE');

      expect(resultado).toEqual({
        id: 1,
        empresaId: 10,
        estado: EstadoCiclo.ACTIVO,
        fechaInicio: new Date('2026-01-01'),
      });
    });

    it('lanza RECURSO_NO_ENCONTRADO (404) si la fila no existe o no pertenece a la empresa', async () => {
      const tx = {
        $queryRaw: jest.fn().mockResolvedValue([]),
      } as unknown as Prisma.TransactionClient;

      await expect(bloquearCicloParaCaptura(tx, 999, 10)).rejects.toThrow(
        new DomainError(
          CodigoError.RECURSO_NO_ENCONTRADO,
          'Ciclo de producción no encontrado en su empresa (RN-068)',
          HttpStatus.NOT_FOUND,
        ),
      );
    });

    it('soporta fallback camelCase y snake_case sin error', async () => {
      const mockRaw = jest.fn().mockResolvedValue([
        {
          id: 5,
          empresa_id: 20,
          estado: EstadoCiclo.SUSPENDIDO,
          fecha_inicio: new Date('2026-02-01'),
        },
      ]);

      const tx = {
        $queryRaw: mockRaw,
      } as unknown as Prisma.TransactionClient;

      const resultado = await bloquearCicloParaCaptura(tx, 5, 20);
      expect(resultado.empresaId).toBe(20);
      expect(resultado.fechaInicio).toEqual(new Date('2026-02-01'));
      expect(resultado.estado).toBe(EstadoCiclo.SUSPENDIDO);
    });
  });

  describe('calcularBalanceMasaKg', () => {
    it('calcula 410 cajas x 20 kg = 8200 kg exactos y suma correctamente', async () => {
      const tx = {
        cosecha: {
          findMany: jest.fn().mockResolvedValue([
            {
              cantidad: new Prisma.Decimal('410'),
              unidad: { factorABase: new Prisma.Decimal('20') },
            },
          ]),
        },
        merma: {
          findMany: jest.fn().mockResolvedValue([]),
        },
        detalleVenta: {
          findMany: jest.fn().mockResolvedValue([]),
        },
      } as unknown as Prisma.TransactionClient;

      const balance = await calcularBalanceMasaKg(tx, 1);
      expect(balance.kgCosechados.toString()).toBe('8200');
      expect(balance.kgMermaPoscosecha.toString()).toBe('0');
      expect(balance.kgVendidos.toString()).toBe('0');
      expect(balance.kgNetos.toString()).toBe('8200');
      expect(balance.kgDisponibles.toString()).toBe('8200');
    });

    it('opera 0.1 x 3 sin error de precisión binaria (IEEE 754)', async () => {
      const tx = {
        cosecha: {
          findMany: jest.fn().mockResolvedValue([
            {
              cantidad: new Prisma.Decimal('1'),
              unidad: { factorABase: new Prisma.Decimal('1') },
            },
          ]),
        },
        merma: {
          findMany: jest.fn().mockResolvedValue([
            {
              cantidad: new Prisma.Decimal('0.1'),
              unidad: { factorABase: new Prisma.Decimal('1') },
            },
            {
              cantidad: new Prisma.Decimal('0.1'),
              unidad: { factorABase: new Prisma.Decimal('1') },
            },
            {
              cantidad: new Prisma.Decimal('0.1'),
              unidad: { factorABase: new Prisma.Decimal('1') },
            },
          ]),
        },
        detalleVenta: {
          findMany: jest.fn().mockResolvedValue([]),
        },
      } as unknown as Prisma.TransactionClient;

      const balance = await calcularBalanceMasaKg(tx, 1);
      expect(balance.kgMermaPoscosecha.toString()).toBe('0.3');
      expect(balance.kgNetos.toString()).toBe('0.7');
      expect(balance.kgDisponibles.toString()).toBe('0.7');
    });

    it('separa mermas en etapa CAMPO (no las incluye en merma poscosecha)', async () => {
      const mockFindMermas = jest.fn().mockResolvedValue([
        {
          cantidad: new Prisma.Decimal('15.5'),
          unidad: { factorABase: new Prisma.Decimal('1') },
        },
      ]);

      const tx = {
        cosecha: {
          findMany: jest.fn().mockResolvedValue([
            {
              cantidad: new Prisma.Decimal('100'),
              unidad: { factorABase: new Prisma.Decimal('1') },
            },
          ]),
        },
        merma: {
          findMany: mockFindMermas,
        },
        detalleVenta: {
          findMany: jest.fn().mockResolvedValue([]),
        },
      } as unknown as Prisma.TransactionClient;

      const balance = await calcularBalanceMasaKg(tx, 1);

      expect(mockFindMermas).toHaveBeenCalledTimes(1);
      const mockCalls = mockFindMermas.mock.calls as unknown as Array<
        [
          {
            where: { cicloId: number; deletedAt: null; etapa: { not: string } };
          },
        ]
      >;
      const mermasCall = mockCalls[0][0];
      expect(mermasCall.where.cicloId).toBe(1);
      expect(mermasCall.where.deletedAt).toBeNull();
      expect(mermasCall.where.etapa).toEqual({ not: 'CAMPO' });
      expect(balance.kgNetos.toString()).toBe('84.5');
    });

    it('excluye ventas canceladas o borradas en el cálculo de kgVendidos', async () => {
      const mockFindDetalles = jest.fn().mockResolvedValue([
        {
          cantidad: new Prisma.Decimal('30.250'),
          unidad: { factorABase: new Prisma.Decimal('1') },
        },
      ]);

      const tx = {
        cosecha: {
          findMany: jest.fn().mockResolvedValue([
            {
              cantidad: new Prisma.Decimal('100'),
              unidad: { factorABase: new Prisma.Decimal('1') },
            },
          ]),
        },
        merma: {
          findMany: jest.fn().mockResolvedValue([
            {
              cantidad: new Prisma.Decimal('10'),
              unidad: { factorABase: new Prisma.Decimal('1') },
            },
          ]),
        },
        detalleVenta: {
          findMany: mockFindDetalles,
        },
      } as unknown as Prisma.TransactionClient;

      const balance = await calcularBalanceMasaKg(tx, 1);

      expect(mockFindDetalles).toHaveBeenCalledTimes(1);
      const mockCalls = mockFindDetalles.mock.calls as unknown as Array<
        [
          {
            where: {
              venta: {
                cicloId: number;
                estado: { not: string };
                deletedAt: null;
              };
            };
          },
        ]
      >;
      const detallesCall = mockCalls[0][0];
      expect(detallesCall.where.venta.cicloId).toBe(1);
      expect(detallesCall.where.venta.estado).toEqual({ not: 'CANCELADA' });
      expect(detallesCall.where.venta.deletedAt).toBeNull();

      // kgCosechados: 100, kgMermaPoscosecha: 10 -> kgNetos: 90
      // kgVendidos: 30.250 -> kgDisponibles: 59.750
      expect(balance.kgCosechados.toString()).toBe('100');
      expect(balance.kgMermaPoscosecha.toString()).toBe('10');
      expect(balance.kgNetos.toString()).toBe('90');
      expect(balance.kgVendidos.toString()).toBe('30.25');
      expect(balance.kgDisponibles.toString()).toBe('59.75');
    });
  });
});
