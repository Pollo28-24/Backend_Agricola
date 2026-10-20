import { Injectable } from '@nestjs/common';
import { RecordWindowValidator } from '../../../../common/domain/validators/record-window.validator';
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
 * Adaptador delgado de GastoWindowValidator sobre RecordWindowValidator (RN-062).
 * Mantiene intacta la firma y comportamiento sin editar el spec existente de Gastos.
 */
@Injectable()
export class GastoWindowValidator {
  public static readonly VENTANA_HORAS = GASTO_CONSTANTS.VENTANA_EDICION_HORAS;

  private readonly recordWindowValidator = new RecordWindowValidator();

  constructor() {}

  /**
   * Valida si la edición está permitida según rol y ventana temporal (RN-062).
   */
  assertEdicionPermitida(params: ValidarVentanaEdicionGastoParams): void {
    this.recordWindowValidator.assertEdicionPermitida({
      createdAt: params.createdAt,
      creadoPorId: params.creadoPorId,
      usuarioId: params.usuarioId,
      tienePermisoAdministrar: params.tienePermisoAdministrar,
      tieneBypassRol: params.tienePermisoEditarTodos,
      ahora: params.ahora,
      ventanaHoras: GastoWindowValidator.VENTANA_HORAS,
      nombreEntidad: 'gasto',
    });
  }

  /**
   * Valida si la eliminación (soft delete) está permitida (Matriz 2.12).
   */
  assertEliminacionPermitida(params: ValidarEliminacionGastoParams): void {
    this.recordWindowValidator.assertEliminacionPermitida({
      tienePermisoAdministrar: params.tienePermisoAdministrar,
      mensajePersonalizado:
        'Solo un usuario administrador con el permiso registro:administrar puede eliminar gastos (Sección 2.12)',
    });
  }
}
