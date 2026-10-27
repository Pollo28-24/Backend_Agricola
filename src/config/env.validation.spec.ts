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
  describe('Validación de entorno para Correo y Recuperación de Contraseña (Hito 11E)', () => {
    const baseProductionEnv = {
      NODE_ENV: 'production',
      DATABASE_URL: 'mysql://root:pass@localhost:3306/db',
      JWT_SECRET: validSecret,
      JWT_REFRESH_SECRET: validSecret,
      MAIL_TRANSPORT: 'brevo',
      BREVO_API_KEY: 'xkeysib-12345678901234567890',
      MAIL_FROM_EMAIL: 'soporte@rentabilidad-agricola.com',
      MAIL_FROM_NAME: 'Soporte Agrícola',
      PASSWORD_RESET_URL: 'https://app.rentabilidad-agricola.com/restablecer',
    };

    it('debe aplicar defaults de development (MAIL_TRANSPORT=log, URLs http)', () => {
      const result = envValidationSchema.validate({
        NODE_ENV: 'development',
        DATABASE_URL: 'mysql://root:pass@localhost:3306/db',
        JWT_SECRET: validSecret,
        JWT_REFRESH_SECRET: validSecret,
      });

      expect(result.error).toBeUndefined();
      const val = result.value as {
        MAIL_TRANSPORT: string;
        PASSWORD_RESET_URL: string;
        PASSWORD_RESET_EXPIRES_MINUTES: number;
        MAIL_FROM_EMAIL: string;
        MAIL_FROM_NAME: string;
      };
      expect(val.MAIL_TRANSPORT).toBe('log');
      expect(val.PASSWORD_RESET_URL).toBe(
        'http://localhost:3000/restablecer-contrasena',
      );
      expect(val.PASSWORD_RESET_EXPIRES_MINUTES).toBe(15);
      expect(val.MAIL_FROM_EMAIL).toBe('no-reply@rentabilidad-agricola.com');
      expect(val.MAIL_FROM_NAME).toBe('Rentabilidad Agrícola');
    });

    it('debe aplicar default MAIL_TRANSPORT=memory cuando NODE_ENV es test', () => {
      const result = envValidationSchema.validate({
        NODE_ENV: 'test',
        DATABASE_URL: 'mysql://root:pass@localhost:3306/db',
        JWT_SECRET: validSecret,
        JWT_REFRESH_SECRET: validSecret,
      });

      expect(result.error).toBeUndefined();
      const val = result.value as { MAIL_TRANSPORT: string };
      expect(val.MAIL_TRANSPORT).toBe('memory');
    });

    it('en production debe rechazar MAIL_TRANSPORT=log o memory', () => {
      const resLog = envValidationSchema.validate({
        ...baseProductionEnv,
        MAIL_TRANSPORT: 'log',
      });
      expect(resLog.error).toBeDefined();
      expect(resLog.error?.message).toContain('MAIL_TRANSPORT');

      const resMem = envValidationSchema.validate({
        ...baseProductionEnv,
        MAIL_TRANSPORT: 'memory',
      });
      expect(resMem.error).toBeDefined();
      expect(resMem.error?.message).toContain('MAIL_TRANSPORT');
    });

    it('en production debe exigir BREVO_API_KEY de al menos 20 caracteres', () => {
      const resSinKey = envValidationSchema.validate({
        ...baseProductionEnv,
        BREVO_API_KEY: undefined,
      });
      expect(resSinKey.error).toBeDefined();
      expect(resSinKey.error?.message).toContain('BREVO_API_KEY');

      const resCorta = envValidationSchema.validate({
        ...baseProductionEnv,
        BREVO_API_KEY: 'demasiado_corta',
      });
      expect(resCorta.error).toBeDefined();
      expect(resCorta.error?.message).toContain('BREVO_API_KEY');
    });

    it('en production debe exigir PASSWORD_RESET_URL con esquema https://', () => {
      const resHttp = envValidationSchema.validate({
        ...baseProductionEnv,
        PASSWORD_RESET_URL:
          'http://inseguro.rentabilidad-agricola.com/restablecer',
      });
      expect(resHttp.error).toBeDefined();
      expect(resHttp.error?.message).toContain('PASSWORD_RESET_URL');
    });

    it('debe rechazar PASSWORD_RESET_EXPIRES_MINUTES fuera del rango 5-60', () => {
      const resBajo = envValidationSchema.validate({
        ...baseProductionEnv,
        PASSWORD_RESET_EXPIRES_MINUTES: 4,
      });
      expect(resBajo.error).toBeDefined();
      expect(resBajo.error?.message).toContain(
        'PASSWORD_RESET_EXPIRES_MINUTES',
      );

      const resAlto = envValidationSchema.validate({
        ...baseProductionEnv,
        PASSWORD_RESET_EXPIRES_MINUTES: 61,
      });
      expect(resAlto.error).toBeDefined();
      expect(resAlto.error?.message).toContain(
        'PASSWORD_RESET_EXPIRES_MINUTES',
      );
    });

    it('en production debe ser válido con todos los parámetros completos y seguros', () => {
      const result = envValidationSchema.validate(baseProductionEnv);
      expect(result.error).toBeUndefined();
    });
  });
});
