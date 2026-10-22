import { Test, TestingModule } from '@nestjs/testing';
import { CuentasPorCobrarService } from './cuentas-por-cobrar.service';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  EstadoCobro,
  VentaEstadoCobroPolicy,
} from '../../../common/domain/policies/venta-estado-cobro.policy';

describe('CuentasPorCobrarService (Unitario)', () => {
  let service: CuentasPorCobrarService;
  let prismaMock: {
    $queryRaw: jest.Mock;
  };

  const empresaId = 10;
  const hoyPrueba = '2026-10-21';

  beforeEach(async () => {
    prismaMock = {
      $queryRaw: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CuentasPorCobrarService,
        {
          provide: PrismaService,
          useValue: prismaMock,
        },
      ],
    }).compile();

    service = module.get<CuentasPorCobrarService>(CuentasPorCobrarService);
  });

  it('calcula correctamente clasificación, bordes de fecha (ayer, hoy, mañana) y paridad con VentaEstadoCobroPolicy', async () => {
    // 1. Simular conteo
    prismaMock.$queryRaw.mockResolvedValueOnce([{ total: 3 }]);

    // 2. Simular resumen global
    prismaMock.$queryRaw.mockResolvedValueOnce([
      {
        totalPorCobrar: '3500.00',
        totalVencido: '1000.00',
        totalVigente: '2500.00',
        totalClientesMorosos: 1,
      },
    ]);

    // 3. Simular filas de datos (Ayer: vencida, Hoy: vigente, Mañana: vigente)
    prismaMock.$queryRaw.mockResolvedValueOnce([
      {
        ventaId: 101,
        folio: 'FAC-001',
        clienteId: 1,
        clienteNombre: 'Cliente A',
        cicloId: 5,
        fechaVenta: '2026-09-01',
        fechaVencimiento: '2026-10-20', // Ayer -> vencida
        total: '1000.00',
        cobrado: '0.00',
        estadoVenta: 'REGISTRADA',
      },
      {
        ventaId: 102,
        folio: 'FAC-002',
        clienteId: 2,
        clienteNombre: 'Cliente B',
        cicloId: 5,
        fechaVenta: '2026-09-15',
        fechaVencimiento: '2026-10-21', // Hoy -> vence hoy (vigente, días = 0)
        total: '1500.00',
        cobrado: '500.00',
        estadoVenta: 'REGISTRADA',
      },
      {
        ventaId: 103,
        folio: 'FAC-003',
        clienteId: 3,
        clienteNombre: 'Cliente C',
        cicloId: 5,
        fechaVenta: '2026-10-01',
        fechaVencimiento: '2026-10-22', // Mañana -> vigente (días = -1)
        total: '2000.00',
        cobrado: '500.00',
        estadoVenta: 'REGISTRADA',
      },
    ]);

    const res = await service.obtenerCuentasPorCobrar(empresaId, {
      hoy: hoyPrueba,
      page: 1,
      limit: 10,
    });

    expect(res.data).toHaveLength(3);

    // Venta 101: vencida ayer (díasVencimiento = 1)
    expect(res.data[0].ventaId).toBe(101);
    expect(res.data[0].estadoCobro).toBe(EstadoCobro.VENCIDA);
    expect(res.data[0].vencida).toBe(true);
    expect(res.data[0].diasVencimiento).toBe(1);
    expect(res.data[0].montoPendiente).toBe('1000.00');

    // Venta 102: vence hoy (díasVencimiento = 0, parcial no vencida)
    expect(res.data[1].ventaId).toBe(102);
    expect(res.data[1].estadoCobro).toBe(EstadoCobro.PARCIAL);
    expect(res.data[1].vencida).toBe(false);
    expect(res.data[1].diasVencimiento).toBe(0);
    expect(res.data[1].montoPendiente).toBe('1000.00');

    // Venta 103: vence mañana (díasVencimiento = -1, parcial no vencida)
    expect(res.data[2].ventaId).toBe(103);
    expect(res.data[2].estadoCobro).toBe(EstadoCobro.PARCIAL);
    expect(res.data[2].vencida).toBe(false);
    expect(res.data[2].diasVencimiento).toBe(-1);
    expect(res.data[2].montoPendiente).toBe('1500.00');

    // Métricas del resumen
    expect(res.resumen.totalPorCobrar).toBe('3500.00');
    expect(res.resumen.totalVencido).toBe('1000.00');
    expect(res.resumen.totalVigente).toBe('2500.00');
    expect(res.resumen.totalClientesMorosos).toBe(1);
    expect(res.meta.total).toBe(3);
    expect(res.meta.totalPages).toBe(1);
  });

  it('retorna colección vacía y resumen formateado cuando no hay ventas pendientes', async () => {
    prismaMock.$queryRaw.mockResolvedValueOnce([{ total: 0 }]);
    prismaMock.$queryRaw.mockResolvedValueOnce([
      {
        totalPorCobrar: null,
        totalVencido: null,
        totalVigente: null,
        totalClientesMorosos: 0,
      },
    ]);

    const res = await service.obtenerCuentasPorCobrar(empresaId, {
      hoy: hoyPrueba,
    });

    expect(res.data).toEqual([]);
    expect(res.resumen.totalPorCobrar).toBe('0.00');
    expect(res.resumen.totalVencido).toBe('0.00');
    expect(res.resumen.totalVigente).toBe('0.00');
    expect(res.resumen.totalClientesMorosos).toBe(0);
    expect(res.meta.total).toBe(0);
    expect(res.meta.totalPages).toBe(1);
  });

  it('aplica filtros de clienteId, estadoCobro y vencida en la consulta SQL', async () => {
    prismaMock.$queryRaw.mockResolvedValueOnce([{ total: 1 }]);
    prismaMock.$queryRaw.mockResolvedValueOnce([
      {
        totalPorCobrar: '500.00',
        totalVencido: '500.00',
        totalVigente: '0.00',
        totalClientesMorosos: 1,
      },
    ]);
    prismaMock.$queryRaw.mockResolvedValueOnce([
      {
        ventaId: 201,
        folio: null,
        clienteId: 9,
        clienteNombre: 'Cliente Moroso',
        cicloId: 3,
        fechaVenta: '2026-08-01',
        fechaVencimiento: '2026-09-01',
        total: '500.00',
        cobrado: '0.00',
        estadoVenta: 'REGISTRADA',
      },
    ]);

    const res = await service.obtenerCuentasPorCobrar(empresaId, {
      clienteId: 9,
      estadoCobro: EstadoCobro.VENCIDA,
      vencida: true,
      hoy: hoyPrueba,
    });

    expect(res.data).toHaveLength(1);
    expect(res.data[0].clienteId).toBe(9);
    expect(res.data[0].estadoCobro).toBe(EstadoCobro.VENCIDA);

    // Verificar que se invocó a $queryRaw 3 veces
    expect(prismaMock.$queryRaw).toHaveBeenCalledTimes(3);
  });

  describe('Paridad exhaustiva SQL contra VentaEstadoCobroPolicy (8 casos)', () => {
    it('comprueba los 8 casos canónicos de estado de cobro, vencimiento y días de atraso', async () => {
      prismaMock.$queryRaw.mockResolvedValueOnce([{ total: 7 }]);
      prismaMock.$queryRaw.mockResolvedValueOnce([
        {
          totalPorCobrar: '7000.00',
          totalVencido: '2500.00',
          totalVigente: '4500.00',
          totalClientesMorosos: 2,
        },
      ]);
      prismaMock.$queryRaw.mockResolvedValueOnce([
        // Caso 1: Cobrado = 0, fecha nula -> PENDIENTE, vencida = false, dias = null
        {
          ventaId: 1,
          folio: 'V-001',
          clienteId: 1,
          clienteNombre: 'Cliente 1',
          cicloId: 1,
          fechaVenta: '2026-10-01',
          fechaVencimiento: null,
          total: '1000.00',
          cobrado: '0.00',
          estadoVenta: 'REGISTRADA',
        },
        // Caso 2: Cobrado = 0, fecha futura -> PENDIENTE, vencida = false, dias = -5
        {
          ventaId: 2,
          folio: 'V-002',
          clienteId: 1,
          clienteNombre: 'Cliente 1',
          cicloId: 1,
          fechaVenta: '2026-10-01',
          fechaVencimiento: '2026-10-26',
          total: '1000.00',
          cobrado: '0.00',
          estadoVenta: 'REGISTRADA',
        },
        // Caso 3: Cobrado = 0, fecha igual a hoy -> PENDIENTE, vencida = false, dias = 0
        {
          ventaId: 3,
          folio: 'V-003',
          clienteId: 1,
          clienteNombre: 'Cliente 1',
          cicloId: 1,
          fechaVenta: '2026-10-01',
          fechaVencimiento: '2026-10-21',
          total: '1000.00',
          cobrado: '0.00',
          estadoVenta: 'REGISTRADA',
        },
        // Caso 4: Cobrado = 0, fecha pasada -> VENCIDA, vencida = true, dias = 6
        {
          ventaId: 4,
          folio: 'V-004',
          clienteId: 2,
          clienteNombre: 'Cliente 2',
          cicloId: 1,
          fechaVenta: '2026-09-01',
          fechaVencimiento: '2026-10-15',
          total: '1500.00',
          cobrado: '0.00',
          estadoVenta: 'REGISTRADA',
        },
        // Caso 5: Parcial con fecha pasada -> PARCIAL, vencida = true, dias = 3
        {
          ventaId: 5,
          folio: 'V-005',
          clienteId: 2,
          clienteNombre: 'Cliente 2',
          cicloId: 1,
          fechaVenta: '2026-09-15',
          fechaVencimiento: '2026-10-18',
          total: '2000.00',
          cobrado: '1000.00',
          estadoVenta: 'REGISTRADA',
        },
        // Caso 6: Parcial con fecha futura -> PARCIAL, vencida = false, dias = -10
        {
          ventaId: 6,
          folio: 'V-006',
          clienteId: 3,
          clienteNombre: 'Cliente 3',
          cicloId: 1,
          fechaVenta: '2026-10-01',
          fechaVencimiento: '2026-10-31',
          total: '2000.00',
          cobrado: '500.00',
          estadoVenta: 'REGISTRADA',
        },
        // Caso 7: Pagada (cobrado >= total) -> PAGADA, vencida = false
        {
          ventaId: 7,
          folio: 'V-007',
          clienteId: 3,
          clienteNombre: 'Cliente 3',
          cicloId: 1,
          fechaVenta: '2026-09-01',
          fechaVencimiento: '2026-09-15',
          total: '1000.00',
          cobrado: '1000.00',
          estadoVenta: 'REGISTRADA',
        },
      ]);

      const res = await service.obtenerCuentasPorCobrar(empresaId, {
        hoy: hoyPrueba,
      });

      // Comparación uno a uno con VentaEstadoCobroPolicy
      const d0 = res.data[0];
      const p0 = VentaEstadoCobroPolicy.calcularEstadoCobro({
        total: 1000,
        totalCobrado: 0,
        estadoVenta: 'REGISTRADA',
        fechaLimitePago: null,
        hoy: hoyPrueba,
      });
      expect(d0.estadoCobro).toBe(p0.estadoCobro);
      expect(d0.vencida).toBe(p0.vencida);
      expect(d0.diasVencimiento).toBeNull();

      const d1 = res.data[1];
      const p1 = VentaEstadoCobroPolicy.calcularEstadoCobro({
        total: 1000,
        totalCobrado: 0,
        estadoVenta: 'REGISTRADA',
        fechaLimitePago: '2026-10-26',
        hoy: hoyPrueba,
      });
      expect(d1.estadoCobro).toBe(p1.estadoCobro);
      expect(d1.vencida).toBe(p1.vencida);
      expect(d1.diasVencimiento).toBe(-5);

      const d2 = res.data[2];
      const p2 = VentaEstadoCobroPolicy.calcularEstadoCobro({
        total: 1000,
        totalCobrado: 0,
        estadoVenta: 'REGISTRADA',
        fechaLimitePago: '2026-10-21',
        hoy: hoyPrueba,
      });
      expect(d2.estadoCobro).toBe(p2.estadoCobro);
      expect(d2.vencida).toBe(p2.vencida);
      expect(d2.diasVencimiento).toBe(0);

      const d3 = res.data[3];
      const p3 = VentaEstadoCobroPolicy.calcularEstadoCobro({
        total: 1500,
        totalCobrado: 0,
        estadoVenta: 'REGISTRADA',
        fechaLimitePago: '2026-10-15',
        hoy: hoyPrueba,
      });
      expect(d3.estadoCobro).toBe(p3.estadoCobro);
      expect(d3.vencida).toBe(p3.vencida);
      expect(d3.diasVencimiento).toBe(6);

      const d4 = res.data[4];
      const p4 = VentaEstadoCobroPolicy.calcularEstadoCobro({
        total: 2000,
        totalCobrado: 1000,
        estadoVenta: 'REGISTRADA',
        fechaLimitePago: '2026-10-18',
        hoy: hoyPrueba,
      });
      expect(d4.estadoCobro).toBe(p4.estadoCobro);
      expect(d4.vencida).toBe(p4.vencida);
      expect(d4.diasVencimiento).toBe(3);

      const d5 = res.data[5];
      const p5 = VentaEstadoCobroPolicy.calcularEstadoCobro({
        total: 2000,
        totalCobrado: 500,
        estadoVenta: 'REGISTRADA',
        fechaLimitePago: '2026-10-31',
        hoy: hoyPrueba,
      });
      expect(d5.estadoCobro).toBe(p5.estadoCobro);
      expect(d5.vencida).toBe(p5.vencida);
      expect(d5.diasVencimiento).toBe(-10);

      const d6 = res.data[6];
      const p6 = VentaEstadoCobroPolicy.calcularEstadoCobro({
        total: 1000,
        totalCobrado: 1000,
        estadoVenta: 'REGISTRADA',
        fechaLimitePago: '2026-09-15',
        hoy: hoyPrueba,
      });
      expect(d6.estadoCobro).toBe(p6.estadoCobro);
      expect(d6.vencida).toBe(p6.vencida);
    });
  });
});
