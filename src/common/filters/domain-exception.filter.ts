import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { ClsServiceManager } from 'nestjs-cls';
import { AppClsStore } from '../context/app-cls.store';
import { DomainError } from '../errors/domain.error';
import { CodigoError } from '../errors/codigos-error.enum';

@Catch()
export class DomainExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(DomainExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();

    const cls = ClsServiceManager.getClsService<AppClsStore>();
    const correlationId =
      (cls?.isActive() ? cls.get('correlationId') : undefined) ||
      (request?.headers?.['x-correlation-id'] as string) ||
      (request?.headers?.['x-request-id'] as string) ||
      (typeof response?.getHeader === 'function'
        ? (response.getHeader('x-correlation-id') as string)
        : undefined) ||
      undefined;

    const empresaId = cls?.isActive() ? cls.get('empresaId') : undefined;
    const usuarioId = cls?.isActive() ? cls.get('usuarioId') : undefined;

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let code: string = CodigoError.ERROR_INTERNO;
    let message = 'Ocurrió un error inesperado en el servidor';
    let details: unknown = undefined;

    if (exception instanceof DomainError) {
      statusCode = exception.getStatus();
      code = exception.code;
      message = exception.message;
      details = exception.details;
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      switch (exception.code) {
        case 'P2002':
          statusCode = HttpStatus.CONFLICT;
          code = CodigoError.CONFLICTO;
          message = 'Ya existe un registro con los datos proporcionados';
          break;
        case 'P2003':
          statusCode = HttpStatus.CONFLICT;
          code = CodigoError.CONFLICTO;
          message =
            'No es posible completar la operación debido a dependencias con otros registros';
          break;
        case 'P2025':
          statusCode = HttpStatus.NOT_FOUND;
          code = CodigoError.RECURSO_NO_ENCONTRADO;
          message =
            'El registro solicitado no existe o no se encuentra disponible';
          break;
        default:
          this.logger.error({
            correlationId,
            empresaId,
            usuarioId,
            endpoint: request?.url,
            metodo: request?.method,
            codigo: CodigoError.ERROR_INTERNO,
            mensaje: `Error de base de datos no mapeado [${exception.code}]: ${exception.message}`,
            prismaCode: exception.code,
          });
          statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
          code = CodigoError.ERROR_INTERNO;
          message = 'Ocurrió un error en la base de datos';
          break;
      }
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
    } else if (
      exception instanceof Error &&
      (exception.name === 'MulterError' ||
        (exception as { code?: string }).code === 'LIMIT_FILE_SIZE')
    ) {
      const multerCode = (exception as { code?: string }).code;
      if (multerCode === 'LIMIT_FILE_SIZE') {
        statusCode = HttpStatus.PAYLOAD_TOO_LARGE;
        code = CodigoError.ARCHIVO_DEMASIADO_GRANDE;
        message = 'El archivo excede el tamaño máximo permitido de 10 MB';
      } else {
        statusCode = HttpStatus.BAD_REQUEST;
        code = CodigoError.PETICION_INVALIDA;
        message = exception.message || 'Error en la subida de archivo';
      }
    } else if (exception instanceof Error) {
      this.logger.error({
        correlationId,
        empresaId,
        usuarioId,
        endpoint: request?.url,
        metodo: request?.method,
        codigo: CodigoError.ERROR_INTERNO,
        mensaje: `Error no controlado: ${exception.message}`,
        ...(process.env.NODE_ENV !== 'production' && exception.stack
          ? { stack: exception.stack }
          : {}),
      });
      message = 'Error interno del servidor';
    }

    if (
      statusCode === HttpStatus.TOO_MANY_REQUESTS &&
      typeof response?.setHeader === 'function'
    ) {
      const existingRetryAfter =
        typeof response.getHeader === 'function'
          ? response.getHeader('Retry-After')
          : undefined;
      if (existingRetryAfter === undefined) {
        const retryFromDetails =
          typeof details === 'object' &&
          details !== null &&
          'retryAfter' in details
            ? (details as { retryAfter?: unknown }).retryAfter
            : undefined;
        const retrySeconds =
          typeof retryFromDetails === 'number' ||
          typeof retryFromDetails === 'string'
            ? String(retryFromDetails)
            : '60';
        response.setHeader('Retry-After', retrySeconds);
      }
    }

    response.status(statusCode).json({
      statusCode,
      code,
      message,
      ...(details !== undefined ? { details } : {}),
    });
  }

  private mapStatusToCode(status: number): CodigoError {
    if (status === 426) {
      return CodigoError.VERSION_APP_OBSOLETA;
    }
    const statusMap: Record<number, CodigoError> = {
      [HttpStatus.BAD_REQUEST]: CodigoError.PETICION_INVALIDA,
      [HttpStatus.UNAUTHORIZED]: CodigoError.NO_AUTENTICADO,
      [HttpStatus.FORBIDDEN]: CodigoError.PERMISO_DENEGADO,
      [HttpStatus.NOT_FOUND]: CodigoError.RECURSO_NO_ENCONTRADO,
      [HttpStatus.CONFLICT]: CodigoError.CONFLICTO,
      [HttpStatus.PAYLOAD_TOO_LARGE]: CodigoError.ARCHIVO_DEMASIADO_GRANDE,
      [HttpStatus.UNSUPPORTED_MEDIA_TYPE]:
        CodigoError.TIPO_ARCHIVO_NO_PERMITIDO,
      [HttpStatus.TOO_MANY_REQUESTS]: CodigoError.DEMASIADAS_PETICIONES,
    };
    return statusMap[status] ?? CodigoError.ERROR_INTERNO;
  }
}
