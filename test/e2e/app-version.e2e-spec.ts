import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { createTestApp } from '../setup/create-test-app';
import { CodigoError } from '../../src/common/errors/codigos-error.enum';

describe('Control de Versión de Cliente Móvil (Hito 11D - D6 / ADR-015)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const testApp = await createTestApp();
    app = testApp.app;
  });

  afterAll(async () => {
    await app.close();
  });

  const getHttpServer = () =>
    app.getHttpServer() as Parameters<typeof request>[0];

  it('permite la petición cuando no se envía la cabecera X-App-Version (200 OK)', async () => {
    const res = await request(getHttpServer())
      .get('/api/v1/health')
      .expect(200);

    const body = res.body as Record<string, unknown>;
    expect(body).toHaveProperty('status', 'ok');
  });

  it('permite la petición cuando la cabecera X-App-Version es igual a la versión mínima (1.0.0)', async () => {
    const res = await request(getHttpServer())
      .get('/api/v1/health')
      .set('X-App-Version', '1.0.0')
      .expect(200);

    const body = res.body as Record<string, unknown>;
    expect(body).toHaveProperty('status', 'ok');
  });

  it('permite la petición cuando la cabecera X-App-Version es superior a la mínima (2.1.0)', async () => {
    const res = await request(getHttpServer())
      .get('/api/v1/health')
      .set('X-App-Version', '2.1.0')
      .expect(200);

    const body = res.body as Record<string, unknown>;
    expect(body).toHaveProperty('status', 'ok');
  });

  it('retorna 426 VERSION_APP_OBSOLETA cuando la versión del cliente es inferior a la mínima (0.9.9)', async () => {
    const res = await request(getHttpServer())
      .get('/api/v1/health')
      .set('X-App-Version', '0.9.9')
      .expect(426);

    const body = res.body as Record<string, unknown>;
    expect(body).toEqual({
      statusCode: 426,
      code: CodigoError.VERSION_APP_OBSOLETA,
      message: expect.stringContaining('0.9.9') as unknown,
      details: {
        minVersion: '1.0.0',
        clientVersion: '0.9.9',
        storeUrl: expect.stringMatching(/^https?:\/\//) as unknown,
      },
    });
  });

  it('retorna 400 VERSION_APP_INVALIDA cuando el formato no es SemVer válido', async () => {
    const res = await request(getHttpServer())
      .get('/api/v1/health')
      .set('X-App-Version', 'v1.0.0')
      .expect(400);

    const body = res.body as Record<string, unknown>;
    expect(body).toEqual({
      statusCode: 400,
      code: CodigoError.VERSION_APP_INVALIDA,
      message: expect.stringContaining('SemVer') as unknown,
      details: {
        clientVersion: 'v1.0.0',
      },
    });
  });
});
