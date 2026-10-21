import { INestApplication } from '@nestjs/common';
import { createTestApp } from '../setup/create-test-app';
import { PrismaService } from '../../src/prisma/prisma.service';
import { Prisma } from '@prisma/client';

const runVolumen = process.env.E2E_VOLUMEN === '1';

if (!runVolumen) {
  describe.skip('Hito 9A: Prueba de Volumen y Plan de Ejecución (EXPLAIN ANALYZE)', () => {
    it('omitido salvo E2E_VOLUMEN=1', () => {});
  });
} else {
  describe('Hito 9A: Prueba de Volumen y Plan de Ejecución (EXPLAIN ANALYZE)', () => {
    let app: INestApplication;
    let prisma: PrismaService;

    beforeAll(async () => {
      const testApp = await createTestApp();
      app = testApp.app;
      prisma = testApp.prisma;
    });

    afterAll(async () => {
      await app.close();
    });

    it('compara plan EXPLAIN ANALYZE entre consulta acotada con IN y consulta abierta por empresa', async () => {
      const empresaId = 1;
      const cicloIds = [1, 2, 3];

      // 1. Consulta acotada con dos pasos: empresaId AND cicloId IN (ids)
      const t0 = Date.now();
      const analyzeIn = await prisma.$queryRaw<
        Record<string, unknown>[]
      >(Prisma.sql`
      EXPLAIN ANALYZE
      SELECT
        cicloId, empresaId, parcelaId, variedadId, estado, fechaInicio, superficieSembrada,
        costoTotal, kgCosechados, kgMerma, kgMermaCampo, kgNetos, kgVendidos, kgDisponibles,
        ingresos, totalFacturado, cobrado, ganancia, margenPct, roiPct, costoPorKg,
        precioPromedioKg, mermaPct, costoPorHectarea, rendimientoKgHa, porCobrar
      FROM v_rentabilidad_ciclo
      WHERE empresaId = ${empresaId}
        AND cicloId IN (${Prisma.join(cicloIds)})
    `);
      const msIn = Date.now() - t0;

      const firstIn = analyzeIn[0] as Record<string, unknown> | undefined;
      const treeIn =
        typeof firstIn?.['EXPLAIN'] === 'string' ? firstIn['EXPLAIN'] : '';

      // 2. Consulta abierta con solo empresaId
      const t1 = Date.now();
      const analyzeEmpresa = await prisma.$queryRaw<
        Record<string, unknown>[]
      >(Prisma.sql`
      EXPLAIN ANALYZE
      SELECT
        cicloId, empresaId, parcelaId, variedadId, estado, fechaInicio, superficieSembrada,
        costoTotal, kgCosechados, kgMerma, kgMermaCampo, kgNetos, kgVendidos, kgDisponibles,
        ingresos, totalFacturado, cobrado, ganancia, margenPct, roiPct, costoPorKg,
        precioPromedioKg, mermaPct, costoPorHectarea, rendimientoKgHa, porCobrar
      FROM v_rentabilidad_ciclo
      WHERE empresaId = ${empresaId}
    `);
      const msEmpresa = Date.now() - t1;

      const firstEmpresa = analyzeEmpresa[0] as
        Record<string, unknown> | undefined;
      const treeEmpresa =
        typeof firstEmpresa?.['EXPLAIN'] === 'string'
          ? firstEmpresa['EXPLAIN']
          : '';

      // Log para el reporte
      console.log('=== [EXPLAIN ANALYZE TREE - PASO 2 CON IN (ids)] ===');
      console.log(`Tiempo: ${msIn}ms`);
      console.log(treeIn);

      console.log('=== [EXPLAIN ANALYZE TREE - SOLO EMPRESA] ===');
      console.log(`Tiempo: ${msEmpresa}ms`);
      console.log(treeEmpresa);

      expect(treeIn).toBeDefined();
      expect(treeEmpresa).toBeDefined();
    });
  });
}
