import { Test, TestingModule } from '@nestjs/testing';
import { AccionAuditoria } from '@prisma/client';
import { PrediosService } from './predios.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../prisma/audit.service';
import { CreatePredioDto } from './dto/create-predio.dto';
import { UpdatePredioDto } from './dto/update-predio.dto';
import { DomainError } from '../../common/errors/domain.error';
import { CodigoError } from '../../common/errors/codigos-error.enum';

describe('PrediosService (RN-003, RN-041, RN-068)', () => {
  let service: PrediosService;

  const mockPrismaService = {
    predio: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    parcela: {
      count: jest.fn(),
    },
  };

  const mockAuditService = {
    registrar: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PrediosService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: AuditService, useValue: mockAuditService },
      ],
    }).compile();

    service = module.get<PrediosService>(PrediosService);
  });

  it('debe estar definido', () => {
    expect(service).toBeDefined();
  });

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
    mockPrismaService.predio.findFirst.mockResolvedValue({ id: 1, nombre: 'Rancho Santa Fe' });

    await expect(service.crearPredio(10, dtoPredio)).rejects.toThrow(DomainError);
    try {
      await service.crearPredio(10, dtoPredio);
    } catch (e: any) {
      expect(e.code).toBe(CodigoError.CONFLICTO);
      expect(e.getStatus()).toBe(409);
    }
  });

  it('debe listar predios de la empresa con conteo de parcelas activas', async () => {
    mockPrismaService.predio.findMany.mockResolvedValue([
      {
        id: 1,
        empresaId: 10,
        nombre: 'Rancho Santa Fe',
        superficieTotal: 30.5,
        _count: { parcelas: 3 },
        createdAt: new Date('2026-10-15T12:00:00Z'),
        updatedAt: new Date('2026-10-15T12:00:00Z'),
      },
    ]);

    const res = await service.listarPredios(10);
    expect(res).toHaveLength(1);
    expect(res[0].parcelasCount).toBe(3);
  });

  it('debe obtener un predio por ID garantizando aislamiento de tenant (RN-068)', async () => {
    mockPrismaService.predio.findFirst.mockResolvedValue({
      id: 1,
      empresaId: 10,
      nombre: 'Rancho Santa Fe',
      superficieTotal: 30.5,
      _count: { parcelas: 2 },
      createdAt: new Date('2026-10-15T12:00:00Z'),
      updatedAt: new Date('2026-10-15T12:00:00Z'),
    });

    const res = await service.obtenerPredioPorId(10, 1);
    expect(res.id).toBe(1);
    expect(mockPrismaService.predio.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 1, empresaId: 10, deletedAt: null }),
      }),
    );
  });

  it('debe actualizar un predio exitosamente validando colisión de nombre', async () => {
    mockPrismaService.predio.findFirst
      .mockResolvedValueOnce({ id: 1, nombre: 'Antiguo', superficieTotal: 20.0 }) // Actual
      .mockResolvedValueOnce(null); // Duplicado check

    mockPrismaService.predio.update.mockResolvedValue({
      id: 1,
      empresaId: 10,
      nombre: 'Rancho Modificado',
      superficieTotal: 35.0,
      _count: { parcelas: 1 },
      createdAt: new Date('2026-10-15T12:00:00Z'),
      updatedAt: new Date('2026-10-15T12:00:00Z'),
    });

    const dtoUpdate: UpdatePredioDto = { nombre: 'Rancho Modificado', superficieTotal: 35.0 };
    const res = await service.actualizarPredio(10, 1, dtoUpdate);

    expect(res.nombre).toBe('Rancho Modificado');
    expect(mockAuditService.registrar).toHaveBeenCalledWith(
      expect.objectContaining({
        empresaId: 10,
        entidad: 'predio',
        accion: AccionAuditoria.ACTUALIZAR,
      }),
    );
  });

  it('debe rechazar la eliminación si el predio contiene parcelas activas', async () => {
    mockPrismaService.predio.findFirst.mockResolvedValue({ id: 1, nombre: 'Rancho con Parcelas' });
    mockPrismaService.parcela.count.mockResolvedValue(2); // Tiene 2 parcelas

    await expect(service.eliminarPredio(10, 1)).rejects.toThrow(DomainError);
    try {
      await service.eliminarPredio(10, 1);
    } catch (e: any) {
      expect(e.code).toBe(CodigoError.CONFLICTO);
      expect(e.getStatus()).toBe(409);
    }
  });

  it('debe dar de baja lógica el predio y anexar #baja{id} para liberar índice único (RN-041)', async () => {
    mockPrismaService.predio.findFirst.mockResolvedValue({ id: 5, nombre: 'Predio A Borrar' });
    mockPrismaService.parcela.count.mockResolvedValue(0); // Sin parcelas
    mockPrismaService.predio.update.mockResolvedValue({});

    const res = await service.eliminarPredio(10, 5);

    expect(res.mensaje).toContain('exitosamente');
    expect(mockPrismaService.predio.update).toHaveBeenCalledWith({
      where: { id: 5 },
      data: expect.objectContaining({
        nombre: 'Predio A Borrar#baja5',
        deletedAt: expect.any(Date),
      }),
    });
    expect(mockAuditService.registrar).toHaveBeenCalledWith(
      expect.objectContaining({
        empresaId: 10,
        entidad: 'predio',
        accion: AccionAuditoria.ELIMINAR,
      }),
    );
  });
});
