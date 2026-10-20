import { FechaUtil } from './fechas';

describe('FechaUtil', () => {
  it('debe devolver fecha local en formato YYYY-MM-DD', () => {
    const hoy = FechaUtil.hoyLocal();
    expect(hoy).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('debe identificar fechas pasadas correctamente', () => {
    expect(FechaUtil.esFechaPasada('2020-01-01')).toBe(true);
    expect(FechaUtil.esFechaPasada('2099-01-01')).toBe(false);
  });

  it('debe calcular horas transcurridas', () => {
    const haceDosHoras = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const horas = FechaUtil.horasTranscurridas(haceDosHoras);
    expect(horas).toBeGreaterThanOrEqual(1.9);
    expect(horas).toBeLessThanOrEqual(2.1);
  });

  it('debe formatear a YYYY-MM-DD sin desfasar por huso horario (3.23)', () => {
    const fecha = new Date('2027-01-15T00:00:00.000Z');
    expect(FechaUtil.toDateOnly(fecha)).toBe('2027-01-15');
  });
});
