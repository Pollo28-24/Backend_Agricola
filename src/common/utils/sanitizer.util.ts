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

/**
 * Sanitiza recursivamente cualquier objeto, registro o diccionario eliminando claves sensibles
 * (contraseñas, tokens, headers de autorización, secretos) para logging y auditoría segura (RN-074).
 * Maneja BigInt convirtiéndolo a string para evitar errores de serialización JSON.
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
      } else if (value !== null && typeof value === 'object' && !(value instanceof Date)) {
        if (Array.isArray(value)) {
          sanitizado[key] = value.map((item) =>
            typeof item === 'object' && item !== null ? sanitizeLog(item) : item,
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
