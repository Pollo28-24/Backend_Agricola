import { ActividadOwnershipValidator } from './actividad-ownership.validator';
import { DomainError } from '../../../../common/errors/domain.error';
import { CodigoError } from '../../../../common/errors/codigos-error.enum';

describe('ActividadOwnershipValidator', () => {
  let validator: ActividadOwnershipValidator;

  beforeEach(() => {
    validator = new ActividadOwnershipValidator();
  });

  const empresaIdToken = 10;
  const cicloValido = { id: 1, empresaId: 10 };
  const tipoActividadValido = { id: 2, activo: true };

  it('debe validar exitosamente cuando ciclo y tipoActividad son válidos', () => {
    expect(() =>
      validator.assertPertenenciaEmpresa({
        empresaIdToken,
        ciclo: cicloValido,
        tipoActividad: tipoActividadValido,
      }),
    ).not.toThrow();
  });

  it('debe rechazar con 404 si el ciclo es null o de otra empresa (RN-068)', () => {
    expect(() =>
      validator.assertPertenenciaEmpresa({
        empresaIdToken,
        ciclo: null,
        tipoActividad: tipoActividadValido,
      }),
    ).toThrow(DomainError);

    expect(() =>
      validator.assertPertenenciaEmpresa({
        empresaIdToken,
        ciclo: { id: 1, empresaId: 99 },
        tipoActividad: tipoActividadValido,
      }),
    ).toThrow(DomainError);
  });

  it('debe rechazar con 404 si el tipoActividad no existe', () => {
    expect(() =>
      validator.assertPertenenciaEmpresa({
        empresaIdToken,
        ciclo: cicloValido,
        tipoActividad: null,
      }),
    ).toThrow(DomainError);
  });

  it('debe rechazar con 409 si el tipoActividad está inactivo', () => {
    try {
      validator.assertPertenenciaEmpresa({
        empresaIdToken,
        ciclo: cicloValido,
        tipoActividad: { id: 2, activo: false },
      }),
      fail('Debió lanzar DomainError');
    } catch (e: any) {
      expect(e).toBeInstanceOf(DomainError);
      expect(e.code).toBe(CodigoError.CONFLICTO);
      expect(e.getStatus()).toBe(409);
    }
  });

  it('debe rechazar con 404 si el responsable asignado no pertenece a la empresa', () => {
    try {
      validator.assertPertenenciaEmpresa({
        empresaIdToken,
        ciclo: cicloValido,
        tipoActividad: tipoActividadValido,
        responsable: { id: 5, empresaId: 99, activo: true },
      });
      fail('Debió lanzar DomainError');
    } catch (e: any) {
      expect(e).toBeInstanceOf(DomainError);
      expect(e.code).toBe(CodigoError.RECURSO_NO_ENCONTRADO);
      expect(e.getStatus()).toBe(404);
    }
  });

  it('debe rechazar con 409 si el responsable asignado está inactivo', () => {
    try {
      validator.assertPertenenciaEmpresa({
        empresaIdToken,
        ciclo: cicloValido,
        tipoActividad: tipoActividadValido,
        responsable: { id: 5, empresaId: 10, activo: false },
      });
      fail('Debió lanzar DomainError');
    } catch (e: any) {
      expect(e).toBeInstanceOf(DomainError);
      expect(e.code).toBe(CodigoError.CONFLICTO);
      expect(e.getStatus()).toBe(409);
    }
  });
});
