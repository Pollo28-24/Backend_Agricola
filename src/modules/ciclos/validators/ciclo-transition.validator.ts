import { Injectable, HttpStatus } from '@nestjs/common';
import { EstadoCiclo } from '@prisma/client';
import { AccionCiclo, TRANSICIONES_CICLO } from '../constants/ciclo-state-machine.constant';
import { DomainError } from '../../../common/errors/domain.error';
import { CodigoError } from '../../../common/errors/codigos-error.enum';

@Injectable()
export class CicloTransitionValidator {
  /**
   * Valida si la acción solicitada es legal desde el estado actual del ciclo.
   * Si es válida, retorna el nuevo estado; de lo contrario lanza DomainError (409 CONFLICT).
   */
  validar(estadoActual: EstadoCiclo, accion: AccionCiclo): EstadoCiclo {
    const estadoDestino = TRANSICIONES_CICLO[estadoActual]?.[accion];

    if (!estadoDestino) {
      throw new DomainError(
        CodigoError.CONFLICTO,
        `Transición no permitida: no se puede ejecutar la acción '${accion}' en un ciclo con estado '${estadoActual}'`,
        HttpStatus.CONFLICT,
      );
    }

    return estadoDestino;
  }
}
