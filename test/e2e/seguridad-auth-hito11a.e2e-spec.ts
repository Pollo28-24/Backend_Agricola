import request from 'supertest';
import { INestApplication, RequestMethod } from '@nestjs/common';
import { DiscoveryService, MetadataScanner, Reflector } from '@nestjs/core';
import { PATH_METADATA, METHOD_METADATA } from '@nestjs/common/constants';
import { Test, TestingModule } from '@nestjs/testing';
import { ValidationPipe } from '@nestjs/common';
import { getOptionsToken } from '@nestjs/throttler';
import { EstadoParcela, EstadoSuscripcion, Prisma } from '@prisma/client';
import * as argon2 from 'argon2';
import { createTestApp } from '../setup/create-test-app';
import { AppModule } from '../../src/app.module';
import { crearThrottlerOptions } from '../../src/modules/auth/guards/app-throttler.guard';
import { DomainExceptionFilter } from '../../src/common/filters/domain-exception.filter';
import { SerializacionInterceptor } from '../../src/common/interceptors/serializacion.interceptor';
import { PrismaService } from '../../src/prisma/prisma.service';
import { getOrLoadSeedData, E2eSeedData } from '../setup/e2e-seed';
import { generateTestJwt } from '../setup/test-tokens.util';
import { CodigoError } from '../../src/common/errors/codigos-error.enum';
import { IS_PUBLIC_KEY } from '../../src/modules/auth/decorators/public.decorator';

const ALLOWLIST_RN038 = new Set([
  'POST /api/v1/auth/login',
  'POST /api/v1/auth/refresh',
  'POST /api/v1/auth/logout',
  'POST /api/v1/empresas/registro',
  'PATCH /api/v1/auth/contrasena/cambiar',
]);

describe('Hito 11A: Seguridad, Sesiones, Throttling y Reglas RN-072, RN-038, RN-037, RN-074 (E2E)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let seed: E2eSeedData;
  let hashPasswordTest: string;

  beforeAll(async () => {
    const testApp = await createTestApp();
    app = testApp.app;
    await app.listen(0);
    prisma = testApp.prisma;
    seed = await getOrLoadSeedData(prisma);
    hashPasswordTest = await argon2.hash('Password123!', {
      type: argon2.argon2id,
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1,
    });
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  // ===========================================================================
  // BLOQUE 1 & 3: Refresh Token por Familia, Reuso, Concurrencia y Argon2id
  // ===========================================================================
  describe('1. Rotación atómica de Refresh Tokens, Reuso por Familia y Argon2id (Bloques 1 y 3)', () => {
    it('reuso de un refresh token ya rotado revoca toda la familia en BD y el token hijo deja de funcionar (401)', async () => {
      const server = app.getHttpServer() as Parameters<typeof request>[0];

      // 1. Login inicial crea nueva familia
      const loginRes = await request(server).post('/api/v1/auth/login').send({
        correo: seed.empresaA.usuarios.admin.correo,
        contrasena: 'Password123!',
      });
      expect(loginRes.status).toBe(200);
      const rtPadre = (loginRes.body as { refreshToken: string }).refreshToken;

      // 2. Rotación legítima: emite rtHijo y marca rtPadre como revocado
      const refresh1 = await request(server)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: rtPadre });
      expect(refresh1.status).toBe(200);
      const rtHijo = (refresh1.body as { refreshToken: string }).refreshToken;
      expect(rtHijo).toBeDefined();
      expect(rtHijo).not.toBe(rtPadre);

      // 3. Reuso malicioso de rtPadre -> debe responder 401 y revocar toda la familia (incluyendo rtHijo)
      const reusoRes = await request(server)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: rtPadre });
      expect(reusoRes.status).toBe(401);
      expect((reusoRes.body as { code: string }).code).toBe(
        CodigoError.NO_AUTENTICADO,
      );

      // 4. Intentar usar rtHijo después del reuso -> debe fallar con 401 porque la familia fue revocada en BD
      const hijoRes = await request(server)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: rtHijo });
      expect(hijoRes.status).toBe(401);
      expect((hijoRes.body as { code: string }).code).toBe(
        CodigoError.NO_AUTENTICADO,
      );
    });

    it('5 peticiones concurrentes de refresh con el mismo token terminan con 0 tokens activos en la familia y como máximo un 200', async () => {
      const server = app.getHttpServer() as Parameters<typeof request>[0];

      const loginRes = await request(server).post('/api/v1/auth/login').send({
        correo: seed.empresaA.usuarios.contador.correo,
        contrasena: 'Password123!',
      });
      expect(loginRes.status).toBe(200);
      const rtInicial = (loginRes.body as { refreshToken: string })
        .refreshToken;

      // Obtener el familiaId creado en BD
      const ultimoToken = await prisma.refreshToken.findFirstOrThrow({
        where: { usuarioId: seed.empresaA.usuarios.contador.id },
        orderBy: { id: 'desc' },
      });
      const familiaId = ultimoToken.familiaId;

      // Disparar 5 refresh concurrentes con el mismo token
      const respuestas = await Promise.all(
        Array.from({ length: 5 }, () =>
          request(server)
            .post('/api/v1/auth/refresh')
            .send({ refreshToken: rtInicial }),
        ),
      );

      const exitos200 = respuestas.filter((r) => r.status === 200);
      const rechazos401 = respuestas.filter((r) => r.status === 401);

      expect(exitos200.length).toBeLessThanOrEqual(1);
      expect(rechazos401.length).toBeGreaterThanOrEqual(4);

      const activosEnFamilia = await prisma.refreshToken.count({
        where: { familiaId, revocado: false },
      });
      expect(activosEnFamilia).toBe(0);
    });

    it('logout revoca toda la familia; token expirado en BD devuelve 401 sin revocar otros tokens de la familia', async () => {
      const server = app.getHttpServer() as Parameters<typeof request>[0];

      const loginOpen = await request(server).post('/api/v1/auth/login').send({
        correo: seed.empresaA.usuarios.admin.correo,
        contrasena: 'Password123!',
      });
      expect(loginOpen.status).toBe(200);
      const { accessToken, refreshToken } = loginOpen.body as {
        accessToken: string;
        refreshToken: string;
      };

      const tokenRow = await prisma.refreshToken.findFirstOrThrow({
        where: { usuarioId: seed.empresaA.usuarios.admin.id },
        orderBy: { id: 'desc' },
      });

      // Insertar un hermano activo en la misma familia para verificar que expiración NO revoca la familia
      const hermano = await prisma.refreshToken.create({
        data: {
          usuarioId: seed.empresaA.usuarios.admin.id,
          familiaId: tokenRow.familiaId,
          jti: `hermano-${Date.now()}`,
          tokenHash: 'hash_hermano',
          expiraEn: new Date(Date.now() + 600_000),
          revocado: false,
        },
      });

      // Forzar expiración de tokenRow en BD
      await prisma.refreshToken.update({
        where: { id: tokenRow.id },
        data: { expiraEn: new Date(Date.now() - 10_000) },
      });

      const expRes = await request(server)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken });
      expect(expRes.status).toBe(401);

      // El hermano sigue activo porque un token expirado NO revoca la familia
      const hermanoDespuesExp = await prisma.refreshToken.findUniqueOrThrow({
        where: { id: hermano.id },
      });
      expect(hermanoDespuesExp.revocado).toBe(false);

      // Ahora ejecutar logout con el refreshToken -> revoca toda la familia incluyendo el hermano
      const logoutRes = await request(server)
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ refreshToken });
      expect(logoutRes.status).toBe(200);

      const activosTrasLogout = await prisma.refreshToken.count({
        where: { familiaId: tokenRow.familiaId, revocado: false },
      });
      expect(activosTrasLogout).toBe(0);
    });

    it('login hace rehash transparente a m=19456,t=2,p=1 cuando el usuario tiene parámetros antiguos y responde igual ante correo inexistente vs clave errónea', async () => {
      const server = app.getHttpServer() as Parameters<typeof request>[0];

      // Generar hash con parámetros antiguos (m=4096, t=2, p=1)
      const hashAntiguo = await argon2.hash('Password123!', {
        type: argon2.argon2id,
        memoryCost: 4096,
        timeCost: 2,
        parallelism: 1,
      });
      await prisma.usuario.update({
        where: { id: seed.empresaA.usuarios.capturista.id },
        data: { contrasenaHash: hashAntiguo },
      });

      const loginOk = await request(server).post('/api/v1/auth/login').send({
        correo: seed.empresaA.usuarios.capturista.correo,
        contrasena: 'Password123!',
      });
      expect(loginOk.status).toBe(200);

      const usuarioActualizado = await prisma.usuario.findUniqueOrThrow({
        where: { id: seed.empresaA.usuarios.capturista.id },
      });
      expect(usuarioActualizado.contrasenaHash).toMatch(/\bm=19456\b/);
      expect(usuarioActualizado.contrasenaHash).toMatch(/\bt=2\b/);

      // Comparar respuesta de correo inexistente vs contraseña errónea
      const resNoExiste = await request(server)
        .post('/api/v1/auth/login')
        .send({
          correo: 'no.existe.jamas@e2e-test.com',
          contrasena: 'ClaveIncorrecta999!',
        });
      const resClaveErronea = await request(server)
        .post('/api/v1/auth/login')
        .send({
          correo: seed.empresaA.usuarios.capturista.correo,
          contrasena: 'ClaveIncorrecta999!',
        });

      expect(resNoExiste.status).toBe(401);
      expect(resClaveErronea.status).toBe(401);
      expect(resNoExiste.body).toEqual(resClaveErronea.body);
    });
  });

  // ===========================================================================
  // BLOQUE 4: RN-072 (Revalidación inmediata de usuario, rol y suscripción)
  // ===========================================================================
  describe('2. RN-072: Revalidación en tiempo real de usuario desactivado, cambio de rol y suscripción', () => {
    it('rechaza inmediatamente con 401 un accessToken vigente si el usuario es desactivado en BD, y tampoco permite refresh', async () => {
      const server = app.getHttpServer() as Parameters<typeof request>[0];
      const rolCapturista = await prisma.rol.findUniqueOrThrow({
        where: { codigo: 'CAPTURISTA' },
      });
      const hash = hashPasswordTest;

      const tempUser = await prisma.usuario.create({
        data: {
          empresaId: seed.empresaA.id,
          rolId: rolCapturista.id,
          nombre: 'Temp',
          apellido: 'RN072',
          correo: `temp.rn072.${Date.now()}@e2e-test.com`,
          contrasenaHash: hash,
          activo: true,
        },
      });

      try {
        const loginRes = await request(server)
          .post('/api/v1/auth/login')
          .send({ correo: tempUser.correo, contrasena: 'Password123!' });
        expect(loginRes.status).toBe(200);
        const { accessToken, refreshToken } = loginRes.body as {
          accessToken: string;
          refreshToken: string;
        };

        // Petición con usuario activo pasa
        const meOk = await request(server)
          .get('/api/v1/auth/me')
          .set('Authorization', `Bearer ${accessToken}`);
        expect(meOk.status).toBe(200);

        // Desactivar usuario vía API con Admin de Empresa A
        const adminToken = `Bearer ${generateTestJwt(
          seed.empresaA.usuarios.admin.id,
          seed.empresaA.id,
          'ADMIN',
        )}`;
        const patchDesactivar = await request(server)
          .patch(`/api/v1/usuarios/${tempUser.id}`)
          .set('Authorization', adminToken)
          .send({ activo: false });
        expect(patchDesactivar.status).toBe(200);

        // Siguiente petición con el mismo accessToken vigente es rechazada con 401
        const meRechazado = await request(server)
          .get('/api/v1/auth/me')
          .set('Authorization', `Bearer ${accessToken}`);
        expect(meRechazado.status).toBe(401);

        // Intentar refrescar con el refreshToken revoca la familia y responde 401
        const refreshRechazado = await request(server)
          .post('/api/v1/auth/refresh')
          .send({ refreshToken });
        expect(refreshRechazado.status).toBe(401);

        const tokensActivos = await prisma.refreshToken.count({
          where: { usuarioId: tempUser.id, revocado: false },
        });
        expect(tokensActivos).toBe(0);
      } finally {
        await prisma.refreshToken.deleteMany({
          where: { usuarioId: tempUser.id },
        });
        await prisma.bitacoraAuditoria.deleteMany({
          where: { entidad: 'usuario', entidadId: tempUser.id },
        });
        await prisma.usuario.delete({ where: { id: tempUser.id } });
      }
    });

    it('cambio de rol en BD se refleja en la siguiente petición sin esperar a que expire el accessToken (RN-072)', async () => {
      const server = app.getHttpServer() as Parameters<typeof request>[0];
      const rolContador = await prisma.rol.findUniqueOrThrow({
        where: { codigo: 'CONTADOR' },
      });
      const hash = hashPasswordTest;

      const userRol = await prisma.usuario.create({
        data: {
          empresaId: seed.empresaA.id,
          rolId: rolContador.id,
          nombre: 'Cambio',
          apellido: 'Rol',
          correo: `cambio.rol.${Date.now()}@e2e-test.com`,
          contrasenaHash: hash,
          activo: true,
        },
      });

      try {
        // Emitir JWT cuyo payload dice CONTADOR
        const tokenJwt = `Bearer ${generateTestJwt(
          userRol.id,
          seed.empresaA.id,
          'CONTADOR',
        )}`;

        // Como CONTADOR puede consultar reportes (200)
        const repAntes = await request(server)
          .get('/api/v1/reportes/rentabilidad')
          .set('Authorization', tokenJwt);
        expect(repAntes.status).toBe(200);

        const meAntes = await request(server)
          .get('/api/v1/auth/me')
          .set('Authorization', tokenJwt);
        expect(meAntes.status).toBe(200);
        expect((meAntes.body as { rol: string }).rol).toBe('CONTADOR');

        // Admin cambia el rol del usuario a CAPTURISTA (que NO tiene reporte:consultar)
        const adminToken = `Bearer ${generateTestJwt(
          seed.empresaA.usuarios.admin.id,
          seed.empresaA.id,
          'ADMIN',
        )}`;
        const patchRol = await request(server)
          .patch(`/api/v1/usuarios/${userRol.id}`)
          .set('Authorization', adminToken)
          .send({ rolCodigo: 'CAPTURISTA' });
        expect(patchRol.status).toBe(200);

        // Con el MISMO tokenJwt (cuyo payload firmado dice CONTADOR): reportes da 403 y /auth/me refleja CAPTURISTA
        const repDespues = await request(server)
          .get('/api/v1/reportes/rentabilidad')
          .set('Authorization', tokenJwt);
        expect(repDespues.status).toBe(403);
        expect((repDespues.body as { code: string }).code).toBe(
          CodigoError.PERMISO_DENEGADO,
        );

        const meDespues = await request(server)
          .get('/api/v1/auth/me')
          .set('Authorization', tokenJwt);
        expect(meDespues.status).toBe(200);
        expect(
          (meDespues.body as { rol: string; permisos: string[] }).rol,
        ).toBe('CAPTURISTA');
        expect(
          (meDespues.body as { rol: string; permisos: string[] }).permisos,
        ).toContain('actividad:crear');
        expect(
          (meDespues.body as { rol: string; permisos: string[] }).permisos,
        ).not.toContain('reporte:consultar');

        // Al devolver el rol a CONTADOR en BD, el mismo tokenJwt recupera acceso 200 inmediatamente
        const patchRolVuelta = await request(server)
          .patch(`/api/v1/usuarios/${userRol.id}`)
          .set('Authorization', adminToken)
          .send({ rolCodigo: 'CONTADOR' });
        expect(patchRolVuelta.status).toBe(200);

        const repRecuperado = await request(server)
          .get('/api/v1/reportes/rentabilidad')
          .set('Authorization', tokenJwt);
        expect(repRecuperado.status).toBe(200);
      } finally {
        await prisma.bitacoraAuditoria.deleteMany({
          where: { entidad: 'usuario', entidadId: userRol.id },
        });
        await prisma.usuario.delete({ where: { id: userRol.id } });
      }
    });

    it('rechaza inmediatamente con 401 un accessToken vigente y revoca la familia en refresh cuando la empresa es eliminada (deletedAt) o desactivada (RN-072)', async () => {
      const server = app.getHttpServer() as Parameters<typeof request>[0];
      const planBasico = await prisma.planSuscripcion.findUniqueOrThrow({
        where: { codigo: 'BASICO' },
      });
      const rolAdmin = await prisma.rol.findUniqueOrThrow({
        where: { codigo: 'ADMIN' },
      });
      const hash = hashPasswordTest;

      const empresaTemp = await prisma.empresa.create({
        data: {
          nombre: 'Empresa Eliminada RN072',
          rfc: `EEL${Date.now().toString().slice(-9)}`,
          correo: 'eliminada@rn072.com',
          planId: planBasico.id,
          estadoSuscripcion: EstadoSuscripcion.ACTIVA,
          activo: true,
        },
      });

      const userEmpTemp = await prisma.usuario.create({
        data: {
          empresaId: empresaTemp.id,
          rolId: rolAdmin.id,
          nombre: 'Admin',
          apellido: 'EmpEliminada',
          correo: `admin.emp.elim.${Date.now()}@rn072.com`,
          contrasenaHash: hash,
          activo: true,
        },
      });

      try {
        const loginRes = await request(server).post('/api/v1/auth/login').send({
          correo: userEmpTemp.correo,
          contrasena: 'Password123!',
        });
        expect(loginRes.status).toBe(200);
        const { accessToken, refreshToken } = loginRes.body as {
          accessToken: string;
          refreshToken: string;
        };

        // Dar de baja lógica la empresa (deletedAt !== null)
        await prisma.empresa.update({
          where: { id: empresaTemp.id },
          data: { deletedAt: new Date(), activo: false },
        });

        const meRes = await request(server)
          .get('/api/v1/auth/me')
          .set('Authorization', `Bearer ${accessToken}`);
        expect(meRes.status).toBe(401);
        expect((meRes.body as { code: string }).code).toBe(
          CodigoError.NO_AUTENTICADO,
        );

        const refreshRes = await request(server)
          .post('/api/v1/auth/refresh')
          .send({ refreshToken });
        expect(refreshRes.status).toBe(401);

        const activos = await prisma.refreshToken.count({
          where: { usuarioId: userEmpTemp.id, revocado: false },
        });
        expect(activos).toBe(0);
      } finally {
        await prisma.bitacoraAuditoria.deleteMany({
          where: { empresaId: empresaTemp.id },
        });
        await prisma.refreshToken.deleteMany({
          where: { usuarioId: userEmpTemp.id },
        });
        await prisma.usuario.delete({ where: { id: userEmpTemp.id } });
        await prisma.empresa.delete({ where: { id: empresaTemp.id } });
      }
    });
  });

  // ===========================================================================
  // BLOQUE 4: RN-038 (Empresa VENCIDA y CANCELADA con DiscoveryService)
  // ===========================================================================
  describe('3. RN-038: Suscripción VENCIDA y CANCELADA (DiscoveryService sobre todas las rutas)', () => {
    it('en estado VENCIDA y CANCELADA todos los GET responden 200 y todas las rutas de escritura fuera de la allowlist responden 403 SUSCRIPCION_INACTIVA', async () => {
      const server = app.getHttpServer() as Parameters<typeof request>[0];
      const discoveryService = app.get(DiscoveryService);
      const metadataScanner = app.get(MetadataScanner);
      const reflector = app.get(Reflector);

      // Descubrir dinámicamente todas las rutas registradas en los controladores
      const controllers = discoveryService.getControllers();
      const rutasMutacion: Array<{
        method: string;
        fullPath: string;
        SampleUrl: string;
      }> = [];

      const methodMap: Record<number, string> = {
        [RequestMethod.GET]: 'GET',
        [RequestMethod.POST]: 'POST',
        [RequestMethod.PUT]: 'PUT',
        [RequestMethod.DELETE]: 'DELETE',
        [RequestMethod.PATCH]: 'PATCH',
        [RequestMethod.OPTIONS]: 'OPTIONS',
        [RequestMethod.HEAD]: 'HEAD',
      };

      for (const wrapper of controllers) {
        const instance = wrapper.instance as object | undefined;
        const metatype = wrapper.metatype;
        if (!instance || !metatype) continue;

        const ctrlPathRaw = reflector.get<string | string[]>(
          PATH_METADATA,
          metatype,
        );
        const ctrlPath = Array.isArray(ctrlPathRaw)
          ? ctrlPathRaw[0]
          : (ctrlPathRaw ?? '');

        const prototype = Object.getPrototypeOf(instance) as object;
        const methodNames = metadataScanner.getAllMethodNames(prototype);

        for (const name of methodNames) {
          const handler = (instance as Record<string, unknown>)[name];
          if (typeof handler !== 'function') continue;

          const reqMethodNum = reflector.get<number>(METHOD_METADATA, handler);
          const routePathRaw = reflector.get<string | string[]>(
            PATH_METADATA,
            handler,
          );
          if (reqMethodNum === undefined || routePathRaw === undefined) {
            continue;
          }

          const httpMethod = methodMap[reqMethodNum] ?? 'GET';
          if (['GET', 'HEAD', 'OPTIONS'].includes(httpMethod)) {
            continue;
          }

          const isPublic = reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
            handler,
            metatype,
          ]);

          const subPath = Array.isArray(routePathRaw)
            ? routePathRaw[0]
            : routePathRaw;
          const segments = ['api/v1', ctrlPath, subPath]
            .map((s) => s.replace(/^\/+|\/+$/g, ''))
            .filter(Boolean);
          const fullPath = `/${segments.join('/')}`;
          const key = `${httpMethod} ${fullPath}`;

          if (ALLOWLIST_RN038.has(key) || isPublic) {
            continue;
          }

          const SampleUrl = fullPath.replace(/:[a-zA-Z0-9_]+/g, '1');
          rutasMutacion.push({ method: httpMethod, fullPath, SampleUrl });
        }
      }

      expect(rutasMutacion.length).toBeGreaterThanOrEqual(40);

      const tokenB_Admin = `Bearer ${generateTestJwt(
        seed.empresaB.usuarios.admin.id,
        seed.empresaB.id,
        'ADMIN',
      )}`;

      const rutasGetVerificacion = [
        '/api/v1/auth/me',
        '/api/v1/empresas/mi-empresa',
        '/api/v1/usuarios',
        '/api/v1/auditoria',
        '/api/v1/predios',
        '/api/v1/parcelas',
        '/api/v1/clientes',
        '/api/v1/proveedores',
        '/api/v1/catalogos/cultivos',
        '/api/v1/ciclos',
        '/api/v1/actividades',
        '/api/v1/gastos',
        '/api/v1/cosechas',
        '/api/v1/mermas',
        '/api/v1/ventas',
        '/api/v1/reportes/rentabilidad',
        '/api/v1/reportes/alertas',
        '/api/v1/reportes/cuentas-por-cobrar',
      ];

      try {
        for (const estado of [
          EstadoSuscripcion.VENCIDA,
          EstadoSuscripcion.CANCELADA,
        ]) {
          await prisma.empresa.update({
            where: { id: seed.empresaB.id },
            data: { estadoSuscripcion: estado },
          });

          // 1. Verificar que todos los GET de lectura siguen respondiendo 200 OK
          for (const getUrl of rutasGetVerificacion) {
            const resGet = await request(server)
              .get(getUrl)
              .set('Authorization', tokenB_Admin);
            expect(resGet.status).toBe(200);
          }

          // 2. Verificar que el logout (en allowlist) sigue respondiendo 200 OK
          const resLogout = await request(server)
            .post('/api/v1/auth/logout')
            .set('Authorization', tokenB_Admin)
            .send({ refreshToken: 'token-allowlist-rn038' });
          expect(resLogout.status).toBe(200);

          // 3. Verificar que TODAS las rutas de mutación descubiertas por DiscoveryService dan 403 SUSCRIPCION_INACTIVA
          for (const ruta of rutasMutacion) {
            type MutMethod = 'post' | 'patch' | 'put' | 'delete';
            const methodLower = ruta.method.toLowerCase() as MutMethod;
            const resMut = await request(server)
              [methodLower](ruta.SampleUrl)
              .set('Authorization', tokenB_Admin)
              .send({});
            expect(resMut.status).toBe(403);
            expect((resMut.body as { code: string }).code).toBe(
              CodigoError.SUSCRIPCION_INACTIVA,
            );
          }
        }
      } finally {
        await prisma.empresa.update({
          where: { id: seed.empresaB.id },
          data: { estadoSuscripcion: EstadoSuscripcion.ACTIVA },
        });
      }
    });
  });

  // ===========================================================================
  // BLOQUE 4: RN-037 (Cuotas de Plan BASICO, liberación y concurrencia)
  // ===========================================================================
  describe('4. RN-037: Límites de plan comercial (usuarios BASICO=1 y parcelas no INACTIVAS), liberación de cupo y concurrencia', () => {
    it('usuarios (BASICO=1) y parcelas (BASICO=3, no INACTIVAS) rechazan al exceder, liberan cupo al desactivar/inactivar y serializan creaciones concurrentes (1x 201 y 1x 409)', async () => {
      const server = app.getHttpServer() as Parameters<typeof request>[0];
      const planBasico = await prisma.planSuscripcion.findUniqueOrThrow({
        where: { codigo: 'BASICO' },
      });
      const planProductor = await prisma.planSuscripcion.findUniqueOrThrow({
        where: { codigo: 'PRODUCTOR' },
      });
      const rolAdmin = await prisma.rol.findUniqueOrThrow({
        where: { codigo: 'ADMIN' },
      });
      const hash = hashPasswordTest;

      const empresaCuota = await prisma.empresa.create({
        data: {
          nombre: 'Empresa Cuota RN037',
          rfc: `ECU${Date.now().toString().slice(-9)}`,
          correo: 'cuota@rn037.com',
          planId: planBasico.id, // BASICO: maxUsuarios = 1, maxParcelas = 3
          estadoSuscripcion: EstadoSuscripcion.ACTIVA,
          activo: true,
        },
      });

      const adminCuota = await prisma.usuario.create({
        data: {
          empresaId: empresaCuota.id,
          rolId: rolAdmin.id,
          nombre: 'Admin',
          apellido: 'Cuota',
          correo: `admin.cuota.${Date.now()}@rn037.com`,
          contrasenaHash: hash,
          activo: true,
        },
      });

      const predioCuota = await prisma.predio.create({
        data: {
          empresaId: empresaCuota.id,
          nombre: 'Predio Cuota',
          superficieTotal: new Prisma.Decimal('100.00'),
        },
      });

      const tokenCuota = `Bearer ${generateTestJwt(
        adminCuota.id,
        empresaCuota.id,
        'ADMIN',
      )}`;

      try {
        // A. En plan BASICO (maxUsuarios = 1), crear un 2.º usuario falla con 409 LIMITE_PLAN_EXCEDIDO
        const resUserExcede = await request(server)
          .post('/api/v1/usuarios')
          .set('Authorization', tokenCuota)
          .send({
            nombre: 'Extra',
            apellido: 'User',
            correo: `extra.${Date.now()}@rn037.com`,
            contrasena: 'Password123!',
            rolCodigo: 'CAPTURISTA',
          });
        expect(resUserExcede.status).toBe(409);
        expect((resUserExcede.body as { code: string }).code).toBe(
          CodigoError.LIMITE_PLAN_EXCEDIDO,
        );

        // B. Pasar a PRODUCTOR (maxUsuarios = 3): crear usuario #2, y con 1 cupo libre lanzar 2 creaciones concurrentes -> 1x 201 y 1x 409
        await prisma.empresa.update({
          where: { id: empresaCuota.id },
          data: { planId: planProductor.id },
        });

        const u2Res = await request(server)
          .post('/api/v1/usuarios')
          .set('Authorization', tokenCuota)
          .send({
            nombre: 'UserDos',
            apellido: 'Cuota',
            correo: `u2.${Date.now()}@rn037.com`,
            contrasena: 'Password123!',
            rolCodigo: 'CAPTURISTA',
          });
        expect(u2Res.status).toBe(201);
        const u2Id = (u2Res.body as { id: number }).id;

        // Queda exactamente 1 cupo de usuario (2 de 3 usados): disparar 2 altas concurrentes
        const [concU1, concU2] = await Promise.all([
          request(server)
            .post('/api/v1/usuarios')
            .set('Authorization', tokenCuota)
            .send({
              nombre: 'ConcA',
              apellido: 'Cuota',
              correo: `conca.${Date.now()}@rn037.com`,
              contrasena: 'Password123!',
              rolCodigo: 'CAPTURISTA',
            }),
          request(server)
            .post('/api/v1/usuarios')
            .set('Authorization', tokenCuota)
            .send({
              nombre: 'ConcB',
              apellido: 'Cuota',
              correo: `concb.${Date.now()}@rn037.com`,
              contrasena: 'Password123!',
              rolCodigo: 'CONTADOR',
            }),
        ]);

        const statusesUsuarios = [concU1.status, concU2.status].sort();
        expect(statusesUsuarios).toEqual([201, 409]);

        // Desactivar u2 libera cupo -> ahora sí permite crear otro usuario
        const desactRes = await request(server)
          .patch(`/api/v1/usuarios/${u2Id}`)
          .set('Authorization', tokenCuota)
          .send({ activo: false });
        expect(desactRes.status).toBe(200);

        const trasLiberarUser = await request(server)
          .post('/api/v1/usuarios')
          .set('Authorization', tokenCuota)
          .send({
            nombre: 'Reemplazo',
            apellido: 'Cuota',
            correo: `reemplazo.${Date.now()}@rn037.com`,
            contrasena: 'Password123!',
            rolCodigo: 'CAPTURISTA',
          });
        expect(trasLiberarUser.status).toBe(201);

        // C. Parcelas en plan BASICO (maxParcelas = 3): crear 2 parcelas, luego 2 concurrentes por el 3.er cupo -> 1x 201 y 1x 409
        await prisma.empresa.update({
          where: { id: empresaCuota.id },
          data: { planId: planBasico.id },
        });

        for (let i = 1; i <= 2; i++) {
          const pRes = await request(server)
            .post('/api/v1/parcelas')
            .set('Authorization', tokenCuota)
            .send({
              predioId: predioCuota.id,
              nombre: `Parcela Base ${i}`,
              superficie: 5,
              estado: EstadoParcela.DISPONIBLE,
            });
          expect(pRes.status).toBe(201);
        }

        // Queda 1 cupo de parcela (2 de 3 usadas): lanzar 2 creaciones concurrentes
        const [concP1, concP2] = await Promise.all([
          request(server)
            .post('/api/v1/parcelas')
            .set('Authorization', tokenCuota)
            .send({
              predioId: predioCuota.id,
              nombre: 'Parcela Concurrente 1',
              superficie: 5,
              estado: EstadoParcela.DISPONIBLE,
            }),
          request(server)
            .post('/api/v1/parcelas')
            .set('Authorization', tokenCuota)
            .send({
              predioId: predioCuota.id,
              nombre: 'Parcela Concurrente 2',
              superficie: 5,
              estado: EstadoParcela.DISPONIBLE,
            }),
        ]);

        const statusesParcelas = [concP1.status, concP2.status].sort();
        expect(statusesParcelas).toEqual([201, 409]);

        const parcelaGanadoraId =
          concP1.status === 201
            ? (concP1.body as { id: number }).id
            : (concP2.body as { id: number }).id;

        // Inactivar la parcela ganadora libera cupo (RN-037: parcelas no INACTIVAS)
        const inactParcela = await request(server)
          .patch(`/api/v1/parcelas/${parcelaGanadoraId}`)
          .set('Authorization', tokenCuota)
          .send({ estado: EstadoParcela.INACTIVA });
        expect(inactParcela.status).toBe(200);

        // Con la parcela en estado INACTIVA, crear una nueva parcela DISPONIBLE pasa con 201
        const nuevaParcelaActiva = await request(server)
          .post('/api/v1/parcelas')
          .set('Authorization', tokenCuota)
          .send({
            predioId: predioCuota.id,
            nombre: 'Parcela Tras Inactivar',
            superficie: 4,
            estado: EstadoParcela.DISPONIBLE,
          });
        expect(nuevaParcelaActiva.status).toBe(201);

        // Intentar reactivar la parcela INACTIVA cuando ya hay 3 activas falla con 409 LIMITE_PLAN_EXCEDIDO
        const reactivarRechazada = await request(server)
          .patch(`/api/v1/parcelas/${parcelaGanadoraId}`)
          .set('Authorization', tokenCuota)
          .send({ estado: EstadoParcela.DISPONIBLE });
        expect(reactivarRechazada.status).toBe(409);
        expect((reactivarRechazada.body as { code: string }).code).toBe(
          CodigoError.LIMITE_PLAN_EXCEDIDO,
        );
      } finally {
        await prisma.bitacoraAuditoria.deleteMany({
          where: { empresaId: empresaCuota.id },
        });
        await prisma.parcela.deleteMany({
          where: { predioId: predioCuota.id },
        });
        await prisma.predio.delete({ where: { id: predioCuota.id } });
        await prisma.refreshToken.deleteMany({
          where: { usuario: { empresaId: empresaCuota.id } },
        });
        await prisma.usuario.deleteMany({
          where: { empresaId: empresaCuota.id },
        });
        await prisma.empresa.delete({ where: { id: empresaCuota.id } });
      }
    });
  });

  // ===========================================================================
  // BLOQUE 4: RN-074 (Higiene de secretos en bitácora y respuestas HTTP)
  // ===========================================================================
  describe('5. RN-074: Ninguna fila de bitacora_auditoria ni respuesta HTTP expone contrasenaHash o tokens', () => {
    it('tras login, refresh, crear y editar usuario, ninguna respuesta ni registro de bitácora contiene hashes ni tokens', async () => {
      const server = app.getHttpServer() as Parameters<typeof request>[0];
      const adminToken = `Bearer ${generateTestJwt(
        seed.empresaA.usuarios.admin.id,
        seed.empresaA.id,
        'ADMIN',
      )}`;

      const loginRes = await request(server).post('/api/v1/auth/login').send({
        correo: seed.empresaA.usuarios.admin.correo,
        contrasena: 'Password123!',
      });
      expect(loginRes.status).toBe(200);
      expect(JSON.stringify(loginRes.body)).not.toContain('contrasenaHash');
      expect(JSON.stringify(loginRes.body)).not.toContain('$argon2id$');

      const refreshRes = await request(server)
        .post('/api/v1/auth/refresh')
        .send({
          refreshToken: (loginRes.body as { refreshToken: string })
            .refreshToken,
        });
      expect(refreshRes.status).toBe(200);
      expect(JSON.stringify(refreshRes.body)).not.toContain('contrasenaHash');
      expect(JSON.stringify(refreshRes.body)).not.toContain('$argon2id$');

      const createRes = await request(server)
        .post('/api/v1/usuarios')
        .set('Authorization', adminToken)
        .send({
          nombre: 'Auditoria',
          apellido: 'RN074',
          correo: `rn074.${Date.now()}@e2e-test.com`,
          contrasena: 'Password123!',
          rolCodigo: 'CAPTURISTA',
        });
      expect(createRes.status).toBe(201);
      expect(JSON.stringify(createRes.body)).not.toContain('contrasenaHash');
      expect(JSON.stringify(createRes.body)).not.toContain('$argon2id$');
      const nuevoUserId = (createRes.body as { id: number }).id;

      try {
        const patchRes = await request(server)
          .patch(`/api/v1/usuarios/${nuevoUserId}`)
          .set('Authorization', adminToken)
          .send({ nombre: 'Auditoria Editado' });
        expect(patchRes.status).toBe(200);
        expect(JSON.stringify(patchRes.body)).not.toContain('contrasenaHash');

        const filasBitacora = await prisma.bitacoraAuditoria.findMany({
          where: { empresaId: seed.empresaA.id },
        });
        expect(filasBitacora.length).toBeGreaterThan(0);

        for (const fila of filasBitacora) {
          const dump = JSON.stringify({
            ant: fila.valoresAnteriores,
            nue: fila.valoresNuevos,
          });
          expect(dump).not.toContain('contrasenaHash');
          expect(dump).not.toContain('$argon2id$');
          expect(dump).not.toContain('tokenHash');
          expect(dump).not.toContain('refreshToken');
          expect(dump).not.toContain('accessToken');
        }
      } finally {
        await prisma.bitacoraAuditoria.deleteMany({
          where: { entidad: 'usuario', entidadId: nuevoUserId },
        });
        await prisma.usuario.delete({ where: { id: nuevoUserId } });
      }
    });
  });

  // ===========================================================================
  // BLOQUE 2: Spec E2E dedicado con THROTTLE_ENABLED=true
  // ===========================================================================
  describe('6. Throttling E2E dedicado (THROTTLE_ENABLED=true): 6.º intento -> 429 con Retry-After', () => {
    let throttledApp: INestApplication;

    beforeAll(async () => {
      const moduleFixture: TestingModule = await Test.createTestingModule({
        imports: [AppModule],
      })
        .overrideProvider(getOptionsToken())
        .useValue(crearThrottlerOptions({ enabled: true }))
        .compile();

      throttledApp = moduleFixture.createNestApplication();
      throttledApp.setGlobalPrefix('api/v1');
      throttledApp.useGlobalFilters(new DomainExceptionFilter());
      throttledApp.useGlobalInterceptors(new SerializacionInterceptor());
      throttledApp.useGlobalPipes(
        new ValidationPipe({
          whitelist: true,
          forbidNonWhitelisted: true,
          transform: true,
          transformOptions: { enableImplicitConversion: true },
        }),
      );
      await throttledApp.init();
      await throttledApp.listen(0);
    });

    afterAll(async () => {
      process.env.THROTTLE_ENABLED = 'false';
      if (throttledApp) {
        await throttledApp.close();
      }
    });

    it('al 6.º intento de login para un correo responde 429 DEMASIADAS_PETICIONES con Retry-After, sin bloquear otro correo desde la misma IP', async () => {
      const server = throttledApp.getHttpServer() as Parameters<
        typeof request
      >[0];
      const correoAtacado = `atacado.${Date.now()}@e2e-test.com`;

      for (let i = 1; i <= 5; i++) {
        const res = await request(server)
          .post('/api/v1/auth/login')
          .send({ correo: correoAtacado, contrasena: 'WrongPassword1!' });
        expect(res.status).toBe(401);
      }

      // 6.º intento con el mismo correo -> 429 con Retry-After
      const res6 = await request(server)
        .post('/api/v1/auth/login')
        .send({ correo: correoAtacado, contrasena: 'WrongPassword1!' });
      expect(res6.status).toBe(429);
      expect(res6.body).toEqual({
        statusCode: 429,
        code: CodigoError.DEMASIADAS_PETICIONES,
        message: expect.any(String) as unknown,
        details: { retryAfter: expect.any(Number) as unknown },
      });
      expect(res6.headers['retry-after']).toBeDefined();
      expect(Number(res6.headers['retry-after'])).toBeGreaterThan(0);

      // Otro correo desde la misma IP NO es bloqueado por login-correo
      const resOtroCorreo = await request(server)
        .post('/api/v1/auth/login')
        .send({
          correo: seed.empresaA.usuarios.admin.correo,
          contrasena: 'Password123!',
        });
      expect(resOtroCorreo.status).toBe(200);

      // /api/v1/health está excluido del throttler
      const resHealth = await request(server).get('/api/v1/health');
      expect(resHealth.status).toBe(200);
    });
  });

  describe('Mitigación de Body-Parser (Hito 11F.1)', () => {
    it('rechaza solicitudes con payload comprimido (Content-Encoding: gzip) con HTTP 415', async () => {
      const zlib = await import('zlib');
      const payload = JSON.stringify({
        correo: seed.empresaA.usuarios.admin.correo,
        contrasena: 'Password123!',
      });
      const compressed = zlib.gzipSync(Buffer.from(payload));

      const server = app.getHttpServer() as Parameters<typeof request>[0];
      const res = await request(server)
        .post('/api/v1/auth/login')
        .set('Content-Type', 'application/json')
        .set('Content-Encoding', 'gzip')
        .send(compressed);

      expect(res.status).toBe(415);
      expect(res.body).toMatchObject({
        statusCode: 415,
        code: CodigoError.TIPO_ARCHIVO_NO_PERMITIDO,
      });
    });

    it('permite login normal sin compresión (HTTP 200)', async () => {
      const server = app.getHttpServer() as Parameters<typeof request>[0];
      const res = await request(server).post('/api/v1/auth/login').send({
        correo: seed.empresaA.usuarios.admin.correo,
        contrasena: 'Password123!',
      });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('accessToken');
    });
  });
});
