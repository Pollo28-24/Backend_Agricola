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
      STORAGE_SIGNED_URL_SECRET:
        'prod_storage_signed_url_secret_minimum_32_chars',
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

    it('B4: debe fallar si NODE_ENV está ausente (fail-closed, sin default)', () => {
      const envSinNodeEnv = { ...baseProductionEnv };
      delete (envSinNodeEnv as Record<string, unknown>).NODE_ENV;

      const result = envValidationSchema.validate(envSinNodeEnv);
      expect(result.error).toBeDefined();
      expect(result.error?.message).toContain('"NODE_ENV" is required');
    });

    it('B7: debe rechazar PASSWORD_RESET_URL con fragmento # o query ?', () => {
      const resFragmento = envValidationSchema.validate({
        ...baseProductionEnv,
        PASSWORD_RESET_URL: 'https://app.com/restablecer#token=123',
      });
      expect(resFragmento.error).toBeDefined();
      expect(resFragmento.error?.message).toContain('PASSWORD_RESET_URL');

      const resQuery = envValidationSchema.validate({
        ...baseProductionEnv,
        PASSWORD_RESET_URL: 'https://app.com/restablecer?token=123',
      });
      expect(resQuery.error).toBeDefined();
      expect(resQuery.error?.message).toContain('PASSWORD_RESET_URL');
    });

    describe('DB_ALLOW_PUBLIC_KEY_RETRIEVAL', () => {
      it('en production debe fallar si DB_ALLOW_PUBLIC_KEY_RETRIEVAL es true', () => {
        const res = envValidationSchema.validate({
          ...baseProductionEnv,
          DB_ALLOW_PUBLIC_KEY_RETRIEVAL: true,
        });
        expect(res.error).toBeDefined();
        expect(res.error?.message).toContain('DB_ALLOW_PUBLIC_KEY_RETRIEVAL');
      });

      it('en development debe admitir DB_ALLOW_PUBLIC_KEY_RETRIEVAL en true', () => {
        const res = envValidationSchema.validate({
          ...baseProductionEnv,
          NODE_ENV: 'development',
          MAIL_TRANSPORT: 'log',
          DB_ALLOW_PUBLIC_KEY_RETRIEVAL: true,
        });
        expect(res.error).toBeUndefined();
        const val = res.value as { DB_ALLOW_PUBLIC_KEY_RETRIEVAL: boolean };
        expect(val.DB_ALLOW_PUBLIC_KEY_RETRIEVAL).toBe(true);
      });

      it('si esta ausente debe asignar false por defecto en cualquier entorno', () => {
        const resDev = envValidationSchema.validate({
          ...baseProductionEnv,
          NODE_ENV: 'development',
          MAIL_TRANSPORT: 'log',
        });
        expect(resDev.error).toBeUndefined();
        const valDev = resDev.value as {
          DB_ALLOW_PUBLIC_KEY_RETRIEVAL: boolean;
        };
        expect(valDev.DB_ALLOW_PUBLIC_KEY_RETRIEVAL).toBe(false);

        const resProd = envValidationSchema.validate(baseProductionEnv);
        expect(resProd.error).toBeUndefined();
        const valProd = resProd.value as {
          DB_ALLOW_PUBLIC_KEY_RETRIEVAL: boolean;
        };
        expect(valProd.DB_ALLOW_PUBLIC_KEY_RETRIEVAL).toBe(false);
      });
    });

    describe('STORAGE_SIGNED_URL_SECRET (C10)', () => {
      it('en production debe fallar si falta STORAGE_SIGNED_URL_SECRET (sin default)', () => {
        const envSinSecret = { ...baseProductionEnv };
        delete (envSinSecret as Record<string, unknown>)
          .STORAGE_SIGNED_URL_SECRET;

        const res = envValidationSchema.validate(envSinSecret);
        expect(res.error).toBeDefined();
        expect(res.error?.message).toContain('STORAGE_SIGNED_URL_SECRET');
      });

      it('en development y test debe conservar el default si no se provee STORAGE_SIGNED_URL_SECRET', () => {
        const resDev = envValidationSchema.validate({
          NODE_ENV: 'development',
          DATABASE_URL: 'mysql://root:pass@localhost:3306/db',
          JWT_SECRET: validSecret,
          JWT_REFRESH_SECRET: validSecret,
        });
        expect(resDev.error).toBeUndefined();
        expect(
          (resDev.value as { STORAGE_SIGNED_URL_SECRET: string })
            .STORAGE_SIGNED_URL_SECRET,
        ).toBe('storage_signed_url_default_secret_minimum_32_characters_long');

        const resTest = envValidationSchema.validate({
          NODE_ENV: 'test',
          DATABASE_URL: 'mysql://root:pass@localhost:3306/db',
          JWT_SECRET: validSecret,
          JWT_REFRESH_SECRET: validSecret,
        });
        expect(resTest.error).toBeUndefined();
        expect(
          (resTest.value as { STORAGE_SIGNED_URL_SECRET: string })
            .STORAGE_SIGNED_URL_SECRET,
        ).toBe('storage_signed_url_default_secret_minimum_32_characters_long');
      });
    });

    describe('STORAGE_DRIVER y variables Cloudflare R2 (DT-07)', () => {
      it('debe ser válido con STORAGE_DRIVER=local (o por defecto) sin variables R2', () => {
        const resDefault = envValidationSchema.validate({
          NODE_ENV: 'development',
          DATABASE_URL: 'mysql://root:pass@localhost:3306/db',
          JWT_SECRET: validSecret,
          JWT_REFRESH_SECRET: validSecret,
        });
        expect(resDefault.error).toBeUndefined();
        expect(
          (resDefault.value as { STORAGE_DRIVER: string }).STORAGE_DRIVER,
        ).toBe('local');

        const resLocal = envValidationSchema.validate({
          NODE_ENV: 'development',
          DATABASE_URL: 'mysql://root:pass@localhost:3306/db',
          JWT_SECRET: validSecret,
          JWT_REFRESH_SECRET: validSecret,
          STORAGE_DRIVER: 'local',
        });
        expect(resLocal.error).toBeUndefined();
        expect(
          (resLocal.value as { STORAGE_DRIVER: string }).STORAGE_DRIVER,
        ).toBe('local');
      });

      it('debe fallar cuando STORAGE_DRIVER=r2 y faltan las variables obligatorias de R2', () => {
        const baseR2 = {
          NODE_ENV: 'development',
          DATABASE_URL: 'mysql://root:pass@localhost:3306/db',
          JWT_SECRET: validSecret,
          JWT_REFRESH_SECRET: validSecret,
          STORAGE_DRIVER: 'r2',
          R2_BUCKET_NAME: 'mi-bucket-test',
          R2_ENDPOINT: 'https://account.r2.cloudflarestorage.com',
          R2_ACCESS_KEY_ID: 'fake_access_key_id',
          R2_SECRET_ACCESS_KEY: 'fake_secret_access_key',
        };

        for (const campo of [
          'R2_BUCKET_NAME',
          'R2_ENDPOINT',
          'R2_ACCESS_KEY_ID',
          'R2_SECRET_ACCESS_KEY',
        ]) {
          const copia = { ...baseR2 } as Record<string, unknown>;
          delete copia[campo];
          const res = envValidationSchema.validate(copia);
          expect(res.error).toBeDefined();
          expect(res.error?.message).toContain(campo);
        }
      });

      it('debe ser válido cuando STORAGE_DRIVER=r2 y se proveen todas las variables obligatorias (con y sin R2_ACCOUNT_ID)', () => {
        const resSinAccount = envValidationSchema.validate({
          NODE_ENV: 'development',
          DATABASE_URL: 'mysql://root:pass@localhost:3306/db',
          JWT_SECRET: validSecret,
          JWT_REFRESH_SECRET: validSecret,
          STORAGE_DRIVER: 'r2',
          R2_BUCKET_NAME: 'mi-bucket-test',
          R2_ENDPOINT: 'https://account.r2.cloudflarestorage.com',
          R2_ACCESS_KEY_ID: 'fake_access_key_id',
          R2_SECRET_ACCESS_KEY: 'fake_secret_access_key',
        });
        expect(resSinAccount.error).toBeUndefined();

        const resConAccount = envValidationSchema.validate({
          NODE_ENV: 'development',
          DATABASE_URL: 'mysql://root:pass@localhost:3306/db',
          JWT_SECRET: validSecret,
          JWT_REFRESH_SECRET: validSecret,
          STORAGE_DRIVER: 'r2',
          R2_ACCOUNT_ID: 'fake_account_id',
          R2_BUCKET_NAME: 'mi-bucket-test',
          R2_ENDPOINT: 'https://account.r2.cloudflarestorage.com',
          R2_ACCESS_KEY_ID: 'fake_access_key_id',
          R2_SECRET_ACCESS_KEY: 'fake_secret_access_key',
        });
        expect(resConAccount.error).toBeUndefined();
      });
    });
  });
});
