import { Test, TestingModule } from '@nestjs/testing';
import { AccionAuditoria, EstadoParcela } from '@prisma/client';
import { ParcelasService } from './parcelas.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../prisma/audit.service';
import { CreateParcelaDto } from './dto/create-parcela.dto';
import { UpdateParcelaDto } from './dto/update-parcela.dto';
import { DomainError } from '../../common/errors/domain.error';
import { CodigoError } from '../../common/errors/codigos-error.enum';

describe('ParcelasService (RN-037, RN-041, RN-068, ADR-002)', () => {
  let service: ParcelasService;

  const mockPrismaService = {
    parcela: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    predio: {
      findFirst: jest.fn(),
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
    mockPrismaService.$transaction.mockImplementation(
      (cb: (tx: typeof mockPrismaService) => Promise<unknown>) =>
        cb(mockPrismaService),
    );
    mockPrismaService.$queryRaw.mockResolvedValue([{ id: 10 }]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ParcelasService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: AuditService, useValue: mockAuditService },
      ],
    }).compile();

    service = module.get<ParcelasService>(ParcelasService);
  });

  it('debe estar definido', () => {
    expect(service).toBeDefined();
  });

  const dtoParcela: CreateParcelaDto = {
    predioId: 1,
    tipoSueloId: 2,
    nombre: 'Parcela 1 Sur',
    superficie: 5.5,
    estado: EstadoParcela.DISPONIBLE,
    poligono: { type: 'Polygon', coordinates: [] },
  };

  it('debe crear una parcela exitosamente dentro del cupo del plan comercial bajo lock pesimista (RN-037, ADR-002)', async () => {
    mockPrismaService.empresa.findUnique.mockResolvedValue({
      id: 10,
      deletedAt: null,
      plan: { nombre: 'Productor', maxParcelas: 10 },
    });
    mockPrismaService.parcela.count.mockResolvedValue(4); // 4 de 10 usadas
    mockPrismaService.predio.findFirst.mockResolvedValue({
      id: 1,
      empresaId: 10,
    });
    mockPrismaService.tipoSuelo.findUnique.mockResolvedValue({
      id: 2,
      nombre: 'Franco',
    });
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
    expect(mockPrismaService.$queryRaw).toHaveBeenCalled();
    expect(mockPrismaService.parcela.count).toHaveBeenCalledWith({
      where: {
        predio: { empresaId: 10 },
        estado: { not: EstadoParcela.INACTIVA },
        deletedAt: null,
      },
    });
    expect(mockAuditService.registrar).toHaveBeenCalledWith(
      expect.objectContaining({
        empresaId: 10,
        entidad: 'parcela',
        accion: AccionAuditoria.CREAR,
      }),
      expect.anything(),
    );
  });

  it('debe rechazar con 409 LIMITE_PLAN_EXCEDIDO si se alcanza el cupo maxParcelas (RN-037)', async () => {
    mockPrismaService.empresa.findUnique.mockResolvedValue({
      id: 10,
      deletedAt: null,
      plan: { nombre: 'Básico', maxParcelas: 3 },
    });
    mockPrismaService.parcela.count.mockResolvedValue(3); // Límite alcanzado

    await expect(service.crearParcela(10, dtoParcela)).rejects.toThrow(
      DomainError,
    );
    try {
      await service.crearParcela(10, dtoParcela);
    } catch (e) {
      const err = e as DomainError;
      expect(err.code).toBe(CodigoError.LIMITE_PLAN_EXCEDIDO);
      expect(err.getStatus()).toBe(409);
    }
  });

  it('debe rechazar con 404 si el predio no pertenece a la empresa (RN-068)', async () => {
    mockPrismaService.empresa.findUnique.mockResolvedValue({
      id: 10,
      deletedAt: null,
      plan: { nombre: 'Productor', maxParcelas: 10 },
    });
    mockPrismaService.parcela.count.mockResolvedValue(0);
    mockPrismaService.predio.findFirst.mockResolvedValue(null); // No existe en la empresa

    await expect(service.crearParcela(10, dtoParcela)).rejects.toThrow(
      DomainError,
    );
    try {
      await service.crearParcela(10, dtoParcela);
    } catch (e) {
      const err = e as DomainError;
      expect(err.code).toBe(CodigoError.RECURSO_NO_ENCONTRADO);
      expect(err.getStatus()).toBe(404);
    }
  });

  it('debe rechazar con 409 CONFLICTO si ya existe una parcela activa con ese nombre en el predio', async () => {
    mockPrismaService.empresa.findUnique.mockResolvedValue({
      id: 10,
      deletedAt: null,
      plan: { nombre: 'Productor', maxParcelas: 10 },
    });
    mockPrismaService.parcela.count.mockResolvedValue(0);
    mockPrismaService.predio.findFirst.mockResolvedValue({
      id: 1,
      empresaId: 10,
    });
    mockPrismaService.parcela.findFirst.mockResolvedValue({
      id: 99,
      nombre: 'Parcela 1 Sur',
    });

    await expect(service.crearParcela(10, dtoParcela)).rejects.toThrow(
      DomainError,
    );
    try {
      await service.crearParcela(10, dtoParcela);
    } catch (e) {
      const err = e as DomainError;
      expect(err.code).toBe(CodigoError.CONFLICTO);
      expect(err.getStatus()).toBe(409);
    }
  });

  it('debe listar parcelas de la empresa con filtros opcionales de predio y estado', async () => {
    mockPrismaService.parcela.findMany.mockResolvedValue([
      {
        id: 10,
        predioId: 1,
        nombre: 'Parcela 1',
        superficie: 5.0,
        estado: EstadoParcela.DISPONIBLE,
        createdAt: new Date('2026-10-15T12:00:00Z'),
        updatedAt: new Date('2026-10-15T12:00:00Z'),
        predio: { nombre: 'Rancho Santa Fe' },
        tipoSuelo: null,
      },
    ]);

    const res = await service.listarParcelas(10, 1, EstadoParcela.DISPONIBLE);
    expect(res).toHaveLength(1);
    expect(res[0].nombre).toBe('Parcela 1');
  });

  it('debe obtener una parcela por ID validando pertenencia a la empresa (RN-068)', async () => {
    mockPrismaService.parcela.findFirst.mockResolvedValue({
      id: 10,
      predioId: 1,
      nombre: 'Parcela 1',
      superficie: 5.0,
      estado: EstadoParcela.DISPONIBLE,
      createdAt: new Date('2026-10-15T12:00:00Z'),
      updatedAt: new Date('2026-10-15T12:00:00Z'),
      predio: { nombre: 'Rancho Santa Fe' },
      tipoSuelo: null,
    });

    const res = await service.obtenerParcelaPorId(10, 10);
    expect(res.id).toBe(10);
  });

  it('debe actualizar parcela exitosamente', async () => {
    mockPrismaService.parcela.findFirst
      .mockResolvedValueOnce({
        id: 10,
        predioId: 1,
        nombre: 'Viejo',
        superficie: 5.0,
      })
      .mockResolvedValueOnce(null); // Duplicado check

    mockPrismaService.parcela.update.mockResolvedValue({
      id: 10,
      predioId: 1,
      nombre: 'Parcela Editada',
      superficie: 6.0,
      estado: EstadoParcela.DISPONIBLE,
      createdAt: new Date('2026-10-15T12:00:00Z'),
      updatedAt: new Date('2026-10-15T12:00:00Z'),
      predio: { nombre: 'Rancho Santa Fe' },
      tipoSuelo: null,
    });

    const dtoUpdate: UpdateParcelaDto = {
      nombre: 'Parcela Editada',
      superficie: 6.0,
    };
    const res = await service.actualizarParcela(10, 10, dtoUpdate);
    expect(res.nombre).toBe('Parcela Editada');
    expect(mockAuditService.registrar).toHaveBeenCalledWith(
      expect.objectContaining({
        empresaId: 10,
        entidad: 'parcela',
        accion: AccionAuditoria.ACTUALIZAR,
      }),
    );
  });

  it('debe rechazar la eliminación si la parcela tiene ciclos activos o planificados', async () => {
    mockPrismaService.parcela.findFirst.mockResolvedValue({
      id: 10,
      nombre: 'Parcela con Ciclo',
    });
    mockPrismaService.cicloProduccion.count.mockResolvedValue(1); // 1 ciclo en curso

    await expect(service.eliminarParcela(10, 10)).rejects.toThrow(DomainError);
    try {
      await service.eliminarParcela(10, 10);
    } catch (e) {
      const err = e as DomainError;
      expect(err.code).toBe(CodigoError.CONFLICTO);
      expect(err.getStatus()).toBe(409);
    }
  });

  it('debe dar de baja lógica la parcela y anexar #baja{id} para liberar índice único (RN-041)', async () => {
    mockPrismaService.parcela.findFirst.mockResolvedValue({
      id: 10,
      nombre: 'Parcela A Borrar',
    });
    mockPrismaService.cicloProduccion.count.mockResolvedValue(0);
    mockPrismaService.parcela.update.mockResolvedValue({});

    const res = await service.eliminarParcela(10, 10);
    expect(res.mensaje).toContain('exitosamente');
    expect(mockPrismaService.parcela.update).toHaveBeenCalledWith({
      where: { id: 10 },
      data: expect.objectContaining({
        nombre: 'Parcela A Borrar#baja10',
        estado: EstadoParcela.INACTIVA,
        deletedAt: expect.any(Date) as unknown,
      }) as unknown,
    });
    expect(mockAuditService.registrar).toHaveBeenCalledWith(
      expect.objectContaining({
        empresaId: 10,
        entidad: 'parcela',
        accion: AccionAuditoria.ELIMINAR,
      }),
    );
  });

  it('debe rechazar con 409 LIMITE_PLAN_EXCEDIDO al reactivar una parcela INACTIVA si el cupo ya está lleno (RN-037)', async () => {
    mockPrismaService.parcela.findFirst.mockResolvedValue({
      id: 10,
      predioId: 1,
      nombre: 'Parcela Inactiva',
      superficie: 5.0,
      estado: EstadoParcela.INACTIVA,
    });
    mockPrismaService.empresa.findUnique.mockResolvedValue({
      id: 10,
      deletedAt: null,
      plan: { nombre: 'Básico', maxParcelas: 3 },
    });
    mockPrismaService.parcela.count.mockResolvedValue(3);

    await expect(
      service.actualizarParcela(10, 10, { estado: EstadoParcela.DISPONIBLE }),
    ).rejects.toThrow(DomainError);
  });
});
