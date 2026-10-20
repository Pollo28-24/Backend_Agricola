import { HttpStatus, Injectable } from '@nestjs/common';
import { EstadoCiclo } from '@prisma/client';
import { DomainError } from '../../../../common/errors/domain.error';
import { CodigoError } from '../../../../common/errors/codigos-error.enum';

/**
 * Política institucional del ciclo de vida del Ciclo de Producción.
 * Reutilizable transversalmente por Actividades, Gastos, Cosechas, Mermas y Ventas.
 */
@Injectable()
export class CicloCapturaPolicy {
  /**
   * RN-015: Verifica si el ciclo admite captura de registros operativos.
   * Estados que admiten captura: PLANIFICADO, ACTIVO, SUSPENDIDO.
   * Estados bloqueados: FINALIZADO, CANCELADO.
   */
  assertCaptureAllowed(ciclo: { estado: EstadoCiclo; id?: number }): void {
    if (
      ciclo.estado === EstadoCiclo.FINALIZADO ||
      ciclo.estado === EstadoCiclo.CANCELADO
    ) {
      throw new DomainError(
        CodigoError.CICLO_CERRADO,
        `No se permite capturar ni modificar registros en un ciclo en estado ${ciclo.estado} (RN-015)`,
        HttpStatus.CONFLICT,
      );
    }
  }

  /**
   * RN-044: Verifica que la fecha operativa no sea anterior a la fecha de inicio del ciclo.
   */
  assertFechaCoherente(
    ciclo: { fechaInicio: Date; id?: number },
    fechaOperativa: Date,
    nombreEntidad = 'actividad',
  ): void {
    if (fechaOperativa < ciclo.fechaInicio) {
      throw new DomainError(
        CodigoError.FECHA_ANTERIOR_AL_INICIO,
        `La fecha de la ${nombreEntidad} no puede ser anterior a la fecha de inicio del ciclo (RN-044)`,
        HttpStatus.BAD_REQUEST,
      );
    }
  }
}
