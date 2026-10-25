import { HttpException, HttpStatus } from '@nestjs/common';
import { CodigoError } from './codigos-error.enum';

export class DomainError extends HttpException {
  public readonly code: CodigoError;
  public readonly details?: unknown;

  constructor(
    code: CodigoError,
    message: string,
    status: HttpStatus | number = HttpStatus.BAD_REQUEST,
    details?: unknown,
  ) {
    super(
      {
        statusCode: status,
        code,
        message,
        details,
      },
      status,
    );
    this.code = code;
    this.details = details;
  }
}
