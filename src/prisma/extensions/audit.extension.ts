import { AccionAuditoria } from '@prisma/client';

export const CAMPOS_EXCLUIDOS_AUDITORIA = new Set([
  'contrasenaHash',
  'tokenHash',
  'token',
  'refreshToken',
  'secret',
  'jwt',
]);

/**
 * Sanitiza un objeto eliminando contraseñas y tokens antes de guardarlo en bitácora (RN-074)
 */
export function sanitizarValoresAuditoria(
  datos: unknown,
): Record<string, unknown> | null {
  if (!datos || typeof datos !== 'object') {
    return null;
  }

  const obj = datos as Record<string, unknown>;
  const sanitizado: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    if (!CAMPOS_EXCLUIDOS_AUDITORIA.has(key)) {
      if (typeof value === 'bigint') {
        sanitizado[key] = value.toString();
      } else {
        sanitizado[key] = value;
      }
    }
  }

  return sanitizado;
}

export interface RegistroAuditoriaParams {
  empresaId: number;
  usuarioId?: number | null;
  entidad: string;
  entidadId: number;
  accion: AccionAuditoria;
  valoresAnteriores?: unknown;
  valoresNuevos?: unknown;
  direccionIp?: string | null;
}
