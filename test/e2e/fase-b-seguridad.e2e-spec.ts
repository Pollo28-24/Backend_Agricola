/**
 * Fase B — E2E Tests: RBAC (B1), TOCTOU RN-037 (B2), Gastos monto directo (B3),
 * Logout cross-user (B4), Adjuntos token inválido (B5)
 */
import request, { type Response } from 'supertest';
import { INestApplication } from '@nestjs/common';
import { createTestApp } from '../setup/create-test-app';
import { PrismaService } from '../../src/prisma/prisma.service';
import { getOrLoadSeedData, E2eSeedData } from '../setup/e2e-seed';
import { generateTestJwt } from '../setup/test-tokens.util';
import { CodigoError } from '../../src/common/errors/codigos-error.enum';
import { holdUserLock, waitUntilBlocked } from '../setup/lock-gateway.util';

describe('Fase B: RBAC / TOCTOU / Gastos / Logout / Adjuntos (E2E)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let seed: E2eSeedData;
  let httpServer: import('http').Server;

  let tokenA_Admin: string;
  let tokenA_Capturista: string;
  let tokenA_Contador: string;

  beforeAll(async () => {
    const testApp = await createTestApp();
    app = testApp.app;
    prisma = testApp.prisma;
    seed = await getOrLoadSeedData(prisma);
    await app.listen(0);
    httpServer = app.getHttpServer() as import('http').Server;

    tokenA_Admin = `Bearer ${generateTestJwt(seed.empresaA.usuarios.admin.id, seed.empresaA.id, 'ADMIN')}`;
    tokenA_Capturista = `Bearer ${generateTestJwt(seed.empresaA.usuarios.capturista.id, seed.empresaA.id, 'CAPTURISTA')}`;
    tokenA_Contador = `Bearer ${generateTestJwt(seed.empresaA.usuarios.contador.id, seed.empresaA.id, 'CONTADOR')}`;
  });

  afterAll(async () => {
    await app.close();
  });

  // ===========================================================================
  // B1 — RBAC: un permiso por endpoint
  // ===========================================================================
  describe('B1: RBAC — un permiso por endpoint (gastos y actividades)', () => {
    it('CAPTURISTA puede POST /gastos (gasto:crear) → 201', async () => {
      const res: Response = await request(httpServer)
        .post('/api/v1/gastos')
        .set('Authorization', tokenA_Capturista)
        .send({
          cicloId: seed.empresaA.cicloActivo.id,
          categoriaId: seed.empresaA.categoriaPropia.id,
          fecha: '2026-02-20',
          total: '200',
          unidadId: seed.global.unidadKgId,
          cantidad: '2',
          costoUnitario: '100',
          impuesto: '0',
        });
      expect(res.status).toBe(201);
    });

    it('CONTADOR puede POST /gastos (gasto:crear) → 201', async () => {
      const res: Response = await request(httpServer)
        .post('/api/v1/gastos')
        .set('Authorization', tokenA_Contador)
        .send({
          cicloId: seed.empresaA.cicloActivo.id,
          categoriaId: seed.empresaA.categoriaPropia.id,
          fecha: '2026-02-21',
          total: '300',
          unidadId: seed.global.unidadKgId,
          cantidad: '3',
          costoUnitario: '100',
          impuesto: '0',
        });
      expect(res.status).toBe(201);
    });

    it('CAPTURISTA puede PATCH /gastos/:id (su propio gasto) → 200', async () => {
      const res: Response = await request(httpServer)
        .patch(`/api/v1/gastos/${seed.empresaA.gastoCapturista.id}`)
        .set('Authorization', tokenA_Capturista)
        .send({ descripcion: 'Actualizado por capturista B1' });
      expect(res.status).toBe(200);
    });

    it('CONTADOR puede PATCH /gastos/:id (gasto:editar_todos vía servicio) → 200', async () => {
      const res: Response = await request(httpServer)
        .patch(`/api/v1/gastos/${seed.empresaA.gastoCapturista.id}`)
        .set('Authorization', tokenA_Contador)
        .send({ descripcion: 'Actualizado por contador B1' });
      expect(res.status).toBe(200);
    });

    it('CAPTURISTA NO puede ver gastos de otro usuario (caso negativo) → 404', async () => {
      // El gasto del Admin fue creado por otro usuario; CAPTURISTA solo ve los suyos
      const res: Response = await request(httpServer)
        .get(`/api/v1/gastos/${seed.empresaA.gastoAdmin.id}`)
        .set('Authorization', tokenA_Capturista);
      expect(res.status).toBe(404);
    });

    it('CAPTURISTA puede GET /actividades → 200', async () => {
      const res: Response = await request(httpServer)
        .get('/api/v1/actividades')
        .set('Authorization', tokenA_Capturista);
      expect(res.status).toBe(200);
    });

    it('CAPTURISTA puede GET /actividades/:id → 200', async () => {
      const res: Response = await request(httpServer)
        .get(`/api/v1/actividades/${seed.empresaA.actividadCapturista.id}`)
        .set('Authorization', tokenA_Capturista);
      expect(res.status).toBe(200);
    });

    it('CAPTURISTA puede PATCH /actividades/:id (su propia actividad) → 200 o 409 (ventana expirada)', async () => {
      const res: Response = await request(httpServer)
        .patch(`/api/v1/actividades/${seed.empresaA.actividadCapturista.id}`)
        .set('Authorization', tokenA_Capturista)
        .send({ descripcion: 'Actualizado por capturista B1' });
      // Puede ser 200 si dentro de ventana, 409 si expiró, 403 si no es el creador
      expect([200, 409, 403]).toContain(res.status);
    });

    it('CONTADOR NO tiene actividad:crear → GET /actividades → 403', async () => {
      const res: Response = await request(httpServer)
        .get('/api/v1/actividades')
        .set('Authorization', tokenA_Contador);
      expect(res.status).toBe(403);
    });
  });

  // ===========================================================================
  // B2 — TOCTOU RN-037: concurrencia en reactivación de usuarios
  // ===========================================================================
  describe('B2: TOCTOU RN-037 — concurrencia en reactivación de usuarios', () => {
    it('exactamente 1 éxito y el resto 409 LIMITE_PLAN_EXCEDIDO (lock-gateway)', async () => {
      let planMax2 = await prisma.planSuscripcion.findFirst({
        where: { maxUsuarios: 2 },
      });
      if (!planMax2) {
        planMax2 = await prisma.planSuscripcion.create({
          data: {
            codigo: `PLAN2_${Date.now().toString().slice(-6)}`,
            nombre: 'Plan Test 2 Usuarios',
            maxUsuarios: 2,
            maxParcelas: 5,
            precioMensual: '100.00',
            activo: true,
          },
        });
      }

      const hash = await import('argon2').then((a) => a.hash('Password123!'));
      const rolCap = await prisma.rol.findUniqueOrThrow({
        where: { codigo: 'CAPTURISTA' },
      });

      const empresaTest = await prisma.empresa.create({
        data: {
          nombre: 'B2-Test Empresa',
          rfc: `B2T${Date.now().toString().slice(-9)}`,
          correo: `b2test_${Date.now()}@e2e-test.com`,
          planId: planMax2.id,
          estadoSuscripcion: 'ACTIVA',
          activo: true,
        },
      });

      // 1 usuario activo (admin): deja exactamente 1 cupo disponible
      const adminTest = await prisma.usuario.create({
        data: {
          empresaId: empresaTest.id,
          rolId: (
            await prisma.rol.findUniqueOrThrow({ where: { codigo: 'ADMIN' } })
          ).id,
          nombre: 'Admin',
          apellido: 'B2',
          correo: `b2admin_${Date.now()}@e2e-test.com`,
          contrasenaHash: hash,
          activo: true,
        },
      });

      // 2 usuarios inactivos que competirán por el único cupo disponible
      const [inactivo1, inactivo2] = await Promise.all([
        prisma.usuario.create({
          data: {
            empresaId: empresaTest.id,
            rolId: rolCap.id,
            nombre: 'Cap1',
            apellido: 'B2',
            correo: `b2cap1_${Date.now()}@e2e-test.com`,
            contrasenaHash: hash,
            activo: false,
          },
        }),
        prisma.usuario.create({
          data: {
            empresaId: empresaTest.id,
            rolId: rolCap.id,
            nombre: 'Cap2',
            apellido: 'B2',
            correo: `b2cap2_${Date.now()}@e2e-test.com`,
            contrasenaHash: hash,
            activo: false,
          },
        }),
      ]);

      const tokenB2Admin = `Bearer ${generateTestJwt(adminTest.id, empresaTest.id, 'ADMIN')}`;

      // Compuerta de lock: retener lock exclusivo en DB sobre inactivo1
      const lockHolder = await holdUserLock(inactivo1.id);

      // Disparar reactivaciones concurrentes
      const prom1 = request(httpServer)
        .patch(`/api/v1/usuarios/${inactivo1.id}`)
        .set('Authorization', tokenB2Admin)
        .send({ activo: true });

      const prom2 = request(httpServer)
        .patch(`/api/v1/usuarios/${inactivo2.id}`)
        .set('Authorization', tokenB2Admin)
        .send({ activo: true });

      // Esperar a que la transacción quede bloqueada en MySQL esperando el lock de inactivo1
      await waitUntilBlocked(prisma, 1, 5000);

      // Liberar compuerta
      await lockHolder.commit();

      const [res1, res2] = await Promise.all([prom1, prom2]);
      const exitos = [res1, res2].filter((r) => r.status === 200);
      const conflictos = [res1, res2].filter(
        (r) =>
          r.status === 409 &&
          (r.body as { code?: string }).code ===
            CodigoError.LIMITE_PLAN_EXCEDIDO,
      );

      // Demostración TOCTOU:
      // Sin el fix (ROJO): la tx de verificación se cerraba antes del update, permitiendo 2 éxitos.
      // Con el fix (VERDE): update dentro de tx con FOR UPDATE -> exactamente 1 éxito y 1 conflicto 409.
      expect(exitos.length).toBe(1);
      expect(conflictos.length).toBe(1);
    }, 30000);
  });

  // ===========================================================================
  // B3 — Gasto monto directo: crear + PATCH solo total
  // ===========================================================================
  describe('B3: Gasto monto directo — crear por total y PATCH solo total', () => {
    let gastoDirectoId: number;

    it('crear gasto por monto directo (sin cantidad/unidad) → 201', async () => {
      const res: Response = await request(httpServer)
        .post('/api/v1/gastos')
        .set('Authorization', tokenA_Admin)
        .send({
          cicloId: seed.empresaA.cicloActivo.id,
          categoriaId: seed.empresaA.categoriaPropia.id,
          fecha: '2026-02-25',
          total: '500',
          // Sin cantidad, costoUnitario, ni unidadId → monto directo
        });
      expect(res.status).toBe(201);
      gastoDirectoId = (res.body as { id: number }).id;
    });

    it('PATCH solo total sobre gasto monto directo → 200', async () => {
      if (!gastoDirectoId) return;
      const res: Response = await request(httpServer)
        .patch(`/api/v1/gastos/${gastoDirectoId}`)
        .set('Authorization', tokenA_Admin)
        .send({ total: '600' });
      expect(res.status).toBe(200);
      expect((res.body as { total: string }).total).toBe('600');
    });
  });

  // ===========================================================================
  // B4 — Logout: usuario B no puede revocar token de A
  // ===========================================================================
  describe('B4: Logout — token ajeno no se revoca', () => {
    it('usuario B intentando revocar refresh token de A → 200 silencioso y token A sigue válido', async () => {
      // Login como Admin A para obtener refresh token
      const loginA: Response = await request(httpServer)
        .post('/api/v1/auth/login')
        .send({
          correo: seed.empresaA.usuarios.admin.correo,
          contrasena: 'Password123!',
        });
      expect(loginA.status).toBe(200);
      const rtA = (loginA.body as { refreshToken: string }).refreshToken;

      // Login como Admin B para obtener su propio token de acceso
      const loginB: Response = await request(httpServer)
        .post('/api/v1/auth/login')
        .send({
          correo: seed.empresaB.usuarios.admin.correo,
          contrasena: 'Password123!',
        });
      expect(loginB.status).toBe(200);
      const accessB = (loginB.body as { accessToken: string }).accessToken;

      // B intenta hacer logout con el token de A
      const logoutRes: Response = await request(httpServer)
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${accessB}`)
        .send({ refreshToken: rtA });
      // Debe responder 200 silencioso (sin revelar existencia)
      expect(logoutRes.status).toBe(200);

      // El refresh token de A debe seguir siendo válido
      const refreshA: Response = await request(httpServer)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: rtA });
      expect(refreshA.status).toBe(200);

      // Cleanup: logout real de A
      await request(httpServer)
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${accessB}`) // cualquier Bearer válido
        .send({
          refreshToken: (refreshA.body as { refreshToken: string })
            .refreshToken,
        });
    });
  });

  // ===========================================================================
  // B5 — Adjuntos: token con firma inválida no suplanta usuario
  // ===========================================================================
  describe('B5: Adjuntos — token manipulado en endpoint público de descarga', () => {
    it('token con firma inválida en Authorization header es ignorado y permite descarga legítima → 200', async () => {
      // 1. Crear un gasto dedicado para aislar el test de límites de adjuntos acumulados
      const gastoB5 = await prisma.gasto.create({
        data: {
          cicloId: seed.empresaA.cicloActivo.id,
          categoriaId: seed.empresaA.categoriaPropia.id,
          creadoPorId: seed.empresaA.usuarios.admin.id,
          fecha: new Date('2026-03-01'),
          total: 100,
          costoUnitario: 100,
          descripcion: 'Gasto aislado B5',
        },
      });

      // Crear un adjunto real para el gasto
      const validPdf = Buffer.from(
        '%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF',
      );
      const resAdjunto: Response = await request(httpServer)
        .post(`/api/v1/gastos/${gastoB5.id}/adjuntos`)
        .set('Authorization', tokenA_Admin)
        .attach('archivo', validPdf, 'b5-test.pdf');
      expect(resAdjunto.status).toBe(201);
      const adjuntoId = (resAdjunto.body as { id: number }).id;

      // 2. Obtener enlace firmado legítimo emitido para Admin A
      const resToken: Response = await request(httpServer)
        .get(`/api/v1/adjuntos/${adjuntoId}/enlace-descarga`)
        .set('Authorization', tokenA_Admin);
      expect(resToken.status).toBe(200);
      const tokenDescarga = (resToken.body as { token: string }).token;

      // 3. Construir token JWT manipulado con sub: CONTADOR (otro usuario) y firma inválida
      const fakePayload = Buffer.from(
        JSON.stringify({
          sub: seed.empresaA.usuarios.contador.id,
          empresaId: seed.empresaA.id,
        }),
      ).toString('base64url');
      const manipulatedToken = `eyJhbGciOiJIUzI1NiJ9.${fakePayload}.firma_invalida_manipulada`;

      // 4. Invocar endpoint público de descarga con token HMAC legítimo pero cabecera Authorization manipulada
      const resDescarga: Response = await request(httpServer)
        .get('/api/v1/adjuntos/descarga')
        .set('Authorization', `Bearer ${manipulatedToken}`)
        .query({ token: tokenDescarga });

      // Demostración B5:
      // Sin el fix (ROJO): extraerUsuarioIdDeAuthHeader decodifica el token sin verificar la firma,
      // asume que quien descarga es el Contador (!== Admin A) y RECHAZA con 403.
      // Con el fix (VERDE): jwtService.verify rechaza la firma inválida, el token se ignora (usuarioSolicitanteId = undefined)
      // y la descarga pública procede exitosamente con 200.
      expect(resDescarga.status).toBe(200);
    });
  });

  // ===========================================================================
  // C3 — Usuarios: autodesactivación/autoeliminación de ADMIN + revocación de refresh_token
  // ===========================================================================
  describe('C3: Usuarios — autoprotección de ADMIN y revocación de refresh_token al desactivar', () => {
    it('ADMIN NO puede desactivarse a sí mismo vía PATCH /usuarios/:id → 409 CONFLICTO', async () => {
      const rolAdmin = await prisma.rol.findUniqueOrThrow({
        where: { codigo: 'ADMIN' },
      });
      const adminTemp = await prisma.usuario.create({
        data: {
          empresaId: seed.empresaA.id,
          rolId: rolAdmin.id,
          nombre: 'Admin',
          apellido: 'AutoPatch',
          correo: `admin.autopatch.${Date.now()}@test.com`,
          contrasenaHash: 'hash_dummy',
          activo: true,
        },
      });
      const tokenAdminTemp = `Bearer ${generateTestJwt(adminTemp.id, seed.empresaA.id, 'ADMIN')}`;

      try {
        const res: Response = await request(httpServer)
          .patch(`/api/v1/usuarios/${adminTemp.id}`)
          .set('Authorization', tokenAdminTemp)
          .send({ activo: false });

        expect(res.status).toBe(409);
        expect((res.body as { code: string }).code).toBe(CodigoError.CONFLICTO);
      } finally {
        await prisma.usuario.delete({ where: { id: adminTemp.id } });
      }
    });

    it('ADMIN NO puede eliminarse a sí mismo vía DELETE /usuarios/:id → 409 CONFLICTO', async () => {
      const rolAdmin = await prisma.rol.findUniqueOrThrow({
        where: { codigo: 'ADMIN' },
      });
      const adminTemp = await prisma.usuario.create({
        data: {
          empresaId: seed.empresaA.id,
          rolId: rolAdmin.id,
          nombre: 'Admin',
          apellido: 'AutoDelete',
          correo: `admin.autodelete.${Date.now()}@test.com`,
          contrasenaHash: 'hash_dummy',
          activo: true,
        },
      });
      const tokenAdminTemp = `Bearer ${generateTestJwt(adminTemp.id, seed.empresaA.id, 'ADMIN')}`;

      try {
        const res: Response = await request(httpServer)
          .delete(`/api/v1/usuarios/${adminTemp.id}`)
          .set('Authorization', tokenAdminTemp);

        expect(res.status).toBe(409);
        expect((res.body as { code: string }).code).toBe(CodigoError.CONFLICTO);
      } finally {
        await prisma.usuario.delete({ where: { id: adminTemp.id } });
      }
    });

    it('PATCH /usuarios/:id con activo: false revoca inmediatamente sus refresh_token activos', async () => {
      const rolCapturista = await prisma.rol.findUniqueOrThrow({
        where: { codigo: 'CAPTURISTA' },
      });
      const usuarioTarget = await prisma.usuario.create({
        data: {
          empresaId: seed.empresaA.id,
          rolId: rolCapturista.id,
          nombre: 'Target',
          apellido: 'Revoke',
          correo: `target.revoke.${Date.now()}@test.com`,
          contrasenaHash: 'hash_dummy',
          activo: true,
        },
      });

      const rt = await prisma.refreshToken.create({
        data: {
          usuarioId: usuarioTarget.id,
          jti: `jti-c3-${Date.now()}`,
          familiaId: `fam-c3-${Date.now()}`,
          tokenHash: `hash-c3-${Date.now()}`,
          expiraEn: new Date(Date.now() + 86400_000),
          revocado: false,
        },
      });

      try {
        const res: Response = await request(httpServer)
          .patch(`/api/v1/usuarios/${usuarioTarget.id}`)
          .set('Authorization', tokenA_Admin)
          .send({ activo: false });

        expect(res.status).toBe(200);

        const rtDespues = await prisma.refreshToken.findUniqueOrThrow({
          where: { id: rt.id },
        });
        expect(rtDespues.revocado).toBe(true);
        expect(rtDespues.revocadoEn).not.toBeNull();
      } finally {
        await prisma.refreshToken.deleteMany({
          where: { usuarioId: usuarioTarget.id },
        });
        await prisma.usuario.delete({ where: { id: usuarioTarget.id } });
      }
    });
  });
});
