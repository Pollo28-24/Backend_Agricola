import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AccionAuditoria } from '@prisma/client';
import { AuthService } from './auth.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../prisma/audit.service';
import { PasswordService } from '../../common/services/password.service';
import { DomainError } from '../../common/errors/domain.error';

describe('AuthService', () => {
  let service: AuthService;

  const mockPrismaService = {
    usuario: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    refreshToken: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
  };

  const mockJwtService = {
    sign: jest.fn((payload, options) => `token_mock_${payload.sub || payload.jti}`),
    verify: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn((key: string, defaultValue?: string) => {
      if (key === 'JWT_SECRET') return 'super_secret_jwt_key_test_123456';
      if (key === 'JWT_EXPIRES_IN') return '15m';
      if (key === 'JWT_REFRESH_SECRET') return 'super_secret_jwt_refresh_key_test';
      if (key === 'JWT_REFRESH_EXPIRES_IN') return '7d';
      return defaultValue;
    }),
  };

  const mockPasswordService = {
    verify: jest.fn(),
  };

  const mockAuditService = {
    registrar: jest.fn().mockResolvedValue(undefined),
  };

  const mockUsuario = {
    id: 1,
    empresaId: 10,
    nombre: 'Ramón',
    apellido: 'Ortega',
    correo: 'ramon@correo.com',
    contrasenaHash: 'hashed_password',
    activo: true,
    deletedAt: null,
    empresa: {
      id: 10,
      nombre: 'Rancho Los Pinos',
      estadoSuscripcion: 'ACTIVA',
      deletedAt: null,
    },
    rol: {
      id: 1,
      codigo: 'ADMIN',
      permisos: [
        { permiso: { codigo: 'empresa:administrar' } },
        { permiso: { codigo: 'usuario:administrar' } },
      ],
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: PasswordService, useValue: mockPasswordService },
        { provide: AuditService, useValue: mockAuditService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('debe estar definido', () => {
    expect(service).toBeDefined();
  });

  describe('login', () => {
    it('debe autenticar exitosamente, generar par de tokens, registrar auditoría y devolver permisos (RN-040, RN-072)', async () => {
      mockPrismaService.usuario.findUnique.mockResolvedValue(mockUsuario);
      mockPasswordService.verify.mockResolvedValue(true);
      mockPrismaService.usuario.update.mockResolvedValue(mockUsuario);
      mockPrismaService.refreshToken.create.mockResolvedValue({});

      const res = await service.login(
        { correo: 'ramon@correo.com', contrasena: 'ClaveValida123!' },
        '127.0.0.1',
      );

      expect(res.accessToken).toBeDefined();
      expect(res.refreshToken).toBeDefined();
      expect(res.usuario.id).toBe(1);
      expect(res.usuario.rol).toBe('ADMIN');
      expect(res.usuario.permisos).toEqual([
        'empresa:administrar',
        'usuario:administrar',
      ]);

      // Verificar actualización de último acceso
      expect(mockPrismaService.usuario.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { ultimoAcceso: expect.any(Date) },
      });

      // Verificar auditoría de INICIO_SESION
      expect(mockAuditService.registrar).toHaveBeenCalledWith(
        expect.objectContaining({
          empresaId: 10,
          usuarioId: 1,
          entidad: 'usuario',
          entidadId: 1,
          accion: AccionAuditoria.INICIO_SESION,
          ip: '127.0.0.1',
        }),
      );
    });

    it('debe rechazar con 401 si el usuario no existe', async () => {
      mockPrismaService.usuario.findUnique.mockResolvedValue(null);

      await expect(
        service.login({ correo: 'inexistente@correo.com', contrasena: '123456' }),
      ).rejects.toThrow(DomainError);
    });

    it('debe rechazar con 401 si la contraseña es incorrecta', async () => {
      mockPrismaService.usuario.findUnique.mockResolvedValue(mockUsuario);
      mockPasswordService.verify.mockResolvedValue(false);

      await expect(
        service.login({ correo: 'ramon@correo.com', contrasena: 'ClaveErronea' }),
      ).rejects.toThrow(DomainError);
    });

    it('debe rechazar con 401 si el usuario está inactivo (RN-072)', async () => {
      mockPrismaService.usuario.findUnique.mockResolvedValue({
        ...mockUsuario,
        activo: false,
      });
      mockPasswordService.verify.mockResolvedValue(true);

      await expect(
        service.login({ correo: 'ramon@correo.com', contrasena: 'ClaveValida' }),
      ).rejects.toThrow(DomainError);
    });

    it('debe rechazar con 401 si la empresa asociada fue eliminada', async () => {
      mockPrismaService.usuario.findUnique.mockResolvedValue({
        ...mockUsuario,
        empresa: { ...mockUsuario.empresa, deletedAt: new Date() },
      });
      mockPasswordService.verify.mockResolvedValue(true);

      await expect(
        service.login({ correo: 'ramon@correo.com', contrasena: 'ClaveValida' }),
      ).rejects.toThrow(DomainError);
    });
  });

  describe('refresh', () => {
    it('debe rotar el refresh token, revocar el anterior y emitir un nuevo par (Sección 3.23)', async () => {
      const mockRefreshTokenDb = {
        id: 99,
        usuarioId: 1,
        jti: 'jti-123',
        tokenHash: (service as any).hashToken('refresh_token_valido'),
        revocado: false,
        expiraEn: new Date(Date.now() + 100000),
        usuario: mockUsuario,
      };

      mockJwtService.verify.mockReturnValue({ sub: 1, jti: 'jti-123' });
      mockPrismaService.refreshToken.findUnique.mockResolvedValue(mockRefreshTokenDb);
      mockPrismaService.refreshToken.update.mockResolvedValue({
        ...mockRefreshTokenDb,
        revocado: true,
      });
      mockPrismaService.refreshToken.create.mockResolvedValue({});

      const res = await service.refresh({ refreshToken: 'refresh_token_valido' });

      expect(res.accessToken).toBeDefined();
      expect(res.refreshToken).toBeDefined();

      // Verificar que se revocó el token usado
      expect(mockPrismaService.refreshToken.update).toHaveBeenCalledWith({
        where: { id: 99 },
        data: {
          revocado: true,
          revocadoEn: expect.any(Date),
        },
      });

      // Verificar que se creó el nuevo token
      expect(mockPrismaService.refreshToken.create).toHaveBeenCalled();
    });

    it('debe rechazar si el token ya estaba revocado', async () => {
      mockJwtService.verify.mockReturnValue({ sub: 1, jti: 'jti-123' });
      mockPrismaService.refreshToken.findUnique.mockResolvedValue({
        id: 99,
        usuarioId: 1,
        jti: 'jti-123',
        revocado: true, // Ya revocado
        expiraEn: new Date(Date.now() + 100000),
      });

      await expect(
        service.refresh({ refreshToken: 'token_ya_usado' }),
      ).rejects.toThrow(DomainError);
    });
  });

  describe('me', () => {
    it('debe devolver el perfil y permisos vigentes del usuario', async () => {
      mockPrismaService.usuario.findUnique.mockResolvedValue(mockUsuario);

      const res = await service.me(1);

      expect(res.id).toBe(1);
      expect(res.correo).toBe('ramon@correo.com');
      expect(res.rol).toBe('ADMIN');
      expect(res.permisos).toContain('empresa:administrar');
    });
  });
});
