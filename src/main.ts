import { ValidationPipe, Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { DomainExceptionFilter } from './common/filters/domain-exception.filter';
import { SerializacionInterceptor } from './common/interceptors/serializacion.interceptor';
import { crearDocumentoOpenApi } from './config/openapi.config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Configuración de confianza en proxy reverso (por defecto sin confianza)
  const trustProxy = process.env.TRUST_PROXY;
  const httpAdapter = app.getHttpAdapter().getInstance() as {
    set?: (setting: string, val: unknown) => void;
  };
  if (typeof httpAdapter?.set === 'function') {
    if (trustProxy === 'true' || trustProxy === '1') {
      httpAdapter.set('trust proxy', 1);
    } else if (trustProxy && trustProxy !== 'false' && trustProxy !== '0') {
      httpAdapter.set('trust proxy', trustProxy);
    } else {
      httpAdapter.set('trust proxy', false);
    }
  }

  // Seguridad HTTP
  app.use(helmet());

  // Prefijo global de API versionada (sección 3.23)
  app.setGlobalPrefix('api/v1');

  // Filtros e Interceptores globales
  app.useGlobalFilters(new DomainExceptionFilter());
  app.useGlobalInterceptors(new SerializacionInterceptor());

  // Validación estricta de DTOs
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // Documentación OpenAPI / Swagger
  const document = crearDocumentoOpenApi(app);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
    },
  });

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  const logger = new Logger('Bootstrap');
  logger.log(`Servidor iniciado en http://localhost:${port}/api/v1`);
  logger.log(`Swagger disponible en http://localhost:${port}/api/docs`);
}

void bootstrap();
