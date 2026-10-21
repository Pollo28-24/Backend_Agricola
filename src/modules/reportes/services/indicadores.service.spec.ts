import { Test, TestingModule } from '@nestjs/testing';
import { IndicadoresService } from './indicadores.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { CodigoError } from '../../../common/errors/codigos-error.enum';
import { EstadoCiclo } from '@prisma/client';

describe('IndicadoresService (Unitario)', () => {
  let service: IndicadoresService;
  let prismaMock: {
    cicloProduccion: {
      count: jest.Mock;
      findMany: jest.Mock;
      findFirst: jest.Mock;
    };
    parcela: {
      findFirst: jest.Mock;
    };
    $queryRaw: jest.Mock;
  };

  const empresaId = 1;

  beforeEach(async () => {
    prismaMock = {
      cicloProduccion: {
        count: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
      },
      parcela: {
        findFirst: jest.fn(),
      },
      $queryRaw: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IndicadoresService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get<IndicadoresService>(IndicadoresService);
  });

  describe('obtenerRentabilidad (Diseño en 2 pasos)', () => {
    it('paso 1 vacío -> NO debe ejecutar SQL sobre la vista y debe retornar array vacío', async () => {
      prismaMock.cicloProduccion.count.mockResolvedValue(0);

      const res = await service.obtenerRentabilidad(empresaId, {
        page: 1,
        limit: 10,
      });

      expect(res.data).toEqual([]);
      expect(res.meta).toEqual({ total: 0, page: 1, limit: 10, totalPages: 1 });
      expect(prismaMock.cicloProduccion.findMany).not.toHaveBeenCalled();
      expect(prismaMock.$queryRaw).not.toHaveBeenCalled();
    });

    it('paso 1 con 3 IDs -> debe ejecutar SQL con IN de 3 IDs y respetar el orden del paso 1', async () => {
      prismaMock.cicloProduccion.count.mockResolvedValue(3);
      prismaMock.cicloProduccion.findMany.mockResolvedValue([
        {
          id: 103,
          nombre: 'Ciclo 3',
          estado: EstadoCiclo.FINALIZADO,
          fechaInicio: new Date('2026-03-01'),
          fechaFin: new Date('2026-06-01'),
          parcela: { nombre: 'P3', predio: { nombre: 'Predio A' } },
          variedad: { nombre: 'V3', cultivo: { nombre: 'Tomate' } },
        },
        {
          id: 102,
          nombre: 'Ciclo 2',
          estado: EstadoCiclo.FINALIZADO,
          fechaInicio: new Date('2026-02-01'),
          fechaFin: new Date('2026-05-01'),
          parcela: { nombre: 'P2', predio: { nombre: 'Predio A' } },
          variedad: { nombre: 'V2', cultivo: { nombre: 'Chile' } },
        },
        {
          id: 101,
          nombre: 'Ciclo 1',
          estado: EstadoCiclo.ACTIVO,
          fechaInicio: new Date('2026-01-01'),
          fechaFin: null,
          parcela: { nombre: 'P1', predio: { nombre: 'Predio B' } },
          variedad: { nombre: 'V1', cultivo: { nombre: 'Cebolla' } },
        },
      ]);

      prismaMock.$queryRaw.mockResolvedValue([
        {
          cicloId: 101,
          empresaId: 1,
          costoTotal: '1000.00',
          ingresos: '2000.00',
          ganancia: '1000.00',
          margenPct: '50.00',
          superficieSembrada: '1.00',
        },
        {
          cicloId: 103,
          empresaId: 1,
          costoTotal: '3000.00',
          ingresos: '6000.00',
          ganancia: '3000.00',
          margenPct: '50.00',
          superficieSembrada: '3.00',
        },
      ]);

      const res = await service.obtenerRentabilidad(empresaId, {
        page: 1,
        limit: 10,
      });

      expect(prismaMock.$queryRaw).toHaveBeenCalledTimes(1);
      expect(res.data).toHaveLength(3);
      // El orden del paso 1 debe preservarse: 103, luego 102, luego 101
      expect(res.data[0].ciclo.id).toBe(103);
      expect(res.data[0].indicadores.costoTotal).toBe('3000.00');

      expect(res.data[1].ciclo.id).toBe(102);
      expect(res.data[1].indicadores.costoTotal).toBe('0.00'); // No estaba en vista, defaults

      expect(res.data[2].ciclo.id).toBe(101);
      expect(res.data[2].indicadores.costoTotal).toBe('1000.00');
    });
  });

  describe('obtenerRentabilidadCiclo', () => {
    it('debe lanzar 404 RECURSO_NO_ENCONTRADO si el ciclo no existe o es de otra empresa', async () => {
      prismaMock.cicloProduccion.findFirst.mockResolvedValue(null);

      await expect(
        service.obtenerRentabilidadCiclo(empresaId, 999),
      ).rejects.toMatchObject({
        code: CodigoError.RECURSO_NO_ENCONTRADO,
      });

      expect(prismaMock.$queryRaw).not.toHaveBeenCalled();
    });
  });

  describe('obtenerCostosPorCategoria', () => {
    it('debe lanzar 404 si el ciclo no existe', async () => {
      prismaMock.cicloProduccion.findFirst.mockResolvedValue(null);

      await expect(
        service.obtenerCostosPorCategoria(empresaId, 999),
      ).rejects.toMatchObject({
        code: CodigoError.RECURSO_NO_ENCONTRADO,
      });
    });

    it('debe retornar lista vacía con 200 si no hay costos registrados', async () => {
      prismaMock.cicloProduccion.findFirst.mockResolvedValue({ id: 10 });
      prismaMock.$queryRaw.mockResolvedValue([]);

      const res = await service.obtenerCostosPorCategoria(empresaId, 10);
      expect(res).toEqual([]);
    });
  });

  describe('obtenerComparativoParcela', () => {
    it('debe lanzar 404 si la parcela no existe o es ajena', async () => {
      prismaMock.parcela.findFirst.mockResolvedValue(null);

      await expect(
        service.obtenerComparativoParcela(empresaId, 999, {}),
      ).rejects.toMatchObject({
        code: CodigoError.RECURSO_NO_ENCONTRADO,
      });
    });

    it('debe filtrar solo FINALIZADOS por defecto (incluirActivos=false o ausente)', async () => {
      prismaMock.parcela.findFirst.mockResolvedValue({ id: 5 });
      prismaMock.$queryRaw.mockResolvedValueOnce([{ total: 0 }]); // count

      const res = await service.obtenerComparativoParcela(empresaId, 5, {});
      expect(res.data).toEqual([]);
      expect(res.meta.total).toBe(0);
    });
  });
});
