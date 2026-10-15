import { PipeTransform, Injectable, HttpStatus } from '@nestjs/common';
import { CodigoError } from '../errors/codigos-error.enum';
import { DomainError } from '../errors/domain.error';

@Injectable()
export class ParseBigIntPipe implements PipeTransform<string, bigint> {
  transform(value: string): bigint {
    try {
      if (!/^-?\d+$/.test(value)) {
        throw new Error('Not a valid integer string');
      }
      return BigInt(value);
    } catch {
      throw new DomainError(
        CodigoError.PETICION_INVALIDA,
        `El valor '${value}' no es un identificador BigInt válido`,
        HttpStatus.BAD_REQUEST,
      );
    }
  }
}
