import { Test, TestingModule } from '@nestjs/testing';
import { AccionAuditoria } from '@prisma/client';
import { UsuariosService } from './usuarios.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../prisma/audit.service';
import { PasswordService } from '../../common/services/password.service';
import { CreateUsuarioDto, RolCodigoEnum } from './dto/create-usuario.dto';
import { DomainError } from '../../common/errors/domain.error';
import { CodigoError } from '../../common/errors/codigos-error.enum';

describe('UsuariosService (RN-037, RN-061, RN-068, Sección 3.11)', () => {
  let service: UsuariosService;

  const mockPrismaService = {
    empresa: {
      findUnique: jest.fn(),
    },
    usuario: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    rol: {
      findUnique: jest.fn(),
    },
    refreshToken: {
      updateMany: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const mockAuditService = {
    registrar: jest.fn().mockResolvedValue(undefined),
  };

  const mockPasswordService = {
    hash: jest.fn().mockResolvedValue('argon2_hash_mock'),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsuariosService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: AuditService, useValue: mockAuditService },
        { provide: PasswordService, useValue: mockPasswordService },
      ],
    }).compile();

    service = module.get<UsuariosService>(UsuariosService);
  });

  it('debe estar definido', () => {
    expect(service).toBeDefined();
  });

  describe('crear (RN-037, RN-002, RN-061, RN-040)', () => {
    const dtoCrear: CreateUsuarioDto = {
      nombre: 'Carlos',
      apellido: 'Méndez',
      correo: 'carlos@rancho.com',
      contrasena: 'ClaveSegura123',
      rolCodigo: RolCodigoEnum.CAPTURISTA,
      telefono: '9511234567',
    };

    it('debe crear un usuario exitosamente dentro de los límites del plan', async () => {
      mockPrismaService.empresa.findUnique.mockResolvedValue({
        id: 1,
        deletedAt: null,
        plan: { id: 1, nombre: 'Productor', maxUsuarios: 3 },
      });
      mockPrismaService.usuario.count.mockResolvedValue(1); // 1 de 3 activos
      mockPrismaService.usuario.findUnique.mockResolvedValue(null); // Correo libre
      mockPrismaService.rol.findUnique.mockResolvedValue({
        id: 2,
        codigo: 'CAPTURISTA',
      });
      mockPrismaService.usuario.create.mockResolvedValue({
        id: 10,
        empresaId: 1,
        rolId: 2,
        nombre: 'Carlos',
        apellido: 'Méndez',
        correo: 'carlos@rancho.com',
        telefono: '9511234567',
        activo: true,
        rol: {
          codigo: 'CAPTURISTA',
          permisos: [{ permiso: { codigo: 'gasto:crear' } }],
        },
        ultimoAcceso: null,
        createdAt: new Date('2026-10-15T12:00:00Z'),
      });

      const res = await service.crear(1, dtoCrear);

      expect(res.id).toBe(10);
      expect(res.correo).toBe('carlos@rancho.com');
      expect(res.rol).toBe('CAPTURISTA');
      expect(res.permisos).toEqual(['gasto:crear']);
      expect(mockPasswordService.hash).toHaveBeenCalledWith('ClaveSegura123');
      expect(mockAuditService.registrar).toHaveBeenCalledWith(
        expect.objectContaining({
          empresaId: 1,
          entidad: 'usuario',
          accion: AccionAuditoria.CREAR,
        }),
      );
    });

    it('debe rechazar con 409 LIMITE_PLAN_EXCEDIDO si se alcanza el máximo de usuarios (RN-037)', async () => {
      mockPrismaService.empresa.findUnique.mockResolvedValue({
        id: 1,
        deletedAt: null,
        plan: { id: 1, nombre: 'Básico', maxUsuarios: 1 },
      });
      mockPrismaService.usuario.count.mockResolvedValue(1); // Límite copado

      await expect(service.crear(1, dtoCrear)).rejects.toThrow(DomainError);
      try {
        await service.crear(1, dtoCrear);
      } catch (e: any) {
        expect(e.code).toBe(CodigoError.LIMITE_PLAN_EXCEDIDO);
        expect(e.getStatus()).toBe(409);
      }
    });

    it('debe rechazar con 409 CONFLICTO si el correo ya existe en el sistema (RN-002)', async () => {
      mockPrismaService.empresa.findUnique.mockResolvedValue({
        id: 1,
        deletedAt: null,
        plan: { id: 1, nombre: 'Productor', maxUsuarios: 5 },
      });
      mockPrismaService.usuario.count.mockResolvedValue(1);
      mockPrismaService.usuario.findUnique.mockResolvedValue({
        id: 99,
        correo: 'carlos@rancho.com',
        deletedAt: null,
      });

      await expect(service.crear(1, dtoCrear)).rejects.toThrow(DomainError);
      try {
        await service.crear(1, dtoCrear);
      } catch (e: any) {
        expect(e.code).toBe(CodigoError.CONFLICTO);
        expect(e.getStatus()).toBe(409);
      }
    });

    it('debe rechazar con 404 si el rol especificado no existe', async () => {
      mockPrismaService.empresa.findUnique.mockResolvedValue({
        id: 1,
        deletedAt: null,
        plan: { id: 1, nombre: 'Productor', maxUsuarios: 5 },
      });
      mockPrismaService.usuario.count.mockResolvedValue(1);
      mockPrismaService.usuario.findUnique.mockResolvedValue(null);
      mockPrismaService.rol.findUnique.mockResolvedValue(null);

      await expect(service.crear(1, dtoCrear)).rejects.toThrow(DomainError);
      try {
        await service.crear(1, dtoCrear);
      } catch (e: any) {
        expect(e.code).toBe(CodigoError.RECURSO_NO_ENCONTRADO);
        expect(e.getStatus()).toBe(404);
      }
    });
  });

  describe('obtenerPorId (RN-068 Aislamiento multi-tenant)', () => {
    it('debe devolver el usuario si pertenece al mismo tenant', async () => {
      mockPrismaService.usuario.findFirst.mockResolvedValue({
        id: 5,
        empresaId: 10,
        nombre: 'Ana',
        apellido: 'López',
        correo: 'ana@rancho.com',
        telefono: null,
        activo: true,
        rol: { codigo: 'CONTADOR', permisos: [] },
        ultimoAcceso: null,
        createdAt: new Date('2026-10-15T12:00:00Z'),
      });

      const res = await service.obtenerPorId(10, 5);
      expect(res.id).toBe(5);
      expect(res.rol).toBe('CONTADOR');
    });

    it('debe lanzar 404 NOT_FOUND si el usuario pertenece a otra empresa para no revelar existencia', async () => {
      mockPrismaService.usuario.findFirst.mockResolvedValue(null);

      await expect(service.obtenerPorId(10, 99)).rejects.toThrow(DomainError);
      try {
        await service.obtenerPorId(10, 99);
      } catch (e: any) {
        expect(e.code).toBe(CodigoError.RECURSO_NO_ENCONTRADO);
        expect(e.getStatus()).toBe(404);
      }
    });
  });

  describe('eliminar (Sección 3.11, RN-041)', () => {
    it('debe anonimizar el correo con #baja{id}, marcar deletedAt y revocar tokens', async () => {
      mockPrismaService.usuario.findFirst.mockResolvedValue({
        id: 7,
        empresaId: 10,
        correo: 'juan@rancho.com',
        deletedAt: null,
      });

      mockPrismaService.$transaction.mockImplementation(async (callback: any) => {
        const tx = {
          usuario: { update: jest.fn().mockResolvedValue({}) },
          refreshToken: { updateMany: jest.fn().mockResolvedValue({ count: 2 }) },
        };
        return callback(tx);
      });

      const res = await service.eliminar(10, 7);

      expect(res.mensaje).toContain('baja exitosamente');
      expect(mockPrismaService.$transaction).toHaveBeenCalled();
      expect(mockAuditService.registrar).toHaveBeenCalledWith(
        expect.objectContaining({
          empresaId: 10,
          entidad: 'usuario',
          entidadId: 7,
          accion: AccionAuditoria.ELIMINAR,
        }),
      );
    });

    it('debe rechazar con 404 si el usuario a eliminar no pertenece a la empresa', async () => {
      mockPrismaService.usuario.findFirst.mockResolvedValue(null);

      await expect(service.eliminar(10, 99)).rejects.toThrow(DomainError);
    });
  });

  describe('actualizar (reactivación con RN-037)', () => {
    it('debe rechazar reactivación si el plan ya no tiene cupo disponible', async () => {
      mockPrismaService.usuario.findFirst.mockResolvedValue({
        id: 8,
        empresaId: 10,
        activo: false,
        rolId: 2,
        rol: { codigo: 'CAPTURISTA' },
      });

      mockPrismaService.empresa.findUnique.mockResolvedValue({
        id: 10,
        plan: { maxUsuarios: 2 },
      });
      mockPrismaService.usuario.count.mockResolvedValue(2); // Cupo lleno

      await expect(
        service.actualizar(10, 8, { activo: true }),
      ).rejects.toThrow(DomainError);
      try {
        await service.actualizar(10, 8, { activo: true });
      } catch (e: any) {
        expect(e.code).toBe(CodigoError.LIMITE_PLAN_EXCEDIDO);
        expect(e.getStatus()).toBe(409);
      }
    });
  });
});
