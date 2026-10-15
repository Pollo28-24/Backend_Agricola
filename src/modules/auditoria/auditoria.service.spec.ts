import { Test, TestingModule } from '@nestjs/testing';
import { AccionAuditoria } from '@prisma/client';
import { AuditoriaService } from './auditoria.service';
import { PrismaService } from '../../prisma/prisma.service';
import { FiltroAuditoriaDto } from './dto/filtro-auditoria.dto';
import { DomainError } from '../../common/errors/domain.error';
import { CodigoError } from '../../common/errors/codigos-error.enum';

describe('AuditoriaService (RN-003, RN-043, RN-060, RN-068, RN-074)', () => {
  let service: AuditoriaService;

  const mockPrismaService = {
    bitacoraAuditoria: {
      findMany: jest.fn(),
      count: jest.fn(),
      findFirst: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditoriaService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<AuditoriaService>(AuditoriaService);
  });

  it('debe estar definido', () => {
    expect(service).toBeDefined();
  });

  describe('listar (paginación y filtros según Sección 3.23)', () => {
    const mockFecha = new Date('2026-10-15T18:00:00.000Z');
    const mockRegistros = [
      {
        id: BigInt(100),
        empresaId: 1,
        usuarioId: 2,
        entidad: 'usuario',
        entidadId: 5,
        accion: AccionAuditoria.CREAR,
        valoresAnteriores: null,
        valoresNuevos: { nombre: 'Pedro' },
        direccionIp: '192.168.1.100',
        createdAt: mockFecha,
        usuario: {
          id: 2,
          nombre: 'Admin',
          apellido: 'Principal',
          correo: 'admin@rancho.com',
          rol: { codigo: 'ADMIN' },
        },
      },
    ];

    it('debe retornar registros paginados con valores por defecto (page=1, limit=20)', async () => {
      mockPrismaService.bitacoraAuditoria.findMany.mockResolvedValue(mockRegistros);
      mockPrismaService.bitacoraAuditoria.count.mockResolvedValue(45);

      const res = await service.listar(1, new FiltroAuditoriaDto());

      expect(res.data).toHaveLength(1);
      expect(res.data[0].id).toBe('100'); // BigInt serializado a string
      expect(res.data[0].usuario?.correo).toBe('admin@rancho.com');
      expect(res.meta).toEqual({
        total: 45,
        page: 1,
        limit: 20,
        totalPages: 3, // Math.ceil(45 / 20) = 3
      });
      expect(mockPrismaService.bitacoraAuditoria.findMany).toHaveBeenCalledWith({
        where: { empresaId: 1 },
        include: {
          usuario: {
            include: {
              rol: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: 0,
        take: 20,
      });
    });

    it('debe aplicar filtros opcionales de usuarioId, entidad y accion garantizando tenant isolation', async () => {
      mockPrismaService.bitacoraAuditoria.findMany.mockResolvedValue([]);
      mockPrismaService.bitacoraAuditoria.count.mockResolvedValue(0);

      const filtros: FiltroAuditoriaDto = {
        page: 2,
        limit: 10,
        usuarioId: 5,
        entidad: 'parcela',
        accion: AccionAuditoria.ACTUALIZAR,
      };

      const res = await service.listar(10, filtros);

      expect(res.meta.page).toBe(2);
      expect(res.meta.limit).toBe(10);
      expect(mockPrismaService.bitacoraAuditoria.findMany).toHaveBeenCalledWith({
        where: {
          empresaId: 10,
          usuarioId: 5,
          entidad: 'parcela',
          accion: AccionAuditoria.ACTUALIZAR,
        },
        include: {
          usuario: {
            include: {
              rol: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: 10, // (2 - 1) * 10
        take: 10,
      });
    });
  });

  describe('obtenerPorId (RN-068 Aislamiento multi-tenant)', () => {
    it('debe devolver el detalle completo si el registro pertenece a la empresa', async () => {
      mockPrismaService.bitacoraAuditoria.findFirst.mockResolvedValue({
        id: BigInt(500),
        empresaId: 2,
        usuarioId: null,
        usuario: null,
        entidad: 'empresa',
        entidadId: 2,
        accion: AccionAuditoria.INICIO_SESION,
        valoresAnteriores: null,
        valoresNuevos: null,
        direccionIp: '127.0.0.1',
        createdAt: new Date('2026-10-15T12:00:00Z'),
      });

      const res = await service.obtenerPorId(2, BigInt(500));

      expect(res.id).toBe('500');
      expect(res.empresaId).toBe(2);
      expect(res.usuario).toBeNull();
      expect(mockPrismaService.bitacoraAuditoria.findFirst).toHaveBeenCalledWith({
        where: { id: BigInt(500), empresaId: 2 },
        include: {
          usuario: {
            include: {
              rol: true,
            },
          },
        },
      });
    });

    it('debe lanzar 404 NOT_FOUND si el registro no existe o pertenece a otro tenant (RN-068)', async () => {
      mockPrismaService.bitacoraAuditoria.findFirst.mockResolvedValue(null);

      await expect(service.obtenerPorId(2, BigInt(999))).rejects.toThrow(DomainError);
      try {
        await service.obtenerPorId(2, BigInt(999));
      } catch (e: any) {
        expect(e.code).toBe(CodigoError.RECURSO_NO_ENCONTRADO);
        expect(e.getStatus()).toBe(404);
      }
    });
  });
});
