import { AccionAuditoria } from '@prisma/client';

import {
  sanitizeLog,
  CAMPOS_SENSIBLES,
} from '../../common/utils/sanitizer.util';

export const CAMPOS_EXCLUIDOS_AUDITORIA = CAMPOS_SENSIBLES;

/**
 * Sanitiza un objeto eliminando contraseñas y tokens antes de guardarlo en bitácora (RN-074)
 */
export function sanitizarValoresAuditoria(
  datos: unknown,
): Record<string, unknown> | null {
  return sanitizeLog(datos);
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
