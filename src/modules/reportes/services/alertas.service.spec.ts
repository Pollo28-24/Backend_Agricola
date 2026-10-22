import { Test, TestingModule } from '@nestjs/testing';
import { AlertasService } from './alertas.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { CodigoAlerta, SeveridadAlerta } from '../constants/alertas.constants';
import { EstadoCiclo } from '@prisma/client';

describe('AlertasService (Unitario)', () => {
  let service: AlertasService;
  let prismaMock: {
    cicloProduccion: { findMany: jest.Mock };
    $queryRaw: jest.Mock;
    gasto: { groupBy: jest.Mock };
    empresa: { findUnique: jest.Mock };
    parcela: { count: jest.Mock };
    usuario: { count: jest.Mock };
  };

  const empresaId = 1;
  const hoyPrueba = '2026-10-21';

  beforeEach(async () => {
    prismaMock = {
      cicloProduccion: { findMany: jest.fn() },
      $queryRaw: jest.fn(),
      gasto: { groupBy: jest.fn() },
      empresa: { findUnique: jest.fn() },
      parcela: { count: jest.fn() },
      usuario: { count: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AlertasService,
        {
          provide: PrismaService,
          useValue: prismaMock,
        },
      ],
    }).compile();

    service = module.get<AlertasService>(AlertasService);
  });

  it('dispara cada una de las 10 reglas de alerta con fixtures deterministas', async () => {
    // Ciclos en BD:
    // Ciclo 1: En pérdida (ganancia < 0, facturado > 0)
    // Ciclo 2: Costo supera precio (costoPorKg 18 > precio 15)
    // Ciclo 3: Merma elevada (mermaPct 12% > 10%)
    // Ciclo 4: Categoría dominante (categoría Fertilizantes 45% > 40%)
    // Ciclo 5: Costo creciente (parcela 10, costo 20 > ciclo anterior 15 * 1.15 = 17.25)
    // Ciclo 6: Rendimiento bajo (finalizado, meta 10000, cosechado 7000 < 8000)
    // Ciclo 7: Sin captura (activo, último gasto hace 20 días > 15)
    // Ciclo 8: Ciclo largo (activo, fechaInicio hace 150 días, variedad 100 días * 1.2 = 120)
    prismaMock.cicloProduccion.findMany.mockResolvedValueOnce([
      {
        id: 1,
        nombre: 'Ciclo Pérdida',
        estado: EstadoCiclo.ACTIVO,
        fechaInicio: new Date('2026-09-01'),
        fechaFin: null,
        cerradoEn: null,
        superficieSembrada: 10,
        metaProduccionKg: null,
        parcelaId: 1,
        variedadId: 1,
        variedad: { duracionCicloDias: 90 },
      },
      {
        id: 2,
        nombre: 'Ciclo Costo Alto',
        estado: EstadoCiclo.ACTIVO,
        fechaInicio: new Date('2026-09-01'),
        fechaFin: null,
        cerradoEn: null,
        superficieSembrada: 10,
        metaProduccionKg: null,
        parcelaId: 2,
        variedadId: 1,
        variedad: { duracionCicloDias: 90 },
      },
      {
        id: 3,
        nombre: 'Ciclo Merma',
        estado: EstadoCiclo.ACTIVO,
        fechaInicio: new Date('2026-09-01'),
        fechaFin: null,
        cerradoEn: null,
        superficieSembrada: 10,
        metaProduccionKg: null,
        parcelaId: 3,
        variedadId: 1,
        variedad: { duracionCicloDias: 90 },
      },
      {
        id: 4,
        nombre: 'Ciclo Dominante',
        estado: EstadoCiclo.ACTIVO,
        fechaInicio: new Date('2026-09-01'),
        fechaFin: null,
        cerradoEn: null,
        superficieSembrada: 10,
        metaProduccionKg: null,
        parcelaId: 4,
        variedadId: 1,
        variedad: { duracionCicloDias: 90 },
      },
      {
        id: 5,
        nombre: 'Ciclo Creciente',
        estado: EstadoCiclo.ACTIVO,
        fechaInicio: new Date('2026-09-01'),
        fechaFin: null,
        cerradoEn: null,
        superficieSembrada: 10,
        metaProduccionKg: null,
        parcelaId: 10,
        variedadId: 1,
        variedad: { duracionCicloDias: 90 },
      },
      {
        id: 6,
        nombre: 'Ciclo Rendimiento Bajo',
        estado: EstadoCiclo.FINALIZADO,
        fechaInicio: new Date('2026-06-01'),
        fechaFin: new Date('2026-10-15'),
        cerradoEn: new Date('2026-10-15'),
        superficieSembrada: 10,
        metaProduccionKg: '10000.000',
        parcelaId: 6,
        variedadId: 1,
        variedad: { duracionCicloDias: 120 },
      },
      {
        id: 7,
        nombre: 'Ciclo Inactivo',
        estado: EstadoCiclo.ACTIVO,
        fechaInicio: new Date('2026-09-01'),
        fechaFin: null,
        cerradoEn: null,
        superficieSembrada: 10,
        metaProduccionKg: null,
        parcelaId: 7,
        variedadId: 1,
        variedad: { duracionCicloDias: 90 },
      },
      {
        id: 8,
        nombre: 'Ciclo Demorado',
        estado: EstadoCiclo.ACTIVO,
        fechaInicio: new Date('2026-05-01'), // 173 días a 2026-10-21 (> 100 * 1.2 = 120)
        fechaFin: null,
        cerradoEn: null,
        superficieSembrada: 10,
        metaProduccionKg: null,
        parcelaId: 8,
        variedadId: 1,
        variedad: { duracionCicloDias: 100 },
      },
    ]);

    // Query 1: v_rentabilidad_ciclo
    const rentRows = [
      {
        cicloId: 1,
        empresaId,
        parcelaId: 1,
        variedadId: 1,
        estado: 'ACTIVO',
        totalFacturado: '50000.00',
        costoTotal: '70000.00',
        ganancia: '-20000.00',
        costoPorKg: null,
        precioPromedioKg: null,
        mermaPct: '2.00',
        kgCosechados: null,
      },
      {
        cicloId: 2,
        empresaId,
        parcelaId: 2,
        variedadId: 1,
        estado: 'ACTIVO',
        totalFacturado: '30000.00',
        costoTotal: '36000.00',
        ganancia: '-6000.00',
        costoPorKg: '18.00',
        precioPromedioKg: '15.00',
        mermaPct: '3.00',
        kgCosechados: '2000.000',
      },
      {
        cicloId: 3,
        empresaId,
        parcelaId: 3,
        variedadId: 1,
        estado: 'ACTIVO',
        totalFacturado: '40000.00',
        costoTotal: '30000.00',
        ganancia: '10000.00',
        costoPorKg: '10.00',
        precioPromedioKg: '15.00',
        mermaPct: '12.50', // > 10%
        kgCosechados: '3000.000',
      },
      {
        cicloId: 4,
        empresaId,
        parcelaId: 4,
        variedadId: 1,
        estado: 'ACTIVO',
        totalFacturado: '40000.00',
        costoTotal: '30000.00',
        ganancia: '10000.00',
        costoPorKg: '10.00',
        precioPromedioKg: '15.00',
        mermaPct: '2.00',
        kgCosechados: '3000.000',
      },
      {
        cicloId: 5,
        empresaId,
        parcelaId: 10,
        variedadId: 1,
        estado: 'ACTIVO',
        totalFacturado: '40000.00',
        costoTotal: '40000.00',
        ganancia: '0.00',
        costoPorKg: '20.00',
        precioPromedioKg: '20.00',
        mermaPct: '2.00',
        kgCosechados: '2000.000',
      },
      {
        cicloId: 6,
        empresaId,
        parcelaId: 6,
        variedadId: 1,
        estado: 'FINALIZADO',
        totalFacturado: '70000.00',
        costoTotal: '60000.00',
        ganancia: '10000.00',
        costoPorKg: '8.57',
        precioPromedioKg: '10.00',
        mermaPct: '2.00',
        kgCosechados: '7000.000', // 7000 < 8000 (80% de 10000)
      },
      {
        cicloId: 7,
        empresaId,
        parcelaId: 7,
        variedadId: 1,
        estado: 'ACTIVO',
        totalFacturado: null,
        costoTotal: '5000.00',
        ganancia: '-5000.00',
        costoPorKg: null,
        precioPromedioKg: null,
        mermaPct: null,
        kgCosechados: null,
      },
      {
        cicloId: 8,
        empresaId,
        parcelaId: 8,
        variedadId: 1,
        estado: 'ACTIVO',
        totalFacturado: null,
        costoTotal: '5000.00',
        ganancia: '-5000.00',
        costoPorKg: null,
        precioPromedioKg: null,
        mermaPct: null,
        kgCosechados: null,
      },
    ];

    // Query 2: v_costo_por_categoria
    const catRows = [
      {
        cicloId: 4,
        categoriaRaizId: 1,
        categoriaRaiz: 'Fertilizantes',
        porcentaje: '45.00', // > 40%
      },
    ];

    // Query 3: v_comparativo_parcela (para ciclo 5 en parcela 10)
    const compRows = [
      {
        parcelaId: 10,
        cicloId: 5,
        fechaInicio: new Date('2026-09-01'),
        costoPorKg: '20.00',
      },
      {
        parcelaId: 10,
        cicloId: 99,
        fechaInicio: new Date('2026-01-01'),
        costoPorKg: '15.00', // 20.00 > 15.00 * 1.15 = 17.25
      },
    ];

    // Query 4: gastos Max (para ciclo 7 inactivo: último gasto hace 25 días)
    const gastosMax = [
      {
        cicloId: 1,
        _max: { fecha: new Date('2026-10-20') },
      },
      {
        cicloId: 2,
        _max: { fecha: new Date('2026-10-20') },
      },
      {
        cicloId: 3,
        _max: { fecha: new Date('2026-10-20') },
      },
      {
        cicloId: 4,
        _max: { fecha: new Date('2026-10-20') },
      },
      {
        cicloId: 5,
        _max: { fecha: new Date('2026-10-20') },
      },
      {
        cicloId: 7,
        _max: { fecha: new Date('2026-09-25') }, // Inactivo desde sept
      },
      {
        cicloId: 8,
        _max: { fecha: new Date('2026-10-20') },
      },
    ];

    // Mock de $queryRaw en orden de ejecución dentro del servicio:
    // 1. rentabilidad, 2. categorías, 3. comparativo
    prismaMock.$queryRaw
      .mockResolvedValueOnce(rentRows)
      .mockResolvedValueOnce(catRows)
      .mockResolvedValueOnce(compRows);

    prismaMock.gasto.groupBy.mockResolvedValueOnce(gastosMax);

    // Query 5: ventas vencidas para COBRO_VENCIDO
    prismaMock.$queryRaw.mockResolvedValueOnce([
      {
        ventaId: 50,
        folio: 'FAC-050',
        clienteId: 5,
        clienteNombre: 'Cliente Moroso',
        cicloId: 1,
        fechaVencimiento: new Date('2026-09-15'),
        saldoPendiente: '12000.00',
      },
    ]);

    // Query 6: Límites de plan
    prismaMock.empresa.findUnique.mockResolvedValueOnce({
      plan: {
        nombre: 'Plan Básico',
        maxParcelas: 10,
        maxUsuarios: 5,
      },
    });
    prismaMock.parcela.count.mockResolvedValueOnce(9); // 9 de 10 = 90% -> LIMITE_PLAN_CERCANO
    prismaMock.usuario.count.mockResolvedValueOnce(3); // 3 de 5 = 60%

    const res = await service.obtenerAlertas(empresaId, {
      hoy: hoyPrueba,
      limit: 50,
    });

    const codigosEncontrados = res.data.map((a) => a.codigo);

    // Verificar las 10 reglas disparadas
    expect(codigosEncontrados).toContain(CodigoAlerta.CICLO_EN_PERDIDA); // Regla 1
    expect(codigosEncontrados).toContain(CodigoAlerta.COSTO_SUPERA_PRECIO); // Regla 2
    expect(codigosEncontrados).toContain(CodigoAlerta.COBRO_VENCIDO); // Regla 3
    expect(codigosEncontrados).toContain(CodigoAlerta.MERMA_ELEVADA); // Regla 4
    expect(codigosEncontrados).toContain(CodigoAlerta.CATEGORIA_DOMINANTE); // Regla 5
    expect(codigosEncontrados).toContain(CodigoAlerta.COSTO_CRECIENTE); // Regla 6
    expect(codigosEncontrados).toContain(CodigoAlerta.RENDIMIENTO_BAJO); // Regla 7
    expect(codigosEncontrados).toContain(CodigoAlerta.CICLO_SIN_CAPTURA); // Regla 8
    expect(codigosEncontrados).toContain(CodigoAlerta.CICLO_LARGO); // Regla 9
    expect(codigosEncontrados).toContain(CodigoAlerta.LIMITE_PLAN_CERCANO); // Regla 10

    // Resumen y severidades
    expect(res.resumen.totalAltas).toBeGreaterThanOrEqual(3);
    expect(res.resumen.totalMedias).toBeGreaterThanOrEqual(4);
    expect(res.resumen.totalBajas).toBeGreaterThanOrEqual(2);
    expect(res.resumen.totalInformativas).toBeGreaterThanOrEqual(1);
    expect(res.meta.total).toBe(res.data.length);

    // Verificar que las ALTA están al inicio del ordenamiento
    expect(res.data[0].severidad).toBe(SeveridadAlerta.ALTA);
  });

  it('no dispara alerta cuando el valor observado es exactamente igual al umbral', async () => {
    prismaMock.cicloProduccion.findMany.mockResolvedValueOnce([
      {
        id: 11,
        nombre: 'Ciclo En Umbral',
        estado: EstadoCiclo.ACTIVO,
        fechaInicio: new Date('2026-09-01'),
        fechaFin: null,
        cerradoEn: null,
        superficieSembrada: 10,
        metaProduccionKg: null,
        parcelaId: 11,
        variedadId: 1,
        variedad: { duracionCicloDias: 90 },
      },
    ]);

    // Merma exactamente igual al 10.00% y categoría exactamente igual al 40.00%
    prismaMock.$queryRaw
      .mockResolvedValueOnce([
        {
          cicloId: 11,
          empresaId,
          parcelaId: 11,
          variedadId: 1,
          estado: 'ACTIVO',
          totalFacturado: '50000.00',
          costoTotal: '40000.00',
          ganancia: '10000.00',
          costoPorKg: '15.00',
          precioPromedioKg: '15.00', // Costo igual a precio (no supera)
          mermaPct: '10.00', // Exactamente 10% (umbral)
          kgCosechados: '2000.000',
        },
      ])
      .mockResolvedValueOnce([
        {
          cicloId: 11,
          categoriaRaizId: 1,
          categoriaRaiz: 'Semillas',
          porcentaje: '40.00', // Exactamente 40% (umbral)
        },
      ])
      .mockResolvedValueOnce([]) // Comparativo
      .mockResolvedValueOnce([]); // Ventas vencidas vacías

    prismaMock.gasto.groupBy.mockResolvedValueOnce([
      {
        cicloId: 11,
        _max: { fecha: new Date('2026-10-15') }, // Hace 6 días (no supera 15)
      },
    ]);

    prismaMock.empresa.findUnique.mockResolvedValueOnce({
      plan: {
        nombre: 'Plan Pro',
        maxParcelas: 10,
        maxUsuarios: 10,
      },
    });
    prismaMock.parcela.count.mockResolvedValueOnce(5); // 50%
    prismaMock.usuario.count.mockResolvedValueOnce(4); // 40%

    const res = await service.obtenerAlertas(empresaId, { hoy: hoyPrueba });

    // Ninguna alerta debe haberse disparado
    expect(res.data).toHaveLength(0);
    expect(res.resumen.total).toBe(0);
  });

  it('permite filtrar alertas por severidad y cicloId', async () => {
    prismaMock.cicloProduccion.findMany.mockResolvedValueOnce([
      {
        id: 20,
        nombre: 'Ciclo Filtrable',
        estado: EstadoCiclo.ACTIVO,
        fechaInicio: new Date('2026-09-01'),
        fechaFin: null,
        cerradoEn: null,
        superficieSembrada: 10,
        metaProduccionKg: null,
        parcelaId: 20,
        variedadId: 1,
        variedad: { duracionCicloDias: 90 },
      },
    ]);

    prismaMock.$queryRaw
      .mockResolvedValueOnce([
        {
          cicloId: 20,
          empresaId,
          parcelaId: 20,
          variedadId: 1,
          estado: 'ACTIVO',
          totalFacturado: '10000.00',
          costoTotal: '30000.00',
          ganancia: '-20000.00',
          costoPorKg: null,
          precioPromedioKg: null,
          mermaPct: '15.00', // MEDIA
          kgCosechados: null,
        },
      ])
      .mockResolvedValueOnce([]) // categorias
      .mockResolvedValueOnce([]) // comparativo
      .mockResolvedValueOnce([]); // ventas vencidas

    prismaMock.gasto.groupBy.mockResolvedValueOnce([]);
    prismaMock.empresa.findUnique.mockResolvedValueOnce(null);
    prismaMock.parcela.count.mockResolvedValueOnce(0);
    prismaMock.usuario.count.mockResolvedValueOnce(0);

    // Filtrar solo severidad ALTA
    const resAlta = await service.obtenerAlertas(empresaId, {
      severidad: SeveridadAlerta.ALTA,
      cicloId: 20,
      hoy: hoyPrueba,
    });

    expect(resAlta.data).toHaveLength(1);
    expect(resAlta.data[0].codigo).toBe(CodigoAlerta.CICLO_EN_PERDIDA);
    expect(resAlta.data[0].severidad).toBe(SeveridadAlerta.ALTA);

    // Filtrar solo severidad MEDIA
    prismaMock.cicloProduccion.findMany.mockResolvedValueOnce([
      {
        id: 20,
        nombre: 'Ciclo Filtrable',
        estado: EstadoCiclo.ACTIVO,
        fechaInicio: new Date('2026-09-01'),
        fechaFin: null,
        cerradoEn: null,
        superficieSembrada: 10,
        metaProduccionKg: null,
        parcelaId: 20,
        variedadId: 1,
        variedad: { duracionCicloDias: 90 },
      },
    ]);
    prismaMock.$queryRaw
      .mockResolvedValueOnce([
        {
          cicloId: 20,
          empresaId,
          parcelaId: 20,
          variedadId: 1,
          estado: 'ACTIVO',
          totalFacturado: '10000.00',
          costoTotal: '30000.00',
          ganancia: '-20000.00',
          costoPorKg: null,
          precioPromedioKg: null,
          mermaPct: '15.00',
          kgCosechados: null,
        },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    prismaMock.gasto.groupBy.mockResolvedValueOnce([]);
    prismaMock.empresa.findUnique.mockResolvedValueOnce(null);
    prismaMock.parcela.count.mockResolvedValueOnce(0);
    prismaMock.usuario.count.mockResolvedValueOnce(0);

    const resMedia = await service.obtenerAlertas(empresaId, {
      severidad: SeveridadAlerta.MEDIA,
      cicloId: 20,
      hoy: hoyPrueba,
    });

    expect(resMedia.data).toHaveLength(1);
    expect(resMedia.data[0].codigo).toBe(CodigoAlerta.MERMA_ELEVADA);
    expect(resMedia.data[0].severidad).toBe(SeveridadAlerta.MEDIA);
  });

  describe('Estados de ciclo y ventas independientes', () => {
    it('COBRO_VENCIDO se reporta incluso si el ciclo asociado está FINALIZADO hace más de 30 días', async () => {
      // Universo de ciclos vacío (cerrado hace más de 30 días)
      prismaMock.cicloProduccion.findMany.mockResolvedValueOnce([]);

      // Query 5: Venta vencida de un ciclo antiguo
      prismaMock.$queryRaw.mockResolvedValueOnce([
        {
          ventaId: 999,
          folio: 'V-HISTORICA',
          clienteId: 50,
          clienteNombre: 'Cliente Histórico',
          cicloId: 100,
          fechaVencimiento: new Date('2026-08-01'),
          saldoPendiente: '5000.00',
        },
      ]);

      prismaMock.empresa.findUnique.mockResolvedValueOnce(null);
      prismaMock.parcela.count.mockResolvedValueOnce(0);
      prismaMock.usuario.count.mockResolvedValueOnce(0);

      const res = await service.obtenerAlertas(empresaId, { hoy: hoyPrueba });

      expect(res.data).toHaveLength(1);
      expect(res.data[0].codigo).toBe(CodigoAlerta.COBRO_VENCIDO);
      expect(res.data[0].severidad).toBe(SeveridadAlerta.ALTA);
      expect(res.data[0].cicloId).toBe(100);
      expect(res.data[0].ventaId).toBe(999);
    });

    it('tolera datos faltantes o nulos (sin duración de variedad, sin meta, cocientes null) sin error', async () => {
      prismaMock.cicloProduccion.findMany.mockResolvedValueOnce([
        {
          id: 50,
          nombre: 'Ciclo Sin Datos',
          estado: EstadoCiclo.ACTIVO,
          fechaInicio: new Date('2026-10-01'),
          fechaFin: null,
          cerradoEn: null,
          superficieSembrada: null,
          metaProduccionKg: null, // Sin meta
          parcelaId: 50,
          variedadId: 50,
          variedad: null, // Sin duración de variedad
        },
      ]);

      prismaMock.$queryRaw
        .mockResolvedValueOnce([
          {
            cicloId: 50,
            empresaId,
            parcelaId: 50,
            variedadId: 50,
            estado: 'ACTIVO',
            totalFacturado: null,
            costoTotal: null,
            ganancia: null,
            costoPorKg: null,
            precioPromedioKg: null,
            mermaPct: null,
            kgCosechados: null,
          },
        ])
        .mockResolvedValueOnce([]) // Sin categorías
        .mockResolvedValueOnce([]) // Sin comparativo
        .mockResolvedValueOnce([]); // Sin ventas vencidas

      prismaMock.gasto.groupBy.mockResolvedValueOnce([
        {
          cicloId: 50,
          _max: { fecha: new Date('2026-10-18') }, // Actividad reciente (3 días)
        },
      ]);

      prismaMock.empresa.findUnique.mockResolvedValueOnce({
        plan: null, // Sin plan configurado
      });

      const res = await service.obtenerAlertas(empresaId, { hoy: hoyPrueba });

      // No debe lanzar error ni generar alertas espurias de rendimiento/largo/merma/etc.
      expect(res.data).toHaveLength(0);
      expect(res.resumen.total).toBe(0);
    });

    it('ordena canónicamente por severidad (ALTA -> MEDIA -> BAJA -> INFORMATIVA) y cicloId asc', async () => {
      prismaMock.cicloProduccion.findMany.mockResolvedValueOnce([
        {
          id: 2,
          nombre: 'Ciclo B',
          estado: EstadoCiclo.ACTIVO,
          fechaInicio: new Date('2026-09-01'),
          fechaFin: null,
          cerradoEn: null,
          superficieSembrada: 10,
          metaProduccionKg: null,
          parcelaId: 2,
          variedadId: 1,
          variedad: { duracionCicloDias: 90 },
        },
        {
          id: 1,
          nombre: 'Ciclo A',
          estado: EstadoCiclo.ACTIVO,
          fechaInicio: new Date('2026-09-01'),
          fechaFin: null,
          cerradoEn: null,
          superficieSembrada: 10,
          metaProduccionKg: null,
          parcelaId: 1,
          variedadId: 1,
          variedad: { duracionCicloDias: 90 },
        },
      ]);

      // Ciclo 1 genera MEDIA (merma 15%), Ciclo 2 genera ALTA (pérdida)
      prismaMock.$queryRaw
        .mockResolvedValueOnce([
          {
            cicloId: 1,
            empresaId,
            parcelaId: 1,
            variedadId: 1,
            estado: 'ACTIVO',
            totalFacturado: '20000.00',
            costoTotal: '15000.00',
            ganancia: '5000.00',
            costoPorKg: '10.00',
            precioPromedioKg: '12.00',
            mermaPct: '15.00', // MEDIA
            kgCosechados: '2000.000',
          },
          {
            cicloId: 2,
            empresaId,
            parcelaId: 2,
            variedadId: 1,
            estado: 'ACTIVO',
            totalFacturado: '10000.00',
            costoTotal: '25000.00',
            ganancia: '-15000.00', // ALTA
            costoPorKg: null,
            precioPromedioKg: null,
            mermaPct: null,
            kgCosechados: null,
          },
        ])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      prismaMock.gasto.groupBy.mockResolvedValueOnce([
        { cicloId: 1, _max: { fecha: new Date('2026-10-18') } },
        { cicloId: 2, _max: { fecha: new Date('2026-10-18') } },
      ]);

      prismaMock.empresa.findUnique.mockResolvedValueOnce(null);
      prismaMock.parcela.count.mockResolvedValueOnce(0);
      prismaMock.usuario.count.mockResolvedValueOnce(0);

      const res = await service.obtenerAlertas(empresaId, { hoy: hoyPrueba });

      expect(res.data.length).toBeGreaterThanOrEqual(2);
      expect(res.data[0].severidad).toBe(SeveridadAlerta.ALTA);
      expect(res.data[0].cicloId).toBe(2);
      expect(res.data[1].severidad).toBe(SeveridadAlerta.MEDIA);
      expect(res.data[1].cicloId).toBe(1);
    });
  });
});
