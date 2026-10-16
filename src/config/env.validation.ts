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
});
