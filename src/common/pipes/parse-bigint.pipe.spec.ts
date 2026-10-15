import { ParseBigIntPipe } from './parse-bigint.pipe';
import { DomainError } from '../errors/domain.error';
import { CodigoError } from '../errors/codigos-error.enum';

describe('ParseBigIntPipe', () => {
  let pipe: ParseBigIntPipe;

  beforeEach(() => {
    pipe = new ParseBigIntPipe();
  });

  it('debe transformar una cadena numérica válida a BigInt', () => {
    const res = pipe.transform('1234567890123456789');
    expect(res).toBe(BigInt('1234567890123456789'));
  });

  it('debe transformar un cero o número negativo', () => {
    expect(pipe.transform('0')).toBe(BigInt(0));
    expect(pipe.transform('-123')).toBe(BigInt(-123));
  });

  it('debe arrojar DomainError con PETICION_INVALIDA y 400 si el valor no es un entero', () => {
    expect(() => pipe.transform('abc')).toThrow(DomainError);
    try {
      pipe.transform('abc');
    } catch (e: any) {
      expect(e.code).toBe(CodigoError.PETICION_INVALIDA);
      expect(e.getStatus()).toBe(400);
    }
  });

  it('debe arrojar DomainError si contiene decimales o caracteres especiales', () => {
    expect(() => pipe.transform('12.34')).toThrow(DomainError);
    expect(() => pipe.transform('123abc')).toThrow(DomainError);
    expect(() => pipe.transform('')).toThrow(DomainError);
  });
});
