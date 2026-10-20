import { Injectable } from '@nestjs/common';
import { RecordWindowValidator } from '../../../../common/domain/validators/record-window.validator';
import { ACTIVIDAD_CONSTANTS } from '../../constants/actividad.constants';

export interface ValidarVentanaEdicionParams {
  createdAt: Date;
  creadoPorId: number;
  usuarioId: number;
  tienePermisoAdministrar: boolean; // true si el usuario posee 'registro:administrar' (ADMIN)
  ahora?: Date;
}

/**
 * Adaptador delgado de ActividadWindowValidator sobre RecordWindowValidator (RN-062).
 * Mantiene intacta la firma y comportamiento sin editar el spec existente de Actividades.
 */
@Injectable()
export class ActividadWindowValidator {
  public static readonly VENTANA_HORAS =
    ACTIVIDAD_CONSTANTS.VENTANA_EDICION_HORAS;

  private readonly recordWindowValidator = new RecordWindowValidator();

  constructor() {}

  assertEdicionPermitida(params: ValidarVentanaEdicionParams): void {
    this.recordWindowValidator.assertEdicionPermitida({
      createdAt: params.createdAt,
      creadoPorId: params.creadoPorId,
      usuarioId: params.usuarioId,
      tienePermisoAdministrar: params.tienePermisoAdministrar,
      ahora: params.ahora,
      ventanaHoras: ActividadWindowValidator.VENTANA_HORAS,
    });
  }
}
