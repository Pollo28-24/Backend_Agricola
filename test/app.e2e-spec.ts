import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { createTestApp } from './setup/create-test-app';

describe('HealthController (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const testApp = await createTestApp();
    app = testApp.app;
  });

  afterAll(async () => {
    await app.close();
  });

  it('/api/v1/health (GET) debe responder 200 OK', () => {
    return request(app.getHttpServer()).get('/api/v1/health').expect(200);
  });
});
