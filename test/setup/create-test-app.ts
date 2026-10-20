import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from '../../src/app.module';
import { DomainExceptionFilter } from '../../src/common/filters/domain-exception.filter';
import { SerializacionInterceptor } from '../../src/common/interceptors/serializacion.interceptor';
import { PrismaService } from '../../src/prisma/prisma.service';
import { assertDatabaseRealEsDeTest } from './e2e-env';

export interface TestAppInstance {
  app: INestApplication;
  prisma: PrismaService;
}

export async function createTestApp(): Promise<TestAppInstance> {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleFixture.createNestApplication();

  // 1. Configuración idéntica a main.ts
  app.setGlobalPrefix('api/v1');
  app.useGlobalFilters(new DomainExceptionFilter());
  app.useGlobalInterceptors(new SerializacionInterceptor());
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

  await app.init();

  const prisma = app.get<PrismaService>(PrismaService);

  // 2. Guard estricto de 3 capas sobre la conexión de la app Nest
  await assertDatabaseRealEsDeTest(prisma);

  return { app, prisma };
}
