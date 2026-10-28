import request from 'supertest';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getOptionsToken } from '@nestjs/throttler';
import { AccionAuditoria, EstadoSuscripcion } from '@prisma/client';
import * as argon2 from 'argon2';
import { AppModule } from '../../src/app.module';
import { createTestApp } from '../setup/create-test-app';
import { PrismaService } from '../../src/prisma/prisma.service';
import { getOrLoadSeedData, E2eSeedData } from '../setup/e2e-seed';
import { CodigoError } from '../../src/common/errors/codigos-error.enum';
import { MailService } from '../../src/modules/mail/mail.service';
import { MemoryTransport } from '../../src/modules/mail/transports/memory.transport';
import { DomainExceptionFilter } from '../../src/common/filters/domain-exception.filter';
import { SerializacionInterceptor } from '../../src/common/interceptors/serializacion.interceptor';
import { crearThrottlerOptions } from '../../src/modules/auth/guards/app-throttler.guard';

describe('Hito 11E: Gestión de Contraseñas, Recuperación por Correo y Sesiones (E2E)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let seed: E2eSeedData;
  let memoryTransport: MemoryTransport;
  let mailService: MailService;

  beforeAll(async () => {
    const testApp = await createTestApp();
    app = testApp.app;
    await app.listen(0);
    prisma = testApp.prisma;
    seed = await getOrLoadSeedData(prisma);
    mailService = app.get(MailService);
    memoryTransport = mailService.getTransport() as MemoryTransport;
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  beforeEach(async () => {
    if (memoryTransport && typeof memoryTransport.limpiar === 'function') {
      memoryTransport.limpiar();
    }
    await prisma.passwordResetToken.deleteMany({});
  });

  afterEach(async () => {
    const hashOriginal = await argon2.hash('Password123!', {
      type: argon2.argon2id,
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1,
    });
    await prisma.usuario.updateMany({
      where: {
        id: {
          in: [
            seed.empresaA.usuarios.admin.id,
            seed.empresaA.usuarios.capturista.id,
            seed.empresaA.usuarios.contador.id,
            seed.empresaB.usuarios.admin.id,
          ],
        },
      },
      data: {
        contrasenaHash: hashOriginal,
        cambioContrasenaEn: null,
        activo: true,
      },
    });
  });

  // ===========================================================================
  // 1. Cambio autenticado de contraseña
  // ===========================================================================
  describe('1. Cambio autenticado de contraseña (PATCH /api/v1/auth/contrasena/cambiar)', () => {
    it('debe cambiar la contraseña, invalidar el access token previo y permitir login con la nueva clave', async () => {
      const server = app.getHttpServer() as Parameters<typeof request>[0];

      // 1. Login inicial para obtener tokens
      const loginRes = await request(server).post('/api/v1/auth/login').send({
        correo: seed.empresaA.usuarios.admin.correo,
        contrasena: 'Password123!',
      });
      expect(loginRes.status).toBe(200);
      const { accessToken: oldAccessToken, refreshToken: oldRefreshToken } =
        loginRes.body as {
          accessToken: string;
          refreshToken: string;
        };

      // 2. Cambiar contraseña exitosamente
      const nuevaClave = 'NuevaPassword456!';
      const cambiarRes = await request(server)
        .patch('/api/v1/auth/contrasena/cambiar')
        .set('Authorization', `Bearer ${oldAccessToken}`)
        .send({
          contrasenaActual: 'Password123!',
          nuevaContrasena: nuevaClave,
        });

      expect(cambiarRes.status).toBe(200);
      expect((cambiarRes.body as { mensaje: string }).mensaje).toContain(
        'Contraseña actualizada exitosamente',
      );

      // Sin sleep: asegurar que cambioContrasenaEn quede posterior al token previo para probar invalidación
      await prisma.usuario.update({
        where: { id: seed.empresaA.usuarios.admin.id },
        data: { cambioContrasenaEn: new Date(Date.now() + 5000) },
      });

      // 3. El access token viejo debe ser rechazado inmediatamente con 401 en endpoints protegidos
      const meRes = await request(server)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${oldAccessToken}`);

      expect(meRes.status).toBe(401);
      expect((meRes.body as { code: string }).code).toBe(
        CodigoError.NO_AUTENTICADO,
      );

      // RN-076: El refresh token previo debe haber sido revocado y no permitir rotación
      const refreshViejoRes = await request(server)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: oldRefreshToken });
      expect(refreshViejoRes.status).toBe(401);

      // Ajustar cambioContrasenaEn al pasado para permitir login con nuevo token emitido ahora
      await prisma.usuario.update({
        where: { id: seed.empresaA.usuarios.admin.id },
        data: { cambioContrasenaEn: new Date(Date.now() - 5000) },
      });

      // 4. Intentar login con la clave vieja -> 401
      const loginViejoRes = await request(server)
        .post('/api/v1/auth/login')
        .send({
          correo: seed.empresaA.usuarios.admin.correo,
          contrasena: 'Password123!',
        });
      expect(loginViejoRes.status).toBe(401);

      // 5. Login con la nueva clave -> 200 OK
      const loginNuevoRes = await request(server)
        .post('/api/v1/auth/login')
        .send({
          correo: seed.empresaA.usuarios.admin.correo,
          contrasena: nuevaClave,
        });
      expect(loginNuevoRes.status).toBe(200);
    });

    it('debe rechazar con 400 CONTRASENA_ACTUAL_INCORRECTA si la clave actual no coincide', async () => {
      const server = app.getHttpServer() as Parameters<typeof request>[0];

      const loginRes = await request(server).post('/api/v1/auth/login').send({
        correo: seed.empresaA.usuarios.admin.correo,
        contrasena: 'Password123!',
      });
      expect(loginRes.status).toBe(200);
      const { accessToken } = loginRes.body as { accessToken: string };

      const res = await request(server)
        .patch('/api/v1/auth/contrasena/cambiar')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          contrasenaActual: 'ClaveIncorrecta999!',
          nuevaContrasena: 'OtraClaveSegura123!',
        });

      expect(res.status).toBe(400);
      expect((res.body as { code: string }).code).toBe(
        CodigoError.CONTRASENA_ACTUAL_INCORRECTA,
      );
    });

    it('debe permitir cambiar contraseña a un usuario cuya empresa tiene suscripción VENCIDA (RN-038 allowlist)', async () => {
      const server = app.getHttpServer() as Parameters<typeof request>[0];

      const empresaB = await prisma.empresa.findUniqueOrThrow({
        where: { id: seed.empresaB.id },
      });
      const estadoOriginal = empresaB.estadoSuscripcion;

      await prisma.empresa.update({
        where: { id: empresaB.id },
        data: { estadoSuscripcion: EstadoSuscripcion.VENCIDA },
      });

      try {
        const loginRes = await request(server).post('/api/v1/auth/login').send({
          correo: seed.empresaB.usuarios.admin.correo,
          contrasena: 'Password123!',
        });
        expect(loginRes.status).toBe(200);
        const { accessToken } = loginRes.body as { accessToken: string };

        const res = await request(server)
          .patch('/api/v1/auth/contrasena/cambiar')
          .set('Authorization', `Bearer ${accessToken}`)
          .send({
            contrasenaActual: 'Password123!',
            nuevaContrasena: 'Password123!',
          });

        expect(res.status).toBe(200);
      } finally {
        await prisma.empresa.update({
          where: { id: empresaB.id },
          data: { estadoSuscripcion: estadoOriginal },
        });
      }
    });
  });

  // ===========================================================================
  // 2. Solicitud de recuperación de contraseña (anti-enumeración y correo)
  // ===========================================================================
  describe('2. Solicitud de recuperación (POST /api/v1/auth/contrasena/solicitar-recuperacion)', () => {
    it('anti-enumeración: responde 200 con mensaje genérico y no envía correo si el email no existe', async () => {
      const server = app.getHttpServer() as Parameters<typeof request>[0];

      const res = await request(server)
        .post('/api/v1/auth/contrasena/solicitar-recuperacion')
        .send({
          correo: 'correo_que_no_existe_jamas_12345@dominio-inexistente.com',
        });

      expect(res.status).toBe(200);
      expect((res.body as { mensaje: string }).mensaje).toContain(
        'Si el correo electrónico está registrado, recibirá las instrucciones para restablecer su contraseña.',
      );
      expect(memoryTransport.obtenerCorreos().length).toBe(0);
    });

    it('anti-enumeración: responde 200 con mensaje genérico y no envía correo si el usuario está inactivo', async () => {
      const server = app.getHttpServer() as Parameters<typeof request>[0];

      await prisma.usuario.update({
        where: { id: seed.empresaA.usuarios.capturista.id },
        data: { activo: false },
      });

      try {
        const res = await request(server)
          .post('/api/v1/auth/contrasena/solicitar-recuperacion')
          .send({
            correo: seed.empresaA.usuarios.capturista.correo,
          });

        expect(res.status).toBe(200);
        expect((res.body as { mensaje: string }).mensaje).toContain(
          'Si el correo electrónico está registrado, recibirá las instrucciones para restablecer su contraseña.',
        );
        expect(memoryTransport.obtenerCorreos().length).toBe(0);
      } finally {
        await prisma.usuario.update({
          where: { id: seed.empresaA.usuarios.capturista.id },
          data: { activo: true },
        });
      }
    });

    it('flujo exitoso: genera token uniuso en BD y despacha correo con enlace de recuperación', async () => {
      const server = app.getHttpServer() as Parameters<typeof request>[0];

      const res = await request(server)
        .post('/api/v1/auth/contrasena/solicitar-recuperacion')
        .send({
          correo: seed.empresaA.usuarios.admin.correo,
        });

      expect(res.status).toBe(200);
      expect((res.body as { mensaje: string }).mensaje).toContain(
        'Si el correo electrónico está registrado, recibirá las instrucciones para restablecer su contraseña.',
      );

      await mailService.esperarEnviosPendientes();

      const enviados = memoryTransport.obtenerCorreos();
      expect(enviados.length).toBe(1);
      expect(enviados[0].destinatario).toBe(
        seed.empresaA.usuarios.admin.correo,
      );
      expect(enviados[0].asunto).toContain('Restablecimiento de Contraseña');
      expect(enviados[0].contenidoHtml).toContain('token=');

      const tokensEnBd = await prisma.passwordResetToken.findMany({
        where: { usuarioId: seed.empresaA.usuarios.admin.id },
      });
      expect(tokensEnBd.length).toBeGreaterThan(0);
      const ultimoToken = tokensEnBd[tokensEnBd.length - 1];
      expect(ultimoToken.usadoEn).toBeNull();
      expect(ultimoToken.revocadoEn).toBeNull();
      expect(ultimoToken.tokenHash).toHaveLength(64);
    });

    it('R1 Anti-enumeración y cuota: al 4.º intento en 15 min responde 200 idéntico sin generar nuevo token ni despachar correo', async () => {
      const server = app.getHttpServer() as Parameters<typeof request>[0];
      const correoUsuario = seed.empresaA.usuarios.capturista.correo;
      const usuarioId = seed.empresaA.usuarios.capturista.id;

      await prisma.passwordResetToken.deleteMany({
        where: { usuarioId },
      });
      memoryTransport.limpiar();

      for (let i = 1; i <= 3; i++) {
        const res = await request(server)
          .post('/api/v1/auth/contrasena/solicitar-recuperacion')
          .send({ correo: correoUsuario });
        expect(res.status).toBe(200);
      }
      await mailService.esperarEnviosPendientes();

      expect(memoryTransport.obtenerCorreos().length).toBe(3);
      const tokensAntes = await prisma.passwordResetToken.count({
        where: { usuarioId },
      });
      expect(tokensAntes).toBe(3);

      const res4 = await request(server)
        .post('/api/v1/auth/contrasena/solicitar-recuperacion')
        .send({ correo: correoUsuario });
      await mailService.esperarEnviosPendientes();

      expect(res4.status).toBe(200);
      expect((res4.body as { mensaje: string }).mensaje).toContain(
        'Si el correo electrónico está registrado, recibirá las instrucciones para restablecer su contraseña.',
      );
      expect(memoryTransport.obtenerCorreos().length).toBe(3);
      const tokensDespues = await prisma.passwordResetToken.count({
        where: { usuarioId },
      });
      expect(tokensDespues).toBe(3);
    });

    it('R1 Anti-enumeración: si MailService falla, revoca el token en BD y responde 200 OK idéntico sin propagar 500/503', async () => {
      const server = app.getHttpServer() as Parameters<typeof request>[0];
      const correoUsuario = seed.empresaA.usuarios.admin.correo;
      const usuarioId = seed.empresaA.usuarios.admin.id;

      memoryTransport.simularFalloProximoEnvio(
        new Error('Brevo service unavailable 503'),
      );

      const res = await request(server)
        .post('/api/v1/auth/contrasena/solicitar-recuperacion')
        .send({ correo: correoUsuario });

      expect(res.status).toBe(200);
      expect((res.body as { mensaje: string }).mensaje).toContain(
        'Si el correo electrónico está registrado, recibirá las instrucciones para restablecer su contraseña.',
      );

      await mailService.esperarEnviosPendientes();

      const tokens = await prisma.passwordResetToken.findMany({
        where: { usuarioId },
        orderBy: { id: 'desc' },
        take: 1,
      });
      expect(tokens.length).toBe(1);
      expect(tokens[0].revocadoEn).not.toBeNull();
    });

    it('B3 Anti-enumeración exhaustiva: compara status 200, body, content-type y content-length exacto entre los 6 casos', async () => {
      const server = app.getHttpServer() as Parameters<typeof request>[0];
      const adminA = seed.empresaA.usuarios.admin;
      const capturistaA = seed.empresaA.usuarios.capturista;
      const contadorA = seed.empresaA.usuarios.contador;
      const adminB = seed.empresaB.usuarios.admin;

      // 1. Correo inexistente
      const resInexistente = await request(server)
        .post('/api/v1/auth/contrasena/solicitar-recuperacion')
        .send({ correo: 'inexistente_b3_xyz987@dominio-fantasma.com' });

      // 2. Usuario inactivo
      await prisma.usuario.update({
        where: { id: capturistaA.id },
        data: { activo: false },
      });
      let resUsuarioInactivo: request.Response;
      try {
        resUsuarioInactivo = await request(server)
          .post('/api/v1/auth/contrasena/solicitar-recuperacion')
          .send({ correo: capturistaA.correo });
      } finally {
        await prisma.usuario.update({
          where: { id: capturistaA.id },
          data: { activo: true },
        });
      }

      // 3. Empresa inactiva
      await prisma.empresa.update({
        where: { id: seed.empresaB.id },
        data: { activo: false },
      });
      let resEmpresaInactiva: request.Response;
      try {
        resEmpresaInactiva = await request(server)
          .post('/api/v1/auth/contrasena/solicitar-recuperacion')
          .send({ correo: adminB.correo });
      } finally {
        await prisma.empresa.update({
          where: { id: seed.empresaB.id },
          data: { activo: true },
        });
      }

      // 4. Cuota de 3 tokens excedida
      await prisma.passwordResetToken.deleteMany({
        where: { usuarioId: contadorA.id },
      });
      for (let i = 0; i < 3; i++) {
        await prisma.passwordResetToken.create({
          data: {
            usuarioId: contadorA.id,
            tokenHash: `hash_mock_cuota_${i}_${Date.now()}`,
            expiraEn: new Date(Date.now() + 15 * 60 * 1000),
            createdAt: new Date(),
          },
        });
      }
      const resCuota = await request(server)
        .post('/api/v1/auth/contrasena/solicitar-recuperacion')
        .send({ correo: contadorA.correo });

      // 5. Fallo de Brevo (transporte)
      memoryTransport.simularFalloProximoEnvio(
        new Error('Brevo timeout connection simulated 504'),
      );
      const resFalloBrevo = await request(server)
        .post('/api/v1/auth/contrasena/solicitar-recuperacion')
        .send({ correo: adminA.correo });

      // 6. Caso feliz
      memoryTransport.limpiar();
      const resCasoFeliz = await request(server)
        .post('/api/v1/auth/contrasena/solicitar-recuperacion')
        .send({ correo: adminA.correo });

      await mailService.esperarEnviosPendientes();

      const respuestas = [
        { nombre: 'correo inexistente', res: resInexistente },
        { nombre: 'usuario inactivo', res: resUsuarioInactivo },
        { nombre: 'empresa inactiva', res: resEmpresaInactiva },
        { nombre: 'cuota excedida', res: resCuota },
        { nombre: 'fallo transporte Brevo', res: resFalloBrevo },
        { nombre: 'caso feliz', res: resCasoFeliz },
      ];

      const longitudEsperada = resInexistente.headers['content-length'];

      for (const item of respuestas) {
        expect(item.res.status).toBe(200);
        expect(item.res.headers['content-type']).toBe(
          'application/json; charset=utf-8',
        );
        expect(item.res.body).toEqual({
          mensaje:
            'Si el correo electrónico está registrado, recibirá las instrucciones para restablecer su contraseña.',
        });
        expect(item.res.headers['content-length']).toBe(longitudEsperada);
      }
    });
  });

  // ===========================================================================
  // 3. Restablecimiento de contraseña
  // ===========================================================================
  describe('3. Restablecimiento de contraseña (POST /api/v1/auth/contrasena/restablecer)', () => {
    it('debe consumir el token de forma atómica y actualizar la contraseña (Trampa 2)', async () => {
      const server = app.getHttpServer() as Parameters<typeof request>[0];

      // Login inicial del contador para obtener sesión activa previa
      const loginPrevioRes = await request(server)
        .post('/api/v1/auth/login')
        .send({
          correo: seed.empresaA.usuarios.contador.correo,
          contrasena: 'Password123!',
        });
      expect(loginPrevioRes.status).toBe(200);
      const { refreshToken: oldRefreshToken } = loginPrevioRes.body as {
        refreshToken: string;
      };

      await request(server)
        .post('/api/v1/auth/contrasena/solicitar-recuperacion')
        .send({
          correo: seed.empresaA.usuarios.contador.correo,
        });

      await mailService.esperarEnviosPendientes();

      const enviados = memoryTransport.obtenerCorreos();
      expect(enviados.length).toBe(1);
      const emailBody = enviados[0].contenidoHtml;

      const match = emailBody.match(/token=([a-f0-9]{64})/);
      expect(match).not.toBeNull();
      const token = match![1];

      const nuevaClave = 'RestablecidaSegura789!';
      const res = await request(server)
        .post('/api/v1/auth/contrasena/restablecer')
        .send({
          token,
          nuevaContrasena: nuevaClave,
        });

      expect(res.status).toBe(200);
      expect((res.body as { mensaje: string }).mensaje).toContain(
        'Contraseña restablecida exitosamente',
      );

      const tokens = await prisma.passwordResetToken.findMany({
        where: { usuarioId: seed.empresaA.usuarios.contador.id },
      });
      const tokenConsumido = tokens[tokens.length - 1];
      expect(tokenConsumido.usadoEn).not.toBeNull();

      const reusoRes = await request(server)
        .post('/api/v1/auth/contrasena/restablecer')
        .send({
          token,
          nuevaContrasena: 'OtraClaveCualquiera123!',
        });

      expect(reusoRes.status).toBe(400);
      expect((reusoRes.body as { code: string }).code).toBe(
        CodigoError.TOKEN_RECUPERACION_INVALIDO,
      );

      const loginRes = await request(server).post('/api/v1/auth/login').send({
        correo: seed.empresaA.usuarios.contador.correo,
        contrasena: nuevaClave,
      });
      expect(loginRes.status).toBe(200);

      // RN-076: El refresh token previo al restablecimiento debe haber sido revocado
      const refreshViejoRes = await request(server)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: oldRefreshToken });
      expect(refreshViejoRes.status).toBe(401);
    });

    it('5 peticiones concurrentes con el mismo token: exactamente 1 tiene éxito y 4 son rechazadas con 400 TOKEN_RECUPERACION_INVALIDO', async () => {
      const server = app.getHttpServer() as Parameters<typeof request>[0];

      await prisma.passwordResetToken.deleteMany({
        where: { usuarioId: seed.empresaA.usuarios.capturista.id },
      });
      memoryTransport.limpiar();

      await request(server)
        .post('/api/v1/auth/contrasena/solicitar-recuperacion')
        .send({
          correo: seed.empresaA.usuarios.capturista.correo,
        });

      const enviados = memoryTransport.obtenerCorreos();
      const match =
        enviados[enviados.length - 1].contenidoHtml.match(
          /token=([a-f0-9]{64})/,
        );
      expect(match).not.toBeNull();
      const token = match![1];

      const promesas = Array.from({ length: 5 }, (_, idx) =>
        request(server)
          .post('/api/v1/auth/contrasena/restablecer')
          .send({
            token,
            nuevaContrasena: `ClaveConcurrente${idx}!`,
          }),
      );

      const respuestas = await Promise.all(promesas);
      const exitos = respuestas.filter((r) => r.status === 200);
      const fallos = respuestas.filter(
        (r) =>
          r.status === 400 &&
          (r.body as { code: string }).code ===
            (CodigoError.TOKEN_RECUPERACION_INVALIDO as string),
      );

      expect(exitos.length).toBe(1);
      expect(fallos.length).toBe(4);
    });

    it('debe rechazar con 400 TOKEN_RECUPERACION_INVALIDO si el token expiró', async () => {
      const server = app.getHttpServer() as Parameters<typeof request>[0];

      await request(server)
        .post('/api/v1/auth/contrasena/solicitar-recuperacion')
        .send({
          correo: seed.empresaA.usuarios.contador.correo,
        });

      await mailService.esperarEnviosPendientes();

      const enviados = memoryTransport.obtenerCorreos();
      const match =
        enviados[enviados.length - 1].contenidoHtml.match(
          /token=([a-f0-9]{64})/,
        );
      const token = match![1];

      await prisma.passwordResetToken.updateMany({
        where: { usuarioId: seed.empresaA.usuarios.contador.id },
        data: { expiraEn: new Date(Date.now() - 60000) },
      });

      const res = await request(server)
        .post('/api/v1/auth/contrasena/restablecer')
        .send({
          token,
          nuevaContrasena: 'Password123!',
        });

      expect(res.status).toBe(400);
      expect((res.body as { code: string }).code).toBe(
        CodigoError.TOKEN_RECUPERACION_INVALIDO,
      );
    });

    it('debe rechazar con 400 TOKEN_RECUPERACION_INVALIDO si el token es inexistente o basura', async () => {
      const server = app.getHttpServer() as Parameters<typeof request>[0];

      const res = await request(server)
        .post('/api/v1/auth/contrasena/restablecer')
        .send({
          token: 'a'.repeat(64),
          nuevaContrasena: 'Password123!',
        });

      expect(res.status).toBe(400);
      expect((res.body as { code: string }).code).toBe(
        CodigoError.TOKEN_RECUPERACION_INVALIDO,
      );
    });
  });

  // ===========================================================================
  // 4. Auditoría de Seguridad (RN-074)
  // ===========================================================================
  describe('4. Auditoría de Seguridad (RN-074)', () => {
    it('debe registrar CAMBIO_CONTRASENA y RESTABLECIMIENTO_CONTRASENA sin filtrar contraseñas ni tokens', async () => {
      const auditorias = await prisma.bitacoraAuditoria.findMany({
        where: {
          accion: {
            in: [
              AccionAuditoria.CAMBIO_CONTRASENA,
              AccionAuditoria.RESTABLECIMIENTO_CONTRASENA,
            ],
          },
        },
      });

      expect(auditorias.length).toBeGreaterThan(0);
      for (const reg of auditorias) {
        const detallesStr = JSON.stringify(reg.detalles || {});
        expect(detallesStr).not.toContain('Password123!');
        expect(detallesStr).not.toContain('NuevaPassword456!');
        expect(detallesStr).not.toContain('RestablecidaSegura789!');
        expect(detallesStr).not.toContain('contrasenaActual');
        expect(detallesStr).not.toContain('nuevaContrasena');
      }
    });
  });

  // ===========================================================================
  // 5. Throttlers nombrados en contraseñas (THROTTLE_ENABLED=true)
  // ===========================================================================
  describe('5. Throttlers nombrados en contraseñas (THROTTLE_ENABLED=true)', () => {
    let throttledApp: INestApplication;

    beforeAll(async () => {
      const moduleFixture: TestingModule = await Test.createTestingModule({
        imports: [AppModule],
      })
        .overrideProvider(getOptionsToken())
        .useValue(
          crearThrottlerOptions({
            enabled: true,
            recuperarIpLimit: 5,
            recuperarIpTtlMs: 900_000,
            recuperarCorreoLimit: 3,
            recuperarCorreoTtlMs: 900_000,
            restablecerIpLimit: 10,
            restablecerIpTtlMs: 900_000,
            cambiarUsuarioLimit: 5,
            cambiarUsuarioTtlMs: 900_000,
          }),
        )
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
      if (throttledApp) {
        await throttledApp.close();
      }
    });

    it('demostración de TTL en milisegundos: @nestjs/throttler v6 utiliza milisegundos en configuración (900_000 ms = 15 min)', () => {
      const opciones = crearThrottlerOptions({ enabled: true });
      const throttlers = (
        opciones as {
          throttlers: Array<{ name: string; ttl: number; limit: number }>;
        }
      ).throttlers;

      const recuperarIp = throttlers.find((t) => t.name === 'recuperar-ip');
      const recuperarCorreo = throttlers.find(
        (t) => t.name === 'recuperar-correo',
      );
      const restablecerIp = throttlers.find((t) => t.name === 'restablecer-ip');
      const cambiarUsuario = throttlers.find(
        (t) => t.name === 'cambiar-usuario',
      );

      expect(recuperarIp).toBeDefined();
      expect(recuperarIp?.ttl).toBe(900_000);
      expect(recuperarIp?.limit).toBe(5);

      expect(recuperarCorreo).toBeDefined();
      expect(recuperarCorreo?.ttl).toBe(900_000);
      expect(recuperarCorreo?.limit).toBe(3);

      expect(restablecerIp).toBeDefined();
      expect(restablecerIp?.ttl).toBe(900_000);
      expect(restablecerIp?.limit).toBe(10);

      expect(cambiarUsuario).toBeDefined();
      expect(cambiarUsuario?.ttl).toBe(900_000);
      expect(cambiarUsuario?.limit).toBe(5);
    });

    it('recuperar-correo: la 4.ª petición con el mismo correo responde 429 DEMASIADAS_PETICIONES', async () => {
      const server = throttledApp.getHttpServer() as Parameters<
        typeof request
      >[0];
      const correo = `throttle.correo.${Date.now()}@rentabilidad.com`;

      for (let i = 1; i <= 3; i++) {
        const res = await request(server)
          .post('/api/v1/auth/contrasena/solicitar-recuperacion')
          .send({ correo });
        expect(res.status).toBe(200);
      }

      const res4 = await request(server)
        .post('/api/v1/auth/contrasena/solicitar-recuperacion')
        .send({ correo });

      expect(res4.status).toBe(429);
      expect((res4.body as { code: string }).code).toBe(
        CodigoError.DEMASIADAS_PETICIONES,
      );
      expect(res4.headers['retry-after']).toBeDefined();
    });

    it('recuperar-ip: la 6.ª petición desde la misma IP responde 429 DEMASIADAS_PETICIONES', async () => {
      const server = throttledApp.getHttpServer() as Parameters<
        typeof request
      >[0];

      for (let i = 1; i <= 5; i++) {
        const res = await request(server)
          .post('/api/v1/auth/contrasena/solicitar-recuperacion')
          .send({ correo: `ip.distinto.${i}.${Date.now()}@rentabilidad.com` });
        if (res.status === 429) {
          expect((res.body as { code: string }).code).toBe(
            CodigoError.DEMASIADAS_PETICIONES,
          );
          return;
        }
        expect(res.status).toBe(200);
      }

      const res6 = await request(server)
        .post('/api/v1/auth/contrasena/solicitar-recuperacion')
        .send({ correo: `ip.bloqueada.${Date.now()}@rentabilidad.com` });

      expect(res6.status).toBe(429);
      expect((res6.body as { code: string }).code).toBe(
        CodigoError.DEMASIADAS_PETICIONES,
      );
      expect(res6.headers['retry-after']).toBeDefined();
    });

    it('restablecer-ip: la 11.ª petición desde la misma IP responde 429 DEMASIADAS_PETICIONES', async () => {
      const server = throttledApp.getHttpServer() as Parameters<
        typeof request
      >[0];

      for (let i = 1; i <= 10; i++) {
        const res = await request(server)
          .post('/api/v1/auth/contrasena/restablecer')
          .send({
            token: 'b'.repeat(64),
            nuevaContrasena: 'Password123!',
          });
        if (res.status === 429) {
          expect((res.body as { code: string }).code).toBe(
            CodigoError.DEMASIADAS_PETICIONES,
          );
          return;
        }
        expect(res.status).toBe(400);
      }

      const res11 = await request(server)
        .post('/api/v1/auth/contrasena/restablecer')
        .send({
          token: 'b'.repeat(64),
          nuevaContrasena: 'Password123!',
        });

      expect(res11.status).toBe(429);
      expect((res11.body as { code: string }).code).toBe(
        CodigoError.DEMASIADAS_PETICIONES,
      );
      expect(res11.headers['retry-after']).toBeDefined();
    });

    it('cambiar-usuario: la 6.ª petición de cambio de contraseña responde 429 DEMASIADAS_PETICIONES', async () => {
      const server = throttledApp.getHttpServer() as Parameters<
        typeof request
      >[0];

      // Login del capturista para obtener access token fresco
      const loginRes = await request(server).post('/api/v1/auth/login').send({
        correo: seed.empresaA.usuarios.capturista.correo,
        contrasena: 'Password123!',
      });
      expect(loginRes.status).toBe(200);
      const { accessToken } = loginRes.body as { accessToken: string };

      for (let i = 1; i <= 5; i++) {
        const res = await request(server)
          .patch('/api/v1/auth/contrasena/cambiar')
          .set('Authorization', `Bearer ${accessToken}`)
          .send({
            contrasenaActual: 'ClaveErronea123!',
            nuevaContrasena: 'NuevaPassword456!',
          });
        if (res.status === 429) {
          expect((res.body as { code: string }).code).toBe(
            CodigoError.DEMASIADAS_PETICIONES,
          );
          return;
        }
        expect(res.status).toBe(400);
      }

      const res6 = await request(server)
        .patch('/api/v1/auth/contrasena/cambiar')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          contrasenaActual: 'ClaveErronea123!',
          nuevaContrasena: 'NuevaPassword456!',
        });

      expect(res6.status).toBe(429);
      expect((res6.body as { code: string }).code).toBe(
        CodigoError.DEMASIADAS_PETICIONES,
      );
      expect(res6.headers['retry-after']).toBeDefined();
    });
  });
});
