import { TextoSeguroUtil } from './texto-seguro.util';

describe('TextoSeguroUtil', () => {
  it('debe anteponer comilla simple a textos que comiencen con caracteres de fórmula (=, +, -, @, tab, retorno de carro)', () => {
    expect(TextoSeguroUtil.escapar('=SUM(A1:A10)')).toBe("'=SUM(A1:A10)");
    expect(TextoSeguroUtil.escapar('+123456')).toBe("'+123456");
    expect(TextoSeguroUtil.escapar('-cmd|/c calc')).toBe("'-cmd|/c calc");
    expect(TextoSeguroUtil.escapar('@SUM(B1)')).toBe("'@SUM(B1)");
    expect(TextoSeguroUtil.escapar('\ttextoConTab')).toBe("'\ttextoConTab");
    expect(TextoSeguroUtil.escapar('\rretornoCarro')).toBe("'\rretornoCarro");
  });

  it('debe neutralizar fórmulas incluso cuando tienen espacios iniciales en blanco', () => {
    expect(TextoSeguroUtil.escapar('   =HYPERLINK("http://evil.com")')).toBe(
      '\'   =HYPERLINK("http://evil.com")',
    );
    expect(TextoSeguroUtil.escapar('  +555')).toBe("'  +555");
    expect(TextoSeguroUtil.escapar('   -test')).toBe("'   -test");
    expect(TextoSeguroUtil.escapar('  @alerta')).toBe("'  @alerta");
    expect(TextoSeguroUtil.escapar(' \ttab')).toBe("' \ttab");
    expect(TextoSeguroUtil.escapar(' \rcr')).toBe("' \rcr");
  });

  it('debe preservar intacto el texto normal humano sin caracteres peligrosos', () => {
    expect(TextoSeguroUtil.escapar('Parcela Norte')).toBe('Parcela Norte');
    expect(TextoSeguroUtil.escapar('Cliente Agrícola del Valle')).toBe(
      'Cliente Agrícola del Valle',
    );
    expect(TextoSeguroUtil.escapar('FAC-2026-001')).toBe('FAC-2026-001');
    expect(TextoSeguroUtil.escapar('Fertilizante triple 16')).toBe(
      'Fertilizante triple 16',
    );
  });

  it('debe manejar null y undefined devolviendo cadena vacía', () => {
    expect(TextoSeguroUtil.escapar(null)).toBe('');
    expect(TextoSeguroUtil.escapar(undefined)).toBe('');
  });
});
