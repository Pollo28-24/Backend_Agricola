import { ExecutionContext, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AppVersionGuard,
  HTTP_STATUS_UPGRADE_REQUIRED,
  compareSemVer,
  parseSemVer,
} from './app-version.guard';
import { DomainError } from '../errors/domain.error';
import { CodigoError } from '../errors/codigos-error.enum';

describe('AppVersionGuard (Hito 11D - ADR-015)', () => {
  let guard: AppVersionGuard;
  let configService: ConfigService;

  beforeEach(() => {
    configService = {
      get: jest.fn((key: string, defaultValue?: string) => {
        if (key === 'MIN_APP_VERSION') return '1.2.0';
        if (key === 'APP_STORE_URL')
          return 'https://play.google.com/store/apps/details?id=com.rentabilidad.agricola';
        return defaultValue;
      }),
    } as unknown as ConfigService;
    guard = new AppVersionGuard(configService);
  });

  function mockContext(headerValue?: string | string[]): ExecutionContext {
    const request = {
      headers: {
        ...(headerValue !== undefined ? { 'x-app-version': headerValue } : {}),
      },
    };
    return {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as unknown as ExecutionContext;
  }

  describe('Evaluación de cabecera X-App-Version', () => {
    it('debe permitir la petición si la cabecera X-App-Version no está presente (modo no intrusivo)', () => {
      const ctx = mockContext(undefined);
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('debe permitir la petición si la cabecera está vacía o contiene sólo espacios en blanco', () => {
      const ctx = mockContext('   ');
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('debe lanzar 400 VERSION_APP_INVALIDA si la versión no cumple con SemVer', () => {
      const invalidVersions = [
        'v1.0.0',
        '1.0',
        '1.0.0.0',
        'alpha',
        '01.0.0',
        '1.0.0-beta..1',
      ];

      for (const ver of invalidVersions) {
        const ctx = mockContext(ver);
        expect(() => guard.canActivate(ctx)).toThrow(DomainError);
        try {
          guard.canActivate(ctx);
        } catch (err: unknown) {
          const domainErr = err as DomainError;
          expect(domainErr.getStatus()).toBe(HttpStatus.BAD_REQUEST);
          expect(domainErr.code).toBe(CodigoError.VERSION_APP_INVALIDA);
          expect(domainErr.details).toEqual({ clientVersion: ver });
        }
      }
    });

    it('debe lanzar 426 VERSION_APP_OBSOLETA si la versión del cliente es menor a MIN_APP_VERSION', () => {
      const obsoleteVersions = ['1.1.9', '1.0.0', '0.9.5', '1.2.0-rc.1'];

      for (const ver of obsoleteVersions) {
        const ctx = mockContext(ver);
        expect(() => guard.canActivate(ctx)).toThrow(DomainError);
        try {
          guard.canActivate(ctx);
        } catch (err: unknown) {
          const domainErr = err as DomainError;
          expect(domainErr.getStatus()).toBe(HTTP_STATUS_UPGRADE_REQUIRED);
          expect(domainErr.code).toBe(CodigoError.VERSION_APP_OBSOLETA);
          expect(domainErr.details).toEqual({
            minVersion: '1.2.0',
            clientVersion: ver,
            storeUrl:
              'https://play.google.com/store/apps/details?id=com.rentabilidad.agricola',
          });
        }
      }
    });

    it('debe permitir la petición si la versión es exactamente igual a MIN_APP_VERSION', () => {
      const ctx = mockContext('1.2.0');
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('debe permitir la petición si la versión es mayor a MIN_APP_VERSION', () => {
      const validVersions = ['1.2.1', '1.3.0', '2.0.0', '1.2.0+build.10'];

      for (const ver of validVersions) {
        const ctx = mockContext(ver);
        expect(guard.canActivate(ctx)).toBe(true);
      }
    });

    it('debe tomar el primer elemento si la cabecera viene como array', () => {
      const ctx = mockContext(['1.2.5', '1.0.0']);
      expect(guard.canActivate(ctx)).toBe(true);
    });
  });

  describe('SemVer utilidades (compareSemVer / parseSemVer)', () => {
    it('parsea correctamente componentes semver válidos', () => {
      const parsed = parseSemVer('2.1.3-beta.1+exp.sha');
      expect(parsed).toEqual({
        major: 2,
        minor: 1,
        patch: 3,
        prerelease: ['beta', '1'],
      });
    });

    it('compara versiones numéricas mayores, menores y parches', () => {
      expect(compareSemVer('2.0.0', '1.9.9')).toBeGreaterThan(0);
      expect(compareSemVer('1.1.0', '1.0.9')).toBeGreaterThan(0);
      expect(compareSemVer('1.0.1', '1.0.0')).toBeGreaterThan(0);
      expect(compareSemVer('1.0.0', '1.0.0')).toBe(0);
      expect(compareSemVer('0.9.9', '1.0.0')).toBeLessThan(0);
    });

    it('da menor precedencia a prerelease sobre versión normal', () => {
      expect(compareSemVer('1.0.0-alpha', '1.0.0')).toBeLessThan(0);
      expect(compareSemVer('1.0.0', '1.0.0-alpha')).toBeGreaterThan(0);
      expect(compareSemVer('1.0.0-alpha', '1.0.0-beta')).toBeLessThan(0);
    });
  });
});
