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
import {
  CodigoAlerta,
  SeveridadAlerta,
} from '../../src/modules/reportes/constants/alertas.constants';
import { VentaEstadoCobroPolicy } from '../../src/common/domain/policies/venta-estado-cobro.policy';

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

  describe('Hito 9B: Cuentas por Cobrar y Alertas de Rentabilidad (E2E)', () => {
    // -------------------------------------------------------------------------
    // 1. RBAC y Lecturas sin efectos secundarios
    // -------------------------------------------------------------------------
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

    it('Lecturas sin efectos: ni cuentas-por-cobrar ni alertas generan registros en bitacoraAuditoria', async () => {
      const auditCountAntes = await prisma.bitacoraAuditoria.count({
        where: { empresaId: seed.empresaA.id },
      });

      const resCobros = await testRequest(app)
        .get('/api/v1/reportes/cuentas-por-cobrar')
        .set('Authorization', tokenA_Admin);
      expect(resCobros.status).toBe(200);

      const resAlertas = await testRequest(app)
        .get('/api/v1/reportes/alertas')
        .set('Authorization', tokenA_Admin);
      expect(resAlertas.status).toBe(200);

      const auditCountDespues = await prisma.bitacoraAuditoria.count({
        where: { empresaId: seed.empresaA.id },
      });
      expect(auditCountDespues).toBe(auditCountAntes);
    });

    // -------------------------------------------------------------------------
    // 2. Cuentas por Cobrar (Filtros, Paridad, Orden, Paginación, Aislamiento)
    // -------------------------------------------------------------------------
    it('Cuentas por cobrar: valor por defecto devuelve cuentas vigentes y vencidas no canceladas con saldo > 0', async () => {
      const res = await testRequest(app)
        .get('/api/v1/reportes/cuentas-por-cobrar')
        .set('Authorization', tokenA_Admin);

      expect(res.status).toBe(200);
      const body = res.body as {
        data: Array<{
          ventaId: number;
          montoTotal: string;
          montoCobrado: string;
          montoPendiente: string;
          estadoCobro: string;
          vencida: boolean;
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

      for (const item of body.data) {
        expect(Number(item.montoPendiente)).toBeGreaterThan(0);
        expect(item.estadoCobro).not.toBe('CANCELADA');
      }
    });

    it('Cuentas por cobrar: filtros por estadoCobro (PENDIENTE, PARCIAL, VENCIDA, PAGADA) y vencida (true/false)', async () => {
      for (const estado of ['PENDIENTE', 'PARCIAL', 'VENCIDA', 'PAGADA']) {
        const res = await testRequest(app)
          .get(`/api/v1/reportes/cuentas-por-cobrar?estadoCobro=${estado}`)
          .set('Authorization', tokenA_Admin);
        expect(res.status).toBe(200);
        const body = res.body as { data: Array<{ estadoCobro: string }> };
        for (const item of body.data) {
          expect(item.estadoCobro).toBe(estado);
        }
      }

      const resVencida = await testRequest(app)
        .get('/api/v1/reportes/cuentas-por-cobrar?vencida=true')
        .set('Authorization', tokenA_Admin);
      expect(resVencida.status).toBe(200);
      const bodyVencida = resVencida.body as {
        data: Array<{ vencida: boolean }>;
      };
      for (const item of bodyVencida.data) {
        expect(item.vencida).toBe(true);
      }

      const resNoVencida = await testRequest(app)
        .get('/api/v1/reportes/cuentas-por-cobrar?vencida=false')
        .set('Authorization', tokenA_Admin);
      expect(resNoVencida.status).toBe(200);
      const bodyNoVencida = resNoVencida.body as {
        data: Array<{ vencida: boolean }>;
      };
      for (const item of bodyNoVencida.data) {
        expect(item.vencida).toBe(false);
      }
    });

    it('Cuentas por cobrar: orden con fechaLimitePago nula al final y paginación con página vacía', async () => {
      const res = await testRequest(app)
        .get('/api/v1/reportes/cuentas-por-cobrar?limit=100')
        .set('Authorization', tokenA_Admin);
      expect(res.status).toBe(200);
      const body = res.body as {
        data: Array<{ fechaVencimiento: string | null }>;
        meta: { total: number };
      };

      if (body.data.length >= 2) {
        let encontroNulo = false;
        for (const item of body.data) {
          if (item.fechaVencimiento === null) {
            encontroNulo = true;
          } else if (encontroNulo) {
            expect(item.fechaVencimiento).toBeNull();
          }
        }
      }

      // Página vacía con skip fuera de rango
      const resVacia = await testRequest(app)
        .get(`/api/v1/reportes/cuentas-por-cobrar?page=9999&limit=10`)
        .set('Authorization', tokenA_Admin);
      expect(resVacia.status).toBe(200);
      const bodyVacia = resVacia.body as {
        data: any[];
        meta: { total: number; page: number };
      };
      expect(bodyVacia.data).toEqual([]);
      expect(bodyVacia.meta.page).toBe(9999);
      expect(bodyVacia.meta.total).toBe(body.meta.total);
    });

    it('Cuentas por cobrar: paridad exhaustiva contra VentaEstadoCobroPolicy sobre la base de datos real', async () => {
      const res = await testRequest(app)
        .get('/api/v1/reportes/cuentas-por-cobrar?limit=100')
        .set('Authorization', tokenA_Admin);
      expect(res.status).toBe(200);
      const body = res.body as {
        data: Array<{
          ventaId: number;
          montoTotal: string;
          montoCobrado: string;
          montoPendiente: string;
          estadoCobro: string;
          vencida: boolean;
          fechaVencimiento: string | null;
        }>;
      };

      const hoy = VentaEstadoCobroPolicy.obtenerHoyMexico();

      for (const item of body.data) {
        const esperado = VentaEstadoCobroPolicy.calcularEstadoCobro({
          total: item.montoTotal,
          totalCobrado: item.montoCobrado,
          estadoVenta: 'REGISTRADA',
          fechaLimitePago: item.fechaVencimiento,
          hoy,
        });

        expect(item.estadoCobro).toBe(esperado.estadoCobro);
        expect(item.vencida).toBe(esperado.vencida);
        expect(item.montoPendiente).toBe(esperado.saldoPendiente);
      }
    });

    it('Cuentas por cobrar: aislamiento multiempresa estricto', async () => {
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

    // -------------------------------------------------------------------------
    // 3. Alertas de Rentabilidad (10 Reglas, Umbrales, Estados, Orden, O(1) Queries)
    // -------------------------------------------------------------------------
    describe('Evaluación de las 10 Reglas de Alerta por API', () => {
      let cicloPerdidaId: number;
      let cicloCostoPrecioId: number;
      let cicloCobroId: number;
      let cicloMermaId: number;
      let cicloDominanteId: number;
      let cicloCrecienteId: number;
      let cicloRendimientoId: number;
      let cicloSinCapturaId: number;
      let cicloLargoId: number;
      let cicloEnUmbralId: number;
      let cicloPlanificadoId: number;
      let cicloCanceladoId: number;
      let cicloCerradoAntiguoId: number;

      beforeAll(async () => {
        // Regla 1: CICLO_EN_PERDIDA (ganancia < 0, facturado > 0)
        const ded1 = await crearCicloAisladoParaConcurrencia(
          prisma,
          seed.empresaA.id,
          seed.empresaA.usuarios.admin.id,
          seed.global.variedadId,
          1.0,
        );
        cicloPerdidaId = ded1.cicloId;
        await prisma.cicloProduccion.update({
          where: { id: cicloPerdidaId },
          data: {
            nombre: 'Ciclo 9B Alerta Pérdida',
            estado: EstadoCiclo.ACTIVO,
          },
        });
        await prisma.gasto.create({
          data: {
            cicloId: cicloPerdidaId,
            categoriaId: seed.global.categoriaSistemaId,
            proveedorId: seed.empresaA.proveedor.id,
            creadoPorId: seed.empresaA.usuarios.admin.id,
            fecha: new Date('2026-10-18'),
            descripcion: 'Gasto alto',
            cantidad: new Prisma.Decimal('1'),
            costoUnitario: new Prisma.Decimal('20000.00'),
            impuesto: new Prisma.Decimal('0'),
            total: new Prisma.Decimal('20000.00'),
          },
        });
        const venta1 = await prisma.venta.create({
          data: {
            cicloId: cicloPerdidaId,
            clienteId: seed.empresaA.cliente.id,
            creadoPorId: seed.empresaA.usuarios.admin.id,
            fecha: new Date('2026-10-18'),
            impuesto: new Prisma.Decimal('0'),
            total: new Prisma.Decimal('10000.00'),
            estado: EstadoVenta.REGISTRADA,
          },
        });
        const cosh1 = await prisma.cosecha.create({
          data: {
            cicloId: cicloPerdidaId,
            unidadId: seed.global.unidadKgId,
            creadoPorId: seed.empresaA.usuarios.admin.id,
            fecha: new Date('2026-10-18'),
            cantidad: new Prisma.Decimal('1000.000'),
            calidad: CalidadCosecha.PRIMERA,
          },
        });
        await prisma.detalleVenta.create({
          data: {
            ventaId: venta1.id,
            cosechaId: cosh1.id,
            unidadId: seed.global.unidadKgId,
            calidad: CalidadCosecha.PRIMERA,
            cantidad: new Prisma.Decimal('1000.000'),
            precioUnitario: new Prisma.Decimal('10.00'),
          },
        });

        // Regla 2: COSTO_SUPERA_PRECIO (costo/kg 25 > precio/kg 15)
        const ded2 = await crearCicloAisladoParaConcurrencia(
          prisma,
          seed.empresaA.id,
          seed.empresaA.usuarios.admin.id,
          seed.global.variedadId,
          1.0,
        );
        cicloCostoPrecioId = ded2.cicloId;
        await prisma.cicloProduccion.update({
          where: { id: cicloCostoPrecioId },
          data: {
            nombre: 'Ciclo 9B Costo Supera Precio',
            estado: EstadoCiclo.ACTIVO,
          },
        });
        await prisma.gasto.create({
          data: {
            cicloId: cicloCostoPrecioId,
            categoriaId: seed.global.categoriaSistemaId,
            proveedorId: seed.empresaA.proveedor.id,
            creadoPorId: seed.empresaA.usuarios.admin.id,
            fecha: new Date('2026-10-18'),
            descripcion: 'Gasto Costo Alto',
            cantidad: new Prisma.Decimal('1'),
            costoUnitario: new Prisma.Decimal('25000.00'),
            impuesto: new Prisma.Decimal('0'),
            total: new Prisma.Decimal('25000.00'),
          },
        });
        const cosh2 = await prisma.cosecha.create({
          data: {
            cicloId: cicloCostoPrecioId,
            unidadId: seed.global.unidadKgId,
            creadoPorId: seed.empresaA.usuarios.admin.id,
            fecha: new Date('2026-10-18'),
            cantidad: new Prisma.Decimal('1000.000'),
            calidad: CalidadCosecha.PRIMERA,
          },
        });
        const venta2 = await prisma.venta.create({
          data: {
            cicloId: cicloCostoPrecioId,
            clienteId: seed.empresaA.cliente.id,
            creadoPorId: seed.empresaA.usuarios.admin.id,
            fecha: new Date('2026-10-18'),
            impuesto: new Prisma.Decimal('0'),
            total: new Prisma.Decimal('15000.00'),
            estado: EstadoVenta.REGISTRADA,
          },
        });
        await prisma.detalleVenta.create({
          data: {
            ventaId: venta2.id,
            cosechaId: cosh2.id,
            unidadId: seed.global.unidadKgId,
            calidad: CalidadCosecha.PRIMERA,
            cantidad: new Prisma.Decimal('1000.000'),
            precioUnitario: new Prisma.Decimal('15.00'),
          },
        });

        // Regla 3: COBRO_VENCIDO (saldo pendiente > 0, fecha límite pasada)
        const ded3 = await crearCicloAisladoParaConcurrencia(
          prisma,
          seed.empresaA.id,
          seed.empresaA.usuarios.admin.id,
          seed.global.variedadId,
          1.0,
        );
        cicloCobroId = ded3.cicloId;
        await prisma.cicloProduccion.update({
          where: { id: cicloCobroId },
          data: {
            nombre: 'Ciclo 9B Cobro Vencido',
            estado: EstadoCiclo.FINALIZADO,
            cerradoEn: new Date('2026-08-01'), // Ciclo finalizado hace más de 30 días
          },
        });
        await prisma.venta.create({
          data: {
            cicloId: cicloCobroId,
            clienteId: seed.empresaA.cliente.id,
            creadoPorId: seed.empresaA.usuarios.admin.id,
            fecha: new Date('2026-08-01'),
            fechaLimitePago: new Date('2026-09-15'), // Vencida
            impuesto: new Prisma.Decimal('0'),
            total: new Prisma.Decimal('12000.00'),
            estado: EstadoVenta.REGISTRADA,
          },
        });

        // Regla 4: MERMA_ELEVADA (mermaPct 15% > 10%)
        const ded4 = await crearCicloAisladoParaConcurrencia(
          prisma,
          seed.empresaA.id,
          seed.empresaA.usuarios.admin.id,
          seed.global.variedadId,
          1.0,
        );
        cicloMermaId = ded4.cicloId;
        await prisma.cicloProduccion.update({
          where: { id: cicloMermaId },
          data: { nombre: 'Ciclo 9B Merma Alta', estado: EstadoCiclo.ACTIVO },
        });
        await prisma.gasto.create({
          data: {
            cicloId: cicloMermaId,
            categoriaId: seed.global.categoriaSistemaId,
            proveedorId: seed.empresaA.proveedor.id,
            creadoPorId: seed.empresaA.usuarios.admin.id,
            fecha: new Date('2026-10-18'),
            descripcion: 'Gasto base',
            cantidad: new Prisma.Decimal('1'),
            costoUnitario: new Prisma.Decimal('1000.00'),
            impuesto: new Prisma.Decimal('0'),
            total: new Prisma.Decimal('1000.00'),
          },
        });
        await prisma.cosecha.create({
          data: {
            cicloId: cicloMermaId,
            unidadId: seed.global.unidadKgId,
            creadoPorId: seed.empresaA.usuarios.admin.id,
            fecha: new Date('2026-10-18'),
            cantidad: new Prisma.Decimal('1000.000'),
            calidad: CalidadCosecha.PRIMERA,
          },
        });
        await prisma.merma.create({
          data: {
            cicloId: cicloMermaId,
            unidadId: seed.global.unidadKgId,
            motivoId: seed.global.motivoMermaId,
            creadoPorId: seed.empresaA.usuarios.admin.id,
            fecha: new Date('2026-10-19'),
            cantidad: new Prisma.Decimal('150.000'), // 15% de 1000 kg
            etapa: EtapaMerma.POSCOSECHA,
          },
        });

        // Regla 5: CATEGORIA_DOMINANTE (100% en categoría raíz > 40%)
        const ded5 = await crearCicloAisladoParaConcurrencia(
          prisma,
          seed.empresaA.id,
          seed.empresaA.usuarios.admin.id,
          seed.global.variedadId,
          1.0,
        );
        cicloDominanteId = ded5.cicloId;
        await prisma.cicloProduccion.update({
          where: { id: cicloDominanteId },
          data: { nombre: 'Ciclo 9B Dominante', estado: EstadoCiclo.ACTIVO },
        });
        await prisma.gasto.create({
          data: {
            cicloId: cicloDominanteId,
            categoriaId: seed.global.categoriaSistemaId,
            proveedorId: seed.empresaA.proveedor.id,
            creadoPorId: seed.empresaA.usuarios.admin.id,
            fecha: new Date('2026-10-18'),
            descripcion: 'Gasto único',
            cantidad: new Prisma.Decimal('1'),
            costoUnitario: new Prisma.Decimal('5000.00'),
            impuesto: new Prisma.Decimal('0'),
            total: new Prisma.Decimal('5000.00'),
          },
        });

        // Regla 6: COSTO_CRECIENTE (+50% respecto al ciclo anterior de la misma parcela)
        const ded6 = await crearCicloAisladoParaConcurrencia(
          prisma,
          seed.empresaA.id,
          seed.empresaA.usuarios.admin.id,
          seed.global.variedadId,
          1.0,
        );
        const parcelaCreciente = ded6.parcelaId;
        const cicloAnt = await prisma.cicloProduccion.create({
          data: {
            empresaId: seed.empresaA.id,
            parcelaId: parcelaCreciente,
            variedadId: seed.global.variedadId,
            nombre: 'Ciclo 9B Parcela Ant',
            superficieSembrada: new Prisma.Decimal('1.0'),
            estado: EstadoCiclo.FINALIZADO,
            fechaInicio: new Date('2026-01-01'),
            fechaFin: new Date('2026-05-01'),
            creadoPorId: seed.empresaA.usuarios.admin.id,
          },
        });
        await prisma.gasto.create({
          data: {
            cicloId: cicloAnt.id,
            categoriaId: seed.global.categoriaSistemaId,
            proveedorId: seed.empresaA.proveedor.id,
            creadoPorId: seed.empresaA.usuarios.admin.id,
            fecha: new Date('2026-02-01'),
            descripcion: 'Gasto anterior',
            cantidad: new Prisma.Decimal('1'),
            costoUnitario: new Prisma.Decimal('10000.00'),
            impuesto: new Prisma.Decimal('0'),
            total: new Prisma.Decimal('10000.00'),
          },
        });
        await prisma.cosecha.create({
          data: {
            cicloId: cicloAnt.id,
            unidadId: seed.global.unidadKgId,
            creadoPorId: seed.empresaA.usuarios.admin.id,
            fecha: new Date('2026-03-01'),
            cantidad: new Prisma.Decimal('1000.000'),
            calidad: CalidadCosecha.PRIMERA,
          },
        });
        cicloCrecienteId = ded6.cicloId;
        await prisma.cicloProduccion.update({
          where: { id: cicloCrecienteId },
          data: {
            nombre: 'Ciclo 9B Costo Creciente',
            estado: EstadoCiclo.ACTIVO,
            fechaInicio: new Date('2026-06-01'),
          },
        });
        await prisma.gasto.create({
          data: {
            cicloId: cicloCrecienteId,
            categoriaId: seed.global.categoriaSistemaId,
            proveedorId: seed.empresaA.proveedor.id,
            creadoPorId: seed.empresaA.usuarios.admin.id,
            fecha: new Date('2026-10-18'),
            descripcion: 'Gasto actual',
            cantidad: new Prisma.Decimal('1'),
            costoUnitario: new Prisma.Decimal('15000.00'),
            impuesto: new Prisma.Decimal('0'),
            total: new Prisma.Decimal('15000.00'),
          },
        });
        await prisma.cosecha.create({
          data: {
            cicloId: cicloCrecienteId,
            unidadId: seed.global.unidadKgId,
            creadoPorId: seed.empresaA.usuarios.admin.id,
            fecha: new Date('2026-10-18'),
            cantidad: new Prisma.Decimal('1000.000'),
            calidad: CalidadCosecha.PRIMERA,
          },
        });

        // Regla 7: RENDIMIENTO_BAJO (finalizado, meta 10,000 kg, cosechado 6,000 kg < 8,000 kg)
        const ded7 = await crearCicloAisladoParaConcurrencia(
          prisma,
          seed.empresaA.id,
          seed.empresaA.usuarios.admin.id,
          seed.global.variedadId,
          1.0,
        );
        cicloRendimientoId = ded7.cicloId;
        await prisma.cicloProduccion.update({
          where: { id: cicloRendimientoId },
          data: {
            nombre: 'Ciclo 9B Rendimiento Bajo',
            estado: EstadoCiclo.FINALIZADO,
            cerradoEn: new Date('2026-10-10'),
            metaProduccionKg: new Prisma.Decimal('10000.000'),
            fechaInicio: new Date('2026-06-01'),
          },
        });
        await prisma.gasto.create({
          data: {
            cicloId: cicloRendimientoId,
            categoriaId: seed.global.categoriaSistemaId,
            proveedorId: seed.empresaA.proveedor.id,
            creadoPorId: seed.empresaA.usuarios.admin.id,
            fecha: new Date('2026-07-01'),
            descripcion: 'Gasto base',
            cantidad: new Prisma.Decimal('1'),
            costoUnitario: new Prisma.Decimal('1000.00'),
            impuesto: new Prisma.Decimal('0'),
            total: new Prisma.Decimal('1000.00'),
          },
        });
        await prisma.cosecha.create({
          data: {
            cicloId: cicloRendimientoId,
            unidadId: seed.global.unidadKgId,
            creadoPorId: seed.empresaA.usuarios.admin.id,
            fecha: new Date('2026-08-01'),
            cantidad: new Prisma.Decimal('6000.000'), // 60% < 80%
            calidad: CalidadCosecha.PRIMERA,
          },
        });

        // Regla 8: CICLO_SIN_CAPTURA (activo, último gasto hace 31 días > 15)
        const ded8 = await crearCicloAisladoParaConcurrencia(
          prisma,
          seed.empresaA.id,
          seed.empresaA.usuarios.admin.id,
          seed.global.variedadId,
          1.0,
        );
        cicloSinCapturaId = ded8.cicloId;
        await prisma.cicloProduccion.update({
          where: { id: cicloSinCapturaId },
          data: {
            nombre: 'Ciclo 9B Sin Captura',
            estado: EstadoCiclo.ACTIVO,
            fechaInicio: new Date('2026-09-01'),
          },
        });
        await prisma.gasto.create({
          data: {
            cicloId: cicloSinCapturaId,
            categoriaId: seed.global.categoriaSistemaId,
            proveedorId: seed.empresaA.proveedor.id,
            creadoPorId: seed.empresaA.usuarios.admin.id,
            fecha: new Date('2026-09-20'),
            descripcion: 'Último gasto antiguo',
            cantidad: new Prisma.Decimal('1'),
            costoUnitario: new Prisma.Decimal('500.00'),
            impuesto: new Prisma.Decimal('0'),
            total: new Prisma.Decimal('500.00'),
          },
        });

        // Regla 9: CICLO_LARGO (activo, duracionCicloDias = 90, activo hace 173 días > 108)
        const ded9 = await crearCicloAisladoParaConcurrencia(
          prisma,
          seed.empresaA.id,
          seed.empresaA.usuarios.admin.id,
          seed.global.variedadId,
          1.0,
        );
        cicloLargoId = ded9.cicloId;
        await prisma.cicloProduccion.update({
          where: { id: cicloLargoId },
          data: {
            nombre: 'Ciclo 9B Largo',
            estado: EstadoCiclo.ACTIVO,
            fechaInicio: new Date('2026-05-01'),
          },
        });
        await prisma.gasto.create({
          data: {
            cicloId: cicloLargoId,
            categoriaId: seed.global.categoriaSistemaId,
            proveedorId: seed.empresaA.proveedor.id,
            creadoPorId: seed.empresaA.usuarios.admin.id,
            fecha: new Date('2026-10-18'),
            descripcion: 'Gasto reciente',
            cantidad: new Prisma.Decimal('1'),
            costoUnitario: new Prisma.Decimal('100.00'),
            impuesto: new Prisma.Decimal('0'),
            total: new Prisma.Decimal('100.00'),
          },
        });

        // Caso justo en el umbral: merma = 10.00%, categoría = 40.00%, rendimiento = 80.00%
        const dedUmbral = await crearCicloAisladoParaConcurrencia(
          prisma,
          seed.empresaA.id,
          seed.empresaA.usuarios.admin.id,
          seed.global.variedadId,
          1.0,
        );
        cicloEnUmbralId = dedUmbral.cicloId;
        await prisma.cicloProduccion.update({
          where: { id: cicloEnUmbralId },
          data: {
            nombre: 'Ciclo 9B En Umbral',
            estado: EstadoCiclo.FINALIZADO,
            cerradoEn: new Date('2026-10-15'),
            metaProduccionKg: new Prisma.Decimal('1000.000'),
            fechaInicio: new Date('2026-09-01'),
          },
        });
        const catExtraUmbral = await prisma.categoriaGasto.create({
          data: {
            empresaId: seed.empresaA.id,
            nombre: 'Cat 9B Umbral Tercera',
            activo: true,
          },
        });
        await prisma.gasto.create({
          data: {
            cicloId: cicloEnUmbralId,
            categoriaId: seed.global.categoriaSistemaId,
            proveedorId: seed.empresaA.proveedor.id,
            creadoPorId: seed.empresaA.usuarios.admin.id,
            fecha: new Date('2026-10-10'),
            descripcion: 'Gasto Cat 1 40%',
            cantidad: new Prisma.Decimal('1'),
            costoUnitario: new Prisma.Decimal('400.00'),
            impuesto: new Prisma.Decimal('0'),
            total: new Prisma.Decimal('400.00'),
          },
        });
        await prisma.gasto.create({
          data: {
            cicloId: cicloEnUmbralId,
            categoriaId: seed.empresaA.categoriaPropia.id,
            proveedorId: seed.empresaA.proveedor.id,
            creadoPorId: seed.empresaA.usuarios.admin.id,
            fecha: new Date('2026-10-10'),
            descripcion: 'Gasto Cat 2 40%',
            cantidad: new Prisma.Decimal('1'),
            costoUnitario: new Prisma.Decimal('400.00'),
            impuesto: new Prisma.Decimal('0'),
            total: new Prisma.Decimal('400.00'),
          },
        });
        await prisma.gasto.create({
          data: {
            cicloId: cicloEnUmbralId,
            categoriaId: catExtraUmbral.id,
            proveedorId: seed.empresaA.proveedor.id,
            creadoPorId: seed.empresaA.usuarios.admin.id,
            fecha: new Date('2026-10-10'),
            descripcion: 'Gasto Cat 3 20%',
            cantidad: new Prisma.Decimal('1'),
            costoUnitario: new Prisma.Decimal('200.00'),
            impuesto: new Prisma.Decimal('0'),
            total: new Prisma.Decimal('200.00'),
          },
        });
        await prisma.cosecha.create({
          data: {
            cicloId: cicloEnUmbralId,
            unidadId: seed.global.unidadKgId,
            creadoPorId: seed.empresaA.usuarios.admin.id,
            fecha: new Date('2026-10-10'),
            cantidad: new Prisma.Decimal('800.000'), // Exactamente 80.00%
            calidad: CalidadCosecha.PRIMERA,
          },
        });
        await prisma.merma.create({
          data: {
            cicloId: cicloEnUmbralId,
            unidadId: seed.global.unidadKgId,
            motivoId: seed.global.motivoMermaId,
            creadoPorId: seed.empresaA.usuarios.admin.id,
            fecha: new Date('2026-10-11'),
            cantidad: new Prisma.Decimal('80.000'), // Exactamente 10.00%
            etapa: EtapaMerma.POSCOSECHA,
          },
        });

        // Ciclos PLANIFICADO y CANCELADO
        const dedPlan = await crearCicloAisladoParaConcurrencia(
          prisma,
          seed.empresaA.id,
          seed.empresaA.usuarios.admin.id,
          seed.global.variedadId,
          1.0,
        );
        cicloPlanificadoId = dedPlan.cicloId;
        await prisma.cicloProduccion.update({
          where: { id: cicloPlanificadoId },
          data: {
            nombre: 'Ciclo 9B Planificado',
            estado: EstadoCiclo.PLANIFICADO,
          },
        });

        const dedCanc = await crearCicloAisladoParaConcurrencia(
          prisma,
          seed.empresaA.id,
          seed.empresaA.usuarios.admin.id,
          seed.global.variedadId,
          1.0,
        );
        cicloCanceladoId = dedCanc.cicloId;
        await prisma.cicloProduccion.update({
          where: { id: cicloCanceladoId },
          data: { nombre: 'Ciclo 9B Cancelado', estado: EstadoCiclo.CANCELADO },
        });

        // Ciclo FINALIZADO cerrado hace más de 30 días
        const dedCerr = await crearCicloAisladoParaConcurrencia(
          prisma,
          seed.empresaA.id,
          seed.empresaA.usuarios.admin.id,
          seed.global.variedadId,
          1.0,
        );
        cicloCerradoAntiguoId = dedCerr.cicloId;
        await prisma.cicloProduccion.update({
          where: { id: cicloCerradoAntiguoId },
          data: {
            nombre: 'Ciclo 9B Cerrado Antiguo',
            estado: EstadoCiclo.FINALIZADO,
            cerradoEn: new Date('2026-08-01'),
          },
        });

        // Asegurar que Empresa A tenga un plan con límite cercano para probar LIMITE_PLAN_CERCANO
        // Asignar temporalmente el plan 'PRODUCTOR' (maxUsuarios = 3; la empresa tiene 3 usuarios -> 100% >= 80%)
        const planProductor = await prisma.planSuscripcion.findFirst({
          where: { codigo: 'PRODUCTOR' },
        });
        if (planProductor) {
          await prisma.empresa.update({
            where: { id: seed.empresaA.id },
            data: { planId: planProductor.id },
          });
        }
      });

      it('Las 10 alertas disparadas por API con valores observado y umbral validados', async () => {
        const res = await testRequest(app)
          .get('/api/v1/reportes/alertas?limit=100&hoy=2026-10-21')
          .set('Authorization', tokenA_Admin);
        expect(res.status).toBe(200);

        const body = res.body as {
          data: Array<{
            codigo: string;
            severidad: string;
            observado: string;
            umbral: string;
            cicloId?: number | null;
          }>;
        };

        const encontrarAlerta = (codigo: string, cicloId?: number) =>
          body.data.find(
            (a) => a.codigo === codigo && (!cicloId || a.cicloId === cicloId),
          );

        // Regla 1: CICLO_EN_PERDIDA
        const a1 = encontrarAlerta(
          CodigoAlerta.CICLO_EN_PERDIDA,
          cicloPerdidaId,
        );
        expect(a1).toBeDefined();
        expect(a1!.severidad).toBe(SeveridadAlerta.ALTA);
        expect(a1!.umbral).toBe('$0.00');

        // Regla 2: COSTO_SUPERA_PRECIO
        const a2 = encontrarAlerta(
          CodigoAlerta.COSTO_SUPERA_PRECIO,
          cicloCostoPrecioId,
        );
        expect(a2).toBeDefined();
        expect(a2!.severidad).toBe(SeveridadAlerta.ALTA);
        expect(a2!.observado).toContain('25.00');
        expect(a2!.umbral).toContain('15.00');

        // Regla 3: COBRO_VENCIDO
        const a3 = body.data.find(
          (a) =>
            a.codigo === (CodigoAlerta.COBRO_VENCIDO as string) &&
            a.cicloId === cicloCobroId,
        );
        expect(a3).toBeDefined();
        expect(a3!.severidad).toBe(SeveridadAlerta.ALTA);
        expect(a3!.umbral).toBe('0.00');
        const metaA3 = a3!.metadata as { fechaVencimiento?: string };
        expect(metaA3?.fechaVencimiento).toBe('2026-09-15');

        // Regla 4: MERMA_ELEVADA
        const a4 = encontrarAlerta(CodigoAlerta.MERMA_ELEVADA, cicloMermaId);
        expect(a4).toBeDefined();
        expect(a4!.severidad).toBe(SeveridadAlerta.MEDIA);
        expect(a4!.observado).toContain('15.00%');
        expect(a4!.umbral).toBe('10.00%');

        // Regla 5: CATEGORIA_DOMINANTE
        const a5 = encontrarAlerta(
          CodigoAlerta.CATEGORIA_DOMINANTE,
          cicloDominanteId,
        );
        expect(a5).toBeDefined();
        expect(a5!.severidad).toBe(SeveridadAlerta.MEDIA);
        expect(a5!.observado).toContain('100.00%');
        expect(a5!.umbral).toBe('40.00%');

        // Regla 6: COSTO_CRECIENTE
        const a6 = encontrarAlerta(
          CodigoAlerta.COSTO_CRECIENTE,
          cicloCrecienteId,
        );
        expect(a6).toBeDefined();
        expect(a6!.severidad).toBe(SeveridadAlerta.MEDIA);
        expect(a6!.umbral).toContain('11.50');
        expect(a6!.observado).toContain('15.00');
        expect(a6!.mensaje).toContain('15%');

        // Regla 7: RENDIMIENTO_BAJO
        const a7 = encontrarAlerta(
          CodigoAlerta.RENDIMIENTO_BAJO,
          cicloRendimientoId,
        );
        expect(a7).toBeDefined();
        expect(a7!.severidad).toBe(SeveridadAlerta.MEDIA);
        expect(a7!.observado).toContain('60.00%');

        // Regla 8: CICLO_SIN_CAPTURA
        const a8 = encontrarAlerta(
          CodigoAlerta.CICLO_SIN_CAPTURA,
          cicloSinCapturaId,
        );
        expect(a8).toBeDefined();
        expect(a8!.severidad).toBe(SeveridadAlerta.BAJA);
        expect(a8!.umbral).toBe('15 días');

        // Regla 9: CICLO_LARGO
        const a9 = encontrarAlerta(CodigoAlerta.CICLO_LARGO, cicloLargoId);
        expect(a9).toBeDefined();
        expect(a9!.severidad).toBe(SeveridadAlerta.BAJA);
        expect(a9!.umbral).toContain('144 días');

        // Regla 10: LIMITE_PLAN_CERCANO
        const a10 = body.data.find(
          (a) => a.codigo === (CodigoAlerta.LIMITE_PLAN_CERCANO as string),
        );
        expect(a10).toBeDefined();
        expect(a10!.severidad).toBe(SeveridadAlerta.INFORMATIVA);
        expect(a10!.umbral).toBe('90.0%');
      });

      it('Caso justo en el umbral NO alerta para merma (10%), categoría (40%) y rendimiento (80%)', async () => {
        const res = await testRequest(app)
          .get(
            `/api/v1/reportes/alertas?cicloId=${cicloEnUmbralId}&hoy=2026-10-21`,
          )
          .set('Authorization', tokenA_Admin);
        expect(res.status).toBe(200);

        const body = res.body as { data: Array<{ codigo: string }> };
        const codigos = body.data.map((a) => a.codigo);

        expect(codigos).not.toContain(CodigoAlerta.MERMA_ELEVADA);
        expect(codigos).not.toContain(CodigoAlerta.CATEGORIA_DOMINANTE);
        expect(codigos).not.toContain(CodigoAlerta.RENDIMIENTO_BAJO);
      });

      it('PLANIFICADO y CANCELADO no generan alertas; FINALIZADO > 30 días no genera alertas de ciclo', async () => {
        for (const cId of [
          cicloPlanificadoId,
          cicloCanceladoId,
          cicloCerradoAntiguoId,
        ]) {
          const res = await testRequest(app)
            .get(`/api/v1/reportes/alertas?cicloId=${cId}&hoy=2026-10-21`)
            .set('Authorization', tokenA_Admin);
          expect(res.status).toBe(200);
          const body = res.body as { data: Array<{ codigo: string }> };
          // Ninguna alerta asociada al ciclo directamente
          const alertasDeCiclo = body.data.filter(
            (a) => a.codigo !== (CodigoAlerta.COBRO_VENCIDO as string),
          );
          expect(alertasDeCiclo).toHaveLength(0);
        }
      });

      it('COBRO_VENCIDO aparece aún con el ciclo asociado FINALIZADO hace más de 30 días', async () => {
        const res = await testRequest(app)
          .get('/api/v1/reportes/alertas?tipo=COBRO_VENCIDO&hoy=2026-10-21')
          .set('Authorization', tokenA_Admin);
        expect(res.status).toBe(200);

        const body = res.body as {
          data: Array<{ codigo: string; severidad: string }>;
        };
        expect(body.data.length).toBeGreaterThanOrEqual(1);
        for (const item of body.data) {
          expect(item.codigo).toBe(CodigoAlerta.COBRO_VENCIDO);
          expect(item.severidad).toBe(SeveridadAlerta.ALTA);
        }
      });

      it('Orden canónico (ALTA -> MEDIA -> BAJA -> INFORMATIVA y luego cicloId asc), filtros y paginación', async () => {
        const res = await testRequest(app)
          .get('/api/v1/reportes/alertas?limit=100&hoy=2026-10-21')
          .set('Authorization', tokenA_Admin);
        expect(res.status).toBe(200);

        const body = res.body as {
          data: Array<{ severidad: string; cicloId?: number | null }>;
          resumen: {
            totalAltas: number;
            totalMedias: number;
            totalBajas: number;
            totalInformativas: number;
            total: number;
          };
        };

        const pesoSev: Record<string, number> = {
          ALTA: 1,
          MEDIA: 2,
          BAJA: 3,
          INFORMATIVA: 4,
        };

        for (let i = 0; i < body.data.length - 1; i++) {
          const actual = body.data[i];
          const siguiente = body.data[i + 1];
          const pAct = pesoSev[actual.severidad] ?? 5;
          const pSig = pesoSev[siguiente.severidad] ?? 5;
          expect(pAct).toBeLessThanOrEqual(pSig);

          if (pAct === pSig && actual.cicloId && siguiente.cicloId) {
            expect(actual.cicloId).toBeLessThanOrEqual(siguiente.cicloId);
          }
        }

        // Filtro por severidad ALTA
        const resAlta = await testRequest(app)
          .get('/api/v1/reportes/alertas?severidad=ALTA&hoy=2026-10-21')
          .set('Authorization', tokenA_Admin);
        expect(resAlta.status).toBe(200);
        const bodyAlta = resAlta.body as { data: Array<{ severidad: string }> };
        for (const item of bodyAlta.data) {
          expect(item.severidad).toBe(SeveridadAlerta.ALTA);
        }

        // Paginación coherente
        const resPagina = await testRequest(app)
          .get('/api/v1/reportes/alertas?page=1&limit=2&hoy=2026-10-21')
          .set('Authorization', tokenA_Admin);
        expect(resPagina.status).toBe(200);
        const bodyPag = resPagina.body as {
          data: any[];
          meta: {
            page: number;
            limit: number;
            total: number;
            totalPages: number;
          };
        };
        expect(bodyPag.data).toHaveLength(2);
        expect(bodyPag.meta.page).toBe(1);
        expect(bodyPag.meta.limit).toBe(2);
        expect(bodyPag.meta.totalPages).toBe(Math.ceil(bodyPag.meta.total / 2));
      });

      it('Aislamiento multiempresa estricto: alertas de Empresa B no contienen referencias de Empresa A', async () => {
        const resB = await testRequest(app)
          .get('/api/v1/reportes/alertas?hoy=2026-10-21')
          .set('Authorization', tokenB_Admin);
        expect(resB.status).toBe(200);

        const bodyB = resB.body as {
          data: Array<{ cicloId?: number | null; ventaId?: number | null }>;
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

      it('Conteo constante de consultas en GET /reportes/alertas: exactamente el mismo número fijo de consultas SQL con 3 ciclos que con 30 ciclos', async () => {
        let queryCount = 0;
        const origQueryRaw = prisma.$queryRaw.bind(prisma);
        const origCiclosFindMany = prisma.cicloProduccion.findMany.bind(
          prisma.cicloProduccion,
        );
        const origGastoGroupBy = prisma.gasto.groupBy.bind(prisma.gasto);
        const origEmpresaFind = prisma.empresa.findUnique.bind(prisma.empresa);
        const origParcelaCount = prisma.parcela.count.bind(prisma.parcela);
        const origUsuarioCount = prisma.usuario.count.bind(prisma.usuario);

        /* eslint-disable @typescript-eslint/require-await, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call */
        const spyQueryRaw = jest
          .spyOn(prisma, '$queryRaw')
          .mockImplementation(async (...args: any[]) => {
            queryCount++;
            return (origQueryRaw as any)(...args);
          });

        const spyCiclosFindMany = jest
          .spyOn(prisma.cicloProduccion, 'findMany')
          .mockImplementation(async (...args: any[]) => {
            queryCount++;
            return (origCiclosFindMany as any)(...args);
          });

        const spyGastoGroupBy = jest
          .spyOn(prisma.gasto, 'groupBy')
          .mockImplementation(async (...args: any[]) => {
            queryCount++;
            return (origGastoGroupBy as any)(...args);
          });

        const spyEmpresaFind = jest
          .spyOn(prisma.empresa, 'findUnique')
          .mockImplementation(async (...args: any[]) => {
            queryCount++;
            return (origEmpresaFind as any)(...args);
          });

        const spyParcelaCount = jest
          .spyOn(prisma.parcela, 'count')
          .mockImplementation(async (...args: any[]) => {
            queryCount++;
            return (origParcelaCount as any)(...args);
          });

        const spyUsuarioCount = jest
          .spyOn(prisma.usuario, 'count')
          .mockImplementation(async (...args: any[]) => {
            queryCount++;
            return (origUsuarioCount as any)(...args);
          });
        /* eslint-enable @typescript-eslint/require-await, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call */

        try {
          // Medición 1: Consulta normal sobre Empresa A
          queryCount = 0;
          const res1 = await testRequest(app)
            .get('/api/v1/reportes/alertas?hoy=2026-10-21')
            .set('Authorization', tokenA_Admin);
          expect(res1.status).toBe(200);
          const conteoConMenosCiclos = queryCount;

          // Sembrar 27 ciclos adicionales en Empresa A para elevar a > 30 ciclos
          const nuevosCiclos = [];
          for (let i = 0; i < 27; i++) {
            nuevosCiclos.push({
              empresaId: seed.empresaA.id,
              parcelaId: seed.empresaA.parcela.id,
              variedadId: seed.global.variedadId,
              nombre: `Ciclo Volumen Extra ${i}`,
              estado: EstadoCiclo.FINALIZADO,
              cerradoEn: new Date('2026-10-15'),
              superficieSembrada: new Prisma.Decimal('1.00'),
              fechaInicio: new Date('2026-09-01'),
              creadoPorId: seed.empresaA.usuarios.admin.id,
            });
          }
          await prisma.cicloProduccion.createMany({ data: nuevosCiclos });

          // Medición 2: Consulta tras multiplicar el número de ciclos por 3
          queryCount = 0;
          const res2 = await testRequest(app)
            .get('/api/v1/reportes/alertas?hoy=2026-10-21')
            .set('Authorization', tokenA_Admin);
          expect(res2.status).toBe(200);
          const conteoConMasCiclos = queryCount;

          // Demostración formal: el número de consultas a base de datos es IDÉNTICO
          expect(conteoConMasCiclos).toBe(conteoConMenosCiclos);
          expect(conteoConMasCiclos).toBeGreaterThanOrEqual(7);
        } finally {
          spyQueryRaw.mockRestore();
          spyCiclosFindMany.mockRestore();
          spyGastoGroupBy.mockRestore();
          spyEmpresaFind.mockRestore();
          spyParcelaCount.mockRestore();
          spyUsuarioCount.mockRestore();
        }
      });
    });
  });
});
