import { HttpStatus, Injectable } from '@nestjs/common';
import { DomainError } from '../../../../common/errors/domain.error';
import { CodigoError } from '../../../../common/errors/codigos-error.enum';

export interface ValidarEliminacionCosechaParams {
  cosechaId: number;
  mermasVinculadasCount: number;
  // Preparado para ventas vinculadas (RN-050):
  // ventasVinculadasCount?: number;
}

/**
 * Política de dominio pura para la integridad de eliminación de cosechas (RN-050).
 * Regla: No se puede eliminar una cosecha que tenga mermas vigentes asociadas
 * (o ventas asociadas cuando se implemente dicho módulo).
 */
@Injectable()
export class CosechaIntegridadPolicy {
  assertEliminacionPermitida(params: ValidarEliminacionCosechaParams): void {
    if (params.mermasVinculadasCount > 0) {
      throw new DomainError(
        CodigoError.COSECHA_CON_MERMAS_VIGENTES,
        `No se puede eliminar la cosecha ${params.cosechaId} porque tiene ${params.mermasVinculadasCount} mermas activas vinculadas (RN-050)`,
        HttpStatus.CONFLICT,
      );
    }
  }
}
