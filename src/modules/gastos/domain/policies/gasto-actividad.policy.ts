import { HttpStatus, Injectable } from '@nestjs/common';
import { DomainError } from '../../../../common/errors/domain.error';
import { CodigoError } from '../../../../common/errors/codigos-error.enum';

export interface ValidarCoherenciaActividadParams {
  gastoCicloId: number;
  actividad?: {
    cicloId: number;
  } | null;
}

/**
 * Política de dominio pura para coherencia entre Gasto y Actividad (RN-046).
 * Regla: Si un gasto referencia una actividad, la actividad debe pertenecer exactamente
 * al mismo ciclo de producción que el gasto.
 */
@Injectable()
export class GastoActividadPolicy {
  assertActividadPerteneceAlCiclo(
    params: ValidarCoherenciaActividadParams,
  ): void {
    if (!params.actividad) {
      return;
    }

    if (params.actividad.cicloId !== params.gastoCicloId) {
      throw new DomainError(
        CodigoError.ACTIVIDAD_DE_OTRO_CICLO,
        `La actividad agrícola indicada pertenece al ciclo ${params.actividad.cicloId}, no al ciclo ${params.gastoCicloId} del gasto (RN-046)`,
        HttpStatus.BAD_REQUEST,
      );
    }
  }
}
