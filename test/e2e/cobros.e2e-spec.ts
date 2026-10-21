import { INestApplication } from '@nestjs/common';
import { createTestApp } from '../setup/create-test-app';
import { testRequest } from '../setup/http.util';
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
  EstadoCiclo,
  EstadoVenta,
  MetodoPago,
  Prisma,
} from '@prisma/client';
import { AuditService } from '../../src/prisma/audit.service';
import { EstadoCobro } from '../../src/common/domain/policies/venta-estado-cobro.policy';

interface ApiResponseError {
  code?: string;
  message?: string;
}

interface CobroBody {
  id: number;
  ventaId: number;
  monto: string;
  metodo: string;
  deletedAt: string | null;
}

interface VentaResponseItem {
  id: number;
  total: string;
  totalCobrado: string;
  saldoPendiente: string;
  estadoCobro: EstadoCobro;
  vencida: boolean;
}

describe('Hito 8: Módulo de Cobros y Cuentas por Cobrar (E2E)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let auditService: AuditService;
  let seed: E2eSeedData;

  let tokenA_Admin: string;
  let tokenA_Capturista: string;
  let tokenA_Contador: string;

  beforeAll(async () => {
    const testApp = await createTestApp();
    app = testApp.app;
    prisma = testApp.prisma;
    auditService = app.get<AuditService>(AuditService);
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
    jest.restoreAllMocks();
    await app.close();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // Helper para crear una venta con datos limpios
  const crearVentaBase = async (
    cicloId: number,
    empresaId: number,
    total = '1000.00',
    fechaLimitePago: Date | null = null,
  ) => {
    return prisma.venta.create({
      data: {
        cicloId,
        clienteId: seed.empresaA.cliente.id,
        creadoPorId: seed.empresaA.usuarios.admin.id,
        fecha: new Date('2026-03-01'),
        fechaLimitePago,
        total: new Prisma.Decimal(total),
        estado: EstadoVenta.REGISTRADA,
        detalles: {
          create: [
            {
              unidadId: seed.global.unidadKgId,
              calidad: CalidadCosecha.PRIMERA,
              cantidad: new Prisma.Decimal('10.000'),
              precioUnitario: new Prisma.Decimal(total).dividedBy(10),
            },
          ],
        },
      },
    });
  };

  // =========================================================================
  // 1. AISLAMIENTO MULTIEMPRESA (404 ESTRICTO)
  // =========================================================================
  describe('1. Aislamiento multiempresa (404 estricto ante recursos ajenos)', () => {
    it('POST /api/v1/ventas/:id/cobros en venta de Empresa B devuelve 404', async () => {
      const res = await testRequest(app)
        .post(`/api/v1/ventas/${seed.empresaB.venta.id}/cobros`)
        .set('Authorization', tokenA_Admin)
        .send({
          fecha: '2026-03-15',
          monto: '100.00',
          metodo: MetodoPago.EFECTIVO,
        });

      expect(res.status).toBe(404);
      expect((res.body as ApiResponseError).code).toBe(
        CodigoError.RECURSO_NO_ENCONTRADO,
      );
    });

    it('GET /api/v1/ventas/:id/cobros de Empresa B devuelve 404', async () => {
      const res = await testRequest(app)
        .get(`/api/v1/ventas/${seed.empresaB.venta.id}/cobros`)
        .set('Authorization', tokenA_Admin);

      expect(res.status).toBe(404);
      expect((res.body as ApiResponseError).code).toBe(
        CodigoError.RECURSO_NO_ENCONTRADO,
      );
    });

    it('GET /api/v1/cobros/:id y PATCH anular de Empresa B devuelven 404 y no mutan en BD', async () => {
      // Crear un cobro en la venta de Empresa B
      const cobroB = await prisma.cobroVenta.create({
        data: {
          ventaId: seed.empresaB.venta.id,
          registradoPorId: seed.empresaB.usuarios.admin.id,
          fecha: new Date('2026-03-15'),
          monto: new Prisma.Decimal('150.00'),
          metodo: MetodoPago.TRANSFERENCIA,
        },
      });

      // GET con token de A
      const getRes = await testRequest(app)
        .get(`/api/v1/cobros/${cobroB.id}`)
        .set('Authorization', tokenA_Admin);
      expect(getRes.status).toBe(404);

      // Anular con token de A
      const patchRes = await testRequest(app)
        .patch(`/api/v1/cobros/${cobroB.id}/anular`)
        .set('Authorization', tokenA_Admin);
      expect(patchRes.status).toBe(404);

      // Verificar en BD que sigue activo sin deletedAt
      const cobroBEnDb = await prisma.cobroVenta.findUnique({
        where: { id: cobroB.id },
      });
      expect(cobroBEnDb?.deletedAt).toBeNull();
    });
  });

  // =========================================================================
  // 2. RBAC (CAPTURISTA 403, ADMIN Y CONTADOR 200/201)
  // =========================================================================
  describe('2. Control de Acceso RBAC (RN-064)', () => {
    it('CAPTURISTA recibe 403 PERMISO_DENEGADO en todos los endpoints de cobro', async () => {
      const cicloDed = await crearCicloAisladoParaConcurrencia(
        prisma,
        seed.empresaA.id,
        seed.empresaA.usuarios.admin.id,
        seed.global.variedadId,
      );
      const venta = await crearVentaBase(cicloDed.cicloId, seed.empresaA.id);

      const postRes = await testRequest(app)
        .post(`/api/v1/ventas/${venta.id}/cobros`)
        .set('Authorization', tokenA_Capturista)
        .send({
          fecha: '2026-03-15',
          monto: '100.00',
          metodo: MetodoPago.EFECTIVO,
        });
      expect(postRes.status).toBe(403);
      expect((postRes.body as ApiResponseError).code).toBe(
        CodigoError.PERMISO_DENEGADO,
      );

      const listRes = await testRequest(app)
        .get(`/api/v1/ventas/${venta.id}/cobros`)
        .set('Authorization', tokenA_Capturista);
      expect(listRes.status).toBe(403);

      const cobro = await prisma.cobroVenta.create({
        data: {
          ventaId: venta.id,
          registradoPorId: seed.empresaA.usuarios.admin.id,
          fecha: new Date('2026-03-15'),
          monto: new Prisma.Decimal('100.00'),
          metodo: MetodoPago.EFECTIVO,
        },
      });

      const getRes = await testRequest(app)
        .get(`/api/v1/cobros/${cobro.id}`)
        .set('Authorization', tokenA_Capturista);
      expect(getRes.status).toBe(403);

      const anularRes = await testRequest(app)
        .patch(`/api/v1/cobros/${cobro.id}/anular`)
        .set('Authorization', tokenA_Capturista);
      expect(anularRes.status).toBe(403);
    });

    it('CONTADOR y ADMIN están autorizados para registrar y anular cobros', async () => {
      const cicloDed = await crearCicloAisladoParaConcurrencia(
        prisma,
        seed.empresaA.id,
        seed.empresaA.usuarios.admin.id,
        seed.global.variedadId,
      );
      const venta = await crearVentaBase(cicloDed.cicloId, seed.empresaA.id);

      // CONTADOR registra cobro (201)
      const postRes = await testRequest(app)
        .post(`/api/v1/ventas/${venta.id}/cobros`)
        .set('Authorization', tokenA_Contador)
        .send({
          fecha: '2026-03-15',
          monto: '200.00',
          metodo: MetodoPago.TRANSFERENCIA,
        });
      expect(postRes.status).toBe(201);
      const cobroId = (postRes.body as CobroBody).id;

      // CONTADOR consulta detalle (200)
      const getRes = await testRequest(app)
        .get(`/api/v1/cobros/${cobroId}`)
        .set('Authorization', tokenA_Contador);
      expect(getRes.status).toBe(200);

      // ADMIN anula cobro (200)
      const anularRes = await testRequest(app)
        .patch(`/api/v1/cobros/${cobroId}/anular`)
        .set('Authorization', tokenA_Admin);
      expect(anularRes.status).toBe(200);
      expect((anularRes.body as CobroBody).deletedAt).not.toBeNull();
    });
  });

  // =========================================================================
  // 3. CONCURRENCIA: DOBLE COBRO CONCURRENTE (RN-071)
  // =========================================================================
  describe('3. Concurrencia real: Doble cobro simultáneo (RN-071)', () => {
    it('venta de $1000: dos cobros simultáneos de $600 -> uno 201 y otro 409 COBRO_EXCEDE_TOTAL; en BD Σ <= 1000', async () => {
      const cicloDed = await crearCicloAisladoParaConcurrencia(
        prisma,
        seed.empresaA.id,
        seed.empresaA.usuarios.admin.id,
        seed.global.variedadId,
      );
      const venta = await crearVentaBase(
        cicloDed.cicloId,
        seed.empresaA.id,
        '1000.00',
      );

      const lockHolder = await holdCicloLock(cicloDed.cicloId);

      const cobroPayload = {
        fecha: '2026-03-15',
        monto: '600.00',
        metodo: MetodoPago.EFECTIVO,
      };

      const prom1 = testRequest(app)
        .post(`/api/v1/ventas/${venta.id}/cobros`)
        .set('Authorization', tokenA_Admin)
        .send(cobroPayload);

      const prom2 = testRequest(app)
        .post(`/api/v1/ventas/${venta.id}/cobros`)
        .set('Authorization', tokenA_Admin)
        .send(cobroPayload);

      await waitUntilBlocked(prisma, 2, 5000);
      await lockHolder.commit();

      const [res1, res2] = await Promise.all([prom1, prom2]);
      const statuses = [res1.status, res2.status].sort();
      expect(statuses).toEqual([201, 409]);

      const errorRes = res1.status === 409 ? res1 : res2;
      expect((errorRes.body as ApiResponseError).code).toBe(
        CodigoError.COBRO_EXCEDE_TOTAL,
      );

      // En BD queda exactamente un solo cobro vigente
      const cobrosEnBD = await prisma.cobroVenta.findMany({
        where: { ventaId: venta.id, deletedAt: null },
      });
      expect(cobrosEnBD.length).toBe(1);
      expect(Number(cobrosEnBD[0].monto)).toBe(600.0);
    });
  });

  // =========================================================================
  // 4. CONCURRENCIA: DOBLE ANULACIÓN CONCURRENTE (RELECTURA BAJO LOCK)
  // =========================================================================
  describe('4. Concurrencia real: Doble anulación simultánea', () => {
    it('dos solicitudes simultáneas de anular el mismo cobro -> una 200 y la otra 409 COBRO_YA_ANULADO', async () => {
      const cicloDed = await crearCicloAisladoParaConcurrencia(
        prisma,
        seed.empresaA.id,
        seed.empresaA.usuarios.admin.id,
        seed.global.variedadId,
      );
      const venta = await crearVentaBase(
        cicloDed.cicloId,
        seed.empresaA.id,
        '1000.00',
      );

      const cobro = await prisma.cobroVenta.create({
        data: {
          ventaId: venta.id,
          registradoPorId: seed.empresaA.usuarios.admin.id,
          fecha: new Date('2026-03-15'),
          monto: new Prisma.Decimal('400.00'),
          metodo: MetodoPago.TRANSFERENCIA,
        },
      });

      const lockHolder = await holdCicloLock(cicloDed.cicloId);

      const prom1 = testRequest(app)
        .patch(`/api/v1/cobros/${cobro.id}/anular`)
        .set('Authorization', tokenA_Admin);

      const prom2 = testRequest(app)
        .patch(`/api/v1/cobros/${cobro.id}/anular`)
        .set('Authorization', tokenA_Admin);

      await waitUntilBlocked(prisma, 2, 5000);
      await lockHolder.commit();

      const [res1, res2] = await Promise.all([prom1, prom2]);
      const statuses = [res1.status, res2.status].sort();
      expect(statuses).toEqual([200, 409]);

      const errorRes = res1.status === 409 ? res1 : res2;
      expect((errorRes.body as ApiResponseError).code).toBe(
        CodigoError.COBRO_YA_ANULADO,
      );

      const cobroReleido = await prisma.cobroVenta.findUnique({
        where: { id: cobro.id },
      });
      expect(cobroReleido?.deletedAt).not.toBeNull();
    });
  });

  // =========================================================================
  // 5. CONCURRENCIA: COBRO VS CANCELACIÓN DE VENTA
  // =========================================================================
  describe('5. Concurrencia real: Cobro nuevo vs Cancelación de venta', () => {
    it('cobro simultáneo con cancelación de la venta -> no genera estados incoherentes', async () => {
      const cicloDed = await crearCicloAisladoParaConcurrencia(
        prisma,
        seed.empresaA.id,
        seed.empresaA.usuarios.admin.id,
        seed.global.variedadId,
      );
      const venta = await crearVentaBase(
        cicloDed.cicloId,
        seed.empresaA.id,
        '1000.00',
      );

      const lockHolder = await holdCicloLock(cicloDed.cicloId);

      const promCobro = testRequest(app)
        .post(`/api/v1/ventas/${venta.id}/cobros`)
        .set('Authorization', tokenA_Admin)
        .send({
          fecha: '2026-03-15',
          monto: '500.00',
          metodo: MetodoPago.EFECTIVO,
        });

      const promCancelar = testRequest(app)
        .patch(`/api/v1/ventas/${venta.id}/cancelar`)
        .set('Authorization', tokenA_Admin);

      await waitUntilBlocked(prisma, 2, 5000);
      await lockHolder.commit();

      const [resCobro, resCancelar] = await Promise.all([
        promCobro,
        promCancelar,
      ]);

      // Con la compuerta de lock, las únicas salidas válidas son:
      // (a) Cancelación primero: cobro 409 VENTA_YA_CANCELADA, cancelación 200, venta CANCELADA y 0 cobros en BD
      // (b) Cobro primero: cobro 201, cancelación 200, venta CANCELADA y 1 cobro vigente en BD
      // Cualquier otra combinación falla.
      expect(resCancelar.status).toBe(200);

      const ventaEnBD = await prisma.venta.findUnique({
        where: { id: venta.id },
      });
      expect(ventaEnBD?.estado).toBe(EstadoVenta.CANCELADA);

      const cobrosEnBD = await prisma.cobroVenta.findMany({
        where: { ventaId: venta.id, deletedAt: null },
      });

      if (resCobro.status === 409) {
        expect((resCobro.body as ApiResponseError).code).toBe(
          CodigoError.VENTA_YA_CANCELADA,
        );
        expect(cobrosEnBD.length).toBe(0);
      } else if (resCobro.status === 201) {
        expect(cobrosEnBD.length).toBe(1);
        expect(cobrosEnBD[0].deletedAt).toBeNull();
      } else {
        throw new Error(
          `Respuesta inesperada de cobro: status ${resCobro.status}`,
        );
      }
    });
  });

  // =========================================================================
  // 6. CONCURRENCIA: COBRO VS EDICIÓN DEL TOTAL DE LA VENTA
  // =========================================================================
  describe('6. Concurrencia real: Cobro vs Edición reduciendo total de la venta', () => {
    it('PATCH venta reduciendo total a $400 y POST cobro de $600 simultáneos -> nunca queda Σ cobros > total', async () => {
      const cicloDed = await crearCicloAisladoParaConcurrencia(
        prisma,
        seed.empresaA.id,
        seed.empresaA.usuarios.admin.id,
        seed.global.variedadId,
      );
      const venta = await crearVentaBase(
        cicloDed.cicloId,
        seed.empresaA.id,
        '1000.00',
      );

      const lockHolder = await holdCicloLock(cicloDed.cicloId);

      // PATCH que intenta reducir total a 400
      const promPatch = testRequest(app)
        .patch(`/api/v1/ventas/${venta.id}`)
        .set('Authorization', tokenA_Admin)
        .send({
          total: '400.00',
          renglones: [
            {
              unidadId: seed.global.unidadKgId,
              calidad: CalidadCosecha.PRIMERA,
              cantidad: '4.000',
              precioUnitario: '100.00',
            },
          ],
        });

      // POST cobro de 600
      const promCobro = testRequest(app)
        .post(`/api/v1/ventas/${venta.id}/cobros`)
        .set('Authorization', tokenA_Admin)
        .send({
          fecha: '2026-03-15',
          monto: '600.00',
          metodo: MetodoPago.EFECTIVO,
        });

      await waitUntilBlocked(prisma, 2, 5000);
      await lockHolder.commit();

      const [resPatch, resCobro] = await Promise.all([promPatch, promCobro]);

      // Al menos uno debe haber tenido éxito o uno rechazado con 409
      // Si el cobro de 600 entra primero: el patch de reducir a 400 recibe 409 COBRO_EXCEDE_TOTAL
      // Si el patch entra primero (total pasa a 400): el cobro de 600 recibe 409 COBRO_EXCEDE_TOTAL
      const statuses = [resPatch.status, resCobro.status];
      expect(statuses).toContain(409);

      // Verificar en BD que en ningún caso Σ cobros > total
      const ventaEnBd = await prisma.venta.findUnique({
        where: { id: venta.id },
      });
      const cobrosEnBd = await prisma.cobroVenta.findMany({
        where: { ventaId: venta.id, deletedAt: null },
      });
      const sumaCobros = cobrosEnBd.reduce(
        (acc, c) => acc + Number(c.monto),
        0,
      );
      expect(sumaCobros).toBeLessThanOrEqual(Number(ventaEnBd?.total));
    });
  });

  // =========================================================================
  // 7. CICLO FINALIZADO VS CANCELADO (TABLA 2.6)
  // =========================================================================
  describe('7. Ciclo FINALIZADO vs CANCELADO (Tabla 2.6)', () => {
    it('en ciclo FINALIZADO: POST cobro (201) y anular (200) funcionan', async () => {
      const cicloDed = await crearCicloAisladoParaConcurrencia(
        prisma,
        seed.empresaA.id,
        seed.empresaA.usuarios.admin.id,
        seed.global.variedadId,
      );
      const venta = await crearVentaBase(
        cicloDed.cicloId,
        seed.empresaA.id,
        '800.00',
      );

      // Pasar ciclo a FINALIZADO
      await prisma.cicloProduccion.update({
        where: { id: cicloDed.cicloId },
        data: {
          estado: EstadoCiclo.FINALIZADO,
          fechaFin: new Date('2026-03-10'),
        },
      });

      // POST cobro en ciclo FINALIZADO -> 201
      const postRes = await testRequest(app)
        .post(`/api/v1/ventas/${venta.id}/cobros`)
        .set('Authorization', tokenA_Admin)
        .send({
          fecha: '2026-03-15',
          monto: '300.00',
          metodo: MetodoPago.EFECTIVO,
        });
      expect(postRes.status).toBe(201);
      const cobroId = (postRes.body as CobroBody).id;

      // PATCH anular cobro en ciclo FINALIZADO -> 200
      const anularRes = await testRequest(app)
        .patch(`/api/v1/cobros/${cobroId}/anular`)
        .set('Authorization', tokenA_Admin);
      expect(anularRes.status).toBe(200);
      expect((anularRes.body as CobroBody).deletedAt).not.toBeNull();
    });

    it('en ciclo CANCELADO: registrar cobro da 409 CICLO_CERRADO y anular da 409 CICLO_CERRADO', async () => {
      const cicloDed = await crearCicloAisladoParaConcurrencia(
        prisma,
        seed.empresaA.id,
        seed.empresaA.usuarios.admin.id,
        seed.global.variedadId,
      );
      const venta = await crearVentaBase(
        cicloDed.cicloId,
        seed.empresaA.id,
        '800.00',
      );

      const cobro = await prisma.cobroVenta.create({
        data: {
          ventaId: venta.id,
          registradoPorId: seed.empresaA.usuarios.admin.id,
          fecha: new Date('2026-03-15'),
          monto: new Prisma.Decimal('200.00'),
          metodo: MetodoPago.EFECTIVO,
        },
      });

      // Pasar ciclo a CANCELADO
      await prisma.cicloProduccion.update({
        where: { id: cicloDed.cicloId },
        data: { estado: EstadoCiclo.CANCELADO },
      });

      // POST cobro en ciclo CANCELADO -> 409 CICLO_CERRADO
      const postRes = await testRequest(app)
        .post(`/api/v1/ventas/${venta.id}/cobros`)
        .set('Authorization', tokenA_Admin)
        .send({
          fecha: '2026-03-15',
          monto: '100.00',
          metodo: MetodoPago.EFECTIVO,
        });
      expect(postRes.status).toBe(409);
      expect((postRes.body as ApiResponseError).code).toBe(
        CodigoError.CICLO_CERRADO,
      );

      // PATCH anular en ciclo CANCELADO -> 409 CICLO_CERRADO
      const anularRes = await testRequest(app)
        .patch(`/api/v1/cobros/${cobro.id}/anular`)
        .set('Authorization', tokenA_Admin);
      expect(anularRes.status).toBe(409);
      expect((anularRes.body as ApiResponseError).code).toBe(
        CodigoError.CICLO_CERRADO,
      );
    });

    it('cobro simultáneo con la finalización del ciclo: sigue permitido', async () => {
      const cicloDed = await crearCicloAisladoParaConcurrencia(
        prisma,
        seed.empresaA.id,
        seed.empresaA.usuarios.admin.id,
        seed.global.variedadId,
      );
      const venta = await crearVentaBase(
        cicloDed.cicloId,
        seed.empresaA.id,
        '800.00',
      );

      const lockHolder = await holdCicloLock(cicloDed.cicloId);

      // Finalizar ciclo directamente en transacción concurrente
      const promFinalizar = (async () => {
        // Espera a que el lock del holder se libere y luego actualiza
        await prisma.cicloProduccion.update({
          where: { id: cicloDed.cicloId },
          data: {
            estado: EstadoCiclo.FINALIZADO,
            fechaFin: new Date('2026-03-10'),
          },
        });
      })();

      const promCobro = testRequest(app)
        .post(`/api/v1/ventas/${venta.id}/cobros`)
        .set('Authorization', tokenA_Admin)
        .send({
          fecha: '2026-03-15',
          monto: '250.00',
          metodo: MetodoPago.EFECTIVO,
        });

      await waitUntilBlocked(prisma, 1, 5000);
      await lockHolder.commit();

      await promFinalizar;
      const resCobro = await promCobro;

      // Dado que ciclo FINALIZADO admite cobros (Tabla 2.6), el cobro siempre responde 201
      expect(resCobro.status).toBe(201);
    });
  });

  // =========================================================================
  // 8. ESTADOS DERIVADOS POR API
  // =========================================================================
  describe('8. Estados derivados institucionales y campo vencida por API', () => {
    it('deriva correctamente PENDIENTE, VENCIDA, PARCIAL, PAGADA y CANCELADA', async () => {
      const cicloDed = await crearCicloAisladoParaConcurrencia(
        prisma,
        seed.empresaA.id,
        seed.empresaA.usuarios.admin.id,
        seed.global.variedadId,
      );

      // 1. PENDIENTE (fecha límite futura, 0 cobros)
      const vPendiente = await crearVentaBase(
        cicloDed.cicloId,
        seed.empresaA.id,
        '1000.00',
        new Date('2029-12-31'),
      );
      const resPendiente = await testRequest(app)
        .get(`/api/v1/ventas/${vPendiente.id}`)
        .set('Authorization', tokenA_Admin);
      expect((resPendiente.body as VentaResponseItem).estadoCobro).toBe(
        EstadoCobro.PENDIENTE,
      );
      expect((resPendiente.body as VentaResponseItem).vencida).toBe(false);
      expect((resPendiente.body as VentaResponseItem).saldoPendiente).toBe(
        '1000.00',
      );

      // 2. VENCIDA (fecha límite pasada 2026-01-01, 0 cobros)
      const vVencida = await crearVentaBase(
        cicloDed.cicloId,
        seed.empresaA.id,
        '1000.00',
        new Date('2026-01-01'),
      );
      const resVencida = await testRequest(app)
        .get(`/api/v1/ventas/${vVencida.id}`)
        .set('Authorization', tokenA_Admin);
      expect((resVencida.body as VentaResponseItem).estadoCobro).toBe(
        EstadoCobro.VENCIDA,
      );
      expect((resVencida.body as VentaResponseItem).vencida).toBe(true);
      expect((resVencida.body as VentaResponseItem).saldoPendiente).toBe(
        '1000.00',
      );

      // 3. PARCIAL con fecha límite pasada: estadoCobro sigue siendo PARCIAL y vencida = true
      const vParcial = await crearVentaBase(
        cicloDed.cicloId,
        seed.empresaA.id,
        '1000.00',
        new Date('2026-01-01'),
      );
      await prisma.cobroVenta.create({
        data: {
          ventaId: vParcial.id,
          registradoPorId: seed.empresaA.usuarios.admin.id,
          fecha: new Date('2026-03-01'),
          monto: new Prisma.Decimal('400.00'),
          metodo: MetodoPago.EFECTIVO,
        },
      });
      const resParcial = await testRequest(app)
        .get(`/api/v1/ventas/${vParcial.id}`)
        .set('Authorization', tokenA_Admin);
      expect((resParcial.body as VentaResponseItem).estadoCobro).toBe(
        EstadoCobro.PARCIAL,
      );
      expect((resParcial.body as VentaResponseItem).vencida).toBe(true);
      expect((resParcial.body as VentaResponseItem).saldoPendiente).toBe(
        '600.00',
      );
      expect((resParcial.body as VentaResponseItem).totalCobrado).toBe(
        '400.00',
      );

      // 4. PAGADA (cobro completo)
      const vPagada = await crearVentaBase(
        cicloDed.cicloId,
        seed.empresaA.id,
        '1000.00',
        new Date('2026-01-01'),
      );
      await prisma.cobroVenta.create({
        data: {
          ventaId: vPagada.id,
          registradoPorId: seed.empresaA.usuarios.admin.id,
          fecha: new Date('2026-03-01'),
          monto: new Prisma.Decimal('1000.00'),
          metodo: MetodoPago.TRANSFERENCIA,
        },
      });
      const resPagada = await testRequest(app)
        .get(`/api/v1/ventas/${vPagada.id}`)
        .set('Authorization', tokenA_Admin);
      expect((resPagada.body as VentaResponseItem).estadoCobro).toBe(
        EstadoCobro.PAGADA,
      );
      expect((resPagada.body as VentaResponseItem).vencida).toBe(false);
      expect((resPagada.body as VentaResponseItem).saldoPendiente).toBe('0.00');
      expect((resPagada.body as VentaResponseItem).totalCobrado).toBe(
        '1000.00',
      );

      // 5. CANCELADA (saldoPendiente = 0.00, vencida = false)
      const vCancelada = await crearVentaBase(
        cicloDed.cicloId,
        seed.empresaA.id,
        '1000.00',
      );
      await prisma.venta.update({
        where: { id: vCancelada.id },
        data: { estado: EstadoVenta.CANCELADA },
      });
      const resCancelada = await testRequest(app)
        .get(`/api/v1/ventas/${vCancelada.id}`)
        .set('Authorization', tokenA_Admin);
      expect((resCancelada.body as VentaResponseItem).estadoCobro).toBe(
        EstadoCobro.CANCELADA,
      );
      expect((resCancelada.body as VentaResponseItem).vencida).toBe(false);
      expect((resCancelada.body as VentaResponseItem).saldoPendiente).toBe(
        '0.00',
      );
    });
  });

  // =========================================================================
  // 9. ROLLBACK DE AUDITORÍA CON BD REAL
  // =========================================================================
  describe('9. Transaccionalidad real y rollback de auditoría en Cobros', () => {
    it('POST cobro: si auditoría falla, el cobro no se persiste en BD y no hay bitácora', async () => {
      const cicloDed = await crearCicloAisladoParaConcurrencia(
        prisma,
        seed.empresaA.id,
        seed.empresaA.usuarios.admin.id,
        seed.global.variedadId,
      );
      const venta = await crearVentaBase(
        cicloDed.cicloId,
        seed.empresaA.id,
        '500.00',
      );

      jest.spyOn(auditService, 'registrar').mockImplementationOnce(() => {
        return Promise.reject(
          new Error('FALLO_CRITICO_FORZADO_AUDITORIA_POST_COBRO'),
        );
      });

      const res = await testRequest(app)
        .post(`/api/v1/ventas/${venta.id}/cobros`)
        .set('Authorization', tokenA_Admin)
        .send({
          fecha: '2026-03-15',
          monto: '250.00',
          metodo: MetodoPago.EFECTIVO,
          referencia: 'REF-FALLO-AUDIT',
        });

      expect(res.status).toBeGreaterThanOrEqual(500);

      // En BD no existe el cobro
      const cobroEnDb = await prisma.cobroVenta.findFirst({
        where: { referencia: 'REF-FALLO-AUDIT' },
      });
      expect(cobroEnDb).toBeNull();

      // En bitácora no hay registro
      const bitacoras = await prisma.bitacoraAuditoria.findMany({
        where: {
          empresaId: seed.empresaA.id,
          entidad: 'CobroVenta',
        },
      });
      expect(
        bitacoras.some((b) =>
          JSON.stringify(b.valoresNuevos).includes('REF-FALLO-AUDIT'),
        ),
      ).toBe(false);
    });

    it('PATCH anular cobro: si auditoría falla, el cobro conserva deletedAt nulo', async () => {
      const cicloDed = await crearCicloAisladoParaConcurrencia(
        prisma,
        seed.empresaA.id,
        seed.empresaA.usuarios.admin.id,
        seed.global.variedadId,
      );
      const venta = await crearVentaBase(
        cicloDed.cicloId,
        seed.empresaA.id,
        '500.00',
      );

      const cobro = await prisma.cobroVenta.create({
        data: {
          ventaId: venta.id,
          registradoPorId: seed.empresaA.usuarios.admin.id,
          fecha: new Date('2026-03-15'),
          monto: new Prisma.Decimal('200.00'),
          metodo: MetodoPago.EFECTIVO,
        },
      });

      jest.spyOn(auditService, 'registrar').mockImplementationOnce(() => {
        return Promise.reject(
          new Error('FALLO_CRITICO_FORZADO_AUDITORIA_ANULAR_COBRO'),
        );
      });

      const res = await testRequest(app)
        .patch(`/api/v1/cobros/${cobro.id}/anular`)
        .set('Authorization', tokenA_Admin);

      expect(res.status).toBeGreaterThanOrEqual(500);

      // En BD sigue activo
      const cobroReleido = await prisma.cobroVenta.findUnique({
        where: { id: cobro.id },
      });
      expect(cobroReleido?.deletedAt).toBeNull();
    });

    it('Control: auditoría real exitosa registra snapshot y no expone secretos', async () => {
      const cicloDed = await crearCicloAisladoParaConcurrencia(
        prisma,
        seed.empresaA.id,
        seed.empresaA.usuarios.admin.id,
        seed.global.variedadId,
      );
      const venta = await crearVentaBase(
        cicloDed.cicloId,
        seed.empresaA.id,
        '500.00',
      );

      const res = await testRequest(app)
        .post(`/api/v1/ventas/${venta.id}/cobros`)
        .set('Authorization', tokenA_Admin)
        .send({
          fecha: '2026-03-15',
          monto: '150.00',
          metodo: MetodoPago.EFECTIVO,
          referencia: 'REF-CONTROL-EXITO',
        });
      expect(res.status).toBe(201);
      const cobroCreadoId = (res.body as CobroBody).id;

      const registro = await prisma.bitacoraAuditoria.findFirst({
        where: {
          empresaId: seed.empresaA.id,
          entidad: 'CobroVenta',
          entidadId: cobroCreadoId,
        },
      });

      expect(registro).not.toBeNull();
      expect(registro?.accion).toBe('CREAR');
      const serializado = JSON.stringify(registro, (_k, v) =>
        typeof v === 'bigint' ? v.toString() : v,
      );
      expect(serializado).not.toContain('password');
      expect(serializado).not.toContain('contrasenaHash');
    });
  });

  // =========================================================================
  // 10. PARIDAD CON v_rentabilidad_ciclo
  // =========================================================================
  describe('10. Paridad matemática estricta con v_rentabilidad_ciclo', () => {
    it('compara cobrado y porCobrar de la vista SQL contra los cálculos de dominio en TS', async () => {
      const cicloDed = await crearCicloAisladoParaConcurrencia(
        prisma,
        seed.empresaA.id,
        seed.empresaA.usuarios.admin.id,
        seed.global.variedadId,
      );

      // Venta A: $1000, con cobro vigente de $600
      const ventaA = await crearVentaBase(
        cicloDed.cicloId,
        seed.empresaA.id,
        '1000.00',
      );
      await prisma.cobroVenta.create({
        data: {
          ventaId: ventaA.id,
          registradoPorId: seed.empresaA.usuarios.admin.id,
          fecha: new Date('2026-03-15'),
          monto: new Prisma.Decimal('600.00'),
          metodo: MetodoPago.EFECTIVO,
        },
      });

      // Venta B: $500, con cobro anulado de $200
      const ventaB = await crearVentaBase(
        cicloDed.cicloId,
        seed.empresaA.id,
        '500.00',
      );
      await prisma.cobroVenta.create({
        data: {
          ventaId: ventaB.id,
          registradoPorId: seed.empresaA.usuarios.admin.id,
          fecha: new Date('2026-03-15'),
          monto: new Prisma.Decimal('200.00'),
          metodo: MetodoPago.TRANSFERENCIA,
          deletedAt: new Date(), // Cobro anulado
        },
      });

      // Venta C: $800 CANCELADA con cobro previo de $300
      const ventaC = await crearVentaBase(
        cicloDed.cicloId,
        seed.empresaA.id,
        '800.00',
      );
      await prisma.cobroVenta.create({
        data: {
          ventaId: ventaC.id,
          registradoPorId: seed.empresaA.usuarios.admin.id,
          fecha: new Date('2026-03-15'),
          monto: new Prisma.Decimal('300.00'),
          metodo: MetodoPago.CHEQUE,
        },
      });
      await prisma.venta.update({
        where: { id: ventaC.id },
        data: { estado: EstadoVenta.CANCELADA },
      });

      // Consultar la vista SQL real
      const vistaRows = await prisma.$queryRaw<
        Array<{
          cicloId: number;
          totalFacturado: string | number;
          cobrado: string | number;
          porCobrar: string | number;
        }>
      >(
        Prisma.sql`SELECT cicloId, totalFacturado, cobrado, porCobrar FROM v_rentabilidad_ciclo WHERE cicloId = ${cicloDed.cicloId}`,
      );

      expect(vistaRows.length).toBe(1);
      const vSql = vistaRows[0];

      // Verificación de la vista SQL:
      // totalFacturado: 1000 (A) + 500 (B) = 1500 (la venta C cancelada está excluida)
      expect(Number(vSql.totalFacturado)).toBe(1500.0);
      // cobrado: 600 (A) (el cobro anulado de B y el cobro de la venta C cancelada están excluidos)
      expect(Number(vSql.cobrado)).toBe(600.0);
      // porCobrar: 1500 - 600 = 900
      expect(Number(vSql.porCobrar)).toBe(900.0);

      // Consultar por API las ventas del ciclo
      const resVentas = await testRequest(app)
        .get(`/api/v1/ventas?cicloId=${cicloDed.cicloId}`)
        .set('Authorization', tokenA_Admin);

      const items = (resVentas.body as { data: VentaResponseItem[] }).data;
      const ventasNoCanceladas = items.filter(
        (v) => v.estadoCobro !== EstadoCobro.CANCELADA,
      );

      const sumaTotalCobradoTs = ventasNoCanceladas.reduce(
        (acc, v) => acc + Number(v.totalCobrado),
        0,
      );
      const sumaSaldoPendienteTs = ventasNoCanceladas.reduce(
        (acc, v) => acc + Number(v.saldoPendiente),
        0,
      );

      // PARIDAD MATEMÁTICA EXACTA:
      // 1. Suma de totalCobrado en TS coincide con cobrado de la vista SQL
      expect(sumaTotalCobradoTs).toBe(Number(vSql.cobrado));
      // 2. Suma de saldoPendiente en TS coincide con porCobrar de la vista SQL
      expect(sumaSaldoPendienteTs).toBe(Number(vSql.porCobrar));
    });
  });
});
