import { HttpStatus } from '@nestjs/common';
import { GastoActividadPolicy } from './gasto-actividad.policy';
import { DomainError } from '../../../../common/errors/domain.error';
import { CodigoError } from '../../../../common/errors/codigos-error.enum';

describe('GastoActividadPolicy (RN-046)', () => {
  let policy: GastoActividadPolicy;

  beforeEach(() => {
    policy = new GastoActividadPolicy();
  });

  it('debe aprobar si no se especifica actividad (actividad opcional)', () => {
    expect(() =>
      policy.assertActividadPerteneceAlCiclo({
        gastoCicloId: 10,
        actividad: null,
      }),
    ).not.toThrow();
  });

  it('debe aprobar si la actividad pertenece exactamente al mismo ciclo que el gasto', () => {
    expect(() =>
      policy.assertActividadPerteneceAlCiclo({
        gastoCicloId: 10,
        actividad: { cicloId: 10 },
      }),
    ).not.toThrow();
  });

  it('debe fallar con ACTIVIDAD_DE_OTRO_CICLO (400) si la actividad pertenece a otro ciclo', () => {
    expect(() =>
      policy.assertActividadPerteneceAlCiclo({
        gastoCicloId: 10,
        actividad: { cicloId: 15 },
      }),
    ).toThrow(
      new DomainError(
        CodigoError.ACTIVIDAD_DE_OTRO_CICLO,
        'La actividad agrícola indicada pertenece al ciclo 15, no al ciclo 10 del gasto (RN-046)',
        HttpStatus.BAD_REQUEST,
      ),
    );
  });
});
