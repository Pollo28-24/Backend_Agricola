import { Prisma } from '@prisma/client';

export const COBRO_SELECTS = {
  LISTADO: {
    id: true,
    ventaId: true,
    registradoPorId: true,
    fecha: true,
    monto: true,
    metodo: true,
    referencia: true,
    createdAt: true,
    deletedAt: true,
    registradoPor: {
      select: {
        id: true,
        nombre: true,
      },
    },
  } satisfies Prisma.CobroVentaSelect,

  DETALLE: {
    id: true,
    ventaId: true,
    registradoPorId: true,
    fecha: true,
    monto: true,
    metodo: true,
    referencia: true,
    createdAt: true,
    deletedAt: true,
    registradoPor: {
      select: {
        id: true,
        nombre: true,
      },
    },
    venta: {
      select: {
        id: true,
        total: true,
        estado: true,
        fechaLimitePago: true,
      },
    },
  } satisfies Prisma.CobroVentaSelect,
} as const;
