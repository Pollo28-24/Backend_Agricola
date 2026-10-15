import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { DomainExceptionFilter } from './common/filters/domain-exception.filter';
import { SerializacionInterceptor } from './common/interceptors/serializacion.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

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
  const config = new DocumentBuilder()
    .setTitle('Plataforma de Rentabilidad Agrícola - API')
    .setDescription(
      'API REST modular para gestión y análisis de rentabilidad agrícola, costos, cosechas y ventas',
    )
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'Authorization',
        description: 'Ingrese el Access Token JWT',
        in: 'header',
      },
      'JWT-auth',
    )
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
    },
  });

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  console.log(`Servidor iniciado en http://localhost:${port}/api/v1`);
  console.log(`Swagger disponible en http://localhost:${port}/api/docs`);
}

bootstrap();
