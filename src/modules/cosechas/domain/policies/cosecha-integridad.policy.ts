import { HttpStatus, Injectable } from '@nestjs/common';
import { DomainError } from '../../../../common/errors/domain.error';
import { CodigoError } from '../../../../common/errors/codigos-error.enum';

export interface ValidarEliminacionCosechaParams {
  cosechaId: number;
  mermasVinculadasCount: number;
  ventasVinculadasCount?: number;
}

/**
 * Política de dominio pura para la integridad de eliminación de cosechas (RN-050).
 * Regla: No se puede eliminar una cosecha que tenga mermas vigentes asociadas
 * o ventas activas asociadas (RN-050).
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

    if ((params.ventasVinculadasCount ?? 0) > 0) {
      throw new DomainError(
        CodigoError.COSECHA_CON_VENTAS_VINCULADAS,
        `No se puede eliminar la cosecha ${params.cosechaId} porque tiene ${params.ventasVinculadasCount} renglones de venta activos vinculados (RN-050)`,
        HttpStatus.CONFLICT,
      );
    }
  }
}
