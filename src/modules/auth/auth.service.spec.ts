import * as crypto from 'crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AccionAuditoria } from '@prisma/client';
import { AuthService } from './auth.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../prisma/audit.service';
import { PasswordService } from '../../common/services/password.service';
import { MailService } from '../mail/mail.service';
import { DomainError } from '../../common/errors/domain.error';

function sha256(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

interface MockUsuarioPrisma {
  findUnique: jest.Mock<Promise<unknown>, [unknown?]>;
  update: jest.Mock<Promise<unknown>, [unknown?]>;
  updateMany: jest.Mock<Promise<unknown>, [unknown?]>;
}

interface MockRefreshTokenPrisma {
  create: jest.Mock<Promise<unknown>, [unknown?]>;
  findUnique: jest.Mock<Promise<unknown>, [unknown?]>;
  update: jest.Mock<Promise<unknown>, [unknown?]>;
  updateMany: jest.Mock<Promise<unknown>, [unknown?]>;
}

interface MockPasswordResetTokenPrisma {
  count: jest.Mock<Promise<number>, [unknown?]>;
  create: jest.Mock<Promise<unknown>, [unknown?]>;
  findUnique: jest.Mock<Promise<unknown>, [unknown?]>;
  update: jest.Mock<Promise<unknown>, [unknown?]>;
  updateMany: jest.Mock<Promise<unknown>, [unknown?]>;
}

interface MockPrismaService {
  usuario: MockUsuarioPrisma;
  refreshToken: MockRefreshTokenPrisma;
  passwordResetToken: MockPasswordResetTokenPrisma;
  $transaction: jest.Mock<
    Promise<unknown>,
    [(tx: MockPrismaService) => Promise<unknown>]
  >;
}

interface MockJwtService {
  sign: jest.Mock<string, [{ sub?: number; jti?: string }?]>;
  verify: jest.Mock<unknown, [string?, unknown?]>;
}

interface MockConfigService {
  get: jest.Mock<unknown, [string, unknown?]>;
}

interface MockPasswordService {
  verify: jest.Mock<Promise<boolean>, [string?, string?]>;
  hash: jest.Mock<Promise<string>, [string?]>;
  needsRehash: jest.Mock<boolean, [string?]>;
}

interface MockAuditService {
  registrar: jest.Mock<Promise<void>, [unknown?, unknown?]>;
}

interface MockMailService {
  enviarRecuperacionContrasena: jest.Mock<Promise<void>, [unknown?]>;
  registrarEnvio: jest.Mock<void, [Promise<unknown>]>;
  esperarEnviosPendientes: jest.Mock<Promise<void>, []>;
}

describe('AuthService', () => {
  let service: AuthService;

  const enviosPendientesMock = new Set<Promise<unknown>>();

  const mockPrismaService: MockPrismaService = {
    usuario: {
      findUnique: jest.fn<Promise<unknown>, [unknown?]>(),
      update: jest.fn<Promise<unknown>, [unknown?]>(),
      updateMany: jest
        .fn<Promise<unknown>, [unknown?]>()
        .mockResolvedValue({ count: 1 }),
    },
    refreshToken: {
      create: jest.fn<Promise<unknown>, [unknown?]>(),
      findUnique: jest.fn<Promise<unknown>, [unknown?]>(),
      update: jest.fn<Promise<unknown>, [unknown?]>(),
      updateMany: jest.fn<Promise<unknown>, [unknown?]>(),
    },
    passwordResetToken: {
      count: jest.fn<Promise<number>, [unknown?]>(),
      create: jest.fn<Promise<unknown>, [unknown?]>(),
      findUnique: jest.fn<Promise<unknown>, [unknown?]>(),
      update: jest.fn<Promise<unknown>, [unknown?]>(),
      updateMany: jest.fn<Promise<unknown>, [unknown?]>(),
    },
    $transaction: jest.fn<
      Promise<unknown>,
      [(tx: MockPrismaService) => Promise<unknown>]
    >((cb: (tx: MockPrismaService) => Promise<unknown>): Promise<unknown> =>
      cb(mockPrismaService),
    ),
  };

  const mockJwtService: MockJwtService = {
    sign: jest.fn<string, [{ sub?: number; jti?: string }?]>(
      (payload?: { sub?: number; jti?: string }) =>
        `token_mock_${payload?.sub ?? payload?.jti ?? ''}`,
    ),
    verify: jest.fn<unknown, [string?, unknown?]>(),
  };

  const mockConfigService: MockConfigService = {
    get: jest.fn<unknown, [string, unknown?]>(
      (key: string, defaultValue?: unknown) => {
        if (key === 'JWT_SECRET') return 'super_secret_jwt_key_test_123456';
        if (key === 'JWT_EXPIRES_IN') return '15m';
        if (key === 'JWT_REFRESH_SECRET')
          return 'super_secret_jwt_refresh_key_test';
        if (key === 'JWT_REFRESH_EXPIRES_IN') return '7d';
        return defaultValue;
      },
    ),
  };

  const mockPasswordService: MockPasswordService = {
    verify: jest.fn<Promise<boolean>, [string?, string?]>(),
    hash: jest.fn<Promise<string>, [string?]>(),
    needsRehash: jest.fn<boolean, [string?]>().mockReturnValue(false),
  };

  const mockAuditService: MockAuditService = {
    registrar: jest
      .fn<Promise<void>, [unknown?, unknown?]>()
      .mockResolvedValue(undefined),
  };

  const mockMailService: MockMailService = {
    enviarRecuperacionContrasena: jest
      .fn<Promise<void>, [unknown?]>()
      .mockResolvedValue(undefined),
    registrarEnvio: jest.fn<void, [Promise<unknown>]>((p: Promise<unknown>) => {
      enviosPendientesMock.add(p);
      void p.finally(() => enviosPendientesMock.delete(p));
    }),
    esperarEnviosPendientes: jest.fn<Promise<void>, []>(async () => {
      await Promise.allSettled(Array.from(enviosPendientesMock));
    }),
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
        { provide: MailService, useValue: mockMailService },
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
        expect.anything(),
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

  describe('cambiarContrasena (Hito 11E)', () => {
    it('debe cambiar la contraseña exitosamente, actualizar cambioContrasenaEn y revocar todos los refresh tokens (RN-076)', async () => {
      mockPrismaService.usuario.findUnique.mockResolvedValue(mockUsuario);
      mockPasswordService.verify.mockImplementation((hash, plain) =>
        Promise.resolve(plain === 'ClaveVieja123!'),
      );
      mockPasswordService.hash.mockResolvedValue('nuevo_hash_argon2id');
      mockPrismaService.usuario.updateMany.mockResolvedValue({ count: 1 });
      mockPrismaService.refreshToken.updateMany.mockResolvedValue({ count: 2 });

      const res = await service.cambiarContrasena(
        1,
        {
          contrasenaActual: 'ClaveVieja123!',
          nuevaContrasena: 'NuevaClave456!',
        },
        '192.168.1.100',
      );

      expect(res.mensaje).toContain('Contraseña actualizada exitosamente');
      expect(mockPasswordService.verify).toHaveBeenCalledWith(
        mockUsuario.contrasenaHash,
        'ClaveVieja123!',
      );
      expect(mockPrismaService.usuario.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 1, contrasenaHash: mockUsuario.contrasenaHash },
          data: expect.objectContaining({
            contrasenaHash: 'nuevo_hash_argon2id',
            cambioContrasenaEn: expect.any(Date) as Date,
          }) as unknown,
        }),
      );
      expect(mockPrismaService.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { usuarioId: 1, revocado: false },
        data: expect.objectContaining({
          revocado: true,
          revocadoEn: expect.any(Date) as Date,
        }) as unknown,
      });
      expect(mockAuditService.registrar).toHaveBeenCalledWith(
        expect.objectContaining({
          accion: AccionAuditoria.CAMBIO_CONTRASENA,
          usuarioId: 1,
        }),
        expect.anything(),
      );
    });

    it('debe rechazar con 400 CONTRASENA_ACTUAL_INCORRECTA si la clave actual no coincide', async () => {
      mockPrismaService.usuario.findUnique.mockResolvedValue(mockUsuario);
      mockPasswordService.verify.mockResolvedValue(false);

      await expect(
        service.cambiarContrasena(1, {
          contrasenaActual: 'ClaveErronea!',
          nuevaContrasena: 'NuevaClave456!',
        }),
      ).rejects.toThrow('La contraseña actual es incorrecta');
    });

    it('debe rechazar con 401 NO_AUTENTICADO si el usuario no existe', async () => {
      mockPrismaService.usuario.findUnique.mockResolvedValue(null);

      await expect(
        service.cambiarContrasena(999, {
          contrasenaActual: 'Clave!',
          nuevaContrasena: 'NuevaClave456!',
        }),
      ).rejects.toThrow('Usuario no encontrado o inactivo');
    });

    it('debe rechazar con 400 PETICION_INVALIDA si la nueva contraseña es igual a la actual (B3)', async () => {
      mockPrismaService.usuario.findUnique.mockResolvedValue(mockUsuario);
      mockPasswordService.verify.mockResolvedValue(true);

      await expect(
        service.cambiarContrasena(1, {
          contrasenaActual: 'ClaveActual123!',
          nuevaContrasena: 'ClaveActual123!',
        }),
      ).rejects.toThrow(
        'La nueva contraseña no puede ser igual a la contraseña actual',
      );
    });
  });

  describe('solicitarRecuperacion (Hito 11E)', () => {
    it('debe responder 200 OK idéntico sin enviar correo si el usuario no existe (anti-enumeración)', async () => {
      mockPrismaService.usuario.findUnique.mockResolvedValue(null);
      mockPasswordService.verify.mockResolvedValue(false);

      const res = await service.solicitarRecuperacion({
        correo: 'inexistente@correo.com',
      });
      await mockMailService.esperarEnviosPendientes();

      expect(res.mensaje).toContain('Si el correo electrónico está registrado');
      expect(
        mockMailService.enviarRecuperacionContrasena,
      ).not.toHaveBeenCalled();
      expect(
        mockPrismaService.passwordResetToken.create,
      ).not.toHaveBeenCalled();
    });

    it('debe generar token uniuso y enviar correo si el usuario existe y está activo', async () => {
      mockPrismaService.usuario.findUnique.mockResolvedValue(mockUsuario);
      mockPrismaService.passwordResetToken.updateMany.mockResolvedValue({
        count: 0,
      });
      mockPrismaService.passwordResetToken.create.mockResolvedValue({ id: 50 });

      const res = await service.solicitarRecuperacion(
        { correo: 'ramon@correo.com' },
        '201.100.50.2',
      );
      await mockMailService.esperarEnviosPendientes();

      expect(res.mensaje).toContain('Si el correo electrónico está registrado');
      expect(mockPrismaService.passwordResetToken.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            usuarioId: 1,
            tokenHash: expect.any(String) as string,
            expiraEn: expect.any(Date) as Date,
            ipSolicitud: '201.100.50.2',
          }) as unknown,
        }),
      );
      expect(mockMailService.enviarRecuperacionContrasena).toHaveBeenCalledWith(
        'ramon@correo.com',
        'Ramón',
        expect.stringContaining(
          'http://localhost:3000/restablecer-contrasena#token=',
        ),
        expect.any(String) as string,
      );
    });

    it('R1 Anti-enumeración: debe revocar el token y responder 200 OK idéntico si MailService falla (sin propagar 500/503)', async () => {
      mockPrismaService.usuario.findUnique.mockResolvedValue(mockUsuario);
      mockPrismaService.passwordResetToken.count.mockResolvedValue(0);
      mockPrismaService.passwordResetToken.updateMany.mockResolvedValue({
        count: 0,
      });
      mockPrismaService.passwordResetToken.create.mockResolvedValue({ id: 88 });
      mockMailService.enviarRecuperacionContrasena.mockRejectedValue(
        new Error('Brevo down'),
      );

      const res = await service.solicitarRecuperacion({
        correo: 'ramon@correo.com',
      });
      await mockMailService.esperarEnviosPendientes();

      expect(res.mensaje).toContain('Si el correo electrónico está registrado');
      expect(mockPrismaService.passwordResetToken.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 88 },
          data: expect.objectContaining({
            revocadoEn: expect.any(Date) as Date,
          }) as unknown,
        }),
      );
    });

    it('R1 Anti-enumeración: debe responder 200 OK idéntico sin generar token si ya tiene 3 tokens en los últimos 15 min', async () => {
      mockPrismaService.usuario.findUnique.mockResolvedValue(mockUsuario);
      mockPrismaService.passwordResetToken.count.mockResolvedValue(3);

      const res = await service.solicitarRecuperacion({
        correo: 'ramon@correo.com',
      });
      await mockMailService.esperarEnviosPendientes();

      expect(res.mensaje).toContain('Si el correo electrónico está registrado');
      expect(
        mockPrismaService.passwordResetToken.create,
      ).not.toHaveBeenCalled();
      expect(
        mockMailService.enviarRecuperacionContrasena,
      ).not.toHaveBeenCalled();
    });

    it('B1: la tarea diferida nunca rechaza ante error en count (sin unhandledRejection)', async () => {
      mockPrismaService.usuario.findUnique.mockResolvedValue(mockUsuario);
      mockPrismaService.passwordResetToken.count.mockRejectedValue(
        new Error('DB failure in count'),
      );

      const unhandledRejections: unknown[] = [];
      const onUnhandled = (reason: unknown) => {
        unhandledRejections.push(reason);
      };
      process.on('unhandledRejection', onUnhandled);

      try {
        const res = await service.solicitarRecuperacion({
          correo: 'ramon@correo.com',
        });
        expect(res.mensaje).toContain(
          'Si el correo electrónico está registrado',
        );

        await mockMailService.esperarEnviosPendientes();
        await new Promise((resolve) => setImmediate(resolve));

        expect(unhandledRejections).toHaveLength(0);
      } finally {
        process.removeListener('unhandledRejection', onUnhandled);
      }
    });

    it('B2 Anti-enumeración: el envío de correo no debe bloquear la respuesta HTTP (debe responder inmediatamente)', async () => {
      mockPrismaService.usuario.findUnique.mockResolvedValue(mockUsuario);
      mockPrismaService.passwordResetToken.count.mockResolvedValue(0);
      mockPrismaService.passwordResetToken.updateMany.mockResolvedValue({
        count: 0,
      });
      mockPrismaService.passwordResetToken.create.mockResolvedValue({ id: 99 });

      let resolverEnvio!: () => void;
      const promesaEnvioPendiente = new Promise<void>((resolve) => {
        resolverEnvio = resolve;
      });
      mockMailService.enviarRecuperacionContrasena.mockReturnValue(
        promesaEnvioPendiente,
      );

      const respuestaPromise = service.solicitarRecuperacion({
        correo: 'ramon@correo.com',
      });

      const timeoutPromise = new Promise<'timeout'>((resolve) =>
        setTimeout(() => resolve('timeout'), 50),
      );

      const resultado = await Promise.race([respuestaPromise, timeoutPromise]);
      try {
        expect(resultado).not.toBe('timeout');
        expect((resultado as { mensaje: string }).mensaje).toContain(
          'Si el correo electrónico está registrado',
        );
      } finally {
        resolverEnvio();
        await respuestaPromise;
      }
    });

    it('B1 Anti-enumeración: solicitarRecuperacion debe responder inmediatamente sin esperar a que Prisma resuelva la búsqueda de usuario', async () => {
      let resolverPrisma!: (val: unknown) => void;
      const promesaPrismaPendiente = new Promise((resolve) => {
        resolverPrisma = resolve;
      });
      mockPrismaService.usuario.findUnique.mockReturnValue(
        promesaPrismaPendiente,
      );

      const respuestaPromise = service.solicitarRecuperacion({
        correo: 'ramon@correo.com',
      });

      const timeoutPromise = new Promise<'timeout'>((resolve) =>
        setTimeout(() => resolve('timeout'), 50),
      );

      const resultado = await Promise.race([respuestaPromise, timeoutPromise]);
      try {
        expect(resultado).not.toBe('timeout');
        expect((resultado as { mensaje: string }).mensaje).toContain(
          'Si el correo electrónico está registrado',
        );
      } finally {
        resolverPrisma(mockUsuario);
        await respuestaPromise;
      }
    });

    it('DT-17: reintenta ante P2034 / deadlock en la creaci?n del token y tiene ?xito en el segundo intento', async () => {
      mockPrismaService.usuario.findUnique.mockResolvedValue(mockUsuario);
      mockPrismaService.passwordResetToken.count.mockResolvedValue(0);

      let llamadasTx = 0;
      mockPrismaService.$transaction
        .mockImplementationOnce(() => {
          llamadasTx++;
          const err = new Error(
            'Transaction failed due to a deadlock',
          ) as Error & { code: string };
          err.code = 'P2034';
          return Promise.reject(err);
        })
        .mockImplementationOnce(() => {
          llamadasTx++;
          return Promise.resolve({
            id: 1,
            tokenHash: 'hash_test_123',
            expiraEn: new Date(Date.now() + 900_000),
          });
        });

      const res = await service.solicitarRecuperacion(
        { correo: 'ramon@correo.com' },
        '127.0.0.1',
      );

      await new Promise((resolve) => setImmediate(resolve));
      await new Promise((resolve) => setImmediate(resolve));

      expect(res.mensaje).toMatch(/recibir/);
      expect(llamadasTx).toBe(2);
      expect(mockMailService.enviarRecuperacionContrasena).toHaveBeenCalled();
    });
  });

  describe('restablecerContrasena (Hito 11E)', () => {
    it('debe consumir el token de forma atómica, actualizar la contraseña y revocar refresh tokens (Trampa 2)', async () => {
      mockPasswordService.hash.mockResolvedValue('nuevo_hash_restablecido');
      mockPrismaService.passwordResetToken.findUnique.mockResolvedValue({
        id: 10,
        tokenHash: 'token_valido_hex_123',
        usadoEn: null,
        revocadoEn: null,
        expiraEn: new Date(Date.now() + 100000),
        usuarioId: 1,
        usuario: mockUsuario,
      });
      mockPrismaService.passwordResetToken.updateMany.mockResolvedValue({
        count: 1,
      });
      mockPrismaService.usuario.update.mockResolvedValue({});
      mockPrismaService.refreshToken.updateMany.mockResolvedValue({ count: 3 });

      const res = await service.restablecerContrasena(
        {
          token: 'token_valido_hex_123',
          nuevaContrasena: 'NuevaClaveRestablecida123!',
        },
        '189.200.10.1',
      );

      expect(res.mensaje).toContain('Contraseña restablecida exitosamente');
      expect(mockPrismaService.usuario.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 1 },
          data: expect.objectContaining({
            contrasenaHash: 'nuevo_hash_restablecido',
            cambioContrasenaEn: expect.any(Date) as Date,
          }) as unknown,
        }),
      );
      expect(mockPrismaService.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { usuarioId: 1, revocado: false },
        data: expect.objectContaining({
          revocado: true,
          revocadoEn: expect.any(Date) as Date,
        }) as unknown,
      });
      expect(mockAuditService.registrar).toHaveBeenCalledWith(
        expect.objectContaining({
          accion: AccionAuditoria.RESTABLECIMIENTO_CONTRASENA,
          usuarioId: 1,
        }),
        expect.anything(),
      );
    });

    it('B2(a) Pre-chequeo barato: no debe invocar passwordService.hash si el token es inválido o no existe', async () => {
      mockPrismaService.passwordResetToken.findUnique.mockResolvedValue(null);
      mockPasswordService.hash.mockClear();

      await expect(
        service.restablecerContrasena({
          token: 'token_inexistente',
          nuevaContrasena: 'NuevaClave123!',
        }),
      ).rejects.toThrow(
        'El token de recuperación es inválido, expiró o ya fue utilizado',
      );

      expect(mockPasswordService.hash).not.toHaveBeenCalled();
    });

    it('B2(b) ROJA: debe rechazar con 400 TOKEN_RECUPERACION_INVALIDO si el usuario asociado está inactivo', async () => {
      mockPrismaService.passwordResetToken.findUnique.mockResolvedValue({
        id: 10,
        tokenHash: 'hash123',
        usadoEn: null,
        revocadoEn: null,
        expiraEn: new Date(Date.now() + 100000),
        usuario: { ...mockUsuario, activo: false },
      });
      mockPrismaService.passwordResetToken.updateMany.mockResolvedValue({
        count: 1,
      });

      await expect(
        service.restablecerContrasena({
          token: 'token_usuario_inactivo',
          nuevaContrasena: 'NuevaClave123!',
        }),
      ).rejects.toThrow(
        'El token de recuperación es inválido, expiró o ya fue utilizado',
      );
    });

    it('B2(b) ROJA: debe rechazar con 400 TOKEN_RECUPERACION_INVALIDO si la empresa asociada está inactiva', async () => {
      mockPrismaService.passwordResetToken.findUnique.mockResolvedValue({
        id: 10,
        tokenHash: 'hash123',
        usadoEn: null,
        revocadoEn: null,
        expiraEn: new Date(Date.now() + 100000),
        usuario: {
          ...mockUsuario,
          empresa: { id: 1, activo: false, deletedAt: null },
        },
      });
      mockPrismaService.passwordResetToken.updateMany.mockResolvedValue({
        count: 1,
      });

      await expect(
        service.restablecerContrasena({
          token: 'token_empresa_inactiva',
          nuevaContrasena: 'NuevaClave123!',
        }),
      ).rejects.toThrow(
        'El token de recuperación es inválido, expiró o ya fue utilizado',
      );
    });

    it('debe rechazar con 400 TOKEN_RECUPERACION_INVALIDO si el token ya fue usado o expiró', async () => {
      mockPrismaService.passwordResetToken.updateMany.mockResolvedValue({
        count: 0,
      });

      await expect(
        service.restablecerContrasena({
          token: 'token_usado_o_invalido',
          nuevaContrasena: 'NuevaClave123!',
        }),
      ).rejects.toThrow(
        'El token de recuperación es inválido, expiró o ya fue utilizado',
      );
    });
  });
});
