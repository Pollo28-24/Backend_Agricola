import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { IsBoolean, IsOptional } from 'class-validator';
import { ToBoolean } from './to-boolean.decorator';
import { CodigoError } from '../errors/codigos-error.enum';
import { DomainError } from '../errors/domain.error';

class TestDto {
  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  activo?: boolean;
}

describe('@ToBoolean() decorator (B6)', () => {
  function transform(value: unknown): TestDto {
    return plainToInstance(TestDto, { activo: value });
  }

  it('acepta true (boolean) → true', () => {
    const result = transform(true);
    expect(result.activo).toBe(true);
  });

  it("acepta 'true' (string) → true", () => {
    const result = transform('true');
    expect(result.activo).toBe(true);
  });

  it('acepta false (boolean) → false', () => {
    const result = transform(false);
    expect(result.activo).toBe(false);
  });

  it("acepta 'false' (string) → false", () => {
    const result = transform('false');
    expect(result.activo).toBe(false);
  });

  it('acepta undefined → undefined (campo omitido)', () => {
    const result = transform(undefined);
    expect(result.activo).toBeUndefined();
  });

  it("valor inválido '1' lanza DomainError PETICION_INVALIDA", () => {
    expect(() => transform('1')).toThrow(DomainError);
    expect(() => transform('1')).toThrow(
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      expect.objectContaining({ code: CodigoError.PETICION_INVALIDA }),
    );
  });

  it("valor inválido 'yes' lanza DomainError PETICION_INVALIDA", () => {
    expect(() => transform('yes')).toThrow(DomainError);
    expect(() => transform('yes')).toThrow(
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      expect.objectContaining({ code: CodigoError.PETICION_INVALIDA }),
    );
  });

  it("valor inválido 'TRUE' (mayúsculas) lanza DomainError PETICION_INVALIDA", () => {
    // Nuestro decorador es case-sensitive: solo 'true'/'false' minúsculas
    expect(() => transform('TRUE')).toThrow(DomainError);
  });

  it('class-validator @IsBoolean pasa con valor boolean correcto', async () => {
    const dto = transform('false');
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });
});
