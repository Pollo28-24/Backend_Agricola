export const MERMA_SELECTS = {
  /**
   * Validación mínima de ciclo.
   */
  CICLO_VALIDACION: {
    id: true,
    empresaId: true,
    estado: true,
    fechaInicio: true,
  } as const,

  /**
   * Validación mínima de motivo de merma.
   */
  MOTIVO_VALIDACION: {
    id: true,
    nombre: true,
    activo: true,
  } as const,

  /**
   * Validación mínima de cosecha de origen.
   */
  COSECHA_VALIDACION: {
    id: true,
    cicloId: true,
  } as const,

  /**
   * Validación mínima de unidad de medida.
   */
  UNIDAD_VALIDACION: {
    id: true,
    codigo: true,
    nombre: true,
    tipo: true,
    factorABase: true,
  } as const,

  /**
   * Proyección para listados (GET /mermas).
   */
  LISTA_RELACIONES: {
    motivo: {
      select: { id: true, nombre: true },
    },
    cosecha: {
      select: { id: true, fecha: true },
    },
    unidad: {
      select: { id: true, codigo: true, nombre: true, tipo: true },
    },
    creadoPor: {
      select: { id: true, nombre: true, apellido: true },
    },
  } as const,

  /**
   * Proyección para detalle enriquecido (GET /mermas/:id).
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
    motivo: {
      select: { id: true, nombre: true, descripcion: true },
    },
    cosecha: {
      select: { id: true, fecha: true, cantidad: true, calidad: true },
    },
    unidad: {
      select: {
        id: true,
        codigo: true,
        nombre: true,
        tipo: true,
        factorABase: true,
      },
    },
    creadoPor: {
      select: { id: true, nombre: true, apellido: true },
    },
  } as const,
};
