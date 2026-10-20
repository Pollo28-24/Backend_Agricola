export const GASTO_SELECTS = {
  /**
   * Validación mínima de ciclo en creación y edición.
   */
  CICLO_VALIDACION: {
    id: true,
    empresaId: true,
    estado: true,
    fechaInicio: true,
  } as const,

  /**
   * Validación mínima de categoría de gasto.
   * RN-068: Categoría es válida si empresaId = JWT o NULL (sistema) y está activa.
   */
  CATEGORIA_VALIDACION: {
    id: true,
    empresaId: true,
    activo: true,
  } as const,

  /**
   * Validación mínima de proveedor.
   */
  PROVEEDOR_VALIDACION: {
    id: true,
    empresaId: true,
    activo: true,
  } as const,

  /**
   * Validación mínima de actividad.
   */
  ACTIVIDAD_VALIDACION: {
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
  } as const,

  /**
   * Proyección para listados (GET /gastos).
   */
  LISTA_RELACIONES: {
    categoria: {
      select: { id: true, nombre: true },
    },
    proveedor: {
      select: { id: true, nombre: true },
    },
    actividad: {
      select: {
        id: true,
        tipoActividad: { select: { id: true, nombre: true } },
      },
    },
    unidad: {
      select: { id: true, codigo: true, nombre: true },
    },
    creadoPor: {
      select: { id: true, nombre: true, apellido: true },
    },
  } as const,

  /**
   * Proyección para detalle enriquecido (GET /gastos/:id).
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
    categoria: {
      select: { id: true, nombre: true, descripcion: true },
    },
    proveedor: {
      select: { id: true, nombre: true, rfc: true, telefono: true },
    },
    actividad: {
      select: {
        id: true,
        fecha: true,
        tipoActividad: { select: { id: true, nombre: true } },
      },
    },
    unidad: {
      select: { id: true, codigo: true, nombre: true, tipo: true },
    },
    creadoPor: {
      select: { id: true, nombre: true, apellido: true },
    },
  } as const,
};
