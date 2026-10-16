import { Test, TestingModule } from '@nestjs/testing';
import { AccionAuditoria, TipoUnidad } from '@prisma/client';
import { CatalogosService } from './catalogos.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../prisma/audit.service';
import { CreateCategoriaGastoDto } from './dto/categoria-gasto.dto';
import { DomainError } from '../../common/errors/domain.error';
import { CodigoError } from '../../common/errors/codigos-error.enum';

describe('CatalogosService (RN-047, RN-048)', () => {
  let service: CatalogosService;

  const mockPrismaService = {
    cultivo: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
    variedad: {
      findMany: jest.fn(),
    },
    tipoSuelo: {
      findMany: jest.fn(),
    },
    unidadMedida: {
      findMany: jest.fn(),
    },
    tipoActividad: {
      findMany: jest.fn(),
    },
    motivoMerma: {
      findMany: jest.fn(),
    },
    categoriaGasto: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
    },
  };

  const mockAuditService = {
    registrar: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CatalogosService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: AuditService, useValue: mockAuditService },
      ],
    }).compile();

    service = module.get<CatalogosService>(CatalogosService);
  });

  it('debe estar definido', () => {
    expect(service).toBeDefined();
  });

  describe('catálogos globales de solo lectura', () => {
    it('debe consultar cultivos', async () => {
      mockPrismaService.cultivo.findMany.mockResolvedValue([
        { id: 1, nombre: 'Tomate', activo: true },
      ]);
      const res = await service.obtenerCultivos(true);
      expect(res).toHaveLength(1);
      expect(res[0].nombre).toBe('Tomate');
    });

    it('debe consultar variedades de un cultivo existente', async () => {
      mockPrismaService.cultivo.findUnique.mockResolvedValue({ id: 1 });
      mockPrismaService.variedad.findMany.mockResolvedValue([
        { id: 1, cultivoId: 1, nombre: 'Saladette', activo: true },
      ]);
      const res = await service.obtenerVariedades(1, true);
      expect(res).toHaveLength(1);
      expect(res[0].nombre).toBe('Saladette');
    });

    it('debe arrojar 404 al consultar variedades de un cultivo inexistente', async () => {
      mockPrismaService.cultivo.findUnique.mockResolvedValue(null);
      await expect(service.obtenerVariedades(99)).rejects.toThrow(DomainError);
    });

    it('debe consultar tipos de suelo', async () => {
      mockPrismaService.tipoSuelo.findMany.mockResolvedValue([
        { id: 1, nombre: 'Franco' },
      ]);
      const res = await service.obtenerTiposSuelo();
      expect(res).toHaveLength(1);
      expect(res[0].nombre).toBe('Franco');
    });

    it('debe consultar unidades de medida y convertir factorABase a string', async () => {
      mockPrismaService.unidadMedida.findMany.mockResolvedValue([
        {
          id: 1,
          codigo: 'HECTAREA',
          nombre: 'Hectárea',
          tipo: TipoUnidad.AREA,
          factorABase: 10000.0,
        },
      ]);
      const res = await service.obtenerUnidadesMedida(TipoUnidad.AREA);
      expect(res).toHaveLength(1);
      expect(res[0].tipo).toBe(TipoUnidad.AREA);
      expect(res[0].factorABase).toBe('10000');
    });

    it('debe consultar tipos de actividad', async () => {
      mockPrismaService.tipoActividad.findMany.mockResolvedValue([
        { id: 1, nombre: 'Riego', activo: true },
      ]);
      const res = await service.obtenerTiposActividad();
      expect(res).toHaveLength(1);
      expect(res[0].nombre).toBe('Riego');
    });

    it('debe consultar motivos de merma', async () => {
      mockPrismaService.motivoMerma.findMany.mockResolvedValue([
        { id: 1, nombre: 'Plaga', activo: true },
      ]);
      const res = await service.obtenerMotivosMerma();
      expect(res).toHaveLength(1);
      expect(res[0].nombre).toBe('Plaga');
    });
  });

  describe('categorías de gasto híbridas (RN-047, RN-048)', () => {
    it('debe fusionar categorías globales (null) con las del tenant en un árbol de 2 niveles', async () => {
      mockPrismaService.categoriaGasto.findMany.mockResolvedValue([
        {
          id: 1,
          empresaId: null, // Global
          categoriaPadreId: null,
          nombre: 'Insumos',
          descripcion: 'Insumos agrícolas',
          activo: true,
          hijas: [
            {
              id: 2,
              empresaId: null,
              categoriaPadreId: 1,
              nombre: 'Semillas',
              descripcion: null,
              activo: true,
            },
            {
              id: 10,
              empresaId: 5, // Personalizada del tenant
              categoriaPadreId: 1,
              nombre: 'Biofertilizantes Propios',
              descripcion: null,
              activo: true,
            },
          ],
        },
        {
          id: 2,
          empresaId: null,
          categoriaPadreId: 1,
          nombre: 'Semillas',
          descripcion: null,
          activo: true,
          hijas: [],
        },
        {
          id: 10,
          empresaId: 5,
          categoriaPadreId: 1,
          nombre: 'Biofertilizantes Propios',
          descripcion: null,
          activo: true,
          hijas: [],
        },
      ]);

      const res = await service.obtenerCategoriasGasto(5);

      // Solo devuelve la raíz en el primer nivel
      expect(res).toHaveLength(1);
      expect(res[0].id).toBe(1);
      expect(res[0].esPersonalizada).toBe(false);
      expect(res[0].subcategorias).toHaveLength(2);
      expect(res[0].subcategorias![0].esPersonalizada).toBe(false);
      expect(res[0].subcategorias![1].esPersonalizada).toBe(true);
    });

    it('debe crear una categoría raíz personalizada con éxito y registrar auditoría', async () => {
      mockPrismaService.categoriaGasto.findFirst.mockResolvedValue(null);
      mockPrismaService.categoriaGasto.create.mockResolvedValue({
        id: 20,
        empresaId: 5,
        categoriaPadreId: null,
        nombre: 'Servicios de Maquila',
        descripcion: 'Cosecha mecanizada externa',
        activo: true,
      });

      const dto: CreateCategoriaGastoDto = {
        nombre: 'Servicios de Maquila',
        descripcion: 'Cosecha mecanizada externa',
      };

      const res = await service.crearCategoriaGasto(5, dto);

      expect(res.id).toBe(20);
      expect(res.esPersonalizada).toBe(true);
      expect(mockAuditService.registrar).toHaveBeenCalledWith(
        expect.objectContaining({
          empresaId: 5,
          entidad: 'categoria_gasto',
          entidadId: 20,
          accion: AccionAuditoria.CREAR,
        }),
      );
    });

    it('debe crear una subcategoría de nivel 2 si el padre es de nivel 1', async () => {
      mockPrismaService.categoriaGasto.findUnique.mockResolvedValue({
        id: 1,
        empresaId: null,
        categoriaPadreId: null, // Nivel 1 (raíz)
        activo: true,
      });
      mockPrismaService.categoriaGasto.findFirst.mockResolvedValue(null);
      mockPrismaService.categoriaGasto.create.mockResolvedValue({
        id: 21,
        empresaId: 5,
        categoriaPadreId: 1,
        nombre: 'Composta Bocashi',
        descripcion: null,
        activo: true,
      });

      const dto: CreateCategoriaGastoDto = {
        nombre: 'Composta Bocashi',
        categoriaPadreId: 1,
      };

      const res = await service.crearCategoriaGasto(5, dto);

      expect(res.id).toBe(21);
      expect(res.categoriaPadreId).toBe(1);
      expect(res.esPersonalizada).toBe(true);
    });

    it('debe rechazar con 400 PETICION_INVALIDA si se intenta crear un 3er nivel (RN-048)', async () => {
      mockPrismaService.categoriaGasto.findUnique.mockResolvedValue({
        id: 2,
        empresaId: null,
        categoriaPadreId: 1, // Ya tiene padre -> es nivel 2
        activo: true,
      });

      const dto: CreateCategoriaGastoDto = {
        nombre: 'Semilla Criolla',
        categoriaPadreId: 2,
      };

      await expect(service.crearCategoriaGasto(5, dto)).rejects.toThrow(
        DomainError,
      );
      try {
        await service.crearCategoriaGasto(5, dto);
      } catch (e: any) {
        expect(e.code).toBe(CodigoError.PETICION_INVALIDA);
        expect(e.getStatus()).toBe(400);
        expect(e.message).toContain('RN-048');
      }
    });

    it('debe rechazar con 404 si la categoría padre no existe o es de otra empresa', async () => {
      mockPrismaService.categoriaGasto.findUnique.mockResolvedValue({
        id: 99,
        empresaId: 88, // Pertenece a otra empresa
        categoriaPadreId: null,
        activo: true,
      });

      const dto: CreateCategoriaGastoDto = {
        nombre: 'Subcategoría Inválida',
        categoriaPadreId: 99,
      };

      await expect(service.crearCategoriaGasto(5, dto)).rejects.toThrow(
        DomainError,
      );
      try {
        await service.crearCategoriaGasto(5, dto);
      } catch (e: any) {
        expect(e.code).toBe(CodigoError.RECURSO_NO_ENCONTRADO);
        expect(e.getStatus()).toBe(404);
      }
    });

    it('debe rechazar con 409 CONFLICTO si ya existe una categoría activa con el mismo nombre en ese nivel', async () => {
      mockPrismaService.categoriaGasto.findFirst.mockResolvedValue({
        id: 3,
        nombre: 'Mano de Obra',
      });

      const dto: CreateCategoriaGastoDto = {
        nombre: 'Mano de Obra',
      };

      await expect(service.crearCategoriaGasto(5, dto)).rejects.toThrow(
        DomainError,
      );
      try {
        await service.crearCategoriaGasto(5, dto);
      } catch (e: any) {
        expect(e.code).toBe(CodigoError.CONFLICTO);
        expect(e.getStatus()).toBe(409);
      }
    });
  });
});
