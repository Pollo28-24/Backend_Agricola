import { envValidationSchema } from './env.validation';

describe('envValidationSchema (Bloques 2 y 3)', () => {
  const validSecret =
    'A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8S9t0U1v2W3x4Y5z6A7b8C9d0E1f2';

  it('debe fallar si JWT_SECRET tiene menos de 64 caracteres', () => {
    const result = envValidationSchema.validate({
      NODE_ENV: 'development',
      DATABASE_URL: 'mysql://root:pass@localhost:3306/db',
      JWT_SECRET: 'secreto_corto_menos_de_64_chars',
      JWT_REFRESH_SECRET: validSecret,
    });

    expect(result.error).toBeDefined();
    expect(result.error?.message).toContain('JWT_SECRET');
  });

  it('debe fallar si JWT_REFRESH_SECRET tiene menos de 64 caracteres', () => {
    const result = envValidationSchema.validate({
      NODE_ENV: 'test',
      DATABASE_URL: 'mysql://root:pass@localhost:3306/db',
      JWT_SECRET: validSecret,
      JWT_REFRESH_SECRET: 'refresh_corto_menos_de_64_chars',
    });

    expect(result.error).toBeDefined();
    expect(result.error?.message).toContain('JWT_REFRESH_SECRET');
  });

  it('debe aceptar secretos de 64 caracteres o más y aplicar defaults de THROTTLE_ENABLED y TRUST_PROXY', () => {
    const result = envValidationSchema.validate({
      NODE_ENV: 'development',
      DATABASE_URL: 'mysql://root:pass@localhost:3306/db',
      JWT_SECRET: validSecret,
      JWT_REFRESH_SECRET: validSecret,
    });

    expect(result.error).toBeUndefined();
    const val = result.value as {
      THROTTLE_ENABLED: boolean;
      TRUST_PROXY: boolean;
    };
    expect(val.THROTTLE_ENABLED).toBe(true);
    expect(val.TRUST_PROXY).toBe(false);
  });

  it('debe rechazar THROTTLE_ENABLED=false cuando NODE_ENV es production', () => {
    const result = envValidationSchema.validate({
      NODE_ENV: 'production',
      DATABASE_URL: 'mysql://root:pass@localhost:3306/db',
      JWT_SECRET: validSecret,
      JWT_REFRESH_SECRET: validSecret,
      THROTTLE_ENABLED: false,
    });

    expect(result.error).toBeDefined();
    expect(result.error?.message).toContain('THROTTLE_ENABLED');
  });

  describe('Parámetros de costo Argon2id (Hito 11A / 11D - Paso 0.7)', () => {
    it('debe rechazar ARGON2_MEMORY_COST inferior a 19456 bytes', () => {
      const result = envValidationSchema.validate({
        NODE_ENV: 'production',
        DATABASE_URL: 'mysql://root:pass@localhost:3306/db',
        JWT_SECRET: validSecret,
        JWT_REFRESH_SECRET: validSecret,
        ARGON2_MEMORY_COST: 10000,
      });

      expect(result.error).toBeDefined();
      expect(result.error?.message).toContain('ARGON2_MEMORY_COST');
    });

    it('debe rechazar ARGON2_TIME_COST inferior a 2 iteraciones', () => {
      const result = envValidationSchema.validate({
        NODE_ENV: 'production',
        DATABASE_URL: 'mysql://root:pass@localhost:3306/db',
        JWT_SECRET: validSecret,
        JWT_REFRESH_SECRET: validSecret,
        ARGON2_TIME_COST: 1,
      });

      expect(result.error).toBeDefined();
      expect(result.error?.message).toContain('ARGON2_TIME_COST');
    });

    it('debe rechazar ARGON2_PARALLELISM inferior a 1 hilo', () => {
      const result = envValidationSchema.validate({
        NODE_ENV: 'production',
        DATABASE_URL: 'mysql://root:pass@localhost:3306/db',
        JWT_SECRET: validSecret,
        JWT_REFRESH_SECRET: validSecret,
        ARGON2_PARALLELISM: 0,
      });

      expect(result.error).toBeDefined();
      expect(result.error?.message).toContain('ARGON2_PARALLELISM');
    });

    it('debe aplicar los valores por defecto OWASP mínimos cuando no se proveen (m=19456, t=2, p=1)', () => {
      const result = envValidationSchema.validate({
        NODE_ENV: 'development',
        DATABASE_URL: 'mysql://root:pass@localhost:3306/db',
        JWT_SECRET: validSecret,
        JWT_REFRESH_SECRET: validSecret,
      });

      expect(result.error).toBeUndefined();
      const val = result.value as {
        ARGON2_MEMORY_COST: number;
        ARGON2_TIME_COST: number;
        ARGON2_PARALLELISM: number;
      };
      expect(val.ARGON2_MEMORY_COST).toBe(19456);
      expect(val.ARGON2_TIME_COST).toBe(2);
      expect(val.ARGON2_PARALLELISM).toBe(1);
    });
  });
});
