import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test', 'provision')
    .default('development'),
  PORT: Joi.number().port().default(3000),
  DATABASE_URL: Joi.string()
    .required()
    .description('URL de conexión MySQL/MariaDB'),
  JWT_SECRET: Joi.string()
    .min(16)
    .required()
    .description('Clave secreta para JWT'),
  JWT_EXPIRES_IN: Joi.string().default('15m'),
  JWT_REFRESH_SECRET: Joi.string()
    .min(16)
    .required()
    .description('Clave secreta para refresh tokens'),
  JWT_REFRESH_EXPIRES_IN: Joi.string().default('7d'),
  STORAGE_LOCAL_PATH: Joi.string()
    .default('./storage_uploads')
    .description(
      'Directorio base para almacenamiento local de archivos adjuntos',
    ),
  STORAGE_SIGNED_URL_SECRET: Joi.string()
    .min(32)
    .default('storage_signed_url_default_secret_minimum_32_characters_long')
    .description('Secreto HMAC para tokens de descarga firmada'),
  STORAGE_SIGNED_URL_TTL_SECONDS: Joi.number()
    .integer()
    .min(1)
    .default(300)
    .description('Tiempo de vida en segundos para enlace de descarga firmada'),
});
