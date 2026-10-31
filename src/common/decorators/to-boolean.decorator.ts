import { Transform } from 'class-transformer';
import { HttpStatus } from '@nestjs/common';
import { DomainError } from '../errors/domain.error';
import { CodigoError } from '../errors/codigos-error.enum';

/**
 * Decorador @ToBoolean() para campos query booleanos.
 * Acepta: true/false (boolean), 'true'/'false' (string).
 * Cualquier otro valor lanza PETICION_INVALIDA (RN-038 / B6).
 * Usa obj[key] para leer el valor RAW antes de la coerción global (enableImplicitConversion).
 */
export function ToBoolean() {
  return Transform(
    ({
      obj,
      key,
      value,
    }: {
      obj?: Record<string, unknown>;
      key?: string;
      value: unknown;
    }) => {
      const raw = obj && key ? obj[key] : value;
      if (raw === true || raw === 'true') return true;
      if (raw === false || raw === 'false') return false;
      if (raw === undefined || raw === null) return undefined;
      throw new DomainError(
        CodigoError.PETICION_INVALIDA,
        // eslint-disable-next-line @typescript-eslint/no-base-to-string
        `El valor '${typeof raw === 'object' ? JSON.stringify(raw) : String(raw)}' no es un booleano válido. Use 'true' o 'false'.`,
        HttpStatus.BAD_REQUEST,
      );
    },
  );
}
