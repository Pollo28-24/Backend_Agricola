import { Prisma } from '@prisma/client';
import { ReporteFormatoUtil } from './reporte-formato.util';

describe('ReporteFormatoUtil (RN-066)', () => {
  describe('Redondeo HALF_UP positivo y negativo', () => {
    it('debe redondear 0.005 a 0.01 y -0.005 a -0.01 (HALF_UP explícito)', () => {
      expect(ReporteFormatoUtil.formatearImporte('0.005')).toBe('0.01');
      expect(ReporteFormatoUtil.formatearImporte('-0.005')).toBe('-0.01');
      expect(
        ReporteFormatoUtil.formatearImporte(new Prisma.Decimal('0.005')),
      ).toBe('0.01');
      expect(
        ReporteFormatoUtil.formatearImporte(new Prisma.Decimal('-0.005')),
      ).toBe('-0.01');
    });

    it('debe redondear valores específicos del Anexo D y R6 con exactitud', () => {
      expect(ReporteFormatoUtil.formatearPorcentaje('28.9256')).toBe('28.93');
      expect(ReporteFormatoUtil.formatearImporte('10.4878')).toBe('10.49');
      expect(ReporteFormatoUtil.formatearImporte('14.7561')).toBe('14.76');
    });
  });

  describe('Preservación de nulos y manejo de indefinidos / inválidos', () => {
    it('debe devolver null cuando la entrada es null o undefined', () => {
      expect(ReporteFormatoUtil.formatearImporte(null)).toBeNull();
      expect(ReporteFormatoUtil.formatearImporte(undefined)).toBeNull();
      expect(ReporteFormatoUtil.formatearKg(null)).toBeNull();
      expect(ReporteFormatoUtil.formatearPorcentaje(null)).toBeNull();
    });

    it('debe devolver null y no emitir NaN ante valores inválidos o NaN', () => {
      expect(ReporteFormatoUtil.formatearImporte(NaN)).toBeNull();
      expect(ReporteFormatoUtil.formatearImporte(Infinity)).toBeNull();
      expect(ReporteFormatoUtil.formatearImporte(-Infinity)).toBeNull();
      expect(ReporteFormatoUtil.formatearImporte('')).toBeNull();
      expect(ReporteFormatoUtil.formatearImporte('   ')).toBeNull();
      expect(ReporteFormatoUtil.formatearImporte('no-un-numero')).toBeNull();
    });
  });

  describe('Formateo de Kg a 3 decimales', () => {
    it('debe formatear cantidades en kg a 3 decimales con ceros finales', () => {
      expect(ReporteFormatoUtil.formatearKg('50')).toBe('50.000');
      expect(ReporteFormatoUtil.formatearKg(300)).toBe('300.000');
      expect(
        ReporteFormatoUtil.formatearKg(new Prisma.Decimal('950.1234')),
      ).toBe('950.123');
      expect(
        ReporteFormatoUtil.formatearKg(new Prisma.Decimal('950.1235')),
      ).toBe('950.124');
    });
  });

  describe('Soporte de tipos polimórficos de entrada', () => {
    it('debe procesar correctamente Prisma.Decimal', () => {
      const dec = new Prisma.Decimal('86000.00');
      expect(ReporteFormatoUtil.formatearImporte(dec)).toBe('86000.00');
    });

    it('debe procesar correctamente string', () => {
      expect(ReporteFormatoUtil.formatearImporte('121000')).toBe('121000.00');
    });

    it('debe procesar correctamente number finito', () => {
      expect(ReporteFormatoUtil.formatearImporte(35000)).toBe('35000.00');
    });

    it('debe procesar correctamente BigInt', () => {
      expect(ReporteFormatoUtil.formatearImporte(10000n)).toBe('10000.00');
      expect(ReporteFormatoUtil.formatearKg(500n)).toBe('500.000');
    });
  });

  describe('Formateadores especializados de dominio', () => {
    it('formatearRendimiento a 2 decimales', () => {
      expect(ReporteFormatoUtil.formatearRendimiento('4500.567')).toBe(
        '4500.57',
      );
    });

    it('formatearSuperficie a 2 decimales', () => {
      expect(ReporteFormatoUtil.formatearSuperficie('2.5')).toBe('2.50');
    });

    it('formatearHoras a 2 decimales', () => {
      expect(ReporteFormatoUtil.formatearHoras('37.5')).toBe('37.50');
    });
  });
});
