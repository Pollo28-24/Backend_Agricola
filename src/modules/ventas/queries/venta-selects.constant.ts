export const VENTA_SELECTS = {
  /**
   * Validación mínima de ciclo de producción.
   */
  CICLO_VALIDACION: {
    id: true,
    empresaId: true,
    estado: true,
    fechaInicio: true,
  } as const,

  /**
   * Validación mínima de cliente.
   */
  CLIENTE_VALIDACION: {
    id: true,
    empresaId: true,
    activo: true,
    nombre: true,
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
   * Validación de cosecha referenciada en renglón.
   */
  COSECHA_VALIDACION: {
    id: true,
    cicloId: true,
    deletedAt: true,
    ciclo: {
      select: {
        empresaId: true,
      },
    },
  } as const,

  /**
   * Proyección para renglones con relaciones necesarias para respuesta y balance.
   */
  DETALLES_RELACIONES: {
    id: true,
    ventaId: true,
    cosechaId: true,
    unidadId: true,
    calidad: true,
    cantidad: true,
    precioUnitario: true,
    unidad: {
      select: {
        id: true,
        nombre: true,
        codigo: true,
        tipo: true,
        factorABase: true,
      },
    },
    cosecha: {
      select: {
        id: true,
        fecha: true,
        calidad: true,
      },
    },
  } as const,

  /**
   * Proyección para listados (GET /ventas).
   */
  LISTA_RELACIONES: {
    cliente: {
      select: { id: true, nombre: true },
    },
    creadoPor: {
      select: { id: true, nombre: true, apellido: true },
    },
    detalles: {
      select: {
        id: true,
        ventaId: true,
        cosechaId: true,
        unidadId: true,
        calidad: true,
        cantidad: true,
        precioUnitario: true,
        unidad: {
          select: { id: true, nombre: true, codigo: true },
        },
      },
    },
  } as const,
};
