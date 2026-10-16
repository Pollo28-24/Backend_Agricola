import { EstadoCiclo } from '@prisma/client';

export enum AccionCiclo {
  INICIAR = 'iniciar',
  SUSPENDER = 'suspender',
  REANUDAR = 'reanudar',
  FINALIZAR = 'finalizar',
  CANCELAR = 'cancelar',
  REABRIR = 'reabrir',
}

/**
 * Tabla declarativa de transiciones válidas para el ciclo de producción (Sección 2.6).
 * Patrón Finite State Machine.
 */
export const TRANSICIONES_CICLO: Record<
  EstadoCiclo,
  Partial<Record<AccionCiclo, EstadoCiclo>>
> = {
  [EstadoCiclo.PLANIFICADO]: {
    [AccionCiclo.INICIAR]: EstadoCiclo.ACTIVO,
    [AccionCiclo.CANCELAR]: EstadoCiclo.CANCELADO,
  },
  [EstadoCiclo.ACTIVO]: {
    [AccionCiclo.SUSPENDER]: EstadoCiclo.SUSPENDIDO,
    [AccionCiclo.FINALIZAR]: EstadoCiclo.FINALIZADO,
    [AccionCiclo.CANCELAR]: EstadoCiclo.CANCELADO,
  },
  [EstadoCiclo.SUSPENDIDO]: {
    [AccionCiclo.REANUDAR]: EstadoCiclo.ACTIVO,
    [AccionCiclo.FINALIZAR]: EstadoCiclo.FINALIZADO,
    [AccionCiclo.CANCELAR]: EstadoCiclo.CANCELADO,
  },
  [EstadoCiclo.FINALIZADO]: {
    [AccionCiclo.REABRIR]: EstadoCiclo.ACTIVO,
  },
  [EstadoCiclo.CANCELADO]: {
    [AccionCiclo.REABRIR]: EstadoCiclo.ACTIVO,
  },
};
