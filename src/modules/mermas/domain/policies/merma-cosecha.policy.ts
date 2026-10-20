import { HttpStatus, Injectable } from '@nestjs/common';
import { DomainError } from '../../../../common/errors/domain.error';
import { CodigoError } from '../../../../common/errors/codigos-error.enum';

export interface ValidarCoherenciaMermaCosechaParams {
  mermaCicloId: number;
  cosecha?: {
    id: number;
    cicloId: number;
  } | null;
}

/**
 * Política de dominio pura para coherencia de ciclo entre Merma y Cosecha (RN-049).
 * Regla: Si una merma referencia una cosecha de origen (cosechaId), ambas deben
 * pertenecer exactamente al mismo ciclo de producción.
 */
@Injectable()
export class MermaCosechaPolicy {
  assertCosechaPerteneceAlCiclo(
    params: ValidarCoherenciaMermaCosechaParams,
  ): void {
    if (!params.cosecha) {
      return;
    }

    if (params.cosecha.cicloId !== params.mermaCicloId) {
      throw new DomainError(
        CodigoError.COSECHA_DE_OTRO_CICLO,
        `La cosecha de origen (${params.cosecha.id}) pertenece al ciclo ${params.cosecha.cicloId}, no al ciclo ${params.mermaCicloId} de la merma (RN-049)`,
        HttpStatus.BAD_REQUEST,
      );
    }
  }
}
