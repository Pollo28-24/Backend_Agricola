import { Prisma } from '@prisma/client';
import {
  VentaEstadoCobroPolicy,
  EstadoCobro,
} from './venta-estado-cobro.policy';

describe('VentaEstadoCobroPolicy (RN-055, RN-056, RN-073)', () => {
  const total100 = new Prisma.Decimal('100.00');
  const cero = new Prisma.Decimal('0.00');

  describe('Venta CANCELADA (RN-055)', () => {
    it('devuelve estadoCobro CANCELADA, saldoPendiente 0.00 y vencida false independientemente de cobros o fechas', () => {
      const res = VentaEstadoCobroPolicy.calcularEstadoCobro({
        total: total100,
        totalCobrado: new Prisma.Decimal('40.00'),
        estadoVenta: 'CANCELADA',
        fechaLimitePago: '2026-01-01',
        hoy: '2026-03-15',
      });

      expect(res.estadoCobro).toBe(EstadoCobro.CANCELADA);
      expect(res.saldoPendiente).toBe('0.00');
      expect(res.vencida).toBe(false);
    });
  });

  describe('Venta PAGADA', () => {
    it('devuelve PAGADA cuando Σ cobros = total exacto', () => {
      const res = VentaEstadoCobroPolicy.calcularEstadoCobro({
        total: total100,
        totalCobrado: new Prisma.Decimal('100.00'),
        estadoVenta: 'REGISTRADA',
        fechaLimitePago: '2026-01-01',
        hoy: '2026-03-15',
      });

      expect(res.estadoCobro).toBe(EstadoCobro.PAGADA);
      expect(res.saldoPendiente).toBe('0.00');
      expect(res.vencida).toBe(false);
    });

    it('devuelve PAGADA y saldo 0.00 si Σ cobros > total', () => {
      const res = VentaEstadoCobroPolicy.calcularEstadoCobro({
        total: total100,
        totalCobrado: new Prisma.Decimal('100.01'),
        estadoVenta: 'REGISTRADA',
        fechaLimitePago: '2026-01-01',
        hoy: '2026-03-15',
      });

      expect(res.estadoCobro).toBe(EstadoCobro.PAGADA);
      expect(res.saldoPendiente).toBe('0.00');
      expect(res.vencida).toBe(false);
    });
  });

  describe('Venta PARCIAL', () => {
    it('devuelve PARCIAL y vencida false si hoy <= fechaLimitePago', () => {
      const res = VentaEstadoCobroPolicy.calcularEstadoCobro({
        total: total100,
        totalCobrado: new Prisma.Decimal('40.00'),
        estadoVenta: 'REGISTRADA',
        fechaLimitePago: '2026-03-20',
        hoy: '2026-03-15',
      });

      expect(res.estadoCobro).toBe(EstadoCobro.PARCIAL);
      expect(res.saldoPendiente).toBe('60.00');
      expect(res.vencida).toBe(false);
    });

    it('un cobro parcial NUNCA es VENCIDA en estadoCobro, pero expone vencida = true si la fecha límite pasó', () => {
      const res = VentaEstadoCobroPolicy.calcularEstadoCobro({
        total: total100,
        totalCobrado: new Prisma.Decimal('40.00'),
        estadoVenta: 'REGISTRADA',
        fechaLimitePago: '2026-03-10',
        hoy: '2026-03-15',
      });

      expect(res.estadoCobro).toBe(EstadoCobro.PARCIAL);
      expect(res.saldoPendiente).toBe('60.00');
      expect(res.vencida).toBe(true);
    });

    it('maneja precisión decimal exacta con 0.1 * 3 sin errores de punto flotante', () => {
      const total = new Prisma.Decimal('0.30');
      const cobrado = new Prisma.Decimal('0.10')
        .plus(new Prisma.Decimal('0.10'))
        .plus(new Prisma.Decimal('0.05')); // 0.25

      const res = VentaEstadoCobroPolicy.calcularEstadoCobro({
        total,
        totalCobrado: cobrado,
        estadoVenta: 'REGISTRADA',
        hoy: '2026-03-15',
      });

      expect(res.estadoCobro).toBe(EstadoCobro.PARCIAL);
      expect(res.saldoPendiente).toBe('0.05');
      expect(res.vencida).toBe(false);
    });
  });

  describe('Venta PENDIENTE o VENCIDA (Σ cobros = 0)', () => {
    it('devuelve PENDIENTE y vencida false si no tiene fecha límite de pago', () => {
      const res = VentaEstadoCobroPolicy.calcularEstadoCobro({
        total: total100,
        totalCobrado: cero,
        estadoVenta: 'REGISTRADA',
        fechaLimitePago: null,
        hoy: '2026-03-15',
      });

      expect(res.estadoCobro).toBe(EstadoCobro.PENDIENTE);
      expect(res.saldoPendiente).toBe('100.00');
      expect(res.vencida).toBe(false);
    });

    it('devuelve PENDIENTE si hoy < fechaLimitePago', () => {
      const res = VentaEstadoCobroPolicy.calcularEstadoCobro({
        total: total100,
        totalCobrado: cero,
        estadoVenta: 'REGISTRADA',
        fechaLimitePago: '2026-03-20',
        hoy: '2026-03-15',
      });

      expect(res.estadoCobro).toBe(EstadoCobro.PENDIENTE);
      expect(res.saldoPendiente).toBe('100.00');
      expect(res.vencida).toBe(false);
    });

    it('fecha límite igual a hoy NO es vencida (es PENDIENTE y vencida=false)', () => {
      const res = VentaEstadoCobroPolicy.calcularEstadoCobro({
        total: total100,
        totalCobrado: cero,
        estadoVenta: 'REGISTRADA',
        fechaLimitePago: '2026-03-15',
        hoy: '2026-03-15',
      });

      expect(res.estadoCobro).toBe(EstadoCobro.PENDIENTE);
      expect(res.saldoPendiente).toBe('100.00');
      expect(res.vencida).toBe(false);
    });

    it('devuelve VENCIDA y vencida=true cuando hoy > fechaLimitePago y Σ=0', () => {
      const res = VentaEstadoCobroPolicy.calcularEstadoCobro({
        total: total100,
        totalCobrado: cero,
        estadoVenta: 'REGISTRADA',
        fechaLimitePago: '2026-03-14',
        hoy: '2026-03-15',
      });

      expect(res.estadoCobro).toBe(EstadoCobro.VENCIDA);
      expect(res.saldoPendiente).toBe('100.00');
      expect(res.vencida).toBe(true);
    });

    it('acepta fechaLimitePago como objeto Date DATE UTC', () => {
      const fechaDate = new Date('2026-03-14T00:00:00.000Z');
      const res = VentaEstadoCobroPolicy.calcularEstadoCobro({
        total: total100,
        totalCobrado: cero,
        estadoVenta: 'REGISTRADA',
        fechaLimitePago: fechaDate,
        hoy: '2026-03-15',
      });

      expect(res.estadoCobro).toBe(EstadoCobro.VENCIDA);
      expect(res.vencida).toBe(true);
    });
  });

  describe('Casos de cambio de fecha y medianoche con reloj inyectado', () => {
    it('transición de medianoche: 2026-03-14 23:59 vs 2026-03-15 00:01', () => {
      const fechaLimite = '2026-03-14';

      const antesMedianoche = VentaEstadoCobroPolicy.calcularEstadoCobro({
        total: total100,
        totalCobrado: cero,
        estadoVenta: 'REGISTRADA',
        fechaLimitePago: fechaLimite,
        hoy: '2026-03-14',
      });
      expect(antesMedianoche.estadoCobro).toBe(EstadoCobro.PENDIENTE);
      expect(antesMedianoche.vencida).toBe(false);

      const despuesMedianoche = VentaEstadoCobroPolicy.calcularEstadoCobro({
        total: total100,
        totalCobrado: cero,
        estadoVenta: 'REGISTRADA',
        fechaLimitePago: fechaLimite,
        hoy: '2026-03-15',
      });
      expect(despuesMedianoche.estadoCobro).toBe(EstadoCobro.VENCIDA);
      expect(despuesMedianoche.vencida).toBe(true);
    });

    it('obtenerHoyMexico devuelve formato YYYY-MM-DD', () => {
      const hoy = VentaEstadoCobroPolicy.obtenerHoyMexico();
      expect(hoy).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('frontera RN-073 con reloj falso: 2026-11-01T03:30:00Z (CDMX 2026-10-31) no vence venta de 2026-10-31; 2026-11-01T06:00:00Z (CDMX 2026-11-01) sí la vence', () => {
      jest.useFakeTimers();
      try {
        // 1. 2026-11-01T03:30:00Z = 2026-10-31 21:30:00 en America/Mexico_City (UTC-6)
        jest.setSystemTime(new Date('2026-11-01T03:30:00Z'));
        expect(VentaEstadoCobroPolicy.obtenerHoyMexico()).toBe('2026-10-31');

        const antesDeMedianocheCdmx =
          VentaEstadoCobroPolicy.calcularEstadoCobro({
            total: total100,
            totalCobrado: cero,
            estadoVenta: 'REGISTRADA',
            fechaLimitePago: '2026-10-31',
          });
        expect(antesDeMedianocheCdmx.vencida).toBe(false);
        expect(antesDeMedianocheCdmx.estadoCobro).toBe(EstadoCobro.PENDIENTE);

        // 2. 2026-11-01T06:00:00Z = 2026-11-01 00:00:00 en America/Mexico_City (UTC-6)
        jest.setSystemTime(new Date('2026-11-01T06:00:00Z'));
        expect(VentaEstadoCobroPolicy.obtenerHoyMexico()).toBe('2026-11-01');

        const enMedianocheCdmx = VentaEstadoCobroPolicy.calcularEstadoCobro({
          total: total100,
          totalCobrado: cero,
          estadoVenta: 'REGISTRADA',
          fechaLimitePago: '2026-10-31',
        });
        expect(enMedianocheCdmx.vencida).toBe(true);
        expect(enMedianocheCdmx.estadoCobro).toBe(EstadoCobro.VENCIDA);
      } finally {
        jest.useRealTimers();
      }
    });
  });
});
