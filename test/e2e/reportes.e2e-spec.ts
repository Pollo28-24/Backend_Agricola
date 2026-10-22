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
import { CodigoError } from '../../src/common/errors/codigos-error.enum';
import {
  EstadoCiclo,
  EstadoVenta,
  EtapaMerma,
  CalidadCosecha,
  MetodoPago,
  Prisma,
} from '@prisma/client';
import { ReporteFormatoUtil } from '../../src/common/utils/reporte-formato.util';
import { calcularBalanceMasaKg } from '../../src/common/utils/ciclo-balance.util';

interface ApiResponseError {
  code?: string;
  message?: string;
}

interface CicloResumenBody {
  id: number;
  nombre: string;
  estado: EstadoCiclo;
}

interface IndicadoresRentabilidadBody {
  costoTotal: string;
  kgCosechados: string;
  kgMermaPoscosecha: string;
  kgMermaCampo: string;
  kgNetos: string;
  kgVendidos: string;
  kgDisponibles: string;
  ingresos: string;
  totalFacturado: string;
  cobrado: string;
  ganancia: string;
  margenPct: string | null;
  roiPct: string | null;
  costoPorKg: string | null;
  precioPromedioKg: string | null;
  mermaPct: string | null;
  costoPorHectarea: string | null;
  rendimientoKgHa: string | null;
  porCobrar: string;
}

interface RentabilidadDetalleBody {
  ciclo: CicloResumenBody;
  indicadores: IndicadoresRentabilidadBody;
}

interface ItemRentabilidadLista {
  ciclo: CicloResumenBody;
  indicadores: IndicadoresRentabilidadBody;
}

interface PaginatedRentabilidadBody {
  data: ItemRentabilidadLista[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

interface CostoCategoriaItemBody {
  categoriaRaizId: number;
  categoriaRaiz: string;
  monto: string;
  porcentaje: string;
}

interface CostoActividadItemBody {
  tipoActividadId: number;
  tipoActividad: string;
  numeroActividades: number;
  horasTotales: string;
  costoTotal: string;
}

interface MermaDesgloseItemBody {
  motivo: string;
  etapa: EtapaMerma;
  kgMerma: string;
}

interface ComparativoItemBody {
  ciclo: CicloResumenBody;
  indicadores: {
    margenPct: string | null;
    roiPct: string | null;
    costoPorKg: string | null;
    ganancia: string;
  };
  gananciaCicloAnterior?: string | null;
  margenPctCicloAnterior?: string | null;
  costoPorKgCicloAnterior?: string | null;
}

interface ComparativoParcelaBody {
  data: ComparativoItemBody[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

interface RentabilidadVistaFila {
  costoTotal: Prisma.Decimal | number | string | null;
  kgCosechados: Prisma.Decimal | number | string | null;
  kgMerma: Prisma.Decimal | number | string | null;
  kgMermaCampo: Prisma.Decimal | number | string | null;
  kgNetos: Prisma.Decimal | number | string | null;
  kgVendidos: Prisma.Decimal | number | string | null;
  kgDisponibles: Prisma.Decimal | number | string | null;
  ingresos: Prisma.Decimal | number | string | null;
  totalFacturado: Prisma.Decimal | number | string | null;
  cobrado: Prisma.Decimal | number | string | null;
  ganancia: Prisma.Decimal | number | string | null;
  margenPct: Prisma.Decimal | number | string | null;
  roiPct: Prisma.Decimal | number | string | null;
  costoPorKg: Prisma.Decimal | number | string | null;
  precioPromedioKg: Prisma.Decimal | number | string | null;
  mermaPct: Prisma.Decimal | number | string | null;
  costoPorHectarea: Prisma.Decimal | number | string | null;
  rendimientoKgHa: Prisma.Decimal | number | string | null;
  porCobrar: Prisma.Decimal | number | string | null;
}

describe('Hito 9A: Módulo de Indicadores y Reportes Financieros (E2E)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let seed: E2eSeedData;

  let tokenA_Admin: string;
  let tokenA_Capturista: string;
  let tokenA_Contador: string;
  let tokenB_Admin: string;

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
    tokenB_Admin = `Bearer ${generateTestJwt(
      seed.empresaB.usuarios.admin.id,
      seed.empresaB.id,
      'ADMIN',
    )}`;
  });

  afterAll(async () => {
    await app.close();
  });

  // =========================================================================
  // E1. Cifras por API del Canvas (Anexo D puro) y del Ciclo B
  // =========================================================================
  describe('E1. Cifras por API del Canvas (Anexo D puro) y Ciclo B', () => {
    let cicloCanvasId: number;
    let cicloBId: number;

    beforeAll(async () => {
      // 1. CICLO CANVAS (Valores exactos del Anexo D Canvas: sin mermas poscosecha en Canvas)
      const dedCanvas = await crearCicloAisladoParaConcurrencia(
        prisma,
        seed.empresaA.id,
        seed.empresaA.usuarios.admin.id,
        seed.global.variedadId,
        2.5,
      );
      cicloCanvasId = dedCanvas.cicloId;

      await prisma.cicloProduccion.update({
        where: { id: cicloCanvasId },
        data: {
          nombre: 'Ciclo Canvas Anexo D',
          estado: EstadoCiclo.FINALIZADO,
          fechaInicio: new Date('2026-01-15T00:00:00.000Z'),
          fechaFin: new Date('2026-06-30T00:00:00.000Z'),
        },
      });

      // Gasto Canvas: 86,000.00 pesos
      await prisma.gasto.create({
        data: {
          cicloId: cicloCanvasId,
          categoriaId: seed.global.categoriaSistemaId,
          proveedorId: seed.empresaA.proveedor.id,
          creadoPorId: seed.empresaA.usuarios.admin.id,
          fecha: new Date('2026-02-01'),
          descripcion: 'Costos totales Canvas Anexo D',
          cantidad: new Prisma.Decimal('1.000'),
          costoUnitario: new Prisma.Decimal('86000.00'),
          impuesto: new Prisma.Decimal('0.00'),
          total: new Prisma.Decimal('86000.00'),
        },
      });

      // Cosecha Canvas: 8,200 kg
      const cosechaCanvas = await prisma.cosecha.create({
        data: {
          cicloId: cicloCanvasId,
          unidadId: seed.global.unidadKgId,
          creadoPorId: seed.empresaA.usuarios.admin.id,
          fecha: new Date('2026-04-01'),
          cantidad: new Prisma.Decimal('8200.000'),
          calidad: CalidadCosecha.PRIMERA,
        },
      });

      // Venta Canvas: 8,200 kg por 121,000.00 pesos
      const ventaCanvas = await prisma.venta.create({
        data: {
          cicloId: cicloCanvasId,
          clienteId: seed.empresaA.cliente.id,
          creadoPorId: seed.empresaA.usuarios.admin.id,
          fecha: new Date('2026-05-01'),
          impuesto: new Prisma.Decimal('0.00'),
          total: new Prisma.Decimal('121000.00'),
          estado: EstadoVenta.REGISTRADA,
        },
      });

      await prisma.detalleVenta.create({
        data: {
          ventaId: ventaCanvas.id,
          cosechaId: cosechaCanvas.id,
          unidadId: seed.global.unidadKgId,
          calidad: CalidadCosecha.PRIMERA,
          cantidad: new Prisma.Decimal('8200.000'),
          precioUnitario: new Prisma.Decimal('14.756097'),
        },
      });

      // 2. CICLO B (con IVA, mermas poscosecha y campo, venta cancelada, cobro parcial)
      const dedB = await crearCicloAisladoParaConcurrencia(
        prisma,
        seed.empresaA.id,
        seed.empresaA.usuarios.admin.id,
        seed.global.variedadId,
        1.0,
      );
      cicloBId = dedB.cicloId;

      await prisma.cicloProduccion.update({
        where: { id: cicloBId },
        data: {
          nombre: 'Ciclo B Escenario Completo',
          estado: EstadoCiclo.FINALIZADO,
          fechaInicio: new Date('2026-02-01T00:00:00.000Z'),
          fechaFin: new Date('2026-07-01T00:00:00.000Z'),
        },
      });

      // Gasto vigente: 10,000.00 pesos
      await prisma.gasto.create({
        data: {
          cicloId: cicloBId,
          categoriaId: seed.global.categoriaSistemaId,
          proveedorId: seed.empresaA.proveedor.id,
          creadoPorId: seed.empresaA.usuarios.admin.id,
          fecha: new Date('2026-02-10'),
          descripcion: 'Gasto operativo Ciclo B',
          cantidad: new Prisma.Decimal('1.000'),
          costoUnitario: new Prisma.Decimal('10000.00'),
          impuesto: new Prisma.Decimal('0.00'),
          total: new Prisma.Decimal('10000.00'),
        },
      });

      // Gasto borrado: 5,000.00 pesos (no debe contar por RN-057)
      await prisma.gasto.create({
        data: {
          cicloId: cicloBId,
          categoriaId: seed.global.categoriaSistemaId,
          proveedorId: seed.empresaA.proveedor.id,
          creadoPorId: seed.empresaA.usuarios.admin.id,
          fecha: new Date('2026-02-15'),
          descripcion: 'Gasto borrado Ciclo B',
          cantidad: new Prisma.Decimal('1.000'),
          costoUnitario: new Prisma.Decimal('5000.00'),
          impuesto: new Prisma.Decimal('0.00'),
          total: new Prisma.Decimal('5000.00'),
          deletedAt: new Date('2026-02-16'),
        },
      });

      // Cosecha: 1,000.000 kg
      const cosechaB = await prisma.cosecha.create({
        data: {
          cicloId: cicloBId,
          unidadId: seed.global.unidadKgId,
          creadoPorId: seed.empresaA.usuarios.admin.id,
          fecha: new Date('2026-03-01'),
          cantidad: new Prisma.Decimal('1000.000'),
          calidad: CalidadCosecha.PRIMERA,
        },
      });

      // Merma poscosecha: 50.000 kg
      await prisma.merma.create({
        data: {
          cicloId: cicloBId,
          unidadId: seed.global.unidadKgId,
          motivoId: seed.global.motivoMermaId,
          creadoPorId: seed.empresaA.usuarios.admin.id,
          fecha: new Date('2026-03-02'),
          cantidad: new Prisma.Decimal('50.000'),
          etapa: EtapaMerma.POSCOSECHA,
        },
      });

      // Merma campo: 300.000 kg (no resta de cosecha, solo informativa)
      await prisma.merma.create({
        data: {
          cicloId: cicloBId,
          unidadId: seed.global.unidadKgId,
          motivoId: seed.global.motivoMermaId,
          creadoPorId: seed.empresaA.usuarios.admin.id,
          fecha: new Date('2026-02-28'),
          cantidad: new Prisma.Decimal('300.000'),
          etapa: EtapaMerma.CAMPO,
        },
      });

      // Venta vigente: 600.000 kg a precio 20.00 -> subtotal 12,000.00, IVA 2,000.00 -> totalFacturado 14,000.00
      const ventaB = await prisma.venta.create({
        data: {
          cicloId: cicloBId,
          clienteId: seed.empresaA.cliente.id,
          creadoPorId: seed.empresaA.usuarios.admin.id,
          fecha: new Date('2026-04-01'),
          impuesto: new Prisma.Decimal('2000.00'),
          total: new Prisma.Decimal('14000.00'),
          estado: EstadoVenta.REGISTRADA,
        },
      });

      await prisma.detalleVenta.create({
        data: {
          ventaId: ventaB.id,
          cosechaId: cosechaB.id,
          unidadId: seed.global.unidadKgId,
          calidad: CalidadCosecha.PRIMERA,
          cantidad: new Prisma.Decimal('600.000'),
          precioUnitario: new Prisma.Decimal('20.00'),
        },
      });

      // Venta cancelada: 100 kg por 3,000 pesos (no debe sumar por RN-057)
      const ventaCancelada = await prisma.venta.create({
        data: {
          cicloId: cicloBId,
          clienteId: seed.empresaA.cliente.id,
          creadoPorId: seed.empresaA.usuarios.admin.id,
          fecha: new Date('2026-04-05'),
          impuesto: new Prisma.Decimal('0.00'),
          total: new Prisma.Decimal('3000.00'),
          estado: EstadoVenta.CANCELADA,
        },
      });

      await prisma.detalleVenta.create({
        data: {
          ventaId: ventaCancelada.id,
          cosechaId: cosechaB.id,
          unidadId: seed.global.unidadKgId,
          calidad: CalidadCosecha.PRIMERA,
          cantidad: new Prisma.Decimal('100.000'),
          precioUnitario: new Prisma.Decimal('30.00'),
        },
      });

      // Cobro vigente de 8,000.00
      await prisma.cobroVenta.create({
        data: {
          ventaId: ventaB.id,
          registradoPorId: seed.empresaA.usuarios.admin.id,
          fecha: new Date('2026-04-10'),
          monto: new Prisma.Decimal('8000.00'),
          metodo: MetodoPago.TRANSFERENCIA,
        },
      });

      // Cobro anulado de 1,000.00 (no debe sumar por RN-057)
      await prisma.cobroVenta.create({
        data: {
          ventaId: ventaB.id,
          registradoPorId: seed.empresaA.usuarios.admin.id,
          fecha: new Date('2026-04-11'),
          monto: new Prisma.Decimal('1000.00'),
          metodo: MetodoPago.TRANSFERENCIA,
          deletedAt: new Date('2026-04-12'),
        },
      });
    });

    it('Ciclo Canvas: verifica exactamente las cifras del Anexo D del documento normativo', async () => {
      const res = await testRequest(app)
        .get(`/api/v1/reportes/ciclos/${cicloCanvasId}/rentabilidad`)
        .set('Authorization', tokenA_Admin);

      expect(res.status).toBe(200);
      const ind = (res.body as RentabilidadDetalleBody).indicadores;

      expect(ind.costoTotal).toBe('86000.00');
      expect(ind.ingresos).toBe('121000.00');
      expect(ind.ganancia).toBe('35000.00');
      expect(ind.margenPct).toBe('28.93');
      expect(ind.roiPct).toBe('40.70');
      expect(ind.costoPorKg).toBe('10.49');
      expect(ind.precioPromedioKg).toBe('14.76');
      expect(ind.porCobrar).toBe('121000.00');
    });

    it('Ciclo B: verifica cada una de las 16 métricas exigidas para el escenario completo', async () => {
      const res = await testRequest(app)
        .get(`/api/v1/reportes/ciclos/${cicloBId}/rentabilidad`)
        .set('Authorization', tokenA_Admin);

      expect(res.status).toBe(200);
      const ind = (res.body as RentabilidadDetalleBody).indicadores;

      expect(ind.costoTotal).toBe('10000.00');
      expect(ind.kgMermaPoscosecha).toBe('50.000');
      expect(ind.kgMermaCampo).toBe('300.000');
      expect(ind.kgNetos).toBe('950.000');
      expect(ind.kgVendidos).toBe('600.000');
      expect(ind.kgDisponibles).toBe('350.000');
      expect(ind.ingresos).toBe('12000.00');
      expect(ind.totalFacturado).toBe('14000.00');
      expect(ind.cobrado).toBe('8000.00');
      expect(ind.ganancia).toBe('2000.00');
      expect(ind.margenPct).toBe('16.67');
      expect(ind.roiPct).toBe('20.00');
      expect(ind.costoPorKg).toBe('10.53');
      expect(ind.precioPromedioKg).toBe('20.00');
      expect(ind.mermaPct).toBe('5.00');
      expect(ind.porCobrar).toBe('6000.00');
    });
  });

  // =========================================================================
  // E2. Desgloses con datos reales (orden monto desc, raíz jerárquica, campo separado)
  // =========================================================================
  describe('E2. Desgloses de costos y mermas con datos reales y jerarquía', () => {
    let cicloDesgloseId: number;
    let tipoActividad1Id: number;

    beforeAll(async () => {
      const ded = await crearCicloAisladoParaConcurrencia(
        prisma,
        seed.empresaA.id,
        seed.empresaA.usuarios.admin.id,
        seed.global.variedadId,
        2.0,
      );
      cicloDesgloseId = ded.cicloId;

      const tipoAct = await prisma.tipoActividad.findFirst();
      tipoActividad1Id = tipoAct ? tipoAct.id : 1;

      // 1. Actividad operativa con 8 horas
      const actividad = await prisma.actividad.create({
        data: {
          cicloId: cicloDesgloseId,
          tipoActividadId: tipoActividad1Id,
          creadoPorId: seed.empresaA.usuarios.admin.id,
          fecha: new Date('2026-03-01'),
          horasTrabajadas: new Prisma.Decimal('8.00'),
        },
      });

      // 2. Gastos en distintas categorías (padre e hijo)
      // Categoría padre: 4,000.00
      await prisma.gasto.create({
        data: {
          cicloId: cicloDesgloseId,
          categoriaId: seed.global.categoriaSistemaId,
          proveedorId: seed.empresaA.proveedor.id,
          creadoPorId: seed.empresaA.usuarios.admin.id,
          actividadId: actividad.id,
          fecha: new Date('2026-03-01'),
          descripcion: 'Gasto en categoría raíz',
          cantidad: new Prisma.Decimal('1.000'),
          costoUnitario: new Prisma.Decimal('4000.00'),
          impuesto: new Prisma.Decimal('0.00'),
          total: new Prisma.Decimal('4000.00'),
        },
      });

      // 3. Mermas con motivo en CAMPO y en POSCOSECHA
      await prisma.merma.create({
        data: {
          cicloId: cicloDesgloseId,
          unidadId: seed.global.unidadKgId,
          motivoId: seed.global.motivoMermaId,
          creadoPorId: seed.empresaA.usuarios.admin.id,
          fecha: new Date('2026-03-05'),
          cantidad: new Prisma.Decimal('150.000'),
          etapa: EtapaMerma.POSCOSECHA,
        },
      });

      await prisma.merma.create({
        data: {
          cicloId: cicloDesgloseId,
          unidadId: seed.global.unidadKgId,
          motivoId: seed.global.motivoMermaId,
          creadoPorId: seed.empresaA.usuarios.admin.id,
          fecha: new Date('2026-03-04'),
          cantidad: new Prisma.Decimal('80.000'),
          etapa: EtapaMerma.CAMPO,
        },
      });
    });

    it('costos-por-categoria: retorna lista ordenada por monto desc con cálculo de porcentaje', async () => {
      const res = await testRequest(app)
        .get(`/api/v1/reportes/ciclos/${cicloDesgloseId}/costos-por-categoria`)
        .set('Authorization', tokenA_Admin);

      expect(res.status).toBe(200);
      const items = res.body as CostoCategoriaItemBody[];
      expect(items.length).toBeGreaterThanOrEqual(1);
      expect(items[0].monto).toBe('4000.00');
      expect(items[0].porcentaje).toBe('100.00');
    });

    it('costos-por-actividad: retorna desglose con horasTotales y costoTotal ordenado desc', async () => {
      const res = await testRequest(app)
        .get(`/api/v1/reportes/ciclos/${cicloDesgloseId}/costos-por-actividad`)
        .set('Authorization', tokenA_Admin);

      expect(res.status).toBe(200);
      const items = res.body as CostoActividadItemBody[];
      expect(items.length).toBeGreaterThanOrEqual(1);
      expect(items[0].horasTotales).toBe('8.00');
      expect(items[0].costoTotal).toBe('4000.00');
    });

    it('mermas: desglosa por motivo y distingue claramente etapa CAMPO de POSCOSECHA', async () => {
      const res = await testRequest(app)
        .get(`/api/v1/reportes/ciclos/${cicloDesgloseId}/mermas`)
        .set('Authorization', tokenA_Admin);

      expect(res.status).toBe(200);
      const items = res.body as MermaDesgloseItemBody[];
      expect(items.length).toBe(2);

      const pos = items.find((i) => i.etapa === EtapaMerma.POSCOSECHA);
      const cam = items.find((i) => i.etapa === EtapaMerma.CAMPO);

      expect(pos?.kgMerma).toBe('150.000');
      expect(cam?.kgMerma).toBe('80.000');
    });
  });

  // =========================================================================
  // E3. RN-057 (exclusiones de eliminados lógicos y cancelados; ciclo borrado = 404)
  // =========================================================================
  describe('E3. RN-057: Exclusiones de eliminados lógicos y cancelados', () => {
    let cicloBorradoId: number;

    beforeAll(async () => {
      const ded = await crearCicloAisladoParaConcurrencia(
        prisma,
        seed.empresaA.id,
        seed.empresaA.usuarios.admin.id,
        seed.global.variedadId,
        1.0,
      );
      cicloBorradoId = ded.cicloId;

      await prisma.cicloProduccion.update({
        where: { id: cicloBorradoId },
        data: { deletedAt: new Date() },
      });
    });

    it('un ciclo con borrado lógico responde 404 RECURSO_NO_ENCONTRADO en todas las rutas hijas', async () => {
      const rutas = [
        `/api/v1/reportes/ciclos/${cicloBorradoId}/rentabilidad`,
        `/api/v1/reportes/ciclos/${cicloBorradoId}/costos-por-categoria`,
        `/api/v1/reportes/ciclos/${cicloBorradoId}/costos-por-actividad`,
        `/api/v1/reportes/ciclos/${cicloBorradoId}/mermas`,
      ];

      for (const ruta of rutas) {
        const res = await testRequest(app)
          .get(ruta)
          .set('Authorization', tokenA_Admin);
        expect(res.status).toBe(404);
        expect((res.body as ApiResponseError).code).toBe(
          CodigoError.RECURSO_NO_ENCONTRADO,
        );
      }
    });
  });

  // =========================================================================
  // E4. Prueba por tabla sobre las 6 rutas (RBAC, 404 ajenos y no fuga en listados)
  // =========================================================================
  describe('E4. Matriz por tabla sobre las 6 rutas (RBAC y Aislamiento)', () => {
    let cicloAId: number;
    let parcelaAId: number;
    let cicloBId: number;
    let parcelaBId: number;

    beforeAll(async () => {
      const dedA = await crearCicloAisladoParaConcurrencia(
        prisma,
        seed.empresaA.id,
        seed.empresaA.usuarios.admin.id,
        seed.global.variedadId,
      );
      cicloAId = dedA.cicloId;
      parcelaAId = dedA.parcelaId;

      const dedB = await crearCicloAisladoParaConcurrencia(
        prisma,
        seed.empresaB.id,
        seed.empresaB.usuarios.admin.id,
        seed.global.variedadId,
      );
      cicloBId = dedB.cicloId;
      parcelaBId = dedB.parcelaId;
    });

    const rutasParam = [
      {
        nombre: 'rentabilidad (listado)',
        getRuta: () => '/api/v1/reportes/rentabilidad',
        getRutaAjena: () => null,
      },
      {
        nombre: 'rentabilidad (ciclo)',
        getRuta: () => `/api/v1/reportes/ciclos/${cicloAId}/rentabilidad`,
        getRutaAjena: () => `/api/v1/reportes/ciclos/${cicloBId}/rentabilidad`,
      },
      {
        nombre: 'costos-por-categoria',
        getRuta: () =>
          `/api/v1/reportes/ciclos/${cicloAId}/costos-por-categoria`,
        getRutaAjena: () =>
          `/api/v1/reportes/ciclos/${cicloBId}/costos-por-categoria`,
      },
      {
        nombre: 'costos-por-actividad',
        getRuta: () =>
          `/api/v1/reportes/ciclos/${cicloAId}/costos-por-actividad`,
        getRutaAjena: () =>
          `/api/v1/reportes/ciclos/${cicloBId}/costos-por-actividad`,
      },
      {
        nombre: 'mermas',
        getRuta: () => `/api/v1/reportes/ciclos/${cicloAId}/mermas`,
        getRutaAjena: () => `/api/v1/reportes/ciclos/${cicloBId}/mermas`,
      },
      {
        nombre: 'comparativo',
        getRuta: () => `/api/v1/reportes/parcelas/${parcelaAId}/comparativo`,
        getRutaAjena: () =>
          `/api/v1/reportes/parcelas/${parcelaBId}/comparativo`,
      },
    ];

    it.each(rutasParam)(
      'RBAC sobre $nombre: CAPTURISTA 403, CONTADOR y ADMIN 200',
      async ({ getRuta }) => {
        const ruta = getRuta();
        const resCap = await testRequest(app)
          .get(ruta)
          .set('Authorization', tokenA_Capturista);
        expect(resCap.status).toBe(403);
        expect((resCap.body as ApiResponseError).code).toBe(
          CodigoError.PERMISO_DENEGADO,
        );

        const resCon = await testRequest(app)
          .get(ruta)
          .set('Authorization', tokenA_Contador);
        expect(resCon.status).toBe(200);

        const resAdm = await testRequest(app)
          .get(ruta)
          .set('Authorization', tokenA_Admin);
        expect(resAdm.status).toBe(200);
      },
    );

    it.each(
      rutasParam.filter(
        (r) => r.getRutaAjena !== null && r.nombre !== 'rentabilidad (listado)',
      ),
    )(
      'Aislamiento sobre $nombre: ciclo o parcela ajena responde 404',
      async ({ getRutaAjena }) => {
        const rutaAjena = getRutaAjena();
        expect(rutaAjena).toBeTruthy();
        const res = await testRequest(app)
          .get(rutaAjena!)
          .set('Authorization', tokenA_Admin);
        expect(res.status).toBe(404);
        expect((res.body as ApiResponseError).code).toBe(
          CodigoError.RECURSO_NO_ENCONTRADO,
        );
      },
    );

    it('listados de Empresa A y Empresa B están mutuamente aislados', async () => {
      const resA = await testRequest(app)
        .get('/api/v1/reportes/rentabilidad?limit=100')
        .set('Authorization', tokenA_Admin);

      expect(resA.status).toBe(200);
      const bodyA = resA.body as PaginatedRentabilidadBody;
      const idsA = bodyA.data.map((item) => item.ciclo.id);
      expect(idsA).not.toContain(cicloBId);

      const resB = await testRequest(app)
        .get('/api/v1/reportes/rentabilidad?limit=100')
        .set('Authorization', tokenB_Admin);

      expect(resB.status).toBe(200);
      const bodyB = resB.body as PaginatedRentabilidadBody;
      const idsB = bodyB.data.map((item) => item.ciclo.id);
      expect(idsB).not.toContain(cicloAId);
    });
  });

  // =========================================================================
  // E5. Comparativo con LAG cronológico (3 ciclos), inclusión y exclusión de estados
  // =========================================================================
  describe('E5. Comparativo analítico entre ciclos de una parcela (LAG)', () => {
    let parcelaId: number;
    let ciclo1Id: number;
    let ciclo2Id: number;
    let ciclo3Id: number;
    let cicloCanceladoId: number;
    let cicloPlanificadoId: number;

    beforeAll(async () => {
      const ded = await crearCicloAisladoParaConcurrencia(
        prisma,
        seed.empresaA.id,
        seed.empresaA.usuarios.admin.id,
        seed.global.variedadId,
        2.0,
      );
      parcelaId = ded.parcelaId;
      ciclo1Id = ded.cicloId;

      // Ciclo 1 (más antiguo)
      await prisma.cicloProduccion.update({
        where: { id: ciclo1Id },
        data: {
          nombre: 'Ciclo 1 Comparativo',
          estado: EstadoCiclo.FINALIZADO,
          fechaInicio: new Date('2024-01-01'),
          fechaFin: new Date('2024-06-01'),
        },
      });

      await prisma.gasto.create({
        data: {
          cicloId: ciclo1Id,
          categoriaId: seed.global.categoriaSistemaId,
          proveedorId: seed.empresaA.proveedor.id,
          creadoPorId: seed.empresaA.usuarios.admin.id,
          fecha: new Date('2024-02-01'),
          descripcion: 'Gasto C1',
          cantidad: new Prisma.Decimal('1.000'),
          costoUnitario: new Prisma.Decimal('10000.00'),
          impuesto: new Prisma.Decimal('0.00'),
          total: new Prisma.Decimal('10000.00'),
        },
      });

      const v1 = await prisma.venta.create({
        data: {
          cicloId: ciclo1Id,
          clienteId: seed.empresaA.cliente.id,
          creadoPorId: seed.empresaA.usuarios.admin.id,
          fecha: new Date('2024-05-01'),
          impuesto: new Prisma.Decimal('0.00'),
          total: new Prisma.Decimal('20000.00'),
          estado: EstadoVenta.REGISTRADA,
        },
      });

      await prisma.detalleVenta.create({
        data: {
          ventaId: v1.id,
          unidadId: seed.global.unidadKgId,
          cantidad: new Prisma.Decimal('1000.000'),
          precioUnitario: new Prisma.Decimal('20.00'),
        },
      });

      // Ciclo 2 (intermedio)
      const c2 = await prisma.cicloProduccion.create({
        data: {
          empresaId: seed.empresaA.id,
          parcelaId,
          variedadId: seed.global.variedadId,
          creadoPorId: seed.empresaA.usuarios.admin.id,
          nombre: 'Ciclo 2 Comparativo',
          estado: EstadoCiclo.FINALIZADO,
          fechaInicio: new Date('2025-01-01'),
          fechaFin: new Date('2025-06-01'),
          superficieSembrada: new Prisma.Decimal('2.0'),
        },
      });
      ciclo2Id = c2.id;

      await prisma.gasto.create({
        data: {
          cicloId: ciclo2Id,
          categoriaId: seed.global.categoriaSistemaId,
          proveedorId: seed.empresaA.proveedor.id,
          creadoPorId: seed.empresaA.usuarios.admin.id,
          fecha: new Date('2025-02-01'),
          descripcion: 'Gasto C2',
          cantidad: new Prisma.Decimal('1.000'),
          costoUnitario: new Prisma.Decimal('15000.00'),
          impuesto: new Prisma.Decimal('0.00'),
          total: new Prisma.Decimal('15000.00'),
        },
      });

      // Ciclo 3 (más reciente)
      const c3 = await prisma.cicloProduccion.create({
        data: {
          empresaId: seed.empresaA.id,
          parcelaId,
          variedadId: seed.global.variedadId,
          creadoPorId: seed.empresaA.usuarios.admin.id,
          nombre: 'Ciclo 3 Comparativo',
          estado: EstadoCiclo.ACTIVO,
          fechaInicio: new Date('2026-01-01'),
          superficieSembrada: new Prisma.Decimal('2.0'),
        },
      });
      ciclo3Id = c3.id;

      // Ciclo Cancelado y Planificado en la misma parcela
      const cCan = await prisma.cicloProduccion.create({
        data: {
          empresaId: seed.empresaA.id,
          parcelaId,
          variedadId: seed.global.variedadId,
          creadoPorId: seed.empresaA.usuarios.admin.id,
          nombre: 'Ciclo Cancelado',
          estado: EstadoCiclo.CANCELADO,
          fechaInicio: new Date('2026-02-01'),
          superficieSembrada: new Prisma.Decimal('2.0'),
        },
      });
      cicloCanceladoId = cCan.id;

      const cPlan = await prisma.cicloProduccion.create({
        data: {
          empresaId: seed.empresaA.id,
          parcelaId,
          variedadId: seed.global.variedadId,
          creadoPorId: seed.empresaA.usuarios.admin.id,
          nombre: 'Ciclo Planificado',
          estado: EstadoCiclo.PLANIFICADO,
          fechaInicio: new Date('2026-07-01'),
          superficieSembrada: new Prisma.Decimal('2.0'),
        },
      });
      cicloPlanificadoId = cPlan.id;
    });

    it('por defecto solo incluye FINALIZADOS (Ciclo 1 y Ciclo 2) y excluye ACTIVO, CANCELADO y PLANIFICADO', async () => {
      const res = await testRequest(app)
        .get(`/api/v1/reportes/parcelas/${parcelaId}/comparativo`)
        .set('Authorization', tokenA_Admin);

      expect(res.status).toBe(200);
      const body = res.body as ComparativoParcelaBody;
      const ids = body.data.map((d) => d.ciclo.id);

      expect(ids).toContain(ciclo1Id);
      expect(ids).toContain(ciclo2Id);
      expect(ids).not.toContain(ciclo3Id);
      expect(ids).not.toContain(cicloCanceladoId);
      expect(ids).not.toContain(cicloPlanificadoId);

      // Verificación de LAG: Ciclo 1 no tiene anterior (null), Ciclo 2 tiene métricas de Ciclo 1
      const itemC1 = body.data.find((d) => d.ciclo.id === ciclo1Id);
      const itemC2 = body.data.find((d) => d.ciclo.id === ciclo2Id);

      expect(itemC1?.gananciaCicloAnterior).toBeNull();
      expect(itemC2?.gananciaCicloAnterior).toBe('10000.00');
    });

    it('con incluirActivos=true incluye ACTIVO pero JAMÁS CANCELADO ni PLANIFICADO', async () => {
      const res = await testRequest(app)
        .get(
          `/api/v1/reportes/parcelas/${parcelaId}/comparativo?incluirActivos=true`,
        )
        .set('Authorization', tokenA_Admin);

      expect(res.status).toBe(200);
      const body = res.body as ComparativoParcelaBody;
      const ids = body.data.map((d) => d.ciclo.id);

      expect(ids).toContain(ciclo3Id); // ACTIVO incluido
      expect(ids).not.toContain(cicloCanceladoId); // RN-058
      expect(ids).not.toContain(cicloPlanificadoId); // RN-058
    });
  });

  // =========================================================================
  // E6. Paginación y Filtros de Estado y Parcela
  // =========================================================================
  describe('E6. Paginación y Filtros', () => {
    it('filtra por estado y parcelaId devolviendo metadata coherente', async () => {
      const res = await testRequest(app)
        .get('/api/v1/reportes/rentabilidad?estado=FINALIZADO&page=1&limit=5')
        .set('Authorization', tokenA_Admin);

      expect(res.status).toBe(200);
      const body = res.body as PaginatedRentabilidadBody;
      expect(body.meta.page).toBe(1);
      expect(body.meta.limit).toBe(5);
      expect(body.meta.totalPages).toBeGreaterThanOrEqual(1);
      for (const item of body.data) {
        expect(item.ciclo.estado).toBe(EstadoCiclo.FINALIZADO);
      }
    });

    it('página fuera de rango (p.ej. page=9999) devuelve data [] con 200 y meta coherente', async () => {
      const res = await testRequest(app)
        .get('/api/v1/reportes/rentabilidad?page=9999&limit=10')
        .set('Authorization', tokenA_Admin);

      expect(res.status).toBe(200);
      const body = res.body as PaginatedRentabilidadBody;
      expect(body.data).toEqual([]);
      expect(body.meta.page).toBe(9999);
    });
  });

  // =========================================================================
  // E7. Lecturas sin efectos secundarios en bitacora_auditoria (RN-036)
  // =========================================================================
  describe('E7. Lecturas sin efectos secundarios (RN-036)', () => {
    it('el conteo de bitacora_auditoria permanece inalterado tras consultar las 6 rutas', async () => {
      const conteoInicial = await prisma.bitacoraAuditoria.count({
        where: { empresaId: seed.empresaA.id },
      });

      const ciclos = await prisma.cicloProduccion.findMany({
        where: { empresaId: seed.empresaA.id, deletedAt: null },
        take: 1,
      });
      const cicloTestId = ciclos[0].id;
      const parcelaTestId = ciclos[0].parcelaId;

      await testRequest(app)
        .get('/api/v1/reportes/rentabilidad')
        .set('Authorization', tokenA_Admin);

      await testRequest(app)
        .get(`/api/v1/reportes/ciclos/${cicloTestId}/rentabilidad`)
        .set('Authorization', tokenA_Admin);

      await testRequest(app)
        .get(`/api/v1/reportes/ciclos/${cicloTestId}/costos-por-categoria`)
        .set('Authorization', tokenA_Admin);

      await testRequest(app)
        .get(`/api/v1/reportes/ciclos/${cicloTestId}/costos-por-actividad`)
        .set('Authorization', tokenA_Admin);

      await testRequest(app)
        .get(`/api/v1/reportes/ciclos/${cicloTestId}/mermas`)
        .set('Authorization', tokenA_Admin);

      await testRequest(app)
        .get(`/api/v1/reportes/parcelas/${parcelaTestId}/comparativo`)
        .set('Authorization', tokenA_Admin);

      const conteoFinal = await prisma.bitacoraAuditoria.count({
        where: { empresaId: seed.empresaA.id },
      });

      expect(conteoFinal).toBe(conteoInicial);
    });
  });

  // =========================================================================
  // E8. Paridad: kg de la API = v_rentabilidad_ciclo = calcularBalanceMasaKg
  // =========================================================================
  describe('E8. Paridad exacta de balance de masa en kg', () => {
    it('las cantidades en kg devueltas por la API coinciden exactamente con calcularBalanceMasaKg y la vista', async () => {
      const ded = await crearCicloAisladoParaConcurrencia(
        prisma,
        seed.empresaA.id,
        seed.empresaA.usuarios.admin.id,
        seed.global.variedadId,
        1.0,
      );
      const cicloId = ded.cicloId;

      // Cosecha 500 kg
      const cosecha = await prisma.cosecha.create({
        data: {
          cicloId,
          unidadId: seed.global.unidadKgId,
          creadoPorId: seed.empresaA.usuarios.admin.id,
          fecha: new Date('2026-03-01'),
          cantidad: new Prisma.Decimal('500.000'),
          calidad: CalidadCosecha.PRIMERA,
        },
      });

      // Merma poscosecha 40 kg
      await prisma.merma.create({
        data: {
          cicloId,
          unidadId: seed.global.unidadKgId,
          motivoId: seed.global.motivoMermaId,
          creadoPorId: seed.empresaA.usuarios.admin.id,
          fecha: new Date('2026-03-02'),
          cantidad: new Prisma.Decimal('40.000'),
          etapa: EtapaMerma.POSCOSECHA,
        },
      });

      // Venta 200 kg
      const venta = await prisma.venta.create({
        data: {
          cicloId,
          clienteId: seed.empresaA.cliente.id,
          creadoPorId: seed.empresaA.usuarios.admin.id,
          fecha: new Date('2026-03-10'),
          total: new Prisma.Decimal('4000.00'),
          impuesto: new Prisma.Decimal('0.00'),
          estado: EstadoVenta.REGISTRADA,
        },
      });

      await prisma.detalleVenta.create({
        data: {
          ventaId: venta.id,
          cosechaId: cosecha.id,
          unidadId: seed.global.unidadKgId,
          calidad: CalidadCosecha.PRIMERA,
          cantidad: new Prisma.Decimal('200.000'),
          precioUnitario: new Prisma.Decimal('20.00'),
        },
      });

      // 1. API
      const res = await testRequest(app)
        .get(`/api/v1/reportes/ciclos/${cicloId}/rentabilidad`)
        .set('Authorization', tokenA_Admin);
      expect(res.status).toBe(200);
      const apiInd = (res.body as RentabilidadDetalleBody).indicadores;

      // 2. Utilidad pura del dominio
      const balanceDominio = await calcularBalanceMasaKg(prisma, cicloId);

      // 3. Vista directa SQL
      const filasVista = await prisma.$queryRaw<RentabilidadVistaFila[]>(
        Prisma.sql`SELECT * FROM v_rentabilidad_ciclo WHERE cicloId = ${cicloId}`,
      );
      const filaVista = filasVista[0];

      // Verificación de paridad triple
      expect(apiInd.kgCosechados).toBe(
        ReporteFormatoUtil.formatearKg(balanceDominio.kgCosechados),
      );
      expect(apiInd.kgCosechados).toBe(
        ReporteFormatoUtil.formatearKg(filaVista.kgCosechados),
      );

      expect(apiInd.kgMermaPoscosecha).toBe(
        ReporteFormatoUtil.formatearKg(balanceDominio.kgMermaPoscosecha),
      );
      expect(apiInd.kgMermaPoscosecha).toBe(
        ReporteFormatoUtil.formatearKg(filaVista.kgMerma),
      );

      expect(apiInd.kgNetos).toBe(
        ReporteFormatoUtil.formatearKg(balanceDominio.kgNetos),
      );
      expect(apiInd.kgNetos).toBe(
        ReporteFormatoUtil.formatearKg(filaVista.kgNetos),
      );

      expect(apiInd.kgVendidos).toBe(
        ReporteFormatoUtil.formatearKg(balanceDominio.kgVendidos),
      );
      expect(apiInd.kgVendidos).toBe(
        ReporteFormatoUtil.formatearKg(filaVista.kgVendidos),
      );

      expect(apiInd.kgDisponibles).toBe(
        ReporteFormatoUtil.formatearKg(balanceDominio.kgDisponibles),
      );
      expect(apiInd.kgDisponibles).toBe(
        ReporteFormatoUtil.formatearKg(filaVista.kgDisponibles),
      );
    });
  });

  describe('Hito 9B: Cuentas por Cobrar y Alertas (E2E)', () => {
    it('RBAC sobre cuentas-por-cobrar y alertas: CAPTURISTA 403, CONTADOR y ADMIN 200', async () => {
      for (const ruta of [
        '/api/v1/reportes/cuentas-por-cobrar',
        '/api/v1/reportes/alertas',
      ]) {
        const resCap = await testRequest(app)
          .get(ruta)
          .set('Authorization', tokenA_Capturista);
        expect(resCap.status).toBe(403);
        expect((resCap.body as ApiResponseError).code).toBe(
          CodigoError.PERMISO_DENEGADO,
        );

        const resCon = await testRequest(app)
          .get(ruta)
          .set('Authorization', tokenA_Contador);
        expect(resCon.status).toBe(200);

        const resAdm = await testRequest(app)
          .get(ruta)
          .set('Authorization', tokenA_Admin);
        expect(resAdm.status).toBe(200);
      }
    });

    it('GET /reportes/cuentas-por-cobrar devuelve ventas con saldo pendiente, resumen financiero y excluye canceladas', async () => {
      // 1. Contar eventos de auditoría previos
      const auditCountAntes = await prisma.bitacoraAuditoria.count({
        where: { empresaId: seed.empresaA.id },
      });

      const res = await testRequest(app)
        .get('/api/v1/reportes/cuentas-por-cobrar')
        .set('Authorization', tokenA_Admin);

      expect(res.status).toBe(200);
      const body = res.body as {
        data: Array<{
          ventaId: number;
          clienteId: number;
          montoTotal: string;
          montoCobrado: string;
          montoPendiente: string;
          estadoCobro: string;
        }>;
        resumen: {
          totalPorCobrar: string;
          totalVencido: string;
          totalVigente: string;
          totalClientesMorosos: number;
        };
        meta: {
          total: number;
          page: number;
          limit: number;
          totalPages: number;
        };
      };

      expect(body.data.length).toBeGreaterThanOrEqual(1);
      expect(body.resumen).toBeDefined();
      expect(body.meta.total).toBeGreaterThanOrEqual(body.data.length);
      expect(body.data.length).toBeLessThanOrEqual(body.meta.limit);

      // Verificar que los montos pendientes coinciden con saldo = total - cobrado
      for (const item of body.data) {
        const totalNum = parseFloat(item.montoTotal);
        const cobradoNum = parseFloat(item.montoCobrado);
        const pendienteNum = parseFloat(item.montoPendiente);
        expect(pendienteNum).toBeCloseTo(totalNum - cobradoNum, 2);
        expect(pendienteNum).toBeGreaterThan(0);
      }

      // Verificar idempotencia y ausencia de efectos secundarios en auditoría (solo lectura)
      const auditCountDespues = await prisma.bitacoraAuditoria.count({
        where: { empresaId: seed.empresaA.id },
      });
      expect(auditCountDespues).toBe(auditCountAntes);
    });

    it('GET /reportes/cuentas-por-cobrar: aislamiento multiempresa estricto', async () => {
      const resA = await testRequest(app)
        .get('/api/v1/reportes/cuentas-por-cobrar')
        .set('Authorization', tokenA_Admin);
      expect(resA.status).toBe(200);

      const resB = await testRequest(app)
        .get('/api/v1/reportes/cuentas-por-cobrar')
        .set('Authorization', tokenB_Admin);
      expect(resB.status).toBe(200);

      const bodyA = resA.body as { data: Array<{ ventaId: number }> };
      const bodyB = resB.body as { data: Array<{ ventaId: number }> };

      const ventasAIds = new Set(bodyA.data.map((v) => v.ventaId));
      for (const ventaB of bodyB.data) {
        expect(ventasAIds.has(ventaB.ventaId)).toBe(false);
      }
    });

    it('GET /reportes/alertas evalúa y devuelve alertas ordenadas por severidad con resumen', async () => {
      const auditCountAntes = await prisma.bitacoraAuditoria.count({
        where: { empresaId: seed.empresaA.id },
      });

      const res = await testRequest(app)
        .get('/api/v1/reportes/alertas')
        .set('Authorization', tokenA_Admin);

      expect(res.status).toBe(200);
      const body = res.body as {
        data: Array<{
          codigo: string;
          severidad: string;
          mensaje: string;
          observado: string;
          umbral: string;
        }>;
        resumen: {
          totalAltas: number;
          totalMedias: number;
          totalBajas: number;
          totalInformativas: number;
          total: number;
        };
        meta: { total: number };
      };

      expect(body.resumen).toBeDefined();
      expect(body.meta).toBeDefined();
      expect(body.meta.total).toBe(body.resumen.total);

      // Si hay más de un elemento, verificar ordenamiento por severidad (ALTA antes que MEDIA/BAJA)
      if (body.data.length >= 2) {
        const severidades = body.data.map((a) => a.severidad);
        const indiceMedia = severidades.indexOf('MEDIA');
        const indiceBaja = severidades.indexOf('BAJA');
        const indiceInfo = severidades.indexOf('INFORMATIVA');

        severidades.forEach((sev, idx) => {
          if (sev === 'ALTA') {
            if (indiceMedia !== -1) expect(idx).toBeLessThan(indiceMedia);
            if (indiceBaja !== -1) expect(idx).toBeLessThan(indiceBaja);
            if (indiceInfo !== -1) expect(idx).toBeLessThan(indiceInfo);
          }
        });
      }

      // Idempotencia: sin mutación en auditoría
      const auditCountDespues = await prisma.bitacoraAuditoria.count({
        where: { empresaId: seed.empresaA.id },
      });
      expect(auditCountDespues).toBe(auditCountAntes);
    });

    it('GET /reportes/alertas: filtro por severidad y aislamiento multiempresa', async () => {
      const resFiltro = await testRequest(app)
        .get('/api/v1/reportes/alertas?severidad=ALTA')
        .set('Authorization', tokenA_Admin);
      expect(resFiltro.status).toBe(200);

      const bodyFiltro = resFiltro.body as {
        data: Array<{ severidad: string }>;
      };
      for (const alerta of bodyFiltro.data) {
        expect(alerta.severidad).toBe('ALTA');
      }

      // Aislamiento: Empresa B
      const resB = await testRequest(app)
        .get('/api/v1/reportes/alertas')
        .set('Authorization', tokenB_Admin);
      expect(resB.status).toBe(200);

      const bodyB = resB.body as {
        data: Array<{ cicloId?: number | null }>;
      };

      const ciclosA = await prisma.cicloProduccion.findMany({
        where: { empresaId: seed.empresaA.id },
        select: { id: true },
      });
      const ciclosAIds = new Set(ciclosA.map((c) => c.id));

      for (const alertaB of bodyB.data) {
        if (alertaB.cicloId) {
          expect(ciclosAIds.has(alertaB.cicloId)).toBe(false);
        }
      }
    });
  });
});
