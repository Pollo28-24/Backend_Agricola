export const COSECHA_SELECTS = {
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
   * Proyección para listados (GET /cosechas).
   */
  LISTA_RELACIONES: {
    unidad: {
      select: { id: true, codigo: true, nombre: true, tipo: true },
    },
    creadoPor: {
      select: { id: true, nombre: true, apellido: true },
    },
  } as const,

  /**
   * Proyección para detalle enriquecido (GET /cosechas/:id).
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
