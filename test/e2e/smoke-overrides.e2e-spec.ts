import { INestApplication } from '@nestjs/common';
import { createTestApp } from '../setup/create-test-app';
import { testRequest } from '../setup/http.util';
import { PrismaService } from '../../src/prisma/prisma.service';
import { getOrLoadSeedData, E2eSeedData } from '../setup/e2e-seed';
import { generateTestJwt } from '../setup/test-tokens.util';

describe('B4: Smoke Tests de Overrides de Dependencias (Hito 11F.1)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let seed: E2eSeedData;
  let tokenAdmin: string;

  beforeAll(async () => {
    const testApp = await createTestApp();
    app = testApp.app;
    prisma = testApp.prisma;
    seed = await getOrLoadSeedData(prisma);

    tokenAdmin = generateTestJwt(
      seed.empresaA.usuarios.admin.id,
      seed.empresaA.id,
      'ADMIN',
    );
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('1. Swagger UI y JSON: GET /api/docs y /api/docs-json responden 200 OK', async () => {
    const resDocs = await testRequest(app).get('/api/docs');
    expect(resDocs.status).toBe(200);

    const resJson = await testRequest(app).get('/api/docs-json');
    expect(resJson.status).toBe(200);
    expect(resJson.body).toHaveProperty('openapi');
  });

  it('2. Login (qs / body-parser): POST /api/v1/auth/login responde 200 con credenciales validas', async () => {
    const res = await testRequest(app).post('/api/v1/auth/login').send({
      correo: seed.empresaA.usuarios.admin.correo,
      contrasena: 'Password123!',
    });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('accessToken');
  });

  it('3. Exportacion (uuid / exceljs / pdfkit): XLSX, CSV y PDF responden 200', async () => {
    const resXlsx = await testRequest(app)
      .get('/api/v1/reportes/exportaciones/rentabilidad?formato=xlsx')
      .set('Authorization', `Bearer ${tokenAdmin}`);
    expect(resXlsx.status).toBe(200);
    expect(resXlsx.headers['content-type']).toContain('spreadsheetml');

    const resCsv = await testRequest(app)
      .get('/api/v1/reportes/exportaciones/rentabilidad?formato=csv')
      .set('Authorization', `Bearer ${tokenAdmin}`);
    expect(resCsv.status).toBe(200);
    expect(resCsv.headers['content-type']).toContain('text/csv');

    const resPdf = await testRequest(app)
      .get('/api/v1/reportes/exportaciones/rentabilidad?formato=pdf')
      .set('Authorization', `Bearer ${tokenAdmin}`);
    expect(resPdf.status).toBe(200);
    expect(resPdf.headers['content-type']).toContain('application/pdf');
  });

  it('4. Adjuntos (multer): subida y descarga firmada responden 201 y 200', async () => {
    const validPdf = Buffer.from(
      '%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF',
    );
    const resSubida = await testRequest(app)
      .post(`/api/v1/gastos/${seed.empresaA.gastoAdmin.id}/adjuntos`)
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .attach('archivo', validPdf, 'factura-smoke.pdf');

    expect(resSubida.status).toBe(201);
    const adjuntoId = (resSubida.body as { id: number }).id;
    expect(adjuntoId).toBeDefined();

    const resEnlace = await testRequest(app)
      .get(`/api/v1/adjuntos/${adjuntoId}/enlace-descarga`)
      .set('Authorization', `Bearer ${tokenAdmin}`);
    expect(resEnlace.status).toBe(200);
    const tokenDescarga = (resEnlace.body as { token: string }).token;

    const resDescarga = await testRequest(app).get(
      `/api/v1/adjuntos/descarga?token=${tokenDescarga}`,
    );
    expect(resDescarga.status).toBe(200);
  });
});
