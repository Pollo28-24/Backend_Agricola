import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'node:crypto';
import { ClsService } from 'nestjs-cls';
import { AppClsStore } from '../context/app-cls.store';

export const HEADER_CORRELATION_ID = 'X-Correlation-ID';
export const HEADER_REQUEST_ID = 'X-Request-ID';

@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  constructor(private readonly cls: ClsService<AppClsStore>) {}

  use(req: Request, res: Response, next: NextFunction): void {
    const rawCorrelationId = req.headers['x-correlation-id'];
    const rawRequestId = req.headers['x-request-id'];

    const incomingCorrelationId = this.extractFirstString(rawCorrelationId);
    const incomingRequestId = this.extractFirstString(rawRequestId);

    // Prioridad: si existe x-correlation-id se usa; si no, si existe x-request-id se usa; si no, se genera UUID
    const correlationId =
      incomingCorrelationId || incomingRequestId || randomUUID();
    // Preservar estrictamente el request-id entrante si existía, sin sobreescribirlo
    const requestId = incomingRequestId || correlationId;

    // Establecer ambos encabezados para interoperabilidad con proxies y clientes
    res.setHeader(HEADER_CORRELATION_ID, correlationId);
    res.setHeader(HEADER_REQUEST_ID, requestId);

    // Persistir en el almacenamiento asíncrono CLS para trazabilidad en capas inferiores
    if (this.cls.isActive()) {
      this.cls.set('correlationId', correlationId);
    }

    next();
  }

  private extractFirstString(value: unknown): string | null {
    if (typeof value === 'string' && value.trim() !== '') {
      return value.trim();
    }
    if (
      Array.isArray(value) &&
      value.length > 0 &&
      typeof value[0] === 'string' &&
      value[0].trim() !== ''
    ) {
      return value[0].trim();
    }
    return null;
  }
}
