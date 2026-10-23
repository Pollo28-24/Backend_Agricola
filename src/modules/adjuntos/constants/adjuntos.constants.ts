export enum EntidadAdjunto {
  GASTO = 'gasto',
  ACTIVIDAD = 'actividad',
  VENTA = 'venta',
  COBRO = 'cobro',
}

export const ENTIDADES_ADJUNTOS_PERMITIDAS = Object.values(
  EntidadAdjunto,
) as string[];

export const LIMITE_MAXIMO_ADJUNTOS_POR_ENTIDAD = 10;
export const TAMANO_MAXIMO_ARCHIVO_BYTES = 10 * 1024 * 1024; // 10 MB

export const CLAVE_ALMACENAMIENTO_REGEX =
  /^\d+\/[0-9a-f-]{36}\.(jpg|png|webp|pdf)$/;

export const MAPA_ENTIDAD_PERMISO_CREAR: Record<EntidadAdjunto, string> = {
  [EntidadAdjunto.GASTO]: 'gasto:crear',
  [EntidadAdjunto.ACTIVIDAD]: 'actividad:crear',
  [EntidadAdjunto.VENTA]: 'venta:crear',
  [EntidadAdjunto.COBRO]: 'cobro:crear',
};
