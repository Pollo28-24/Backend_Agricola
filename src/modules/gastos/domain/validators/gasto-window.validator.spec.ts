import { HttpStatus } from '@nestjs/common';
import { GastoWindowValidator } from './gasto-window.validator';
import { DomainError } from '../../../../common/errors/domain.error';
import { CodigoError } from '../../../../common/errors/codigos-error.enum';

describe('GastoWindowValidator (RN-062 / 2.12)', () => {
  let validator: GastoWindowValidator;
  const baseDate = new Date('2027-01-10T12:00:00.000Z');

  beforeEach(() => {
    validator = new GastoWindowValidator();
  });

  describe('assertEdicionPermitida', () => {
    it('debe permitir la edición al autor si transcurrieron 47h 59m (dentro de 48h)', () => {
      const ahora = new Date(baseDate.getTime() + (47 * 60 + 59) * 60 * 1000);

      expect(() =>
        validator.assertEdicionPermitida({
          createdAt: baseDate,
          creadoPorId: 5,
          usuarioId: 5,
          tienePermisoAdministrar: false,
          tienePermisoEditarTodos: false,
          ahora,
        }),
      ).not.toThrow();
    });

    it('debe rechazar con VENTANA_EDICION_VENCIDA (409) al autor si transcurrieron 48h 01m', () => {
      const ahora = new Date(baseDate.getTime() + (48 * 60 + 1) * 60 * 1000);

      try {
        validator.assertEdicionPermitida({
          createdAt: baseDate,
          creadoPorId: 5,
          usuarioId: 5,
          tienePermisoAdministrar: false,
          tienePermisoEditarTodos: false,
          ahora,
        });
        fail('Debió lanzar DomainError');
      } catch (e: unknown) {
        expect(e).toBeInstanceOf(DomainError);
        const err = e as DomainError;
        expect(err.code).toBe(CodigoError.VENTANA_EDICION_VENCIDA);
        expect(err.getStatus()).toBe(HttpStatus.CONFLICT);
      }
    });

    it('debe rechazar con PERMISO_DENEGADO (403) si un capturista intenta editar un gasto ajeno', () => {
      expect(() =>
        validator.assertEdicionPermitida({
          createdAt: baseDate,
          creadoPorId: 10,
          usuarioId: 5,
          tienePermisoAdministrar: false,
          tienePermisoEditarTodos: false,
        }),
      ).toThrow(
        new DomainError(
          CodigoError.PERMISO_DENEGADO,
          'No tiene permisos para modificar un gasto creado por otro usuario (RN-062)',
          HttpStatus.FORBIDDEN,
        ),
      );
    });

    it('debe permitir la edición a CONTADOR con gasto:editar_todos fuera de 48h y sobre registros ajenos', () => {
      const ahora = new Date(baseDate.getTime() + 100 * 60 * 60 * 1000); // 100 horas después

      expect(() =>
        validator.assertEdicionPermitida({
          createdAt: baseDate,
          creadoPorId: 10,
          usuarioId: 99,
          tienePermisoAdministrar: false,
          tienePermisoEditarTodos: true, // CONTADOR
          ahora,
        }),
      ).not.toThrow();
    });

    it('debe permitir la edición a ADMIN con registro:administrar fuera de 48h y sobre registros ajenos', () => {
      const ahora = new Date(baseDate.getTime() + 100 * 60 * 60 * 1000);

      expect(() =>
        validator.assertEdicionPermitida({
          createdAt: baseDate,
          creadoPorId: 10,
          usuarioId: 1,
          tienePermisoAdministrar: true, // ADMIN
          tienePermisoEditarTodos: false,
          ahora,
        }),
      ).not.toThrow();
    });
  });

  describe('assertEliminacionPermitida (A2 / 2.12)', () => {
    it('debe permitir la eliminación si el usuario es ADMIN con registro:administrar', () => {
      expect(() =>
        validator.assertEliminacionPermitida({
          tienePermisoAdministrar: true,
        }),
      ).not.toThrow();
    });

    it('debe rechazar con PERMISO_DENEGADO (403) si un CAPTURISTA o CONTADOR intenta eliminar', () => {
      expect(() =>
        validator.assertEliminacionPermitida({
          tienePermisoAdministrar: false,
        }),
      ).toThrow(
        new DomainError(
          CodigoError.PERMISO_DENEGADO,
          'Solo un usuario administrador con el permiso registro:administrar puede eliminar gastos (Sección 2.12)',
          HttpStatus.FORBIDDEN,
        ),
      );
    });
  });
});
