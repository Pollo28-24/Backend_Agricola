import { HttpStatus, Injectable } from '@nestjs/common';
import { DomainError } from '../../errors/domain.error';
import { CodigoError } from '../../errors/codigos-error.enum';

export interface ValidarVentanaRegistroParams {
  createdAt: Date;
  creadoPorId: number;
  usuarioId: number;
  tienePermisoAdministrar: boolean; // bypass total institucional (ADMIN con registro:administrar)
  tieneBypassRol?: boolean; // bypass adicional específico de rol (ej. CONTADOR con gasto:editar_todos)
  ahora?: Date;
  ventanaHoras?: number;
  nombreEntidad?: string;
}

export interface ValidarEliminacionRegistroParams {
  tienePermisoAdministrar: boolean; // Solo ADMIN con registro:administrar
  nombreEntidadPlural?: string;
  mensajePersonalizado?: string;
}

/**
 * Validador unificado de dominio para gobernanza temporal de campo (RN-062).
 * Unifica las reglas de 48 horas, autoría de creación y privilegio de eliminación
 * para Actividades, Gastos, Cosechas y Mermas sin duplicación de lógica.
 */
@Injectable()
export class RecordWindowValidator {
  public static readonly DEFAULT_VENTANA_HORAS = 48;

  assertEdicionPermitida(params: ValidarVentanaRegistroParams): void {
    // 1. Bypass administrativo o por rol facultado
    if (params.tienePermisoAdministrar || params.tieneBypassRol) {
      return;
    }

    // 2. Autoría: quien no tenga bypass solo altera registros propios
    if (params.creadoPorId !== params.usuarioId) {
      const entidad = params.nombreEntidad ?? 'registro';
      throw new DomainError(
        CodigoError.PERMISO_DENEGADO,
        `No tiene permisos para modificar un ${entidad} creado por otro usuario (RN-062)`,
        HttpStatus.FORBIDDEN,
      );
    }

    // 3. Ventana temporal sobre createdAt
    const now = params.ahora ?? new Date();
    const ventana =
      params.ventanaHoras ?? RecordWindowValidator.DEFAULT_VENTANA_HORAS;
    const diffMs = now.getTime() - params.createdAt.getTime();
    const diffHoras = diffMs / (1000 * 60 * 60);

    if (diffHoras > ventana) {
      throw new DomainError(
        CodigoError.VENTANA_EDICION_VENCIDA,
        `La ventana de edición de ${ventana} horas ha expirado (creado hace ${diffHoras.toFixed(1)} h) (RN-062)`,
        HttpStatus.CONFLICT,
      );
    }
  }

  assertEliminacionPermitida(params: ValidarEliminacionRegistroParams): void {
    if (!params.tienePermisoAdministrar) {
      const mensaje =
        params.mensajePersonalizado ??
        `Solo un usuario administrador con el permiso registro:administrar puede eliminar ${params.nombreEntidadPlural ?? 'registros'} (RN-062 / Matriz 2.12)`;
      throw new DomainError(
        CodigoError.PERMISO_DENEGADO,
        mensaje,
        HttpStatus.FORBIDDEN,
      );
    }
  }
}
