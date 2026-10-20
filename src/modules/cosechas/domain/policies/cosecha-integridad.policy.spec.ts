import { HttpStatus } from '@nestjs/common';
import { CosechaIntegridadPolicy } from './cosecha-integridad.policy';
import { DomainError } from '../../../../common/errors/domain.error';
import { CodigoError } from '../../../../common/errors/codigos-error.enum';

describe('CosechaIntegridadPolicy (RN-050)', () => {
  let policy: CosechaIntegridadPolicy;

  beforeEach(() => {
    policy = new CosechaIntegridadPolicy();
  });

  it('debe permitir la eliminación si la cosecha tiene 0 mermas asociadas', () => {
    expect(() =>
      policy.assertEliminacionPermitida({
        cosechaId: 10,
        mermasVinculadasCount: 0,
      }),
    ).not.toThrow();
  });

  it('debe rechazar con COSECHA_CON_MERMAS_VIGENTES (409) si tiene mermas activas', () => {
    expect(() =>
      policy.assertEliminacionPermitida({
        cosechaId: 10,
        mermasVinculadasCount: 2,
      }),
    ).toThrow(
      new DomainError(
        CodigoError.COSECHA_CON_MERMAS_VIGENTES,
        'No se puede eliminar la cosecha 10 porque tiene 2 mermas activas vinculadas (RN-050)',
        HttpStatus.CONFLICT,
      ),
    );
  });

  it('debe rechazar con COSECHA_CON_VENTAS_VINCULADAS (409) si tiene ventas activas vinculadas', () => {
    expect(() =>
      policy.assertEliminacionPermitida({
        cosechaId: 10,
        mermasVinculadasCount: 0,
        ventasVinculadasCount: 1,
      }),
    ).toThrow(
      new DomainError(
        CodigoError.COSECHA_CON_VENTAS_VINCULADAS,
        'No se puede eliminar la cosecha 10 porque tiene 1 renglones de venta activos vinculados (RN-050)',
        HttpStatus.CONFLICT,
      ),
    );
  });
});
