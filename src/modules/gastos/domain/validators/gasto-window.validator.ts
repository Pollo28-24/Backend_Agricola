import { HttpStatus, Injectable } from '@nestjs/common';
import { DomainError } from '../../../../common/errors/domain.error';
import { CodigoError } from '../../../../common/errors/codigos-error.enum';
import { GASTO_CONSTANTS } from '../../constants/gasto.constants';

export interface ValidarVentanaEdicionGastoParams {
  createdAt: Date;
  creadoPorId: number;
  usuarioId: number;
  tienePermisoAdministrar: boolean; // true si posee 'registro:administrar' (ADMIN)
  tienePermisoEditarTodos: boolean; // true si posee 'gasto:editar_todos' (CONTADOR)
  ahora?: Date;
}

export interface ValidarEliminacionGastoParams {
  tienePermisoAdministrar: boolean; // Solo ADMIN con 'registro:administrar' (Matriz 2.12)
}

/**
 * Validador de dominio puro para gobernanza temporal y matriz de privilegios en Gastos (RN-062 / 2.12).
 */
@Injectable()
export class GastoWindowValidator {
  public static readonly VENTANA_HORAS = GASTO_CONSTANTS.VENTANA_EDICION_HORAS;

  /**
   * Valida si la edición está permitida según rol y ventana temporal (RN-062).
   */
  assertEdicionPermitida(params: ValidarVentanaEdicionGastoParams): void {
    // 1. Bypass total: ADMIN ('registro:administrar') o CONTADOR ('gasto:editar_todos')
    if (params.tienePermisoAdministrar || params.tienePermisoEditarTodos) {
      return;
    }

    // 2. Validación de autoría: CAPTURISTA solo puede alterar sus propios registros
    if (params.creadoPorId !== params.usuarioId) {
      throw new DomainError(
        CodigoError.PERMISO_DENEGADO,
        'No tiene permisos para modificar un gasto creado por otro usuario (RN-062)',
        HttpStatus.FORBIDDEN,
      );
    }

    // 3. Validación de ventana temporal sobre createdAt (48 horas)
    const now = params.ahora ?? new Date();
    const diffMs = now.getTime() - params.createdAt.getTime();
    const diffHoras = diffMs / (1000 * 60 * 60);

    if (diffHoras > GastoWindowValidator.VENTANA_HORAS) {
      throw new DomainError(
        CodigoError.VENTANA_EDICION_VENCIDA,
        `La ventana de edición de ${GastoWindowValidator.VENTANA_HORAS} horas ha expirado (creado hace ${diffHoras.toFixed(1)} h) (RN-062)`,
        HttpStatus.CONFLICT,
      );
    }
  }

  /**
   * Valida si la eliminación (soft delete) está permitida.
   * Según sección 2.12 y matriz de permisos, solo ADMIN con 'registro:administrar' puede eliminar gastos.
   * CAPTURISTA y CONTADOR no tienen permitido eliminar gastos.
   */
  assertEliminacionPermitida(params: ValidarEliminacionGastoParams): void {
    if (!params.tienePermisoAdministrar) {
      throw new DomainError(
        CodigoError.PERMISO_DENEGADO,
        'Solo un usuario administrador con el permiso registro:administrar puede eliminar gastos (Sección 2.12)',
        HttpStatus.FORBIDDEN,
      );
    }
  }
}
