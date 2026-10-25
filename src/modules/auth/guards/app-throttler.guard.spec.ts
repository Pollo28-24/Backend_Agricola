import { ExecutionContext, HttpStatus } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ThrottlerStorageService } from '@nestjs/throttler';
import {
  AppThrottlerGuard,
  obtenerTrackerLoginCorreo,
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
});
