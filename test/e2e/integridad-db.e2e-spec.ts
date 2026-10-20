import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { createTestApp } from '../setup/create-test-app';
import { PrismaService } from '../../src/prisma/prisma.service';
import { getOrLoadSeedData, E2eSeedData } from '../setup/e2e-seed';
import { generateTestJwt } from '../setup/test-tokens.util';
import { CodigoError } from '../../src/common/errors/codigos-error.enum';
import { EstadoCiclo, Prisma } from '@prisma/client';

describe('C6: Integridad de BD con Nombres Reales (E2E)', () => {
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

  describe('1. RN-009 por API: Carrera de activación concurrente en la misma parcela', () => {
    it('Dos ciclos PLANIFICADO en la misma parcela iniciados simultáneamente: exactamente uno 200 y el otro 409 CICLO_YA_ACTIVO', async () => {
      // Crear una parcela dedicada
      const parcela = await prisma.parcela.create({
        data: {
          predioId: seed.empresaA.predio.id,
          nombre: `Parcela RN-009 ${Date.now()}`,
          superficie: new Prisma.Decimal('10.00'),
          estado: 'DISPONIBLE',
        },
      });

      // Crear dos ciclos en estado PLANIFICADO sobre la misma parcela
      const ciclo1 = await prisma.cicloProduccion.create({
        data: {
          empresaId: seed.empresaA.id,
          parcelaId: parcela.id,
          variedadId: seed.global.variedadId,
          creadoPorId: seed.empresaA.usuarios.admin.id,
          nombre: 'Ciclo Concurrente 1',
          estado: EstadoCiclo.PLANIFICADO,
          fechaInicio: new Date('2026-05-01'),
          superficieSembrada: new Prisma.Decimal('5.00'),
        },
      });

      const ciclo2 = await prisma.cicloProduccion.create({
        data: {
          empresaId: seed.empresaA.id,
          parcelaId: parcela.id,
          variedadId: seed.global.variedadId,
          creadoPorId: seed.empresaA.usuarios.admin.id,
          nombre: 'Ciclo Concurrente 2',
          estado: EstadoCiclo.PLANIFICADO,
          fechaInicio: new Date('2026-05-01'),
          superficieSembrada: new Prisma.Decimal('5.00'),
        },
      });

      // Disparar simultáneamente PATCH /iniciar para ambos ciclos
      const [res1, res2] = await Promise.all([
        request(app.getHttpServer())
          .patch(`/api/v1/ciclos/${ciclo1.id}/iniciar`)
          .set('Authorization', adminToken),
        request(app.getHttpServer())
          .patch(`/api/v1/ciclos/${ciclo2.id}/iniciar`)
          .set('Authorization', adminToken),
      ]);

      const statuses = [res1.status, res2.status].sort();
      expect(statuses).toEqual([200, 409]);

      const res409 = res1.status === 409 ? res1 : res2;
      expect(res409.body.code).toBe(CodigoError.CICLO_YA_ACTIVO);
      expect(res409.body.statusCode).toBe(409);

      // Verificar en BD: exactamente un ciclo ACTIVO en la parcela
      const activos = await prisma.cicloProduccion.findMany({
        where: {
          parcelaId: parcela.id,
          estado: EstadoCiclo.ACTIVO,
          deletedAt: null,
        },
      });
      expect(activos.length).toBe(1);
    });
  });

  function extraerMySqlErrno(error: any): number | null {
    const msg = String(error?.message || '');
    const match = msg.match(/errno\s*(\d+)/i) || msg.match(/code:\s*(\d+)/i);
    if (match) {
      return parseInt(match[1], 10);
    }
    if (error?.meta?.database_error_code) {
      return Number(error.meta.database_error_code);
    }
    if (error?.errno) {
      return Number(error.errno);
    }
    if (msg.includes('3819') || msg.includes('chk_')) return 3819;
    if (msg.includes('1451') || msg.includes('foreign key constraint fails'))
      return 1451;
    return null;
  }

  describe('2. CHECK Constraints físicos a nivel de RDBMS (MySQL errno 3819)', () => {
    it('chk_gasto_total: insertar gasto con total <= 0 falla con error de CHECK constraint (errno 3819)', async () => {
      let errnoCapturado: number | null = null;
      try {
        await prisma.$executeRawUnsafe(
          `INSERT INTO gasto (cicloId, categoriaId, creadoPorId, fecha, total, costoUnitario, cantidad, impuesto, createdAt, updatedAt)
           VALUES (?, ?, ?, '2026-02-01', 0.00, 0.00, 1.000, 0.00, NOW(3), NOW(3))`,
          seed.empresaA.cicloActivo.id,
          seed.empresaA.categoriaPropia.id,
          seed.empresaA.usuarios.admin.id,
        );
      } catch (error: any) {
        errnoCapturado = extraerMySqlErrno(error);
      }

      // MySQL 8.0: Check constraint 'chk_gasto_total' is violated (errno 3819)
      expect(errnoCapturado).toBe(3819);
    });

    it('chk_cosecha_cantidad: insertar cosecha con cantidad <= 0 falla con errno 3819', async () => {
      let errnoCapturado: number | null = null;
      try {
        await prisma.$executeRawUnsafe(
          `INSERT INTO cosecha (cicloId, unidadId, creadoPorId, fecha, cantidad, calidad, createdAt, updatedAt)
           VALUES (?, ?, ?, '2026-02-01', -5.000, 'PRIMERA', NOW(3), NOW(3))`,
          seed.empresaA.cicloActivo.id,
          seed.global.unidadKgId,
          seed.empresaA.usuarios.admin.id,
        );
      } catch (error: any) {
        errnoCapturado = extraerMySqlErrno(error);
      }

      expect(errnoCapturado).toBe(3819);
    });

    it('chk_merma_cantidad: insertar merma con cantidad <= 0 falla con errno 3819', async () => {
      let errnoCapturado: number | null = null;
      try {
        await prisma.$executeRawUnsafe(
          `INSERT INTO merma (cicloId, unidadId, motivoId, creadoPorId, fecha, cantidad, etapa, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, '2026-02-01', 0.000, 'CAMPO', NOW(3), NOW(3))`,
          seed.empresaA.cicloActivo.id,
          seed.global.unidadKgId,
          seed.global.motivoMermaId,
          seed.empresaA.usuarios.admin.id,
        );
      } catch (error: any) {
        errnoCapturado = extraerMySqlErrno(error);
      }

      expect(errnoCapturado).toBe(3819);
    });
  });

  describe('3. Foreign Keys en RESTRICT (MySQL errno 1451)', () => {
    it('Eliminar parcela que tiene ciclos falla por FK RESTRICT (errno 1451)', async () => {
      let errnoCapturado: number | null = null;
      try {
        await prisma.$executeRawUnsafe(
          'DELETE FROM parcela WHERE id = ?',
          seed.empresaA.parcela.id,
        );
      } catch (error: any) {
        errnoCapturado = extraerMySqlErrno(error);
      }

      expect(errnoCapturado).toBe(1451);
    });

    it('Eliminar ciclo que tiene gastos falla por FK RESTRICT (errno 1451)', async () => {
      let errnoCapturado: number | null = null;
      try {
        await prisma.$executeRawUnsafe(
          'DELETE FROM ciclo_produccion WHERE id = ?',
          seed.empresaA.cicloActivo.id,
        );
      } catch (error: any) {
        errnoCapturado = extraerMySqlErrno(error);
      }

      expect(errnoCapturado).toBe(1451);
    });
  });
});
