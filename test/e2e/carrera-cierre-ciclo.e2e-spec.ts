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
import { EstadoCiclo, Prisma } from '@prisma/client';

describe('C5: Carrera de Cierre vs Operaciones de Ciclo (E2E)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let seed: E2eSeedData;
  let adminToken: string;

  beforeAll(async () => {
    const testApp = await createTestApp();
    app = testApp.app;
    prisma = testApp.prisma;
    seed = await getOrLoadSeedData(prisma);
    adminToken = `Bearer ${generateTestJwt(
      seed.empresaA.usuarios.admin.id,
      seed.empresaA.id,
      'ADMIN',
    )}`;
  });

  afterAll(async () => {
    await app.close();
  });

  it('Demostración de carrera: las peticiones concurrentes deben bloquearse en MySQL y rechazar con 409 CICLO_CERRADO si el ciclo fue finalizado bajo el lock', async () => {
    // 1. Crear un ciclo productivo dedicado y aislado
    const cicloDed = await crearCicloAisladoParaConcurrencia(
      prisma,
      seed.empresaA.id,
      seed.empresaA.usuarios.admin.id,
      seed.global.variedadId,
    );

    // Crear una actividad y un gasto previos para probar PATCH y DELETE
    const actPrevia = await prisma.actividad.create({
      data: {
        cicloId: cicloDed.cicloId,
        tipoActividadId: seed.global.tipoActividadId,
        responsableId: seed.empresaA.usuarios.admin.id,
        creadoPorId: seed.empresaA.usuarios.admin.id,
        fecha: new Date('2026-01-10'),
        descripcion: 'Actividad previa',
      },
    });

    const gastoPrevio = await prisma.gasto.create({
      data: {
        cicloId: cicloDed.cicloId,
        categoriaId: seed.empresaA.categoriaPropia.id,
        proveedorId: seed.empresaA.proveedor.id,
        creadoPorId: seed.empresaA.usuarios.admin.id,
        fecha: new Date('2026-01-15'),
        cantidad: new Prisma.Decimal('5.000'),
        costoUnitario: new Prisma.Decimal('100.00'),
        impuesto: new Prisma.Decimal('0.00'),
        total: new Prisma.Decimal('500.00'),
        unidadId: seed.global.unidadKgId,
        descripcion: 'Gasto previo',
      },
    });

    // 2. Transacción auxiliar toma el lock exclusivo sobre el ciclo y lo pasa a FINALIZADO sin commitear aún
    const lockHolder = await holdCicloLock(cicloDed.cicloId, async (conn) => {
      await conn.query(
        "UPDATE ciclo_produccion SET estado = 'FINALIZADO', fechaFin = '2026-03-31' WHERE id = ?",
        [cicloDed.cicloId],
      );
    });

    // 3. Lanzar peticiones de captura concurrentes (despachadas activamente mientras el lock está retenido)
    const promCrearGasto = request(app.getHttpServer())
      .post('/api/v1/gastos')
      .set('Authorization', adminToken)
      .send({
        cicloId: cicloDed.cicloId,
        categoriaId: seed.empresaA.categoriaPropia.id,
        fecha: '2026-02-15',
        total: '500',
        cantidad: '10',
        costoUnitario: '50',
        unidadId: seed.global.unidadKgId,
        descripcion: 'Gasto en carrera',
      })
      .then((res) => res);

    const promCrearActividad = request(app.getHttpServer())
      .post('/api/v1/actividades')
      .set('Authorization', adminToken)
      .send({
        cicloId: cicloDed.cicloId,
        tipoActividadId: seed.global.tipoActividadId,
        fecha: '2026-02-15',
        descripcion: 'Actividad en carrera',
      })
      .then((res) => res);

    const promActualizarGasto = request(app.getHttpServer())
      .patch(`/api/v1/gastos/${gastoPrevio.id}`)
      .set('Authorization', adminToken)
      .send({ descripcion: 'Gasto modificado en carrera' })
      .then((res) => res);

    const promEliminarGasto = request(app.getHttpServer())
      .delete(`/api/v1/gastos/${gastoPrevio.id}`)
      .set('Authorization', adminToken)
      .then((res) => res);

    const promActualizarActividad = request(app.getHttpServer())
      .patch(`/api/v1/actividades/${actPrevia.id}`)
      .set('Authorization', adminToken)
      .send({ descripcion: 'Actividad modificada en carrera' })
      .then((res) => res);

    // 4. Verificar compuerta de lock: las operaciones deben bloquearse esperando el lock en MySQL
    const blockedCount = await waitUntilBlocked(prisma, 1, 5000);

    // 5. Liberar el lock
    await lockHolder.commit();

    // 6. Recoger respuestas
    const [resGasto, resAct, resPatchGasto, resDelGasto, resPatchAct] =
      await Promise.all([
        promCrearGasto,
        promCrearActividad,
        promActualizarGasto,
        promEliminarGasto,
        promActualizarActividad,
      ]);

    // Afirmaciones:
    // A. Demostración de que la compuerta de lock funcionó (al menos 1 transacción se bloqueó en InnoDB)
    expect(blockedCount).toBeGreaterThanOrEqual(1);

    expect(resGasto.status).toBe(409);
    expect(resGasto.body.code).toBe(CodigoError.CICLO_CERRADO);

    expect(resAct.status).toBe(409);
    expect(resAct.body.code).toBe(CodigoError.CICLO_CERRADO);

    expect(resPatchGasto.status).toBe(409);
    expect(resPatchGasto.body.code).toBe(CodigoError.CICLO_CERRADO);

    expect(resDelGasto.status).toBe(409);
    expect(resDelGasto.body.code).toBe(CodigoError.CICLO_CERRADO);

    expect(resPatchAct.status).toBe(409);
    expect(resPatchAct.body.code).toBe(CodigoError.CICLO_CERRADO);

    // C. Verificar en BD que no quedó ningún registro colado ni mutado
    const gastosFinales = await prisma.gasto.findMany({
      where: { cicloId: cicloDed.cicloId, deletedAt: null },
    });
    expect(gastosFinales.length).toBe(1);
    expect(gastosFinales[0].descripcion).toBe('Gasto previo'); // No se modificó ni eliminó

    const actsFinales = await prisma.actividad.findMany({
      where: { cicloId: cicloDed.cicloId, deletedAt: null },
    });
    expect(actsFinales.length).toBe(1);
    expect(actsFinales[0].descripcion).toBe('Actividad previa'); // No se modificó
  });

  it('La transición de finalizar ciclo espera pacientemente bajo el lock y culmina exitosamente tras liberar', async () => {
    const cicloDed = await crearCicloAisladoParaConcurrencia(
      prisma,
      seed.empresaA.id,
      seed.empresaA.usuarios.admin.id,
      seed.global.variedadId,
    );

    // Retener lock sobre el ciclo
    const lockHolder = await holdCicloLock(cicloDed.cicloId);

    // Lanzar la transición de finalizar (despachada activamente bajo el lock)
    const promFinalizar = request(app.getHttpServer())
      .patch(`/api/v1/ciclos/${cicloDed.cicloId}/finalizar`)
      .set('Authorization', adminToken)
      .send({ fechaFin: '2026-03-31' })
      .then((res) => res);

    // Esperar a que la petición quede en espera por el lock
    const blockedCount = await waitUntilBlocked(prisma, 1, 5000);

    // Liberar el lock
    await lockHolder.commit();

    // Esperar respuesta
    const resFinalizar = await promFinalizar;

    expect(blockedCount).toBeGreaterThanOrEqual(1);
    expect(resFinalizar.status).toBe(200);
    expect(resFinalizar.body.estado).toBe(EstadoCiclo.FINALIZADO);

    const cicloActualizado = await prisma.cicloProduccion.findUnique({
      where: { id: cicloDed.cicloId },
    });
    expect(cicloActualizado?.estado).toBe(EstadoCiclo.FINALIZADO);
  });

  it('Eliminar ciclo con compuerta de lock mientras otra transacción retiene el lock y cambia de estado: debe esperar y rechazar tras liberar', async () => {
    const cicloDed = await crearCicloAisladoParaConcurrencia(
      prisma,
      seed.empresaA.id,
      seed.empresaA.usuarios.admin.id,
      seed.global.variedadId,
    );

    await prisma.cicloProduccion.update({
      where: { id: cicloDed.cicloId },
      data: { estado: EstadoCiclo.PLANIFICADO },
    });

    const lockHolder = await holdCicloLock(cicloDed.cicloId, async (conn) => {
      await conn.query(
        "UPDATE ciclo_produccion SET estado = 'ACTIVO' WHERE id = ?",
        [cicloDed.cicloId],
      );
    });

    const promEliminar = request(app.getHttpServer())
      .delete(`/api/v1/ciclos/${cicloDed.cicloId}`)
      .set('Authorization', adminToken)
      .then((res) => res);

    const blockedCount = await waitUntilBlocked(prisma, 1, 5000);
    expect(blockedCount).toBeGreaterThanOrEqual(1);

    await lockHolder.commit();

    const resEliminar = await promEliminar;

    expect(resEliminar.status).toBe(409);
    expect(resEliminar.body.code).toBe(CodigoError.CONFLICTO);

    const cicloEnDb = await prisma.cicloProduccion.findUnique({
      where: { id: cicloDed.cicloId },
    });
    expect(cicloEnDb?.deletedAt).toBeNull();
    expect(cicloEnDb?.estado).toBe(EstadoCiclo.ACTIVO);
  });
});

