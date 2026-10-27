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
  ARGON2_MEMORY_COST: Joi.number().integer().min(19456).default(19456),
  ARGON2_TIME_COST: Joi.number().integer().min(2).default(2),
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
  MIN_APP_VERSION: Joi.string()
    .default('1.0.0')
    .description('Versión mínima admitida de la app cliente móvil (SemVer)'),
  APP_STORE_URL: Joi.string()
    .uri()
    .default(
      'https://play.google.com/store/apps/details?id=com.rentabilidad.agricola',
    )
    .description('URL de descarga o actualización en tienda de aplicaciones'),
  // =====================================================================
  // CORREO ELECTRÓNICO Y RECUPERACIÓN DE CONTRASEÑA (HITO 11E)
  // =====================================================================
  MAIL_TRANSPORT: Joi.string()
    .valid('brevo', 'log', 'memory')
    .when('NODE_ENV', {
      is: 'production',
      then: Joi.string().valid('brevo').invalid('log', 'memory').required(),
      otherwise: Joi.when('NODE_ENV', {
        is: 'test',
        then: Joi.string().default('memory'),
        otherwise: Joi.string().default('log'),
      }),
    })
    .description('Transporte de envío de correos (brevo, log o memory)'),
  BREVO_API_KEY: Joi.string()
    .when('NODE_ENV', {
      is: 'production',
      then: Joi.string().min(20).required(),
      otherwise: Joi.when('MAIL_TRANSPORT', {
        is: 'brevo',
        then: Joi.string().min(20).required(),
        otherwise: Joi.optional().allow('', null),
      }),
    })
    .description(
      'Clave de API de Brevo para envío transaccional (mínimo 20 caracteres)',
    ),
  MAIL_FROM_EMAIL: Joi.string()
    .email()
    .default('no-reply@rentabilidad-agricola.com')
    .when('NODE_ENV', {
      is: 'production',
      then: Joi.required(),
      otherwise: Joi.optional(),
    })
    .description('Dirección remitente para correos transaccionales'),
  MAIL_FROM_NAME: Joi.string()
    .min(2)
    .default('Rentabilidad Agrícola')
    .when('NODE_ENV', {
      is: 'production',
      then: Joi.required(),
      otherwise: Joi.optional(),
    })
    .description(
      'Nombre remitente para correos transaccionales (mínimo 2 caracteres)',
    ),
  PASSWORD_RESET_URL: Joi.string()
    .when('NODE_ENV', {
      is: 'production',
      then: Joi.string()
        .uri({ scheme: ['https'] })
        .required(),
      otherwise: Joi.string()
        .uri({ scheme: ['http', 'https'] })
        .default('http://localhost:3000/restablecer-contrasena'),
    })
    .description('URL base para enlace de restablecimiento de contraseña'),
  PASSWORD_RESET_EXPIRES_MINUTES: Joi.number()
    .integer()
    .min(5)
    .max(60)
    .default(15)
    .description('Tiempo de expiración del token de recuperación en minutos'),
  THROTTLE_RECUPERAR_IP_LIMIT: Joi.number().integer().min(1).default(5),
  THROTTLE_RECUPERAR_CORREO_LIMIT: Joi.number().integer().min(1).default(3),
  THROTTLE_RESTABLECER_IP_LIMIT: Joi.number().integer().min(1).default(5),
  THROTTLE_CAMBIAR_USUARIO_LIMIT: Joi.number().integer().min(1).default(5),
  THROTTLE_PASSWORD_TTL_MS: Joi.number().integer().min(100).default(900000),
});
