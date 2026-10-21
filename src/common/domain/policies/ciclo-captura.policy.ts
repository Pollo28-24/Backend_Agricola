import { HttpStatus, Injectable } from '@nestjs/common';
import { EstadoCiclo } from '@prisma/client';
import { DomainError } from '../../errors/domain.error';
import { CodigoError } from '../../errors/codigos-error.enum';

export type TipoEntidadOperativa =
  'actividad' | 'gasto' | 'cosecha' | 'merma' | 'venta' | 'cobro';

/**
 * Política institucional del ciclo de vida del Ciclo de Producción.
 * Reutilizable transversalmente por Actividades, Gastos, Cosechas, Mermas, Ventas y Cobros.
 */
@Injectable()
export class CicloCapturaPolicy {
  /**
   * RN-015 / RN-023 / Tabla 2.6:
   * Verifica si el ciclo admite captura de registros operativos según el tipo de entidad.
   * - Para cobros (Tabla 2.6):
   *   - ACTIVO, SUSPENDIDO y FINALIZADO: permiten registrar y anular.
   *   - PLANIFICADO: rechaza con CICLO_NO_ACTIVO (409).
   *   - CANCELADO: rechaza con CICLO_CERRADO (409).
   * - Para el resto de entidades:
   *   - FINALIZADO y CANCELADO: bloquean cualquier tipo de registro operativo (CICLO_CERRADO, 409).
   *   - PLANIFICADO: admite actividades y gastos preparatorios; rechaza cosechas, mermas y ventas (CICLO_NO_ACTIVO, 409).
   *   - ACTIVO y SUSPENDIDO: admiten actividades, gastos, cosechas, mermas y ventas.
   *
   * @param ciclo Entidad ciclo con su estado actual
   * @param tipo Tipo de entidad operativa a capturar (opcional, default 'actividad' para retrocompatibilidad)
   */
  assertCaptureAllowed(
    ciclo: { estado: EstadoCiclo; id?: number },
    tipo: TipoEntidadOperativa = 'actividad',
  ): void {
    if (tipo === 'cobro') {
      if (ciclo.estado === EstadoCiclo.CANCELADO) {
        throw new DomainError(
          CodigoError.CICLO_CERRADO,
          `No se permite registrar ni anular cobros en un ciclo en estado CANCELADO (Tabla 2.6)`,
          HttpStatus.CONFLICT,
        );
      }
      if (ciclo.estado === EstadoCiclo.PLANIFICADO) {
        throw new DomainError(
          CodigoError.CICLO_NO_ACTIVO,
          `No se permite registrar ni anular cobros en un ciclo en estado PLANIFICADO (Tabla 2.6)`,
          HttpStatus.CONFLICT,
        );
      }
      // FINALIZADO, ACTIVO y SUSPENDIDO son permitidos para cobros
      return;
    }

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
      (tipo === 'cosecha' || tipo === 'merma' || tipo === 'venta')
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
