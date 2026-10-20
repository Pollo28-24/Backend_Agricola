import { EstadoCiclo } from '@prisma/client';
import { CicloCapturaPolicy } from './ciclo-captura.policy';
import { DomainError } from '../../../../common/errors/domain.error';
import { CodigoError } from '../../../../common/errors/codigos-error.enum';

describe('CicloCapturaPolicy', () => {
  let policy: CicloCapturaPolicy;

  beforeEach(() => {
    policy = new CicloCapturaPolicy();
  });

  describe('assertCaptureAllowed (RN-015)', () => {
    it('debe permitir captura en ciclos PLANIFICADO, ACTIVO y SUSPENDIDO', () => {
      expect(() => policy.assertCaptureAllowed({ estado: EstadoCiclo.PLANIFICADO })).not.toThrow();
      expect(() => policy.assertCaptureAllowed({ estado: EstadoCiclo.ACTIVO })).not.toThrow();
      expect(() => policy.assertCaptureAllowed({ estado: EstadoCiclo.SUSPENDIDO })).not.toThrow();
    });

    it('debe rechazar con CICLO_CERRADO (409) si el ciclo está FINALIZADO', () => {
      try {
        policy.assertCaptureAllowed({ estado: EstadoCiclo.FINALIZADO });
        fail('Debió lanzar DomainError');
      } catch (e: any) {
        expect(e).toBeInstanceOf(DomainError);
        expect(e.code).toBe(CodigoError.CICLO_CERRADO);
        expect(e.getStatus()).toBe(409);
      }
    });

    it('debe rechazar con CICLO_CERRADO (409) si el ciclo está CANCELADO', () => {
      try {
        policy.assertCaptureAllowed({ estado: EstadoCiclo.CANCELADO });
        fail('Debió lanzar DomainError');
      } catch (e: any) {
        expect(e).toBeInstanceOf(DomainError);
        expect(e.code).toBe(CodigoError.CICLO_CERRADO);
        expect(e.getStatus()).toBe(409);
      }
    });
  });

  describe('assertFechaCoherente (RN-044)', () => {
    const fechaInicio = new Date('2027-01-10T00:00:00.000Z');

    it('debe permitir fechas iguales o posteriores a fechaInicio', () => {
      expect(() =>
        policy.assertFechaCoherente({ fechaInicio }, new Date('2027-01-10T00:00:00.000Z')),
      ).not.toThrow();
      expect(() =>
        policy.assertFechaCoherente({ fechaInicio }, new Date('2027-01-15T00:00:00.000Z')),
      ).not.toThrow();
    });

    it('debe rechazar con FECHA_ANTERIOR_AL_INICIO (400) si la fecha es anterior', () => {
      try {
        policy.assertFechaCoherente({ fechaInicio }, new Date('2027-01-09T23:59:59.000Z'));
        fail('Debió lanzar DomainError');
      } catch (e: any) {
        expect(e).toBeInstanceOf(DomainError);
        expect(e.code).toBe(CodigoError.FECHA_ANTERIOR_AL_INICIO);
        expect(e.getStatus()).toBe(400);
      }
    });
  });
});
