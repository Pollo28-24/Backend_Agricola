import { Test, TestingModule } from '@nestjs/testing';
import { AccionAuditoria, EstadoCiclo, EstadoParcela } from '@prisma/client';
import { EstructuraService } from './estructura.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../prisma/audit.service';
import { CreatePredioDto } from './dto/create-predio.dto';
import { CreateParcelaDto } from './dto/create-parcela.dto';
import { DomainError } from '../../common/errors/domain.error';
import { CodigoError } from '../../common/errors/codigos-error.enum';

describe('EstructuraService (RN-037, RN-041, RN-068, Sección 3.11)', () => {
  let service: EstructuraService;

  const mockPrismaService = {
    predio: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    parcela: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    empresa: {
      findUnique: jest.fn(),
    },
    tipoSuelo: {
      findUnique: jest.fn(),
    },
    cicloProduccion: {
      count: jest.fn(),
    },
    $transaction: jest.fn(),
    $queryRaw: jest.fn(),
  };

  const mockAuditService = {
    registrar: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrismaService.$transaction.mockImplementation(async (cb: any) => cb(mockPrismaService));
    mockPrismaService.$queryRaw.mockResolvedValue([{ id: 10 }]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EstructuraService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: AuditService, useValue: mockAuditService },
      ],
    }).compile();

    service = module.get<EstructuraService>(EstructuraService);
  });

  it('debe estar definido', () => {
    expect(service).toBeDefined();
  });

  // ===================================================================
  // PREDIOS
  // ===================================================================
  describe('Predios', () => {
    const dtoPredio: CreatePredioDto = {
      nombre: 'Rancho Santa Fe',
      ubicacion: 'Carretera Km 12',
      municipio: 'Zaachila',
      entidadFederativa: 'Oaxaca',
      superficieTotal: 30.5,
      latitud: 16.95,
      longitud: -96.72,
    };

    it('debe crear un predio exitosamente y registrar auditoría', async () => {
      mockPrismaService.predio.findFirst.mockResolvedValue(null);
      mockPrismaService.predio.create.mockResolvedValue({
        id: 1,
        empresaId: 10,
        nombre: 'Rancho Santa Fe',
        ubicacion: 'Carretera Km 12',
        municipio: 'Zaachila',
        entidadFederativa: 'Oaxaca',
        superficieTotal: 30.5,
        latitud: 16.95,
        longitud: -96.72,
        createdAt: new Date('2026-10-15T12:00:00Z'),
        updatedAt: new Date('2026-10-15T12:00:00Z'),
      });

      const res = await service.crearPredio(10, dtoPredio);

      expect(res.id).toBe(1);
      expect(res.nombre).toBe('Rancho Santa Fe');
      expect(res.superficieTotal).toBe('30.5');
      expect(mockAuditService.registrar).toHaveBeenCalledWith(
        expect.objectContaining({
          empresaId: 10,
          entidad: 'predio',
          accion: AccionAuditoria.CREAR,
        }),
      );
    });

    it('debe rechazar con 409 CONFLICTO si ya existe un predio activo con el mismo nombre en la empresa', async () => {
      mockPrismaService.predio.findFirst.mockResolvedValue({ id: 2, nombre: 'Rancho Santa Fe' });

      await expect(service.crearPredio(10, dtoPredio)).rejects.toThrow(DomainError);
      try {
        await service.crearPredio(10, dtoPredio);
      } catch (e: any) {
        expect(e.code).toBe(CodigoError.CONFLICTO);
        expect(e.getStatus()).toBe(409);
      }
    });

    it('debe rechazar la eliminación con 409 si el predio tiene parcelas asociadas', async () => {
      mockPrismaService.predio.findFirst.mockResolvedValue({
        id: 1,
        empresaId: 10,
        nombre: 'Rancho Santa Fe',
      });
      mockPrismaService.parcela.count.mockResolvedValue(2); // Tiene 2 parcelas

      await expect(service.eliminarPredio(10, 1)).rejects.toThrow(DomainError);
      try {
        await service.eliminarPredio(10, 1);
      } catch (e: any) {
        expect(e.code).toBe(CodigoError.CONFLICTO);
        expect(e.getStatus()).toBe(409);
      }
    });

    it('debe realizar baja lógica del predio anonimizando el nombre a #baja{id}', async () => {
      mockPrismaService.predio.findFirst.mockResolvedValue({
        id: 1,
        empresaId: 10,
        nombre: 'Rancho Santa Fe',
      });
      mockPrismaService.parcela.count.mockResolvedValue(0);
      mockPrismaService.predio.update.mockResolvedValue({});

      const res = await service.eliminarPredio(10, 1);

      expect(res.mensaje).toContain('exitosamente');
      expect(mockPrismaService.predio.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: expect.objectContaining({
          nombre: 'Rancho Santa Fe#baja1',
          deletedAt: expect.any(Date),
        }),
      });
      expect(mockAuditService.registrar).toHaveBeenCalledWith(
        expect.objectContaining({
          empresaId: 10,
          entidad: 'predio',
          entidadId: 1,
          accion: AccionAuditoria.ELIMINAR,
        }),
      );
    });

    it('debe rechazar con 404 al consultar un predio de otra empresa (RN-068)', async () => {
      mockPrismaService.predio.findFirst.mockResolvedValue(null);

      await expect(service.obtenerPredioPorId(10, 99)).rejects.toThrow(DomainError);
      try {
        await service.obtenerPredioPorId(10, 99);
      } catch (e: any) {
        expect(e.code).toBe(CodigoError.RECURSO_NO_ENCONTRADO);
        expect(e.getStatus()).toBe(404);
      }
    });
  });

  // ===================================================================
  // PARCELAS
  // ===================================================================
  describe('Parcelas', () => {
    const dtoParcela: CreateParcelaDto = {
      predioId: 1,
      tipoSueloId: 2,
      nombre: 'Parcela 1 Sur',
      superficie: 5.5,
      estado: EstadoParcela.DISPONIBLE,
      poligono: { type: 'Polygon', coordinates: [] },
    };

    it('debe crear una parcela exitosamente dentro del cupo del plan comercial (RN-037)', async () => {
      mockPrismaService.empresa.findUnique.mockResolvedValue({
        id: 10,
        deletedAt: null,
        plan: { nombre: 'Productor', maxParcelas: 10 },
      });
      mockPrismaService.parcela.count.mockResolvedValue(4); // 4 de 10 usadas
      mockPrismaService.predio.findFirst.mockResolvedValue({ id: 1, empresaId: 10 });
      mockPrismaService.tipoSuelo.findUnique.mockResolvedValue({ id: 2, nombre: 'Franco' });
      mockPrismaService.parcela.findFirst.mockResolvedValue(null);
      mockPrismaService.parcela.create.mockResolvedValue({
        id: 100,
        predioId: 1,
        tipoSueloId: 2,
        nombre: 'Parcela 1 Sur',
        superficie: 5.5,
        latitud: null,
        longitud: null,
        poligono: { type: 'Polygon', coordinates: [] },
        estado: EstadoParcela.DISPONIBLE,
        createdAt: new Date('2026-10-15T12:00:00Z'),
        updatedAt: new Date('2026-10-15T12:00:00Z'),
        predio: { nombre: 'Rancho Santa Fe' },
        tipoSuelo: { nombre: 'Franco' },
      });

      const res = await service.crearParcela(10, dtoParcela);

      expect(res.id).toBe(100);
      expect(res.predioNombre).toBe('Rancho Santa Fe');
      expect(res.tipoSueloNombre).toBe('Franco');
      expect(res.estado).toBe(EstadoParcela.DISPONIBLE);
      expect(mockAuditService.registrar).toHaveBeenCalledWith(
        expect.objectContaining({
          empresaId: 10,
          entidad: 'parcela',
          accion: AccionAuditoria.CREAR,
        }),
        expect.anything(),
      );
      expect(mockPrismaService.$queryRaw).toHaveBeenCalled();
    });

    it('debe rechazar con 409 LIMITE_PLAN_EXCEDIDO si se alcanza el cupo maxParcelas (RN-037)', async () => {
      mockPrismaService.empresa.findUnique.mockResolvedValue({
        id: 10,
        deletedAt: null,
        plan: { nombre: 'Básico', maxParcelas: 3 },
      });
      mockPrismaService.parcela.count.mockResolvedValue(3); // Límite alcanzado

      await expect(service.crearParcela(10, dtoParcela)).rejects.toThrow(DomainError);
      try {
        await service.crearParcela(10, dtoParcela);
      } catch (e: any) {
        expect(e.code).toBe(CodigoError.LIMITE_PLAN_EXCEDIDO);
        expect(e.getStatus()).toBe(409);
      }
    });

    it('debe rechazar con 404 si el predio no pertenece a la empresa (RN-068)', async () => {
      mockPrismaService.empresa.findUnique.mockResolvedValue({
        id: 10,
        deletedAt: null,
        plan: { nombre: 'Productor', maxParcelas: 10 },
      });
      mockPrismaService.parcela.count.mockResolvedValue(1);
      mockPrismaService.predio.findFirst.mockResolvedValue(null); // No existe para ese tenant

      await expect(service.crearParcela(10, dtoParcela)).rejects.toThrow(DomainError);
      try {
        await service.crearParcela(10, dtoParcela);
      } catch (e: any) {
        expect(e.code).toBe(CodigoError.RECURSO_NO_ENCONTRADO);
        expect(e.getStatus()).toBe(404);
      }
    });

    it('debe rechazar con 409 si ya existe una parcela activa con ese nombre en el predio', async () => {
      mockPrismaService.empresa.findUnique.mockResolvedValue({
        id: 10,
        deletedAt: null,
        plan: { nombre: 'Productor', maxParcelas: 10 },
      });
      mockPrismaService.parcela.count.mockResolvedValue(1);
      mockPrismaService.predio.findFirst.mockResolvedValue({ id: 1, empresaId: 10 });
      mockPrismaService.tipoSuelo.findUnique.mockResolvedValue({ id: 2 });
      mockPrismaService.parcela.findFirst.mockResolvedValue({ id: 50, nombre: 'Parcela 1 Sur' });

      await expect(service.crearParcela(10, dtoParcela)).rejects.toThrow(DomainError);
      try {
        await service.crearParcela(10, dtoParcela);
      } catch (e: any) {
        expect(e.code).toBe(CodigoError.CONFLICTO);
        expect(e.getStatus()).toBe(409);
      }
    });

    it('debe rechazar la eliminación con 409 si la parcela tiene ciclos activos o planificados', async () => {
      mockPrismaService.parcela.findFirst.mockResolvedValue({
        id: 100,
        nombre: 'Parcela 1 Sur',
      });
      mockPrismaService.cicloProduccion.count.mockResolvedValue(1); // Ciclo en curso

      await expect(service.eliminarParcela(10, 100)).rejects.toThrow(DomainError);
      try {
        await service.eliminarParcela(10, 100);
      } catch (e: any) {
        expect(e.code).toBe(CodigoError.CONFLICTO);
        expect(e.getStatus()).toBe(409);
      }
    });

    it('debe realizar baja lógica de parcela anonimizando el nombre a #baja{id} y marcando estado INACTIVA', async () => {
      mockPrismaService.parcela.findFirst.mockResolvedValue({
        id: 100,
        nombre: 'Parcela 1 Sur',
      });
      mockPrismaService.cicloProduccion.count.mockResolvedValue(0);
      mockPrismaService.parcela.update.mockResolvedValue({});

      const res = await service.eliminarParcela(10, 100);

      expect(res.mensaje).toContain('exitosamente');
      expect(mockPrismaService.parcela.update).toHaveBeenCalledWith({
        where: { id: 100 },
        data: expect.objectContaining({
          nombre: 'Parcela 1 Sur#baja100',
          estado: EstadoParcela.INACTIVA,
        }),
      });
      expect(mockAuditService.registrar).toHaveBeenCalledWith(
        expect.objectContaining({
          empresaId: 10,
          entidad: 'parcela',
          entidadId: 100,
          accion: AccionAuditoria.ELIMINAR,
        }),
      );
    });

    it('debe truncar el nombre si tiene 120 caracteres para que con #baja{id} no exceda el límite de la BD', async () => {
      const nombreLargo = 'P'.repeat(120);
      mockPrismaService.parcela.findFirst.mockResolvedValue({
        id: 999,
        nombre: nombreLargo,
      });
      mockPrismaService.cicloProduccion.count.mockResolvedValue(0);
      mockPrismaService.parcela.update.mockResolvedValue({});

      await service.eliminarParcela(10, 999);

      const llamadaUpdate = mockPrismaService.parcela.update.mock.calls[0][0];
      const nombreGuardado = llamadaUpdate.data.nombre;

      expect(nombreGuardado.length).toBeLessThanOrEqual(120);
      expect(nombreGuardado).toContain('#baja999');
    });
  });
});
