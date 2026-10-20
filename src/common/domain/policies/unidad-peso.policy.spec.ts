import { HttpStatus } from '@nestjs/common';
import { TipoUnidad } from '@prisma/client';
import { UnidadPesoPolicy } from './unidad-peso.policy';
import { CodigoError } from '../../errors/codigos-error.enum';

describe('UnidadPesoPolicy (RN-069)', () => {
  let policy: UnidadPesoPolicy;

  beforeEach(() => {
    policy = new UnidadPesoPolicy();
  });

  it('debe aprobar si la unidad de medida es de tipo PESO', () => {
    expect(() =>
      policy.assertUnidadEsDePeso({
        unidad: {
          id: 1,
          codigo: 'KG',
          nombre: 'Kilogramo',
          tipo: TipoUnidad.PESO,
        },
      }),
    ).not.toThrow();
  });

  it('debe rechazar con UNIDAD_NO_PESO (400) si la unidad es de tipo VOLUMEN, AREA, TIEMPO o CONTEO', () => {
    const tiposInvalidos = [
      TipoUnidad.VOLUMEN,
      TipoUnidad.AREA,
      TipoUnidad.TIEMPO,
      TipoUnidad.CONTEO,
    ];

    for (const tipo of tiposInvalidos) {
      expect(() =>
        policy.assertUnidadEsDePeso({
          unidad: {
            id: 2,
            codigo: tipo,
            nombre: `Unidad de ${tipo}`,
            tipo,
          },
        }),
      ).toThrow(
        expect.objectContaining({
          code: CodigoError.UNIDAD_NO_PESO,
          status: HttpStatus.BAD_REQUEST,
        }),
      );
    }
  });
});
