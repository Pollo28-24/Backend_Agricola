import { Prisma } from '@prisma/client';

/**
 * Proyecciones SQL (selects) estandarizadas de Prisma para el módulo de Actividades.
 * Evita duplicar objetos select en el servicio y optimiza el consumo de memoria del RDBMS.
 */
export const ACTIVIDAD_SELECTS = {
  /**
   * Proyección mínima para validación de ciclo en creación y edición.
   */
  CICLO_VALIDACION: {
    id: true,
    empresaId: true,
    estado: true,
    fechaInicio: true,
  } as const,

  /**
   * Proyección mínima para validación de tipo de actividad.
   */
  TIPO_ACTIVIDAD_VALIDACION: {
    id: true,
    activo: true,
  } as const,

  /**
   * Proyección mínima para validación de usuario responsable.
   */
  RESPONSABLE_VALIDACION: {
    id: true,
    empresaId: true,
    activo: true,
  } as const,

  /**
   * Include enriquecido para endpoint de detalle (GET /actividades/:id).
   */
  DETALLE_RELACIONES: {
    ciclo: {
      select: {
        id: true,
        nombre: true,
        estado: true,
        parcelaId: true,
        parcela: { select: { nombre: true } },
      },
    },
    tipoActividad: {
      select: { id: true, nombre: true },
    },
    responsable: {
      select: { id: true, nombre: true, apellido: true },
    },
    creadoPor: {
      select: { id: true, nombre: true, apellido: true },
    },
  } as const,
};
