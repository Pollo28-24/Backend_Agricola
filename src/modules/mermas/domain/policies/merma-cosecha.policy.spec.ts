import { HttpStatus } from '@nestjs/common';
import { MermaCosechaPolicy } from './merma-cosecha.policy';
import { DomainError } from '../../../../common/errors/domain.error';
import { CodigoError } from '../../../../common/errors/codigos-error.enum';

describe('MermaCosechaPolicy (RN-049)', () => {
  let policy: MermaCosechaPolicy;

  beforeEach(() => {
    policy = new MermaCosechaPolicy();
  });

  it('debe aprobar si no se especifica cosecha de origen (cosechaId es opcional)', () => {
    expect(() =>
      policy.assertCosechaPerteneceAlCiclo({
        mermaCicloId: 1,
        cosecha: null,
      }),
    ).not.toThrow();
  });

  it('debe aprobar si la cosecha pertenece al mismo ciclo que la merma', () => {
    expect(() =>
      policy.assertCosechaPerteneceAlCiclo({
        mermaCicloId: 5,
        cosecha: { id: 10, cicloId: 5 },
      }),
    ).not.toThrow();
  });

  it('debe rechazar con COSECHA_DE_OTRO_CICLO (400) si la cosecha pertenece a otro ciclo', () => {
    expect(() =>
      policy.assertCosechaPerteneceAlCiclo({
        mermaCicloId: 5,
        cosecha: { id: 10, cicloId: 8 },
      }),
    ).toThrow(
      new DomainError(
        CodigoError.COSECHA_DE_OTRO_CICLO,
        'La cosecha de origen (10) pertenece al ciclo 8, no al ciclo 5 de la merma (RN-049)',
        HttpStatus.BAD_REQUEST,
      ),
    );
  });
});
