export enum FormatoExportacion {
  XLSX = 'xlsx',
  PDF = 'pdf',
  CSV = 'csv',
}

export const MIME_TYPES_EXPORTACION: Record<FormatoExportacion, string> = {
  [FormatoExportacion.XLSX]:
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  [FormatoExportacion.PDF]: 'application/pdf',
  [FormatoExportacion.CSV]: 'text/csv; charset=utf-8',
};

export const LIMITE_FILAS_EXPORTACION =
  Number(process.env.EXPORTACION_MAX_FILAS) || 5000;

export const TAMANO_PAGINA_EXPORTACION = 100;
