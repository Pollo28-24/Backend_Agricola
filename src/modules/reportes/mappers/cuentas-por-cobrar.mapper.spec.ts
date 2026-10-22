import {
  CuentasPorCobrarMapper,
  FilaCuentaPorCobrarRaw,
} from './cuentas-por-cobrar.mapper';
import { EstadoCobro } from '../../../common/domain/policies/venta-estado-cobro.policy';

describe('CuentasPorCobrarMapper (Unitario)', () => {
  const hoy = '2026-10-21';

  it('toItemDto calcula saldo, días y estado de cobro con exactitud', () => {
    const raw: FilaCuentaPorCobrarRaw = {
      ventaId: 1,
      folio: 'FAC-001',
      clienteId: 5,
      clienteNombre: 'Cliente Central',
      cicloId: 10,
      fechaVenta: new Date('2026-09-01'),
      fechaVencimiento: new Date('2026-10-01'), // vencida hace 20 días
      total: '10000.00',
      cobrado: '2000.00',
      estadoVenta: 'REGISTRADA',
    };

    const item = CuentasPorCobrarMapper.toItemDto(raw, hoy);

    expect(item.ventaId).toBe(1);
    expect(item.folio).toBe('FAC-001');
    expect(item.montoTotal).toBe('10000.00');
    expect(item.montoCobrado).toBe('2000.00');
    expect(item.montoPendiente).toBe('8000.00');
    expect(item.estadoCobro).toBe(EstadoCobro.PARCIAL);
    expect(item.vencida).toBe(true);
    expect(item.diasVencimiento).toBe(20);
  });

  it('toResumenDto agrega totales y cuenta clientes morosos sin duplicados', () => {
    const items = [
      {
        ventaId: 1,
        folio: null,
        clienteId: 5,
        clienteNombre: 'A',
        cicloId: 1,
        fechaVenta: '2026-09-01',
        fechaVencimiento: '2026-10-01',
        montoTotal: '1000.00',
        montoCobrado: '0.00',
        montoPendiente: '1000.00',
        diasVencimiento: 20,
        estadoCobro: EstadoCobro.VENCIDA,
        vencida: true,
      },
      {
        ventaId: 2,
        folio: null,
        clienteId: 5, // mismo cliente con otra venta vencida
        clienteNombre: 'A',
        cicloId: 1,
        fechaVenta: '2026-09-05',
        fechaVencimiento: '2026-10-05',
        montoTotal: '2000.00',
        montoCobrado: '0.00',
        montoPendiente: '2000.00',
        diasVencimiento: 16,
        estadoCobro: EstadoCobro.VENCIDA,
        vencida: true,
      },
      {
        ventaId: 3,
        folio: null,
        clienteId: 8,
        clienteNombre: 'B',
        cicloId: 1,
        fechaVenta: '2026-10-15',
        fechaVencimiento: '2026-11-15',
        montoTotal: '5000.00',
        montoCobrado: '1000.00',
        montoPendiente: '4000.00',
        diasVencimiento: -25,
        estadoCobro: EstadoCobro.PARCIAL,
        vencida: false,
      },
    ];

    const resumen = CuentasPorCobrarMapper.toResumenDto(items);

    expect(resumen.totalPorCobrar).toBe('7000.00');
    expect(resumen.totalVencido).toBe('3000.00');
    expect(resumen.totalVigente).toBe('4000.00');
    expect(resumen.totalClientesMorosos).toBe(1); // Set de clientes únicos
  });
});
