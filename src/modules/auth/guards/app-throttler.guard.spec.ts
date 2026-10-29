import { ExecutionContext, HttpStatus } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ThrottlerStorageService } from '@nestjs/throttler';
import {
  AppThrottlerGuard,
  obtenerTrackerLoginCorreo,
  obtenerTrackerRecuperarCorreo,
  obtenerTrackerCambiarUsuario,
  crearThrottlerOptions,
} from './app-throttler.guard';
import { DomainError } from '../../../common/errors/domain.error';
import { CodigoError } from '../../../common/errors/codigos-error.enum';

describe('AppThrottlerGuard (Bloque 2 — Throttling)', () => {
  it('obtenerTrackerLoginCorreo usa IP + sha256(correo normalizado) y no guarda el correo en claro', () => {
    const req1 = {
      ip: '203.0.113.10',
      body: { correo: '  Victima@Rancho.com  ' },
    };
    const req2 = {
      ip: '203.0.113.10',
      body: { correo: 'victima@rancho.com' },
    };

    const tracker1 = obtenerTrackerLoginCorreo(req1);
    const tracker2 = obtenerTrackerLoginCorreo(req2);

    expect(tracker1).toBe(tracker2);
    expect(tracker1.startsWith('203.0.113.10:')).toBe(true);
    expect(tracker1.toLowerCase()).not.toContain('victima');
    expect(tracker1.toLowerCase()).not.toContain('rancho.com');
  });

  it('obtenerTrackerRecuperarCorreo normaliza el correo y almacena hash SHA-256 sin exponer PII', () => {
    const reqConMayusculasEspacios = {
      ip: '198.51.100.22',
      body: { correo: '  Usuario_Confidencial@Agricola.mx  ' },
    };
    const reqMinusculas = {
      ip: '198.51.100.22',
      body: { correo: 'usuario_confidencial@agricola.mx' },
    };

    const tracker1 = obtenerTrackerRecuperarCorreo(reqConMayusculasEspacios);
    const tracker2 = obtenerTrackerRecuperarCorreo(reqMinusculas);

    expect(tracker1).toBe(tracker2);
    expect(tracker1.startsWith('198.51.100.22:')).toBe(true);
    expect(tracker1.toLowerCase()).not.toContain('usuario_confidencial');
    expect(tracker1.toLowerCase()).not.toContain('agricola.mx');
  });

  it('obtenerTrackerCambiarUsuario extrae usuarioId de req.user, de Bearer token o cae en IP', () => {
    const reqConUser = {
      ip: '192.0.2.1',
      user: { id: 42 },
    };
    expect(obtenerTrackerCambiarUsuario(reqConUser)).toBe('192.0.2.1:user:42');

    const fakePayload = Buffer.from(JSON.stringify({ sub: 77 })).toString(
      'base64url',
    );
    const fakeToken = `header.${fakePayload}.signature`;
    const reqConBearer = {
      ip: '192.0.2.2',
      headers: { authorization: `Bearer ${fakeToken}` },
    };
    expect(obtenerTrackerCambiarUsuario(reqConBearer)).toBe(
      '192.0.2.2:user:77',
    );

    const reqSoloIp = {
      ip: '192.0.2.3',
    };
    expect(obtenerTrackerCambiarUsuario(reqSoloIp)).toBe('192.0.2.3');
  });

  it('bloquea el 6.º intento de login con 429 DEMASIADAS_PETICIONES y cabecera Retry-After, sin bloquear otro correo desde la misma IP', async () => {
    const options = crearThrottlerOptions({
      enabled: true,
      defaultLimit: 300,
      defaultTtlMs: 60_000,
      loginIpLimit: 10,
      loginIpTtlMs: 60_000,
      loginCorreoLimit: 5,
      loginCorreoTtlMs: 60_000,
      loginCorreoBlockDurationMs: 15 * 60 * 1000,
    });
    const storage = new ThrottlerStorageService();
    const reflector = new Reflector();
    const guard = new AppThrottlerGuard(options, storage, reflector);
    await guard.onModuleInit();

    const crearContextoLogin = (correo: string, ip = '198.51.100.7') => {
      const headers: Record<string, string | number> = {};
      const req = {
        ip,
        method: 'POST',
        url: '/api/v1/auth/login',
        headers: {},
        body: { correo },
      };
      const res = {
        header: (name: string, value: string | number) => {
          headers[name] = value;
        },
        setHeader: (name: string, value: string | number) => {
          headers[name] = value;
        },
      };
      class AuthController {}
      const loginHandler = function login() {};
      const context = {
        getClass: () => AuthController,
        getHandler: () => loginHandler,
        switchToHttp: () => ({
          getRequest: () => req,
          getResponse: () => res,
        }),
      } as unknown as ExecutionContext;

      return { context, headers };
    };

    // Primeros 5 intentos para usuario1@rancho.com pasan
    for (let i = 1; i <= 5; i++) {
      const { context } = crearContextoLogin('usuario1@rancho.com');
      await expect(guard.canActivate(context)).resolves.toBe(true);
    }

    // 6.º intento para usuario1@rancho.com -> 429 DEMASIADAS_PETICIONES con Retry-After
    const Intento6 = crearContextoLogin('usuario1@rancho.com');
    let errorCapturado: DomainError | undefined;
    try {
      await guard.canActivate(Intento6.context);
    } catch (err) {
      errorCapturado = err as DomainError;
    }

    expect(errorCapturado).toBeInstanceOf(DomainError);
    expect(errorCapturado?.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
    expect(errorCapturado?.code).toBe(CodigoError.DEMASIADAS_PETICIONES);
    expect(Intento6.headers['Retry-After']).toBeDefined();
    expect(Number(Intento6.headers['Retry-After'])).toBeGreaterThan(0);

    // Otro correo desde la misma IP NO es bloqueado por login-correo (es su 1.er intento en login-correo y 7.º en login-ip <= 10)
    const OtroCorreo = crearContextoLogin('otro@rancho.com');
    await expect(guard.canActivate(OtroCorreo.context)).resolves.toBe(true);

    storage.onApplicationShutdown();
  });

  it('bloquea el 4.º intento de solicitarRecuperacion con 429 por límite de recuperar-correo (3 peticiones)', async () => {
    const options = crearThrottlerOptions({
      enabled: true,
      recuperarIpLimit: 10,
      recuperarCorreoLimit: 3,
      recuperarCorreoTtlMs: 900_000,
    });
    const storage = new ThrottlerStorageService();
    const reflector = new Reflector();
    const guard = new AppThrottlerGuard(options, storage, reflector);
    await guard.onModuleInit();

    const crearContextoRecuperar = (correo: string, ip = '198.51.100.88') => {
      const headers: Record<string, string | number> = {};
      const req = {
        ip,
        method: 'POST',
        url: '/api/v1/auth/contrasena/solicitar-recuperacion',
        headers: {},
        body: { correo },
      };
      const res = {
        header: (name: string, value: string | number) => {
          headers[name] = value;
        },
        setHeader: (name: string, value: string | number) => {
          headers[name] = value;
        },
      };
      class AuthController {}
      const solicitarRecuperacionHandler = function solicitarRecuperacion() {};
      const context = {
        getClass: () => AuthController,
        getHandler: () => solicitarRecuperacionHandler,
        switchToHttp: () => ({
          getRequest: () => req,
          getResponse: () => res,
        }),
      } as unknown as ExecutionContext;

      return { context, headers };
    };

    // Primeras 3 peticiones para recupera@rancho.com pasan
    for (let i = 1; i <= 3; i++) {
      const { context } = crearContextoRecuperar('recupera@rancho.com');
      await expect(guard.canActivate(context)).resolves.toBe(true);
    }

    // 4.º intento -> 429 DEMASIADAS_PETICIONES
    const intento4 = crearContextoRecuperar('recupera@rancho.com');
    let errorCapturado: DomainError | undefined;
    try {
      await guard.canActivate(intento4.context);
    } catch (err) {
      errorCapturado = err as DomainError;
    }

    expect(errorCapturado).toBeInstanceOf(DomainError);
    expect(errorCapturado?.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
    expect(errorCapturado?.code).toBe(CodigoError.DEMASIADAS_PETICIONES);
    expect(intento4.headers['Retry-After']).toBeDefined();

    // Otro correo desde la misma IP no es bloqueado
    const otroCorreo = crearContextoRecuperar('otro_recupera@rancho.com');
    await expect(guard.canActivate(otroCorreo.context)).resolves.toBe(true);

    storage.onApplicationShutdown();
  });

  it('bloquea el 6.º intento de cambiarContrasena con 429 por límite de cambiar-usuario (5 peticiones)', async () => {
    const options = crearThrottlerOptions({
      enabled: true,
      cambiarUsuarioLimit: 5,
      cambiarUsuarioTtlMs: 900_000,
    });
    const storage = new ThrottlerStorageService();
    const reflector = new Reflector();
    const guard = new AppThrottlerGuard(options, storage, reflector);
    await guard.onModuleInit();

    const crearContextoCambiar = (usuarioId: number, ip = '198.51.100.99') => {
      const headers: Record<string, string | number> = {};
      const req = {
        ip,
        method: 'PATCH',
        url: '/api/v1/auth/contrasena/cambiar',
        headers: {},
        user: { id: usuarioId },
      };
      const res = {
        header: (name: string, value: string | number) => {
          headers[name] = value;
        },
        setHeader: (name: string, value: string | number) => {
          headers[name] = value;
        },
      };
      class AuthController {}
      const cambiarContrasenaHandler = function cambiarContrasena() {};
      const context = {
        getClass: () => AuthController,
        getHandler: () => cambiarContrasenaHandler,
        switchToHttp: () => ({
          getRequest: () => req,
          getResponse: () => res,
        }),
      } as unknown as ExecutionContext;

      return { context, headers };
    };

    // Primeras 5 peticiones pasan
    for (let i = 1; i <= 5; i++) {
      const { context } = crearContextoCambiar(101);
      await expect(guard.canActivate(context)).resolves.toBe(true);
    }

    // 6.º intento -> 429 DEMASIADAS_PETICIONES
    const intento6 = crearContextoCambiar(101);
    let errorCapturado: DomainError | undefined;
    try {
      await guard.canActivate(intento6.context);
    } catch (err) {
      errorCapturado = err as DomainError;
    }

    expect(errorCapturado).toBeInstanceOf(DomainError);
    expect(errorCapturado?.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
    expect(errorCapturado?.code).toBe(CodigoError.DEMASIADAS_PETICIONES);
    expect(intento6.headers['Retry-After']).toBeDefined();

    // Otro usuario desde la misma IP pasa
    const otroUsuario = crearContextoCambiar(102);
    await expect(guard.canActivate(otroUsuario.context)).resolves.toBe(true);

    storage.onApplicationShutdown();
  });
});
