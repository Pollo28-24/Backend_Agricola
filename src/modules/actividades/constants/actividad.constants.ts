/**
 * Constantes institucionales para el módulo de Actividades Agrícolas.
 */
export const ACTIVIDAD_CONSTANTS = {
  /**
   * RN-062: Ventana en horas durante la cual un capturista puede editar o eliminar
   * registros propios de actividades desde su creación (createdAt).
   */
  VENTANA_EDICION_HORAS: 48,

  /**
   * Longitud máxima permitida para la descripción de una actividad.
   */
  MAX_DESCRIPCION_LENGTH: 500,

  /**
   * Horas trabajadas mínimas y máximas por registro.
   */
  HORAS_MINIMAS: 0.01,
  HORAS_MAXIMAS: 9999.99,

  /**
   * Paginación por defecto y máxima (Contrato 3.23).
   */
  PAGINACION_DEFAULT_LIMIT: 20,
  PAGINACION_MAX_LIMIT: 100,
} as const;
