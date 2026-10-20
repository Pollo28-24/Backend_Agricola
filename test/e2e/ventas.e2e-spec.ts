import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { createTestApp } from '../setup/create-test-app';
import { PrismaService } from '../../src/prisma/prisma.service';
import {
  getOrLoadSeedData,
  crearCicloAisladoParaConcurrencia,
  E2eSeedData,
} from '../setup/e2e-seed';
import { generateTestJwt } from '../setup/test-tokens.util';
import { holdCicloLock, waitUntilBlocked } from '../setup/lock-gateway.util';
import { CodigoError } from '../../src/common/errors/codigos-error.enum';
import {
  CalidadCosecha,
  EstadoVenta,
  EtapaMerma,
  Prisma,
} from '@prisma/client';
import { calcularBalanceMasaKg } from '../../src/common/utils/ciclo-balance.util';

interface ApiResponseError {
  code?: string;
  message?: string;
}

describe('Hito 7: Módulo de Ventas y Control de Sobreventa (E2E)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let seed: E2eSeedData;

  let tokenA_Admin: string;
  let tokenA_Capturista: string;
  let tokenA_Contador: string;

  beforeAll(async () => {
    const testApp = await createTestApp();
    app = testApp.app;
    prisma = testApp.prisma;
    seed = await getOrLoadSeedData(prisma);

    tokenA_Admin = `Bearer ${generateTestJwt(
      seed.empresaA.usuarios.admin.id,
      seed.empresaA.id,
      'ADMIN',
    )}`;
    tokenA_Capturista = `Bearer ${generateTestJwt(
      seed.empresaA.usuarios.capturista.id,
      seed.empresaA.id,
      'CAPTURISTA',
    )}`;
    tokenA_Contador = `Bearer ${generateTestJwt(
      seed.empresaA.usuarios.contador.id,
      seed.empresaA.id,
      'CONTADOR',
    )}`;
  });

  afterAll(async () => {
    await app.close();
  });

  // =========================================================================
  // 1. AISLAMIENTO MULTIEMPRESA (404 ESTRICTO)
  // =========================================================================
  describe('1. Aislamiento multiempresa (404 estricto ante recursos de otra empresa)', () => {
    it('GET /api/v1/ventas/:id ajeno devuelve 404', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/ventas/${seed.empresaB.venta.id}`)
        .set('Authorization', tokenA_Admin);

      expect(res.status).toBe(404);
      expect((res.body as ApiResponseError).code).toBe(
        CodigoError.RECURSO_NO_ENCONTRADO,
      );
    });

    it('PATCH /api/v1/ventas/:id ajeno devuelve 404 y no muta en BD', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/ventas/${seed.empresaB.venta.id}`)
        .set('Authorization', tokenA_Admin)
        .send({ total: '9999.00' });

      expect(res.status).toBe(404);
      expect((res.body as ApiResponseError).code).toBe(
        CodigoError.RECURSO_NO_ENCONTRADO,
      );

      const ventaB = await prisma.venta.findUnique({
        where: { id: seed.empresaB.venta.id },
      });
      expect(Number(ventaB?.total)).not.toBe(9999);
    });

    it('PATCH /api/v1/ventas/:id/cancelar ajeno devuelve 404', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/ventas/${seed.empresaB.venta.id}/cancelar`)
        .set('Authorization', tokenA_Admin);

      expect(res.status).toBe(404);
      expect((res.body as ApiResponseError).code).toBe(
        CodigoError.RECURSO_NO_ENCONTRADO,
      );
    });

    it('POST /api/v1/ventas con cliente ajeno devuelve 404', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/ventas')
        .set('Authorization', tokenA_Admin)
        .send({
          cicloId: seed.empresaA.cicloActivo.id,
          clienteId: seed.empresaB.cliente.id,
          fecha: '2026-03-15',
          total: '25.00',
          renglones: [
            {
              unidadId: seed.global.unidadKgId,
              calidad: CalidadCosecha.PRIMERA,
              cantidad: '1.000',
              precioUnitario: '25.00',
            },
          ],
        });

      expect(res.status).toBe(404);
      expect((res.body as ApiResponseError).code).toBe(
        CodigoError.RECURSO_NO_ENCONTRADO,
      );
    });

    it('POST /api/v1/ventas con ciclo ajeno devuelve 404', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/ventas')
        .set('Authorization', tokenA_Admin)
        .send({
          cicloId: seed.empresaB.cicloActivo.id,
          clienteId: seed.empresaA.cliente.id,
          fecha: '2026-03-15',
          total: '25.00',
          renglones: [
            {
              unidadId: seed.global.unidadKgId,
              calidad: CalidadCosecha.PRIMERA,
              cantidad: '1.000',
              precioUnitario: '25.00',
            },
          ],
        });

      expect(res.status).toBe(404);
      expect((res.body as ApiResponseError).code).toBe(
        CodigoError.RECURSO_NO_ENCONTRADO,
      );
    });

    it('POST /api/v1/ventas con cosecha ajena en renglón devuelve 404', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/ventas')
        .set('Authorization', tokenA_Admin)
        .send({
          cicloId: seed.empresaA.cicloActivo.id,
          clienteId: seed.empresaA.cliente.id,
          fecha: '2026-03-15',
          total: '25.00',
          renglones: [
            {
              cosechaId: seed.empresaB.cosecha.id,
              unidadId: seed.global.unidadKgId,
              calidad: CalidadCosecha.PRIMERA,
              cantidad: '1.000',
              precioUnitario: '25.00',
            },
          ],
        });

      expect(res.status).toBe(404);
      expect((res.body as ApiResponseError).code).toBe(
        CodigoError.RECURSO_NO_ENCONTRADO,
      );
    });

    it('GET /api/v1/ventas de A nunca lista ventas de Empresa B', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/ventas')
        .set('Authorization', tokenA_Admin);

      expect(res.status).toBe(200);
      const resData = res.body as { data: Array<{ id: number }> };
      const ids = resData.data.map((v) => v.id);
      expect(ids).not.toContain(seed.empresaB.venta.id);
    });
  });

  // =========================================================================
  // 2. CONTROL DE ACCESO (RBAC RN-064)
  // =========================================================================
  describe('2. Control de acceso RBAC (RN-064)', () => {
    it('CAPTURISTA recibe 403 PERMISO_DENEGADO en todos los endpoints de ventas', async () => {
      const postRes = await request(app.getHttpServer())
        .post('/api/v1/ventas')
        .set('Authorization', tokenA_Capturista)
        .send({});
      expect(postRes.status).toBe(403);
      expect((postRes.body as ApiResponseError).code).toBe(
        CodigoError.PERMISO_DENEGADO,
      );

      const getRes = await request(app.getHttpServer())
        .get('/api/v1/ventas')
        .set('Authorization', tokenA_Capturista);
      expect(getRes.status).toBe(403);

      const getDetRes = await request(app.getHttpServer())
        .get(`/api/v1/ventas/${seed.empresaA.venta.id}`)
        .set('Authorization', tokenA_Capturista);
      expect(getDetRes.status).toBe(403);

      const patchRes = await request(app.getHttpServer())
        .patch(`/api/v1/ventas/${seed.empresaA.venta.id}`)
        .set('Authorization', tokenA_Capturista)
        .send({});
      expect(patchRes.status).toBe(403);

      const cancelRes = await request(app.getHttpServer())
        .patch(`/api/v1/ventas/${seed.empresaA.venta.id}/cancelar`)
        .set('Authorization', tokenA_Capturista);
      expect(cancelRes.status).toBe(403);
    });

    it('CONTADOR y ADMIN están autorizados a consultar ventas', async () => {
      const resContador = await request(app.getHttpServer())
        .get('/api/v1/ventas')
        .set('Authorization', tokenA_Contador);
      expect(resContador.status).toBe(200);

      const resAdmin = await request(app.getHttpServer())
        .get('/api/v1/ventas')
        .set('Authorization', tokenA_Admin);
      expect(resAdmin.status).toBe(200);
    });
  });

  // =========================================================================
  // 3. CONCURRENCIA: CONTROL DE SOBREVENTA (RN-027)
  // =========================================================================
  describe('3. Concurrencia real: Control de sobreventa (RN-027)', () => {
    it('dos ventas de 80 kg sobre 100 kg disponibles con compuerta de lock -> un 201 y un 409 VENTA_EXCEDE_DISPONIBLE', async () => {
      const cicloDed = await crearCicloAisladoParaConcurrencia(
        prisma,
        seed.empresaA.id,
        seed.empresaA.usuarios.admin.id,
        seed.global.variedadId,
      );

      // Cosecha aislada de 100 kg
      await prisma.cosecha.create({
        data: {
          cicloId: cicloDed.cicloId,
          unidadId: seed.global.unidadKgId,
          creadoPorId: seed.empresaA.usuarios.admin.id,
          fecha: new Date('2026-02-01'),
          cantidad: new Prisma.Decimal('100.000'),
          calidad: CalidadCosecha.PRIMERA,
        },
      });

      // Retener lock del ciclo
      const lockHolder = await holdCicloLock(cicloDed.cicloId);

      const ventaPayload = {
        cicloId: cicloDed.cicloId,
        clienteId: seed.empresaA.cliente.id,
        fecha: '2026-02-15',
        total: '2000.00',
        renglones: [
          {
            unidadId: seed.global.unidadKgId,
            calidad: CalidadCosecha.PRIMERA,
            cantidad: '80.000',
            precioUnitario: '25.00',
          },
        ],
      };

      const promVenta1 = request(app.getHttpServer())
        .post('/api/v1/ventas')
        .set('Authorization', tokenA_Admin)
        .send(ventaPayload);

      const promVenta2 = request(app.getHttpServer())
        .post('/api/v1/ventas')
        .set('Authorization', tokenA_Admin)
        .send(ventaPayload);

      await waitUntilBlocked(prisma, 2, 5000);
      await lockHolder.commit();

      const [res1, res2] = await Promise.all([promVenta1, promVenta2]);
      const statuses = [res1.status, res2.status].sort();
      expect(statuses).toEqual([201, 409]);

      const errorRes = res1.status === 409 ? res1 : res2;
      expect((errorRes.body as ApiResponseError).code).toBe(
        CodigoError.VENTA_EXCEDE_DISPONIBLE,
      );

      // En BD queda una sola venta
      const ventasEnBD = await prisma.venta.findMany({
        where: { cicloId: cicloDed.cicloId, deletedAt: null },
      });
      expect(ventasEnBD.length).toBe(1);
    });
  });

  // =========================================================================
  // 4. CONCURRENCIA: VENTA VS MERMA POSCOSECHA (RN-070)
  // =========================================================================
  describe('4. Concurrencia real: Venta nueva vs Merma poscosecha (RN-070)', () => {
    it('cosecha 1000 kg, venta 500 kg: venta 300 kg y merma poscosecha 300 kg simultáneas -> una gana, la otra 409', async () => {
      const cicloDed = await crearCicloAisladoParaConcurrencia(
        prisma,
        seed.empresaA.id,
        seed.empresaA.usuarios.admin.id,
        seed.global.variedadId,
      );

      const cosecha = await prisma.cosecha.create({
        data: {
          cicloId: cicloDed.cicloId,
          unidadId: seed.global.unidadKgId,
          creadoPorId: seed.empresaA.usuarios.admin.id,
          fecha: new Date('2026-02-01'),
          cantidad: new Prisma.Decimal('1000.000'),
          calidad: CalidadCosecha.PRIMERA,
        },
      });

      // Venta base de 500 kg
      await prisma.venta.create({
        data: {
          cicloId: cicloDed.cicloId,
          clienteId: seed.empresaA.cliente.id,
          creadoPorId: seed.empresaA.usuarios.admin.id,
          fecha: new Date('2026-02-10'),
          total: new Prisma.Decimal('12500.00'),
          estado: EstadoVenta.REGISTRADA,
          detalles: {
            create: [
              {
                cosechaId: cosecha.id,
                unidadId: seed.global.unidadKgId,
                calidad: CalidadCosecha.PRIMERA,
                cantidad: new Prisma.Decimal('500.000'),
                precioUnitario: new Prisma.Decimal('25.00'),
              },
            ],
          },
        },
      });

      const lockHolder = await holdCicloLock(cicloDed.cicloId);

      const promVenta = request(app.getHttpServer())
        .post('/api/v1/ventas')
        .set('Authorization', tokenA_Admin)
        .send({
          cicloId: cicloDed.cicloId,
          clienteId: seed.empresaA.cliente.id,
          fecha: '2026-02-15',
          total: '7500.00',
          renglones: [
            {
              cosechaId: cosecha.id,
              unidadId: seed.global.unidadKgId,
              calidad: CalidadCosecha.PRIMERA,
              cantidad: '300.000',
              precioUnitario: '25.00',
            },
          ],
        });

      const promMerma = request(app.getHttpServer())
        .post('/api/v1/mermas')
        .set('Authorization', tokenA_Admin)
        .send({
          cicloId: cicloDed.cicloId,
          cosechaId: cosecha.id,
          unidadId: seed.global.unidadKgId,
          motivoId: seed.global.motivoMermaId,
          fecha: '2026-02-15',
          cantidad: 300,
          etapa: EtapaMerma.POSCOSECHA,
        });

      await waitUntilBlocked(prisma, 2, 5000);
      await lockHolder.commit();

      const [resVenta, resMerma] = await Promise.all([promVenta, promMerma]);
      const statuses = [resVenta.status, resMerma.status].sort();
      expect(statuses).toEqual([201, 409]);

      const errorRes = resVenta.status === 409 ? resVenta : resMerma;
      expect([
        CodigoError.VENTA_EXCEDE_DISPONIBLE,
        CodigoError.KG_VENDIDOS_EXCEDEN_NETOS,
      ]).toContain((errorRes.body as ApiResponseError).code);
    });
  });

  // =========================================================================
  // 5. CONCURRENCIA: VENTA VS PATCH DE COSECHA
  // =========================================================================
  describe('5. Concurrencia real: Venta nueva vs PATCH de cosecha', () => {
    it('cosecha 1000 kg, ventas 400 kg: PATCH cosecha a 700 kg y venta nueva de 400 kg simultáneas -> una gana, la otra 409', async () => {
      const cicloDed = await crearCicloAisladoParaConcurrencia(
        prisma,
        seed.empresaA.id,
        seed.empresaA.usuarios.admin.id,
        seed.global.variedadId,
      );

      const cosecha = await prisma.cosecha.create({
        data: {
          cicloId: cicloDed.cicloId,
          unidadId: seed.global.unidadKgId,
          creadoPorId: seed.empresaA.usuarios.admin.id,
          fecha: new Date('2026-02-01'),
          cantidad: new Prisma.Decimal('1000.000'),
          calidad: CalidadCosecha.PRIMERA,
        },
      });

      // Venta base de 400 kg
      await prisma.venta.create({
        data: {
          cicloId: cicloDed.cicloId,
          clienteId: seed.empresaA.cliente.id,
          creadoPorId: seed.empresaA.usuarios.admin.id,
          fecha: new Date('2026-02-10'),
          total: new Prisma.Decimal('10000.00'),
          estado: EstadoVenta.REGISTRADA,
          detalles: {
            create: [
              {
                cosechaId: cosecha.id,
                unidadId: seed.global.unidadKgId,
                calidad: CalidadCosecha.PRIMERA,
                cantidad: new Prisma.Decimal('400.000'),
                precioUnitario: new Prisma.Decimal('25.00'),
              },
            ],
          },
        },
      });

      const lockHolder = await holdCicloLock(cicloDed.cicloId);

      const promPatchCosecha = request(app.getHttpServer())
        .patch(`/api/v1/cosechas/${cosecha.id}`)
        .set('Authorization', tokenA_Admin)
        .send({ cantidad: '700' });

      const promVenta = request(app.getHttpServer())
        .post('/api/v1/ventas')
        .set('Authorization', tokenA_Admin)
        .send({
          cicloId: cicloDed.cicloId,
          clienteId: seed.empresaA.cliente.id,
          fecha: '2026-02-15',
          total: '10000.00',
          renglones: [
            {
              cosechaId: cosecha.id,
              unidadId: seed.global.unidadKgId,
              calidad: CalidadCosecha.PRIMERA,
              cantidad: '400.000',
              precioUnitario: '25.00',
            },
          ],
        });

      await waitUntilBlocked(prisma, 2, 5000);
      await lockHolder.commit();

      const [resCosecha, resVenta] = await Promise.all([
        promPatchCosecha,
        promVenta,
      ]);

      if (resVenta.status === 201) {
        expect(resCosecha.status).toBe(409);
        expect((resCosecha.body as ApiResponseError).code).toBe(
          CodigoError.KG_VENDIDOS_EXCEDEN_NETOS,
        );
      } else {
        expect(resCosecha.status).toBe(200);
        expect(resVenta.status).toBe(409);
        expect((resVenta.body as ApiResponseError).code).toBe(
          CodigoError.VENTA_EXCEDE_DISPONIBLE,
        );
      }
    });
  });

  // =========================================================================
  // 6. CARRERA CON EL CIERRE DEL CICLO
  // =========================================================================
  describe('6. Carrera con el cierre del ciclo (FINALIZADO sin commit)', () => {
    it('POST venta y PATCH cancelar esperan al cierre y reciben 409 CICLO_CERRADO tras commit', async () => {
      const cicloDed = await crearCicloAisladoParaConcurrencia(
        prisma,
        seed.empresaA.id,
        seed.empresaA.usuarios.admin.id,
        seed.global.variedadId,
      );

      // Cosecha de 500 kg
      const cosecha = await prisma.cosecha.create({
        data: {
          cicloId: cicloDed.cicloId,
          unidadId: seed.global.unidadKgId,
          creadoPorId: seed.empresaA.usuarios.admin.id,
          fecha: new Date('2026-02-01'),
          cantidad: new Prisma.Decimal('500.000'),
          calidad: CalidadCosecha.PRIMERA,
        },
      });

      // Venta registrada de 100 kg
      const ventaPrevia = await prisma.venta.create({
        data: {
          cicloId: cicloDed.cicloId,
          clienteId: seed.empresaA.cliente.id,
          creadoPorId: seed.empresaA.usuarios.admin.id,
          fecha: new Date('2026-02-10'),
          total: new Prisma.Decimal('2500.00'),
          estado: EstadoVenta.REGISTRADA,
          detalles: {
            create: [
              {
                cosechaId: cosecha.id,
                unidadId: seed.global.unidadKgId,
                calidad: CalidadCosecha.PRIMERA,
                cantidad: new Prisma.Decimal('100.000'),
                precioUnitario: new Prisma.Decimal('25.00'),
              },
            ],
          },
        },
      });

      // Retener lock y mutar ciclo a FINALIZADO dentro de la tx de MySQL
      const lockHolder = await holdCicloLock(cicloDed.cicloId, async (conn) => {
        await conn.query(
          "UPDATE ciclo_produccion SET estado = 'FINALIZADO', fechaFin = NOW() WHERE id = ?",
          [cicloDed.cicloId],
        );
      });

      // Disparar POST venta nueva y PATCH cancelar simultáneos
      const promPostVenta = request(app.getHttpServer())
        .post('/api/v1/ventas')
        .set('Authorization', tokenA_Admin)
        .send({
          cicloId: cicloDed.cicloId,
          clienteId: seed.empresaA.cliente.id,
          fecha: '2026-02-15',
          total: '2500.00',
          renglones: [
            {
              cosechaId: cosecha.id,
              unidadId: seed.global.unidadKgId,
              calidad: CalidadCosecha.PRIMERA,
              cantidad: '100.000',
              precioUnitario: '25.00',
            },
          ],
        });

      const promCancelar = request(app.getHttpServer())
        .patch(`/api/v1/ventas/${ventaPrevia.id}/cancelar`)
        .set('Authorization', tokenA_Admin);

      await waitUntilBlocked(prisma, 2, 5000);
      await lockHolder.commit();

      const [resPost, resCancel] = await Promise.all([
        promPostVenta,
        promCancelar,
      ]);

      expect(resPost.status).toBe(409);
      expect((resPost.body as ApiResponseError).code).toBe(
        CodigoError.CICLO_CERRADO,
      );

      expect(resCancel.status).toBe(409);
      expect((resCancel.body as ApiResponseError).code).toBe(
        CodigoError.CICLO_CERRADO,
      );

      // En BD: la venta previa sigue REGISTRADA y no se creó la nueva
      const ventaEnBD = await prisma.venta.findUnique({
        where: { id: ventaPrevia.id },
      });
      expect(ventaEnBD?.estado).toBe(EstadoVenta.REGISTRADA);

      const conteoVentas = await prisma.venta.count({
        where: { cicloId: cicloDed.cicloId, deletedAt: null },
      });
      expect(conteoVentas).toBe(1);
    });
  });

  // =========================================================================
  // 7. RN-050 Y RN-070 POR API
  // =========================================================================
  describe('7. Reglas RN-050 y RN-070 por API', () => {
    it('eliminar una cosecha con ventas vinculadas da 409 COSECHA_CON_VENTAS_VINCULADAS (RN-050)', async () => {
      const cicloDed = await crearCicloAisladoParaConcurrencia(
        prisma,
        seed.empresaA.id,
        seed.empresaA.usuarios.admin.id,
        seed.global.variedadId,
      );

      const cosecha = await prisma.cosecha.create({
        data: {
          cicloId: cicloDed.cicloId,
          unidadId: seed.global.unidadKgId,
          creadoPorId: seed.empresaA.usuarios.admin.id,
          fecha: new Date('2026-02-01'),
          cantidad: new Prisma.Decimal('500.000'),
          calidad: CalidadCosecha.PRIMERA,
        },
      });

      const venta = await prisma.venta.create({
        data: {
          cicloId: cicloDed.cicloId,
          clienteId: seed.empresaA.cliente.id,
          creadoPorId: seed.empresaA.usuarios.admin.id,
          fecha: new Date('2026-02-10'),
          total: new Prisma.Decimal('2500.00'),
          estado: EstadoVenta.REGISTRADA,
          detalles: {
            create: [
              {
                cosechaId: cosecha.id,
                unidadId: seed.global.unidadKgId,
                calidad: CalidadCosecha.PRIMERA,
                cantidad: new Prisma.Decimal('100.000'),
                precioUnitario: new Prisma.Decimal('25.00'),
              },
            ],
          },
        },
      });

      // Intentar eliminar la cosecha
      const delRes = await request(app.getHttpServer())
        .delete(`/api/v1/cosechas/${cosecha.id}`)
        .set('Authorization', tokenA_Admin);

      expect(delRes.status).toBe(409);
      expect((delRes.body as ApiResponseError).code).toBe(
        CodigoError.COSECHA_CON_VENTAS_VINCULADAS,
      );

      // Cancelar la venta: la venta cancelada no debe bloquear la eliminación
      await request(app.getHttpServer())
        .patch(`/api/v1/ventas/${venta.id}/cancelar`)
        .set('Authorization', tokenA_Admin)
        .expect(200);

      const delRes2 = await request(app.getHttpServer())
        .delete(`/api/v1/cosechas/${cosecha.id}`)
        .set('Authorization', tokenA_Admin);

      expect(delRes2.status).toBe(200);
    });

    it('reducir una cosecha por debajo de lo vendido da 409 KG_VENDIDOS_EXCEDEN_NETOS (RN-070)', async () => {
      const cicloDed = await crearCicloAisladoParaConcurrencia(
        prisma,
        seed.empresaA.id,
        seed.empresaA.usuarios.admin.id,
        seed.global.variedadId,
      );

      const cosecha = await prisma.cosecha.create({
        data: {
          cicloId: cicloDed.cicloId,
          unidadId: seed.global.unidadKgId,
          creadoPorId: seed.empresaA.usuarios.admin.id,
          fecha: new Date('2026-02-01'),
          cantidad: new Prisma.Decimal('500.000'),
          calidad: CalidadCosecha.PRIMERA,
        },
      });

      // Venta de 400 kg (sin vincular específicamente a la cosecha)
      await prisma.venta.create({
        data: {
          cicloId: cicloDed.cicloId,
          clienteId: seed.empresaA.cliente.id,
          creadoPorId: seed.empresaA.usuarios.admin.id,
          fecha: new Date('2026-02-10'),
          total: new Prisma.Decimal('10000.00'),
          estado: EstadoVenta.REGISTRADA,
          detalles: {
            create: [
              {
                unidadId: seed.global.unidadKgId,
                calidad: CalidadCosecha.PRIMERA,
                cantidad: new Prisma.Decimal('400.000'),
                precioUnitario: new Prisma.Decimal('25.00'),
              },
            ],
          },
        },
      });

      // Intentar reducir cosecha a 300 kg (< 400 kg vendidos)
      const patchRes = await request(app.getHttpServer())
        .patch(`/api/v1/cosechas/${cosecha.id}`)
        .set('Authorization', tokenA_Admin)
        .send({ cantidad: '300' });

      expect(patchRes.status).toBe(409);
      expect((patchRes.body as ApiResponseError).code).toBe(
        CodigoError.KG_VENDIDOS_EXCEDEN_NETOS,
      );
    });
  });

  // =========================================================================
  // 8. ROLLBACK DE AUDITORÍA CON BD REAL
  // =========================================================================
  describe('8. Transaccionalidad y rollback de auditoría', () => {
    it('auditoría registra snapshot completo de renglones en valoresAnteriores y valoresNuevos', async () => {
      const cicloDed = await crearCicloAisladoParaConcurrencia(
        prisma,
        seed.empresaA.id,
        seed.empresaA.usuarios.admin.id,
        seed.global.variedadId,
      );

      await prisma.cosecha.create({
        data: {
          cicloId: cicloDed.cicloId,
          unidadId: seed.global.unidadKgId,
          creadoPorId: seed.empresaA.usuarios.admin.id,
          fecha: new Date('2026-02-01'),
          cantidad: new Prisma.Decimal('500.000'),
          calidad: CalidadCosecha.PRIMERA,
        },
      });

      // 1. Crear venta
      const postRes = await request(app.getHttpServer())
        .post('/api/v1/ventas')
        .set('Authorization', tokenA_Admin)
        .send({
          cicloId: cicloDed.cicloId,
          clienteId: seed.empresaA.cliente.id,
          fecha: '2026-02-15',
          total: '2500.00',
          renglones: [
            {
              unidadId: seed.global.unidadKgId,
              calidad: CalidadCosecha.PRIMERA,
              cantidad: '100.000',
              precioUnitario: '25.00',
            },
          ],
        });

      expect(postRes.status).toBe(201);
      const ventaId = (postRes.body as { id: number }).id;

      // 2. Editar con reemplazo atómico de renglones
      const patchRes = await request(app.getHttpServer())
        .patch(`/api/v1/ventas/${ventaId}`)
        .set('Authorization', tokenA_Admin)
        .send({
          total: '3750.00',
          renglones: [
            {
              unidadId: seed.global.unidadKgId,
              calidad: CalidadCosecha.SEGUNDA,
              cantidad: '150.000',
              precioUnitario: '25.00',
            },
          ],
        });

      expect(patchRes.status).toBe(200);

      // 3. Verificar bitácora de auditoría
      const bitacoras = await prisma.bitacoraAuditoria.findMany({
        where: { entidad: 'Venta', entidadId: ventaId },
        orderBy: { id: 'asc' },
      });

      expect(bitacoras.length).toBe(2); // CREAR y ACTUALIZAR
      const auditUpdate = bitacoras[1];
      expect(auditUpdate.accion).toBe('ACTUALIZAR');

      interface AuditVentaSnapshot {
        renglones: Array<{ calidad: string; cantidad: number | string }>;
      }

      const valAnt = (
        typeof auditUpdate.valoresAnteriores === 'string'
          ? JSON.parse(auditUpdate.valoresAnteriores)
          : auditUpdate.valoresAnteriores
      ) as AuditVentaSnapshot;
      const valNuev = (
        typeof auditUpdate.valoresNuevos === 'string'
          ? JSON.parse(auditUpdate.valoresNuevos)
          : auditUpdate.valoresNuevos
      ) as AuditVentaSnapshot;

      expect(valAnt.renglones.length).toBe(1);
      expect(valAnt.renglones[0].calidad).toBe('PRIMERA');
      expect(Number(valAnt.renglones[0].cantidad)).toBe(100);

      expect(valNuev.renglones.length).toBe(1);
      expect(valNuev.renglones[0].calidad).toBe('SEGUNDA');
      expect(Number(valNuev.renglones[0].cantidad)).toBe(150);
    });
  });

  // =========================================================================
  // 9. PARIDAD ENTRE TYPESCRIPT Y VISTA SQL v_rentabilidad_ciclo
  // =========================================================================
  describe('9. Paridad entre TypeScript y vista SQL v_rentabilidad_ciclo', () => {
    it('calcularBalanceMasaKg coincide con v_rentabilidad_ciclo en un ciclo con ventas canceladas y merma CAMPO', async () => {
      const cicloDed = await crearCicloAisladoParaConcurrencia(
        prisma,
        seed.empresaA.id,
        seed.empresaA.usuarios.admin.id,
        seed.global.variedadId,
      );

      // Cosecha: 1000 kg
      await prisma.cosecha.create({
        data: {
          cicloId: cicloDed.cicloId,
          unidadId: seed.global.unidadKgId,
          creadoPorId: seed.empresaA.usuarios.admin.id,
          fecha: new Date('2026-02-01'),
          cantidad: new Prisma.Decimal('1000.000'),
          calidad: CalidadCosecha.PRIMERA,
        },
      });

      // Merma CAMPO: 100 kg (no debe restar de netos)
      await prisma.merma.create({
        data: {
          cicloId: cicloDed.cicloId,
          motivoId: seed.global.motivoMermaId,
          unidadId: seed.global.unidadKgId,
          creadoPorId: seed.empresaA.usuarios.admin.id,
          fecha: new Date('2026-02-02'),
          cantidad: new Prisma.Decimal('100.000'),
          etapa: EtapaMerma.CAMPO,
        },
      });

      // Merma POSCOSECHA: 50 kg (sí resta de netos)
      await prisma.merma.create({
        data: {
          cicloId: cicloDed.cicloId,
          motivoId: seed.global.motivoMermaId,
          unidadId: seed.global.unidadKgId,
          creadoPorId: seed.empresaA.usuarios.admin.id,
          fecha: new Date('2026-02-03'),
          cantidad: new Prisma.Decimal('50.000'),
          etapa: EtapaMerma.POSCOSECHA,
        },
      });

      // Venta activa: 200 kg
      await prisma.venta.create({
        data: {
          cicloId: cicloDed.cicloId,
          clienteId: seed.empresaA.cliente.id,
          creadoPorId: seed.empresaA.usuarios.admin.id,
          fecha: new Date('2026-02-10'),
          total: new Prisma.Decimal('5000.00'),
          estado: EstadoVenta.REGISTRADA,
          detalles: {
            create: [
              {
                unidadId: seed.global.unidadKgId,
                calidad: CalidadCosecha.PRIMERA,
                cantidad: new Prisma.Decimal('200.000'),
                precioUnitario: new Prisma.Decimal('25.00'),
              },
            ],
          },
        },
      });

      // Venta cancelada: 300 kg (NO debe sumar en kgVendidos)
      await prisma.venta.create({
        data: {
          cicloId: cicloDed.cicloId,
          clienteId: seed.empresaA.cliente.id,
          creadoPorId: seed.empresaA.usuarios.admin.id,
          fecha: new Date('2026-02-12'),
          total: new Prisma.Decimal('7500.00'),
          estado: EstadoVenta.CANCELADA,
          detalles: {
            create: [
              {
                unidadId: seed.global.unidadKgId,
                calidad: CalidadCosecha.PRIMERA,
                cantidad: new Prisma.Decimal('300.000'),
                precioUnitario: new Prisma.Decimal('25.00'),
              },
            ],
          },
        },
      });

      // 1. Balance en TypeScript
      const balanceTS = await calcularBalanceMasaKg(prisma, cicloDed.cicloId);

      // 2. Balance en Vista SQL MySQL
      const vistaRows = await prisma.$queryRaw<
        Array<{
          kgCosechados: Prisma.Decimal | number;
          kgMerma: Prisma.Decimal | number;
          kgNetos: Prisma.Decimal | number;
          kgVendidos: Prisma.Decimal | number;
          kgDisponibles: Prisma.Decimal | number;
        }>
      >(
        Prisma.sql`SELECT kgCosechados, kgMerma, kgNetos, kgVendidos, kgDisponibles
                   FROM v_rentabilidad_ciclo
                   WHERE cicloId = ${cicloDed.cicloId}`,
      );

      expect(vistaRows.length).toBe(1);
      const vista = vistaRows[0];

      // Paridad absoluta:
      // kgCosechados: 1000 exactos
      expect(Number(balanceTS.kgCosechados)).toBe(1000);
      expect(Number(vista.kgCosechados)).toBe(1000);

      // kgMerma: 50 exactos (poscosecha, campo excluida)
      expect(Number(balanceTS.kgMermaPoscosecha)).toBe(50);
      expect(Number(vista.kgMerma)).toBe(50);

      // kgNetos: 950 exactos (1000 - 50)
      expect(Number(balanceTS.kgNetos)).toBe(950);
      expect(Number(vista.kgNetos)).toBe(950);

      // kgVendidos: 200 exactos (la de 300 CANCELADA no cuenta)
      expect(Number(balanceTS.kgVendidos)).toBe(200);
      expect(Number(vista.kgVendidos)).toBe(200);

      // kgDisponibles: 750 exactos (950 - 200)
      expect(Number(balanceTS.kgDisponibles)).toBe(750);
      expect(Number(vista.kgDisponibles)).toBe(750);
    });
  });
});
