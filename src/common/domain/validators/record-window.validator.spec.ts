import { HttpStatus } from '@nestjs/common';
import { RecordWindowValidator } from './record-window.validator';
import { DomainError } from '../../errors/domain.error';
import { CodigoError } from '../../errors/codigos-error.enum';

describe('RecordWindowValidator (RN-062)', () => {
  let validator: RecordWindowValidator;
  const baseCreatedAt = new Date('2027-01-10T10:00:00.000Z');

  beforeEach(() => {
    validator = new RecordWindowValidator();
  });

  describe('assertEdicionPermitida', () => {
    it('debe permitir la modificación al autor dentro de las 48h (47h 59m)', () => {
      const ahora = new Date(
        baseCreatedAt.getTime() + (47 * 60 + 59) * 60 * 1000,
      );

      expect(() =>
        validator.assertEdicionPermitida({
          createdAt: baseCreatedAt,
          creadoPorId: 10,
          usuarioId: 10,
          tienePermisoAdministrar: false,
          ahora,
        }),
      ).not.toThrow();
    });

    it('debe rechazar con VENTANA_EDICION_VENCIDA (409) si superó las 48h (48h 01m)', () => {
      const ahora = new Date(
        baseCreatedAt.getTime() + (48 * 60 + 1) * 60 * 1000,
      );

      expect(() =>
        validator.assertEdicionPermitida({
          createdAt: baseCreatedAt,
          creadoPorId: 10,
          usuarioId: 10,
          tienePermisoAdministrar: false,
          ahora,
        }),
      ).toThrow(
        new DomainError(
          CodigoError.VENTANA_EDICION_VENCIDA,
          'La ventana de edición de 48 horas ha expirado (creado hace 48.0 h) (RN-062)',
          HttpStatus.CONFLICT,
        ),
      );
    });

    it('debe rechazar con PERMISO_DENEGADO (403) si no es el creador y no tiene bypass', () => {
      expect(() =>
        validator.assertEdicionPermitida({
          createdAt: baseCreatedAt,
          creadoPorId: 10,
          usuarioId: 99,
          tienePermisoAdministrar: false,
        }),
      ).toThrow(
        new DomainError(
          CodigoError.PERMISO_DENEGADO,
          'No tiene permisos para modificar un registro creado por otro usuario (RN-062)',
          HttpStatus.FORBIDDEN,
        ),
      );
    });

    it('debe permitir bypass total a ADMIN con registro:administrar fuera de 48h y en registro ajeno', () => {
      const ahora = new Date(baseCreatedAt.getTime() + 100 * 60 * 60 * 1000);

      expect(() =>
        validator.assertEdicionPermitida({
          createdAt: baseCreatedAt,
          creadoPorId: 10,
          usuarioId: 99,
          tienePermisoAdministrar: true,
          ahora,
        }),
      ).not.toThrow();
    });

    it('debe permitir bypass a rol facultado (tieneBypassRol = true) fuera de 48h y en registro ajeno', () => {
      const ahora = new Date(baseCreatedAt.getTime() + 100 * 60 * 60 * 1000);

      expect(() =>
        validator.assertEdicionPermitida({
          createdAt: baseCreatedAt,
          creadoPorId: 10,
          usuarioId: 99,
          tienePermisoAdministrar: false,
          tieneBypassRol: true,
          ahora,
        }),
      ).not.toThrow();
    });
  });

  describe('assertEliminacionPermitida', () => {
    it('debe permitir la eliminación a ADMIN con tienePermisoAdministrar = true', () => {
      expect(() =>
        validator.assertEliminacionPermitida({ tienePermisoAdministrar: true }),
      ).not.toThrow();
    });

    it('debe rechazar la eliminación con PERMISO_DENEGADO (403) si no tiene permiso administrar', () => {
      expect(() =>
        validator.assertEliminacionPermitida({
          tienePermisoAdministrar: false,
        }),
      ).toThrow(
        new DomainError(
          CodigoError.PERMISO_DENEGADO,
          'Solo un usuario administrador con el permiso registro:administrar puede eliminar registros (RN-062 / Matriz 2.12)',
          HttpStatus.FORBIDDEN,
        ),
      );
    });
  });
});
