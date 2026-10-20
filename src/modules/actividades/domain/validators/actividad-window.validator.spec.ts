import { ActividadWindowValidator } from './actividad-window.validator';
import { DomainError } from '../../../../common/errors/domain.error';
import { CodigoError } from '../../../../common/errors/codigos-error.enum';

describe('ActividadWindowValidator', () => {
  let validator: ActividadWindowValidator;

  beforeEach(() => {
    validator = new ActividadWindowValidator();
  });

  const baseCreatedAt = new Date('2027-01-10T10:00:00.000Z');

  it('debe permitir la modificación si el usuario es el creador y está dentro de las 48h', () => {
    // 47 horas y 59 minutos después
    const ahoraDentroDeTiempo = new Date(
      baseCreatedAt.getTime() + 47 * 3600 * 1000 + 59 * 60 * 1000,
    );

    expect(() =>
      validator.assertEdicionPermitida({
        createdAt: baseCreatedAt,
        creadoPorId: 10,
        usuarioId: 10,
        tienePermisoAdministrar: false,
        ahora: ahoraDentroDeTiempo,
      }),
    ).not.toThrow();
  });

  it('debe rechazar con PERMISO_DENEGADO (403) si el usuario NO es el creador y no tiene permiso registro:administrar', () => {
    const ahora = new Date(baseCreatedAt.getTime() + 1000);

    try {
      validator.assertEdicionPermitida({
        createdAt: baseCreatedAt,
        creadoPorId: 10,
        usuarioId: 99, // Otro usuario
        tienePermisoAdministrar: false,
        ahora,
      });
      fail('Debió lanzar DomainError');
    } catch (e: any) {
      expect(e).toBeInstanceOf(DomainError);
      expect(e.code).toBe(CodigoError.PERMISO_DENEGADO);
      expect(e.getStatus()).toBe(403);
    }
  });

  it('debe rechazar con VENTANA_EDICION_VENCIDA (409) si superó las 48h desde createdAt', () => {
    // 48 horas y 1 segundo después
    const ahoraExpirado = new Date(
      baseCreatedAt.getTime() + 48 * 3600 * 1000 + 1000,
    );

    try {
      validator.assertEdicionPermitida({
        createdAt: baseCreatedAt,
        creadoPorId: 10,
        usuarioId: 10,
        tienePermisoAdministrar: false,
        ahora: ahoraExpirado,
      });
      fail('Debió lanzar DomainError');
    } catch (e: any) {
      expect(e).toBeInstanceOf(DomainError);
      expect(e.code).toBe(CodigoError.VENTANA_EDICION_VENCIDA);
      expect(e.getStatus()).toBe(409);
    }
  });

  it('debe hacer bypass completo si tienePermisoAdministrar es true (ADMIN)', () => {
    // Pasadas 100 horas y con otro usuario
    const ahoraMuyTarde = new Date(baseCreatedAt.getTime() + 100 * 3600 * 1000);

    expect(() =>
      validator.assertEdicionPermitida({
        createdAt: baseCreatedAt,
        creadoPorId: 10,
        usuarioId: 99,
        tienePermisoAdministrar: true,
        ahora: ahoraMuyTarde,
      }),
    ).not.toThrow();
  });
});
