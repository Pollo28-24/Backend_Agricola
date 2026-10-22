import { Test, TestingModule } from '@nestjs/testing';
import { CuentasPorCobrarService } from './cuentas-por-cobrar.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { EstadoCobro } from '../../../common/domain/policies/venta-estado-cobro.policy';

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
});
