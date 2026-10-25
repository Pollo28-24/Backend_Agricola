import * as crypto from 'crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AccionAuditoria } from '@prisma/client';
import { AuthService } from './auth.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../prisma/audit.service';
import { PasswordService } from '../../common/services/password.service';
import { DomainError } from '../../common/errors/domain.error';

function sha256(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

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
    sign: jest.fn(
      (payload: { sub?: number; jti?: string }) =>
        `token_mock_${payload.sub ?? payload.jti ?? ''}`,
    ),
    verify: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn((key: string, defaultValue?: string) => {
      if (key === 'JWT_SECRET') return 'super_secret_jwt_key_test_123456';
      if (key === 'JWT_EXPIRES_IN') return '15m';
      if (key === 'JWT_REFRESH_SECRET')
        return 'super_secret_jwt_refresh_key_test';
      if (key === 'JWT_REFRESH_EXPIRES_IN') return '7d';
      return defaultValue;
    }),
  };

  const mockPasswordService = {
    verify: jest.fn(),
    hash: jest.fn(),
    needsRehash: jest.fn().mockReturnValue(false),
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
      activo: true,
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

      expect(mockPrismaService.usuario.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { ultimoAcceso: expect.any(Date) as Date },
      });

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

    it('debe ejecutar verify con hash ficticio si el usuario no existe y devolver la misma respuesta que con contraseña errónea', async () => {
      mockPrismaService.usuario.findUnique.mockResolvedValueOnce(null);
      mockPasswordService.verify.mockResolvedValueOnce(false);

      let errorInexistente: DomainError | undefined;
      try {
        await service.login({
          correo: 'inexistente@correo.com',
          contrasena: 'ClaveErronea',
        });
      } catch (err) {
        errorInexistente = err as DomainError;
      }

      expect(mockPasswordService.verify).toHaveBeenCalledTimes(1);
      expect(mockPasswordService.verify).toHaveBeenCalledWith(
        expect.stringMatching(/^\$argon2id\$/),
        'ClaveErronea',
      );

      mockPrismaService.usuario.findUnique.mockResolvedValueOnce(mockUsuario);
      mockPasswordService.verify.mockResolvedValueOnce(false);

      let errorContrasena: DomainError | undefined;
      try {
        await service.login({
          correo: 'ramon@correo.com',
          contrasena: 'ClaveErronea',
        });
      } catch (err) {
        errorContrasena = err as DomainError;
      }

      expect(errorInexistente).toBeInstanceOf(DomainError);
      expect(errorContrasena).toBeInstanceOf(DomainError);
      expect(errorInexistente?.code).toBe(errorContrasena?.code);
      expect(errorInexistente?.message).toBe(errorContrasena?.message);
      expect(errorInexistente?.getStatus()).toBe(errorContrasena?.getStatus());
    });

    it('debe hacer rehash transparente en login solo si los parámetros de Argon2 son más débiles', async () => {
      const hashDebil = '$argon2id$v=19$m=4096,t=1,p=1$c2FsdHNhbHQ$aGFzaGhhc2g';
      const hashNuevo =
        '$argon2id$v=19$m=19456,t=2,p=1$c2FsdHNhbHQ$bnVldm9oYXNo';

      mockPrismaService.usuario.findUnique.mockResolvedValueOnce({
        ...mockUsuario,
        contrasenaHash: hashDebil,
      });
      mockPasswordService.verify.mockResolvedValueOnce(true);
      mockPasswordService.needsRehash.mockReturnValueOnce(true);
      mockPasswordService.hash.mockResolvedValueOnce(hashNuevo);
      mockPrismaService.usuario.update.mockResolvedValueOnce(mockUsuario);
      mockPrismaService.refreshToken.create.mockResolvedValueOnce({});

      await service.login({
        correo: 'ramon@correo.com',
        contrasena: 'ClaveValida123!',
      });

      expect(mockPasswordService.hash).toHaveBeenCalledWith('ClaveValida123!');
      expect(mockPrismaService.usuario.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: {
          ultimoAcceso: expect.any(Date) as Date,
          contrasenaHash: hashNuevo,
        },
      });
    });

    it('debe rechazar con 401 si la contraseña es incorrecta', async () => {
      mockPrismaService.usuario.findUnique.mockResolvedValue(mockUsuario);
      mockPasswordService.verify.mockResolvedValue(false);

      await expect(
        service.login({
          correo: 'ramon@correo.com',
          contrasena: 'ClaveErronea',
        }),
      ).rejects.toThrow(DomainError);
    });

    it('debe rechazar con 401 si el usuario está inactivo (RN-072)', async () => {
      mockPrismaService.usuario.findUnique.mockResolvedValue({
        ...mockUsuario,
        activo: false,
      });
      mockPasswordService.verify.mockResolvedValue(true);

      await expect(
        service.login({
          correo: 'ramon@correo.com',
          contrasena: 'ClaveValida',
        }),
      ).rejects.toThrow(DomainError);
    });

    it('debe rechazar con 401 si la empresa asociada fue eliminada', async () => {
      mockPrismaService.usuario.findUnique.mockResolvedValue({
        ...mockUsuario,
        empresa: { ...mockUsuario.empresa, deletedAt: new Date() },
      });
      mockPasswordService.verify.mockResolvedValue(true);

      await expect(
        service.login({
          correo: 'ramon@correo.com',
          contrasena: 'ClaveValida',
        }),
      ).rejects.toThrow(DomainError);
    });
  });

  describe('refresh', () => {
    it('debe rotar el refresh token, revocar el anterior y emitir un nuevo par (Sección 3.23)', async () => {
      const mockRefreshTokenDb = {
        id: 99,
        usuarioId: 1,
        familiaId: 'fam-123',
        jti: 'jti-123',
        tokenHash: sha256('refresh_token_valido'),
        revocado: false,
        revocadoEn: null,
        expiraEn: new Date(Date.now() + 100000),
        usuario: mockUsuario,
      };

      mockJwtService.verify.mockReturnValue({ sub: 1, jti: 'jti-123' });
      mockPrismaService.refreshToken.findUnique.mockResolvedValue(
        mockRefreshTokenDb,
      );
      mockPrismaService.refreshToken.updateMany.mockResolvedValue({
        count: 1,
      });
      mockPrismaService.refreshToken.create.mockResolvedValue({});

      const res = await service.refresh({
        refreshToken: 'refresh_token_valido',
      });

      expect(res.accessToken).toBeDefined();
      expect(res.refreshToken).toBeDefined();

      expect(mockPrismaService.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { jti: 'jti-123', revocado: false, revocadoEn: null },
        data: {
          revocado: true,
          revocadoEn: expect.any(Date) as Date,
        },
      });

      expect(mockPrismaService.refreshToken.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            familiaId: 'fam-123',
          }) as Record<string, unknown>,
        }),
      );
    });

    it('debe revocar toda la familia y rechazar con 401 cuando se detecta reuso de un token ya rotado', async () => {
      const tokenStr = 'token_ya_usado';
      mockJwtService.verify.mockReturnValue({ sub: 1, jti: 'jti-padre' });
      mockPrismaService.refreshToken.findUnique.mockResolvedValue({
        id: 99,
        usuarioId: 1,
        familiaId: 'fam-abc',
        jti: 'jti-padre',
        tokenHash: sha256(tokenStr),
        revocado: true,
        revocadoEn: new Date(),
        expiraEn: new Date(Date.now() + 100000),
        usuario: mockUsuario,
      });
      mockPrismaService.refreshToken.updateMany.mockResolvedValue({ count: 2 });

      await expect(service.refresh({ refreshToken: tokenStr })).rejects.toThrow(
        DomainError,
      );

      expect(mockPrismaService.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { familiaId: 'fam-abc', revocado: false },
        data: {
          revocado: true,
          revocadoEn: expect.any(Date) as Date,
        },
      });
    });

    it('5 refresh concurrentes con el mismo token terminan con 0 tokens activos en la familia y como máximo un 200', async () => {
      const tokenStr = 'token_concurrente';
      const tokenHash = sha256(tokenStr);
      const estadoTokens: Array<{
        jti: string;
        familiaId: string;
        revocado: boolean;
        revocadoEn: Date | null;
      }> = [
        {
          jti: 'jti-init',
          familiaId: 'fam-conc',
          revocado: false,
          revocadoEn: null,
        },
      ];

      mockJwtService.verify.mockReturnValue({ sub: 1, jti: 'jti-init' });
      mockPrismaService.refreshToken.findUnique.mockImplementation(() => {
        const actual = estadoTokens[0];
        return Promise.resolve({
          id: 1,
          usuarioId: 1,
          familiaId: actual.familiaId,
          jti: actual.jti,
          tokenHash,
          revocado: false,
          revocadoEn: null,
          expiraEn: new Date(Date.now() + 100000),
          usuario: mockUsuario,
        });
      });

      let rotado = false;
      mockPrismaService.refreshToken.updateMany.mockImplementation(
        (args: {
          where: { jti?: string; familiaId?: string; revocado?: boolean };
        }) => {
          if (args.where.jti) {
            if (!rotado) {
              rotado = true;
              estadoTokens[0].revocado = true;
              estadoTokens[0].revocadoEn = new Date();
              return Promise.resolve({ count: 1 });
            }
            return Promise.resolve({ count: 0 });
          }
          if (args.where.familiaId === 'fam-conc') {
            for (const t of estadoTokens) {
              t.revocado = true;
              t.revocadoEn = new Date();
            }
            return Promise.resolve({ count: estadoTokens.length });
          }
          return Promise.resolve({ count: 0 });
        },
      );

      mockPrismaService.refreshToken.create.mockImplementation(
        (args: { data: { jti: string; familiaId: string } }) => {
          estadoTokens.push({
            jti: args.data.jti,
            familiaId: args.data.familiaId,
            revocado: false,
            revocadoEn: null,
          });
          return Promise.resolve(args.data);
        },
      );

      const resultados = await Promise.allSettled([
        service.refresh({ refreshToken: tokenStr }),
        service.refresh({ refreshToken: tokenStr }),
        service.refresh({ refreshToken: tokenStr }),
        service.refresh({ refreshToken: tokenStr }),
        service.refresh({ refreshToken: tokenStr }),
      ]);

      const exitos = resultados.filter((r) => r.status === 'fulfilled');
      const rechazos = resultados.filter((r) => r.status === 'rejected');
      const activosEnFamilia = estadoTokens.filter((t) => !t.revocado);

      expect(exitos.length).toBeLessThanOrEqual(1);
      expect(rechazos.length).toBeGreaterThanOrEqual(4);
      expect(activosEnFamilia).toHaveLength(0);
    });

    it('token expirado en BD responde 401 sin revocar la familia', async () => {
      const tokenStr = 'token_expirado_bd';
      mockJwtService.verify.mockReturnValue({ sub: 1, jti: 'jti-exp' });
      mockPrismaService.refreshToken.findUnique.mockResolvedValue({
        id: 100,
        usuarioId: 1,
        familiaId: 'fam-exp',
        jti: 'jti-exp',
        tokenHash: sha256(tokenStr),
        revocado: false,
        revocadoEn: null,
        expiraEn: new Date(Date.now() - 5000),
        usuario: mockUsuario,
      });

      await expect(service.refresh({ refreshToken: tokenStr })).rejects.toThrow(
        DomainError,
      );

      expect(mockPrismaService.refreshToken.updateMany).not.toHaveBeenCalled();
    });

    it('usuario desactivado revoca toda la familia y responde 401 (RN-072)', async () => {
      const tokenStr = 'token_user_inactivo';
      mockJwtService.verify.mockReturnValue({ sub: 1, jti: 'jti-inact' });
      mockPrismaService.refreshToken.findUnique.mockResolvedValue({
        id: 101,
        usuarioId: 1,
        familiaId: 'fam-inact',
        jti: 'jti-inact',
        tokenHash: sha256(tokenStr),
        revocado: false,
        revocadoEn: null,
        expiraEn: new Date(Date.now() + 100000),
        usuario: { ...mockUsuario, activo: false },
      });
      mockPrismaService.refreshToken.updateMany.mockResolvedValue({ count: 1 });

      await expect(service.refresh({ refreshToken: tokenStr })).rejects.toThrow(
        DomainError,
      );

      expect(mockPrismaService.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { familiaId: 'fam-inact', revocado: false },
        data: {
          revocado: true,
          revocadoEn: expect.any(Date) as Date,
        },
      });
    });

    it('suscripción inactiva (VENCIDA) en refresh revoca toda la familia y responde 401 (RN-072)', async () => {
      const tokenStr = 'token_sub_vencida';
      mockJwtService.verify.mockReturnValue({ sub: 1, jti: 'jti-sub' });
      mockPrismaService.refreshToken.findUnique.mockResolvedValue({
        id: 102,
        usuarioId: 1,
        familiaId: 'fam-sub',
        jti: 'jti-sub',
        tokenHash: sha256(tokenStr),
        revocado: false,
        revocadoEn: null,
        expiraEn: new Date(Date.now() + 100000),
        usuario: {
          ...mockUsuario,
          empresa: { ...mockUsuario.empresa, estadoSuscripcion: 'VENCIDA' },
        },
      });
      mockPrismaService.refreshToken.updateMany.mockResolvedValue({ count: 1 });

      await expect(service.refresh({ refreshToken: tokenStr })).rejects.toThrow(
        DomainError,
      );

      expect(mockPrismaService.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { familiaId: 'fam-sub', revocado: false },
        data: {
          revocado: true,
          revocadoEn: expect.any(Date) as Date,
        },
      });
    });
  });

  describe('logout', () => {
    it('debe revocar toda la familia asociada al refresh token al cerrar sesión', async () => {
      mockJwtService.verify.mockReturnValue({ sub: 1, jti: 'jti-logout' });
      mockPrismaService.refreshToken.findUnique.mockResolvedValue({
        id: 50,
        jti: 'jti-logout',
        familiaId: 'fam-logout',
      });
      mockPrismaService.refreshToken.updateMany.mockResolvedValue({ count: 2 });

      await service.logout('token_logout');

      expect(mockPrismaService.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { familiaId: 'fam-logout', revocado: false },
        data: {
          revocado: true,
          revocadoEn: expect.any(Date) as Date,
        },
      });
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
