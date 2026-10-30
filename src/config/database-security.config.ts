/**
 * Determina si se permite la recuperación de clave pública RSA en MySQL/MariaDB (caching_sha2_password).
 * Solo se permite cuando la variable de entorno DB_ALLOW_PUBLIC_KEY_RETRIEVAL es 'true'
 * y el entorno NO es 'production'. En producción siempre devuelve false.
 */
export function permitirRecuperacionClavePublica(): boolean {
  return (
    process.env.DB_ALLOW_PUBLIC_KEY_RETRIEVAL === 'true' &&
    process.env.NODE_ENV !== 'production'
  );
}
