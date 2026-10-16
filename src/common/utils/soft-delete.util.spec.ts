import { SoftDeleteUtil } from './soft-delete.util';

describe('SoftDeleteUtil (RN-041 / Sección 3.11)', () => {
  it('debe mantener el texto completo si la longitud total con sufijo no supera el máximo', () => {
    const res = SoftDeleteUtil.generarValorBaja('Rancho Bonito', 1, 150);
    expect(res).toBe('Rancho Bonito#baja1');
    expect(res.length).toBeLessThanOrEqual(150);
  });

  it('debe truncar el texto base si con el sufijo excede la longitud máxima', () => {
    // max 20, sufijo '#baja99' (longitud 7) => base máx 13 chars
    const original = 'EsteNombreEsMuyLargoParaElLimite';
    const res = SoftDeleteUtil.generarValorBaja(original, 99, 20);

    expect(res).toBe('EsteNombreEsM#baja99');
    expect(res.length).toBe(20);
    expect(res.endsWith('#baja99')).toBe(true);
  });

  it('debe respetar exactamente el límite cuando el texto base cabe justo', () => {
    // sufijo '#baja5' (longitud 6). Si base tiene 4 chars y max es 10:
    const original = 'Agro';
    const res = SoftDeleteUtil.generarValorBaja(original, 5, 10);

    expect(res).toBe('Agro#baja5');
    expect(res.length).toBe(10);
  });

  it('debe manejar IDs de varios dígitos correctamente', () => {
    const res = SoftDeleteUtil.generarValorBaja(
      'Proveedor Central',
      123456,
      150,
    );
    expect(res).toBe('Proveedor Central#baja123456');
    expect(res.endsWith('#baja123456')).toBe(true);
  });

  it('debe manejar casos límite donde la longitud máxima es menor o igual a la longitud del sufijo', () => {
    // sufijo '#baja10' (longitud 7), max 5
    const res = SoftDeleteUtil.generarValorBaja('Algo', 10, 5);
    expect(res).toBe('#baja');
    expect(res.length).toBe(5);
  });

  it('debe manejar cadena vacía como valor original', () => {
    const res = SoftDeleteUtil.generarValorBaja('', 8, 50);
    expect(res).toBe('#baja8');
  });

  it('debe preservar caracteres especiales y acentos en el texto base truncado', () => {
    const res = SoftDeleteUtil.generarValorBaja(
      'Agrícola El Niño S.A. de C.V.',
      42,
      25,
    );
    expect(res.endsWith('#baja42')).toBe(true);
    expect(res.length).toBe(25);
  });
});
