import { Prisma } from '@prisma/client';

export const CAMPOS_SENSIBLES = new Set([
  'password',
  'contrasena',
  'contrasenahash',
  'passwordhash',
  'tokenhash',
  'token',
  'refreshtoken',
  'secret',
  'jwt',
  'authorization',
  'cookie',
  'set-cookie',
  'apikey',
  'api-key',
  'x-api-key',
  'client-secret',
  'clientsecret',
]);

function sanitizarElementoArray(item: unknown): unknown {
  if (typeof item === 'bigint') {
    return item.toString();
  }
  if (item instanceof Date) {
    return item.toISOString();
  }
  if (Prisma.Decimal.isDecimal(item)) {
    return item.toString();
  }
  if (typeof item === 'object' && item !== null) {
    return sanitizeLog(item);
  }
  return item;
}

/**
 * Sanitiza recursivamente cualquier objeto, registro o diccionario eliminando claves sensibles
 * (contraseñas, tokens, headers de autorización, secretos) para logging y auditoría segura (RN-074).
 * Maneja BigInt, Prisma.Decimal y Date convirtiéndolos a string para evitar errores o descomposición {s,e,d}.
 */
export function sanitizeLog(datos: unknown): Record<string, unknown> | null {
  if (!datos || typeof datos !== 'object') {
    return null;
  }

  if (Array.isArray(datos)) {
    return null;
  }

  const obj = datos as Record<string, unknown>;
  const sanitizado: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    const keyLower = key.toLowerCase();
    if (!CAMPOS_SENSIBLES.has(keyLower)) {
      if (typeof value === 'bigint') {
        sanitizado[key] = value.toString();
      } else if (value instanceof Date) {
        sanitizado[key] = value.toISOString();
      } else if (Prisma.Decimal.isDecimal(value)) {
        sanitizado[key] = value.toString();
      } else if (value !== null && typeof value === 'object') {
        if (Array.isArray(value)) {
          sanitizado[key] = value.map((item: unknown) =>
            sanitizarElementoArray(item),
          );
        } else {
          sanitizado[key] = sanitizeLog(value);
        }
      } else {
        sanitizado[key] = value;
      }
    }
  }

  return sanitizado;
}
