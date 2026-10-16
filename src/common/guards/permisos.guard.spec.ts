import { Reflector } from '@nestjs/core';
import { ExecutionContext } from '@nestjs/common';
import { PermisosGuard } from './permisos.guard';
import { DomainError } from '../errors/domain.error';
import { CodigoError } from '../errors/codigos-error.enum';
import { IS_PUBLIC_KEY } from '../../modules/auth/decorators/public.decorator';
import { PERMISOS_KEY } from '../decorators/require-permisos.decorator';

describe('PermisosGuard (Sección 2.10.2, RN-039)', () => {
  let guard: PermisosGuard;
  let reflector: Reflector;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new PermisosGuard(reflector);
  });

  function mockContext(options: {
    isPublic?: boolean;
    permisosRequeridos?: string[];
    user?: any;
  }): ExecutionContext {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockImplementation((key: string) => {
        if (key === IS_PUBLIC_KEY) return options.isPublic || false;
        if (key === PERMISOS_KEY)
          return options.permisosRequeridos || undefined;
        return undefined;
      });

    const request = {
      user: options.user,
    };

    return {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as unknown as ExecutionContext;
  }

  it('debe permitir acceso si la ruta es pública', () => {
    const ctx = mockContext({
      isPublic: true,
      permisosRequeridos: ['ciclo:crear'],
    });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('debe permitir acceso si no se especificaron permisos requeridos', () => {
    const ctx = mockContext({
      isPublic: false,
      permisosRequeridos: undefined,
      user: { id: 1, permisos: [] },
    });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('debe lanzar 401 si se exigen permisos y no hay usuario autenticado', () => {
    const ctx = mockContext({
      isPublic: false,
      permisosRequeridos: ['ciclo:crear'],
      user: undefined,
    });
    expect(() => guard.canActivate(ctx)).toThrow(DomainError);
    try {
      guard.canActivate(ctx);
    } catch (e: any) {
      expect(e.code).toBe(CodigoError.NO_AUTENTICADO);
    }
  });

  it('debe permitir acceso si el usuario cuenta con todos los permisos requeridos', () => {
    const userAdmin = {
      id: 1,
      rol: 'ADMIN',
      permisos: ['ciclo:crear', 'ciclo:cerrar', 'gasto:crear'],
    };

    const ctx = mockContext({
      isPublic: false,
      permisosRequeridos: ['ciclo:crear', 'gasto:crear'],
      user: userAdmin,
    });

    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('debe rechazar con 403 PERMISO_DENEGADO si al usuario le falta algún permiso (ej. CAPTURISTA a ventas RN-064)', () => {
    const userCapturista = {
      id: 2,
      rol: 'CAPTURISTA',
      permisos: [
        'actividad:crear',
        'gasto:crear',
        'cosecha:crear',
        'merma:crear',
      ],
    };

    const ctx = mockContext({
      isPublic: false,
      permisosRequeridos: ['venta:crear'],
      user: userCapturista,
    });

    expect(() => guard.canActivate(ctx)).toThrow(DomainError);
    try {
      guard.canActivate(ctx);
    } catch (e: any) {
      expect(e.code).toBe(CodigoError.PERMISO_DENEGADO);
      expect(e.getStatus()).toBe(403);
      expect(e.details.permisosFaltantes).toContain('venta:crear');
      expect(e.details.rol).toBe('CAPTURISTA');
    }
  });
});
