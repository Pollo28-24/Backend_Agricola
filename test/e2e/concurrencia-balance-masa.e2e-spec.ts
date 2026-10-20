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
import { CalidadCosecha, EtapaMerma, Prisma } from '@prisma/client';

describe('C4: Concurrencia Real con Compuerta de Lock sobre MySQL (E2E)', () => {
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

  it('Caso (a): Dos mermas poscosecha de 80 kg sobre cosecha de 100 kg -> exactamente un 201 y un 409 MERMA_EXCEDE_COSECHA', async () => {
    // 1. Crear ciclo y cosecha de 100 kg aislados
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
        cantidad: new Prisma.Decimal('100.000'),
        calidad: CalidadCosecha.PRIMERA,
      },
    });

    // 2. Retener lock sobre el ciclo
    const lockHolder = await holdCicloLock(cicloDed.cicloId);

    // 3. Despachar dos peticiones de merma de 80 kg simultáneamente
    const promMerma1 = request(app.getHttpServer())
      .post('/api/v1/mermas')
      .set('Authorization', adminToken)
      .send({
        cicloId: cicloDed.cicloId,
        cosechaId: cosecha.id,
        unidadId: seed.global.unidadKgId,
        motivoId: seed.global.motivoMermaId,
        fecha: '2026-02-02',
        cantidad: 80,
        etapa: EtapaMerma.POSCOSECHA,
      })
      .then((res) => res);

    const promMerma2 = request(app.getHttpServer())
      .post('/api/v1/mermas')
      .set('Authorization', adminToken)
      .send({
        cicloId: cicloDed.cicloId,
        cosechaId: cosecha.id,
        unidadId: seed.global.unidadKgId,
        motivoId: seed.global.motivoMermaId,
        fecha: '2026-02-02',
        cantidad: 80,
        etapa: EtapaMerma.POSCOSECHA,
      })
      .then((res) => res);

    // 4. Compuerta de lock: esperar a que ambas peticiones se bloqueen en MySQL
    const blockedCount = await waitUntilBlocked(prisma, 2, 5000);

    // 5. Liberar lock
    await lockHolder.commit();

    // 6. Recoger respuestas
    const [res1, res2] = await Promise.all([promMerma1, promMerma2]);

    expect(blockedCount).toBeGreaterThanOrEqual(1);

    const statuses = [res1.status, res2.status].sort();
    expect(statuses).toEqual([201, 409]);

    const errorRes = res1.status === 409 ? res1 : res2;
    expect(errorRes.body.code).toBe(CodigoError.MERMA_EXCEDE_COSECHA);

    // 7. En BD: exactamente una sola merma persistida y suma <= 100 kg
    const mermasBD = await prisma.merma.findMany({
      where: { cicloId: cicloDed.cicloId, deletedAt: null },
    });
    expect(mermasBD.length).toBe(1);
    expect(Number(mermasBD[0].cantidad)).toBe(80);
  });

  it('Caso (b): Cosecha 1000 kg con merma 300 kg -> PATCH cosecha a 500 kg vs POST merma 300 kg simultáneos -> exactamente una gana', async () => {
    // 1. Crear ciclo, cosecha de 1000 kg y merma de 300 kg
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

    await prisma.merma.create({
      data: {
        cicloId: cicloDed.cicloId,
        cosechaId: cosecha.id,
        unidadId: seed.global.unidadKgId,
        motivoId: seed.global.motivoMermaId,
        creadoPorId: seed.empresaA.usuarios.admin.id,
        fecha: new Date('2026-02-02'),
        cantidad: new Prisma.Decimal('300.000'),
        etapa: EtapaMerma.POSCOSECHA,
      },
    });

    // 2. Retener lock
    const lockHolder = await holdCicloLock(cicloDed.cicloId);

    // 3. Despachar PATCH a 500 kg y POST nueva merma 300 kg
    // PATCH 500 es válido por sí solo (300 <= 500)
    // POST merma 300 es válido por sí solo (300 + 300 = 600 <= 1000)
    // Juntas son inválidas (600 > 500)
    const promPatch = request(app.getHttpServer())
      .patch(`/api/v1/cosechas/${cosecha.id}`)
      .set('Authorization', adminToken)
      .send({ cantidad: 500 })
      .then((res) => res);

    const promPostMerma = request(app.getHttpServer())
      .post('/api/v1/mermas')
      .set('Authorization', adminToken)
      .send({
        cicloId: cicloDed.cicloId,
        cosechaId: cosecha.id,
        unidadId: seed.global.unidadKgId,
        motivoId: seed.global.motivoMermaId,
        fecha: '2026-02-03',
        cantidad: 300,
        etapa: EtapaMerma.POSCOSECHA,
      })
      .then((res) => res);

    // 4. Compuerta de lock
    const blockedCount = await waitUntilBlocked(prisma, 2, 5000);

    // 5. Liberar
    await lockHolder.commit();

    const [resPatch, resPostMerma] = await Promise.all([
      promPatch,
      promPostMerma,
    ]);

    expect(blockedCount).toBeGreaterThanOrEqual(1);

    const statuses = [resPatch.status, resPostMerma.status].sort();
    // Si gana PATCH -> 200 y 409; si gana POST merma -> 201 y 409
    expect([
      [200, 409],
      [201, 409],
    ]).toContainEqual(statuses);

    const errorRes = resPatch.status === 409 ? resPatch : resPostMerma;
    expect(errorRes.body.code).toBe(CodigoError.MERMA_EXCEDE_COSECHA);

    // Invariante en BD: suma de mermas poscosecha <= suma de cosechas
    const cosechasFinal = await prisma.cosecha.findMany({
      where: { cicloId: cicloDed.cicloId, deletedAt: null },
    });
    const mermasFinal = await prisma.merma.findMany({
      where: {
        cicloId: cicloDed.cicloId,
        deletedAt: null,
        etapa: EtapaMerma.POSCOSECHA,
      },
    });

    const sumaCosecha = cosechasFinal.reduce(
      (acc, c) => acc + Number(c.cantidad),
      0,
    );
    const sumaMerma = mermasFinal.reduce(
      (acc, m) => acc + Number(m.cantidad),
      0,
    );

    expect(sumaMerma).toBeLessThanOrEqual(sumaCosecha);
  });

  it('Caso (c): Merma de etapa CAMPO simultánea no altera el balance de masa poscosecha ni compite por el límite', async () => {
    // 1. Crear ciclo y cosecha de 100 kg
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
        cantidad: new Prisma.Decimal('100.000'),
        calidad: CalidadCosecha.PRIMERA,
      },
    });

    // 2. Retener lock
    const lockHolder = await holdCicloLock(cicloDed.cicloId);

    // 3. Merma de CAMPO de 500 kg (incluso mayor a la cosecha) y merma POSCOSECHA de 80 kg
    const promCampo = request(app.getHttpServer())
      .post('/api/v1/mermas')
      .set('Authorization', adminToken)
      .send({
        cicloId: cicloDed.cicloId,
        unidadId: seed.global.unidadKgId,
        motivoId: seed.global.motivoMermaId,
        fecha: '2026-02-02',
        cantidad: 500,
        etapa: EtapaMerma.CAMPO,
      })
      .then((res) => res);

    const promPoscosecha = request(app.getHttpServer())
      .post('/api/v1/mermas')
      .set('Authorization', adminToken)
      .send({
        cicloId: cicloDed.cicloId,
        cosechaId: cosecha.id,
        unidadId: seed.global.unidadKgId,
        motivoId: seed.global.motivoMermaId,
        fecha: '2026-02-02',
        cantidad: 80,
        etapa: EtapaMerma.POSCOSECHA,
      })
      .then((res) => res);

    // 4. Compuerta de lock
    const blockedCount = await waitUntilBlocked(prisma, 2, 5000);

    // 5. Liberar
    await lockHolder.commit();

    const [resCampo, resPoscosecha] = await Promise.all([
      promCampo,
      promPoscosecha,
    ]);

    expect(blockedCount).toBeGreaterThanOrEqual(1);

    // Ambas deben tener éxito: CAMPO no compite por el balance y POSCOSECHA 80 <= 100
    expect(resCampo.status).toBe(201);
    expect(resPoscosecha.status).toBe(201);

    const mermasBD = await prisma.merma.findMany({
      where: { cicloId: cicloDed.cicloId, deletedAt: null },
    });
    expect(mermasBD.length).toBe(2);
  });
});
