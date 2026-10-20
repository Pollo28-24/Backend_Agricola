import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import type { App } from 'supertest/types';

/**
 * Helper tipado para invocar Supertest evitando avisos de @typescript-eslint/no-unsafe-argument
 * sobre app.getHttpServer() en las suites de prueba E2E.
 */
export function testRequest(
  app: INestApplication,
): request.SuperTest<request.Test> {
  const server = app.getHttpServer() as App;
  return request(server);
}
