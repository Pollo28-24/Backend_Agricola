import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { createTestApp } from '../setup/create-test-app';
import { CodigoError } from '../../src/common/errors/codigos-error.enum';
import { generateTestJwt } from '../setup/test-tokens.util';
import { getOrLoadSeedData, E2eSeedData } from '../setup/e2e-seed';

describe('Control de Versión de Cliente Móvil (Hito 11D - D6 / ADR-015 - Paso 0.2)', () => {
  let app: INestApplication;
  let tokenAdmin: string;
  let seed: E2eSeedData;

  beforeAll(async () => {
    const testApp = await createTestApp();
    app = testApp.app;
    seed = await getOrLoadSeedData(testApp.prisma);
    tokenAdmin = generateTestJwt(
      seed.empresaA.usuarios.admin.id,
      seed.empresaA.id,
      'ADMIN',
    );
  });

  afterAll(async () => {
    await app.close();
  });

  const getHttpServer = () =>
    app.getHttpServer() as Parameters<typeof request>[0];

  interface RutaConfig {
    nombre: string;
    metodo: 'GET' | 'POST';
    url: string;
    body?: Record<string, unknown>;
    auth?: boolean;
    statusEsperadoSinGuardia: number;
    exentaDeGuard?: boolean;
  }

  const rutasEvaluadas: RutaConfig[] = [
    {
      nombre: '1. /api/v1/health',
      metodo: 'GET',
      url: '/api/v1/health',
      statusEsperadoSinGuardia: 200,
    },
    {
      nombre: '2. /api/docs (exenta por diseño Swagger)',
      metodo: 'GET',
      url: '/api/docs/',
      statusEsperadoSinGuardia: 200,
      exentaDeGuard: true,
    },
    {
      nombre: '3. GET /api/v1/adjuntos/descarga?token=',
      metodo: 'GET',
      url: '/api/v1/adjuntos/descarga?token=token_invalido',
      statusEsperadoSinGuardia: 403,
    },
    {
      nombre: '4. POST /api/v1/auth/login',
      metodo: 'POST',
      url: '/api/v1/auth/login',
      body: {
        correo: 'no_existe@agro.com',
        contrasena: 'Password123!',
      },
      statusEsperadoSinGuardia: 401,
    },
    {
      nombre: '5. GET /api/v1/auth/me (autenticada)',
      metodo: 'GET',
      url: '/api/v1/auth/me',
      auth: true,
      statusEsperadoSinGuardia: 200,
    },
  ];

  function ejecutarPeticion(ruta: RutaConfig, versionHeader?: string) {
    const req =
      ruta.metodo === 'POST'
        ? request(getHttpServer()).post(ruta.url).send(ruta.body)
        : request(getHttpServer()).get(ruta.url);

    if (versionHeader !== undefined) {
      req.set('X-App-Version', versionHeader);
    }
    if (ruta.auth) {
      req.set('Authorization', `Bearer ${tokenAdmin}`);
    }
    return req;
  }

  describe('Matriz Exhaustiva: 4 Estados de Cabecera × 5 Endpoints Clave', () => {
    describe('Caso A: Cabecera AUSENTE (NUNCA se rechaza)', () => {
      for (const ruta of rutasEvaluadas) {
        it(`[${ruta.nombre}] cabecera ausente permite la petición sin 426`, async () => {
          const res = await ejecutarPeticion(ruta, undefined);
          expect(res.status).toBe(ruta.statusEsperadoSinGuardia);
          if (res.body && typeof res.body === 'object') {
            const body = res.body as Record<string, unknown>;
            expect(body.code).not.toBe(CodigoError.VERSION_APP_OBSOLETA);
            expect(body.code).not.toBe(CodigoError.VERSION_APP_INVALIDA);
          }
        });
      }
    });

    describe('Caso B: Versión VÁLIDA (>= 1.0.0, ej. 1.2.0)', () => {
      for (const ruta of rutasEvaluadas) {
        it(`[${ruta.nombre}] versión válida 1.2.0 permite la petición`, async () => {
          const res = await ejecutarPeticion(ruta, '1.2.0');
          expect(res.status).toBe(ruta.statusEsperadoSinGuardia);
          if (res.body && typeof res.body === 'object') {
            const body = res.body as Record<string, unknown>;
            expect(body.code).not.toBe(CodigoError.VERSION_APP_OBSOLETA);
            expect(body.code).not.toBe(CodigoError.VERSION_APP_INVALIDA);
          }
        });
      }
    });

    describe('Caso C: Versión OBSOLETA (< 1.0.0, ej. 0.9.0 -> 426 UPGRADE REQUIRED)', () => {
      for (const ruta of rutasEvaluadas) {
        if (ruta.exentaDeGuard) {
          it(`[${ruta.nombre}] ruta exenta no es bloqueada aunque versión sea obsoleta (200)`, async () => {
            const res = await ejecutarPeticion(ruta, '0.9.0');
            expect(res.status).toBe(200);
          });
        } else {
          it(`[${ruta.nombre}] versión obsoleta 0.9.0 es bloqueada con 426`, async () => {
            const res = await ejecutarPeticion(ruta, '0.9.0');
            expect(res.status).toBe(426);
            const body = res.body as Record<string, unknown>;
            expect(body).toEqual({
              statusCode: 426,
              code: CodigoError.VERSION_APP_OBSOLETA,
              message: expect.stringContaining('0.9.0') as unknown,
              details: {
                minVersion: '1.0.0',
                clientVersion: '0.9.0',
                storeUrl: expect.stringMatching(/^https?:\/\//) as unknown,
              },
            });
          });
        }
      }
    });

    describe('Caso D: Versión MALFORMADA (ej. "v1.0.0-invalida" -> 400 BAD REQUEST)', () => {
      for (const ruta of rutasEvaluadas) {
        if (ruta.exentaDeGuard) {
          it(`[${ruta.nombre}] ruta exenta no es bloqueada aunque versión sea malformada (200)`, async () => {
            const res = await ejecutarPeticion(ruta, 'v1.0.0-no-semver');
            expect(res.status).toBe(200);
          });
        } else {
          it(`[${ruta.nombre}] versión malformada es rechazada con 400`, async () => {
            const res = await ejecutarPeticion(ruta, 'v1.0.0-no-semver');
            expect(res.status).toBe(400);
            const body = res.body as Record<string, unknown>;
            expect(body).toEqual({
              statusCode: 400,
              code: CodigoError.VERSION_APP_INVALIDA,
              message: expect.stringContaining('SemVer') as unknown,
              details: {
                clientVersion: 'v1.0.0-no-semver',
              },
            });
          });
        }
      }
    });
  });
});
