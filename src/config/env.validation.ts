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
    .min(64)
    .required()
    .description('Clave secreta para JWT (mínimo 64 caracteres)'),
  JWT_EXPIRES_IN: Joi.string().default('15m'),
  JWT_REFRESH_SECRET: Joi.string()
    .min(64)
    .required()
    .description('Clave secreta para refresh tokens (mínimo 64 caracteres)'),
  JWT_REFRESH_EXPIRES_IN: Joi.string().default('7d'),
  THROTTLE_ENABLED: Joi.boolean()
    .when('NODE_ENV', {
      is: 'production',
      then: Joi.boolean().valid(true).default(true),
      otherwise: Joi.boolean().default(true),
    })
    .description(
      'Habilita rate limiting HTTP (obligatorio true en production)',
    ),
  TRUST_PROXY: Joi.alternatives()
    .try(Joi.boolean(), Joi.number().integer().min(0), Joi.string())
    .default(false)
    .description('Configuración de Express trust proxy (por defecto false)'),
  THROTTLE_DEFAULT_LIMIT: Joi.number().integer().min(1).default(300),
  THROTTLE_DEFAULT_TTL_MS: Joi.number().integer().min(100).default(60000),
  THROTTLE_LOGIN_IP_LIMIT: Joi.number().integer().min(1).default(10),
  THROTTLE_LOGIN_CORREO_LIMIT: Joi.number().integer().min(1).default(5),
  THROTTLE_LOGIN_BLOCK_MS: Joi.number().integer().min(100).default(900000),
  ARGON2_MEMORY_COST: Joi.number().integer().min(4096).default(19456),
  ARGON2_TIME_COST: Joi.number().integer().min(1).default(2),
  ARGON2_PARALLELISM: Joi.number().integer().min(1).default(1),
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
