import { HttpStatus, Injectable } from '@nestjs/common';
import { EstadoCiclo } from '@prisma/client';
import { DomainError } from '../../errors/domain.error';
import { CodigoError } from '../../errors/codigos-error.enum';

export type TipoEntidadOperativa = 'actividad' | 'gasto' | 'cosecha' | 'merma';

/**
 * Política institucional del ciclo de vida del Ciclo de Producción.
 * Reutilizable transversalmente por Actividades, Gastos, Cosechas, Mermas y Ventas.
 */
@Injectable()
export class CicloCapturaPolicy {
  /**
   * RN-015 / RN-023 / Tabla 2.6:
   * Verifica si el ciclo admite captura de registros operativos según el tipo de entidad.
   * - FINALIZADO y CANCELADO: bloquean cualquier tipo de registro operativo (CICLO_CERRADO, 409).
   * - PLANIFICADO: admite actividades y gastos preparatorios; rechaza cosechas y mermas (CICLO_NO_ACTIVO, 409).
   * - ACTIVO y SUSPENDIDO: admiten actividades, gastos, cosechas y mermas.
   *
   * @param ciclo Entidad ciclo con su estado actual
   * @param tipo Tipo de entidad operativa a capturar (opcional, default 'actividad' para retrocompatibilidad)
   */
  assertCaptureAllowed(
    ciclo: { estado: EstadoCiclo; id?: number },
    tipo: TipoEntidadOperativa = 'actividad',
  ): void {
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

    if (
      ciclo.estado === EstadoCiclo.PLANIFICADO &&
      (tipo === 'cosecha' || tipo === 'merma')
    ) {
      throw new DomainError(
        CodigoError.CICLO_NO_ACTIVO,
        `No se permite capturar ${tipo}s en un ciclo en estado PLANIFICADO. El ciclo debe estar ACTIVO o SUSPENDIDO (Tabla 2.6)`,
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
    nombreEntidad: TipoEntidadOperativa = 'actividad',
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
