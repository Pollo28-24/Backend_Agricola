import * as path from 'path';

export interface TipoDetectado {
  mime: string;
  ext: 'jpg' | 'png' | 'webp' | 'pdf';
}

/**
 * Detecta el tipo MIME real y la extensión a partir de las firmas binarias
 * (magic bytes) en la cabecera del archivo.
 */
export function detectarTipoPorFirma(
  buffer: Buffer | null | undefined,
): TipoDetectado | null {
  if (!buffer || buffer.length < 4) {
    return null;
  }

  // 1. JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { mime: 'image/jpeg', ext: 'jpg' };
  }

  // 2. PNG: 89 50 4E 47 0D 0A 1A 0A (8 bytes)
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return { mime: 'image/png', ext: 'png' };
  }

  // 3. WEBP: "RIFF" en byte 0 y "WEBP" en byte 8 (mínimo 12 bytes)
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return { mime: 'image/webp', ext: 'webp' };
  }

  // 4. PDF: "%PDF-" en byte 0 (mínimo 5 bytes)
  if (
    buffer.length >= 5 &&
    buffer.subarray(0, 5).toString('ascii') === '%PDF-'
  ) {
    return { mime: 'application/pdf', ext: 'pdf' };
  }

  return null;
}

/**
 * Sanea el nombre original del archivo para evitar vulnerabilidades de path traversal
 * o inyección de caracteres de control.
 */
export function sanearNombreArchivo(
  nombreOriginal: string | null | undefined,
): string {
  if (!nombreOriginal || typeof nombreOriginal !== 'string') {
    return 'archivo';
  }

  // 1. Extraer solo el basename (elimina ../, rutas absolutas o relativas de Windows y Unix)
  let base = path.basename(nombreOriginal.replace(/\\/g, '/'));

  // 2. Eliminar caracteres nulos y de control (\x00-\x1F, \x7F)
  // eslint-disable-next-line no-control-regex
  base = base.replace(/[\x00-\x1F\x7F]/g, '');

  // 3. Limpiar espacios iniciales y finales
  base = base.trim();

  // 4. Si queda vacío tras sanitización, asignar un valor por defecto
  if (!base) {
    base = 'archivo';
  }

  // 5. Truncar a un máximo de 255 caracteres preservando la extensión si existe
  if (base.length > 255) {
    const ext = path.extname(base);
    const nombreSinExt = base.substring(0, base.length - ext.length);
    base = nombreSinExt.substring(0, 255 - ext.length) + ext;
  }

  return base;
}
