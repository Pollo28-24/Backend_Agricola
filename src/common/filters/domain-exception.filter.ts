import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { DomainError } from '../errors/domain.error';
import { CodigoError } from '../errors/codigos-error.enum';

@Catch()
export class DomainExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(DomainExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let code: string = CodigoError.ERROR_INTERNO;
    let message = 'Ocurrió un error inesperado en el servidor';
    let details: unknown = undefined;

    if (exception instanceof DomainError) {
      statusCode = exception.getStatus();
      code = exception.code;
      message = exception.message;
      details = exception.details;
    } else if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const res = exception.getResponse();

      if (typeof res === 'object' && res !== null) {
        const obj = res as Record<string, unknown>;
        message = (obj.message as string) || exception.message;
        code = (obj.code as string) || this.mapStatusToCode(statusCode);
        details = Array.isArray(obj.message) ? obj.message : obj.details;
      } else {
        message = String(res);
        code = this.mapStatusToCode(statusCode);
      }
    } else if (exception instanceof Error) {
      this.logger.error(`Error no controlado: ${exception.message}`, exception.stack);
      message = 'Error interno del servidor';
    }

    response.status(statusCode).json({
      statusCode,
      code,
      message,
      ...(details !== undefined ? { details } : {}),
    });
  }

  private mapStatusToCode(status: number): CodigoError {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return CodigoError.PETICION_INVALIDA;
      case HttpStatus.UNAUTHORIZED:
        return CodigoError.NO_AUTENTICADO;
      case HttpStatus.FORBIDDEN:
        return CodigoError.PERMISO_DENEGADO;
      case HttpStatus.NOT_FOUND:
        return CodigoError.RECURSO_NO_ENCONTRADO;
      case HttpStatus.CONFLICT:
        return CodigoError.CONFLICTO;
      default:
        return CodigoError.ERROR_INTERNO;
    }
  }
}
