import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { EstadoSuscripcion } from '@prisma/client';
import * as argon2 from 'argon2';
import { createTestApp } from '../setup/create-test-app';
import { PrismaService } from '../../src/prisma/prisma.service';
import { getOrLoadSeedData, E2eSeedData } from '../setup/e2e-seed';
import { CodigoError } from '../../src/common/errors/codigos-error.enum';
import { MailService } from '../../src/modules/mail/mail.service';
import { MemoryTransport } from '../../src/modules/mail/transports/memory.transport';

describe('Hito 11E: Gestión de Contraseñas, Recuperación por Correo y Sesiones (E2E)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let seed: E2eSeedData;
  let memoryTransport: MemoryTransport;

  beforeAll(async () => {
    const testApp = await createTestApp();
    app = testApp.app;
    await app.listen(0);
    prisma = testApp.prisma;
    seed = await getOrLoadSeedData(prisma);
    const mailService = app.get(MailService);
    memoryTransport = mailService.getTransport() as MemoryTransport;
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  beforeEach(() => {
    if (memoryTransport && typeof memoryTransport.limpiar === 'function') {
      memoryTransport.limpiar();
    }
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
      const { accessToken: oldAccessToken } = loginRes.body as { accessToken: string };

      // Esperar al menos 1 segundo para asegurar que payload.iat quede estrictamente anterior a cambioContrasenaEn
      await new Promise((resolve) => setTimeout(resolve, 1100));

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

      // 3. El access token viejo debe ser rechazado inmediatamente con 401 en endpoints protegidos
      const meRes = await request(server)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${oldAccessToken}`);

      expect(meRes.status).toBe(401);
      expect((meRes.body as { code: string }).code).toBe(CodigoError.NO_AUTENTICADO);

      // 4. Intentar login con la clave vieja -> 401
      const loginViejoRes = await request(server).post('/api/v1/auth/login').send({
        correo: seed.empresaA.usuarios.admin.correo,
        contrasena: 'Password123!',
      });
      expect(loginViejoRes.status).toBe(401);

      // 5. Login con la nueva clave -> 200 OK
      const loginNuevoRes = await request(server).post('/api/v1/auth/login').send({
        correo: seed.empresaA.usuarios.admin.correo,
        contrasena: nuevaClave,
      });
      expect(loginNuevoRes.status).toBe(200);
      const { accessToken: newAccessToken } = loginNuevoRes.body as { accessToken: string };

      // Restaurar la contraseña original para no afectar otros tests
      await request(server)
        .patch('/api/v1/auth/contrasena/cambiar')
        .set('Authorization', `Bearer ${newAccessToken}`)
        .send({
          contrasenaActual: nuevaClave,
          nuevaContrasena: 'Password123!',
        });
    });

    it('debe rechazar con 400 CONTRASENA_ACTUAL_INCORRECTA si la clave actual no coincide', async () => {
      const server = app.getHttpServer() as Parameters<typeof request>[0];

      const loginRes = await request(server).post('/api/v1/auth/login').send({
        correo: seed.empresaA.usuarios.admin.correo,
        contrasena: 'Password123!',
      });
      const { accessToken } = loginRes.body as { accessToken: string };

      const res = await request(server)
        .patch('/api/v1/auth/contrasena/cambiar')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          contrasenaActual: 'ClaveIncorrecta999!',
          nuevaContrasena: 'OtraClaveSegura123!',
        });

      expect(res.status).toBe(400);
      expect((res.body as { code: string }).code).toBe(CodigoError.CONTRASENA_ACTUAL_INCORRECTA);
    });

    it('debe permitir cambiar contraseña a un usuario cuya empresa tiene suscripción VENCIDA (RN-038 allowlist)', async () => {
      const server = app.getHttpServer() as Parameters<typeof request>[0];

      // Cambiar estado de suscripción de empresa B a VENCIDA temporalmente
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

        // AccesoVigenteGuard permite /auth/contrasena/cambiar
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

      // Desactivar temporalmente al capturista de empresa A
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

      const enviados = memoryTransport.obtenerCorreos();
      expect(enviados.length).toBe(1);
      expect(enviados[0].destinatario).toBe(seed.empresaA.usuarios.admin.correo);
      expect(enviados[0].asunto).toContain('Restablecimiento de Contraseña');
      expect(enviados[0].contenidoHtml).toContain('token=');

      // Verificar que el token se guardó hasheado en BD
      const tokensEnBd = await prisma.passwordResetToken.findMany({
        where: { usuarioId: seed.empresaA.usuarios.admin.id },
      });
      expect(tokensEnBd.length).toBeGreaterThan(0);
      const ultimoToken = tokensEnBd[tokensEnBd.length - 1];
      expect(ultimoToken.usadoEn).toBeNull();
      expect(ultimoToken.revocadoEn).toBeNull();
      expect(ultimoToken.tokenHash).toHaveLength(64); // SHA-256 hex
    });
  });

  // ===========================================================================
  // 3. Restablecimiento de contraseña
  // ===========================================================================
  describe('3. Restablecimiento de contraseña (POST /api/v1/auth/contrasena/restablecer)', () => {
    it('debe consumir el token de forma atómica y actualizar la contraseña (Trampa 2)', async () => {
      const server = app.getHttpServer() as Parameters<typeof request>[0];

      // 1. Solicitar recuperación
      await request(server)
        .post('/api/v1/auth/contrasena/solicitar-recuperacion')
        .send({
          correo: seed.empresaA.usuarios.contador.correo,
        });

      const enviados = memoryTransport.obtenerCorreos();
      expect(enviados.length).toBe(1);
      const emailBody = enviados[0].contenidoHtml;

      // Extraer el token de la URL
      const match = emailBody.match(/token=([a-f0-9]{64})/);
      expect(match).not.toBeNull();
      const token = match![1];

      // 2. Restablecer contraseña
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

      // 3. Comprobar que en BD el token quedó consumido
      const tokens = await prisma.passwordResetToken.findMany({
        where: { usuarioId: seed.empresaA.usuarios.contador.id },
      });
      const tokenConsumido = tokens[tokens.length - 1];
      expect(tokenConsumido.usadoEn).not.toBeNull();

      // 4. Intentar reutilizar el MISMO token -> 400 TOKEN_RECUPERACION_INVALIDO
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

      // 5. Iniciar sesión con la nueva contraseña restablecida
      const loginRes = await request(server).post('/api/v1/auth/login').send({
        correo: seed.empresaA.usuarios.contador.correo,
        contrasena: nuevaClave,
      });
      expect(loginRes.status).toBe(200);

      // Restaurar contraseña original del contador
      const hashOriginal = await argon2.hash('Password123!', {
        type: argon2.argon2id,
        memoryCost: 19456,
        timeCost: 2,
        parallelism: 1,
      });
      await prisma.usuario.update({
        where: { id: seed.empresaA.usuarios.contador.id },
        data: { contrasenaHash: hashOriginal },
      });
    });

    it('debe rechazar con 400 TOKEN_RECUPERACION_INVALIDO si el token expiró', async () => {
      const server = app.getHttpServer() as Parameters<typeof request>[0];

      // Solicitar recuperación
      await request(server)
        .post('/api/v1/auth/contrasena/solicitar-recuperacion')
        .send({
          correo: seed.empresaA.usuarios.contador.correo,
        });

      const enviados = memoryTransport.obtenerCorreos();
      const match = enviados[0].contenidoHtml.match(/token=([a-f0-9]{64})/);
      const token = match![1];

      // Forzar expiración en BD colocando expiraEn en el pasado
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
            in: ['CAMBIO_CONTRASENA', 'RESTABLECIMIENTO_CONTRASENA'] as any,
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
});
