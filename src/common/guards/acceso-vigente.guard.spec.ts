import { Reflector } from '@nestjs/core';
import { ExecutionContext } from '@nestjs/common';
import { EstadoSuscripcion } from '@prisma/client';
import { AccesoVigenteGuard } from './acceso-vigente.guard';
import { DomainError } from '../errors/domain.error';
import { CodigoError } from '../errors/codigos-error.enum';

describe('AccesoVigenteGuard (RN-038, RN-072)', () => {
  let guard: AccesoVigenteGuard;
  let reflector: Reflector;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new AccesoVigenteGuard(reflector);
  });

  function mockContext(options: {
    isPublic?: boolean;
    user?: any;
    method?: string;
    url?: string;
  }): ExecutionContext {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(options.isPublic || false);

    const request = {
      user: options.user,
      method: options.method || 'GET',
      url: options.url || '/api/v1/ciclos',
    };

    return {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as unknown as ExecutionContext;
  }

  it('debe permitir acceso si la ruta está decorada con @Public()', () => {
    const ctx = mockContext({ isPublic: true });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('debe lanzar 401 NO_AUTENTICADO si no hay usuario en request', () => {
    const ctx = mockContext({ isPublic: false, user: undefined });
    expect(() => guard.canActivate(ctx)).toThrow(DomainError);
    try {
      guard.canActivate(ctx);
    } catch (e: any) {
      expect(e.code).toBe(CodigoError.NO_AUTENTICADO);
    }
  });

  it('debe permitir lectura y escritura cuando la suscripción es ACTIVA o PRUEBA', () => {
    const userActivo = { id: 1, estadoSuscripcion: EstadoSuscripcion.ACTIVA };

    const ctxGet = mockContext({ user: userActivo, method: 'GET' });
    expect(guard.canActivate(ctxGet)).toBe(true);

    const ctxPost = mockContext({ user: userActivo, method: 'POST' });
    expect(guard.canActivate(ctxPost)).toBe(true);
  });

  it('debe permitir operaciones de lectura (GET) con suscripción VENCIDA o CANCELADA (RN-038)', () => {
    const userVencido = { id: 1, estadoSuscripcion: EstadoSuscripcion.VENCIDA };
    const ctxGet = mockContext({ user: userVencido, method: 'GET' });
    expect(guard.canActivate(ctxGet)).toBe(true);

    const userCancelado = { id: 1, estadoSuscripcion: EstadoSuscripcion.CANCELADA };
    const ctxHead = mockContext({ user: userCancelado, method: 'HEAD' });
    expect(guard.canActivate(ctxHead)).toBe(true);
  });

  it('debe bloquear con 403 SUSCRIPCION_INACTIVA intentos de escritura con suscripción VENCIDA (RN-038)', () => {
    const userVencido = { id: 1, estadoSuscripcion: EstadoSuscripcion.VENCIDA };

    const ctxPost = mockContext({ user: userVencido, method: 'POST' });
    expect(() => guard.canActivate(ctxPost)).toThrow(DomainError);

    try {
      guard.canActivate(ctxPost);
    } catch (e: any) {
      expect(e.code).toBe(CodigoError.SUSCRIPCION_INACTIVA);
      expect(e.getStatus()).toBe(403);
    }

    const ctxDelete = mockContext({ user: userVencido, method: 'DELETE' });
    expect(() => guard.canActivate(ctxDelete)).toThrow(DomainError);
  });

  it('debe permitir logout aunque la suscripción esté vencida', () => {
    const userVencido = { id: 1, estadoSuscripcion: EstadoSuscripcion.VENCIDA };
    const ctxLogout = mockContext({
      user: userVencido,
      method: 'POST',
      url: '/api/v1/auth/logout',
    });
    expect(guard.canActivate(ctxLogout)).toBe(true);
  });
});
