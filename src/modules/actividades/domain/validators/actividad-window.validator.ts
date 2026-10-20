import { HttpStatus, Injectable } from '@nestjs/common';
import { DomainError } from '../../../../common/errors/domain.error';
import { CodigoError } from '../../../../common/errors/codigos-error.enum';
import { ACTIVIDAD_CONSTANTS } from '../../constants/actividad.constants';

export interface ValidarVentanaEdicionParams {
  createdAt: Date;
  creadoPorId: number;
  usuarioId: number;
  tienePermisoAdministrar: boolean; // true si el usuario posee 'registro:administrar' (ADMIN)
  ahora?: Date;
}

/**
 * Validador de dominio para la gobernanza temporal de registros de campo (RN-062).
 * Un usuario sin 'registro:administrar' solo edita registros que él mismo creó,
 * dentro de las 48 horas desde su creación (createdAt).
 */
@Injectable()
export class ActividadWindowValidator {
  public static readonly VENTANA_HORAS = ACTIVIDAD_CONSTANTS.VENTANA_EDICION_HORAS;

  assertEdicionPermitida(params: ValidarVentanaEdicionParams): void {
    // 1. Bypass institucional: ADMIN con 'registro:administrar' edita/elimina sin restricción temporal ni de autoría
    if (params.tienePermisoAdministrar) {
      return;
    }

    // 2. Validación de autoría: CAPTURISTA solo puede alterar sus propios registros
    if (params.creadoPorId !== params.usuarioId) {
      throw new DomainError(
        CodigoError.PERMISO_DENEGADO,
        'No tiene permisos para modificar o eliminar un registro creado por otro usuario (RN-062)',
        HttpStatus.FORBIDDEN,
      );
    }

    // 3. Validación de ventana temporal sobre createdAt
    const now = params.ahora ?? new Date();
    const diffMs = now.getTime() - params.createdAt.getTime();
    const diffHoras = diffMs / (1000 * 60 * 60);

    if (diffHoras > ActividadWindowValidator.VENTANA_HORAS) {
      throw new DomainError(
        CodigoError.VENTANA_EDICION_VENCIDA,
        `La ventana de edición de ${ActividadWindowValidator.VENTANA_HORAS} horas ha expirado (creado hace ${diffHoras.toFixed(1)} h) (RN-062)`,
        HttpStatus.CONFLICT,
      );
    }
  }
}
