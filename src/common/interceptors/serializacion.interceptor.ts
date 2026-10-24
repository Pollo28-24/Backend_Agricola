import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  StreamableFile,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Prisma } from '@prisma/client';

@Injectable()
export class SerializacionInterceptor implements NestInterceptor {
  intercept(
    _context: ExecutionContext,
    next: CallHandler,
  ): Observable<unknown> {
    return next.handle().pipe(map((data) => this.transform(data)));
  }

  private transform(value: unknown): unknown {
    if (value === null || value === undefined) {
      return value;
    }

    if (value instanceof StreamableFile || Buffer.isBuffer(value)) {
      return value;
    }

    if (typeof value === 'bigint') {
      return value.toString();
    }

    if (value instanceof Prisma.Decimal) {
      return value.toString();
    }

    if (value instanceof Date) {
      return value.toISOString();
    }

    if (Array.isArray(value)) {
      return value.map((item) => this.transform(item));
    }

    if (typeof value === 'object') {
      const transformed: Record<string, unknown> = {};
      for (const key of Object.keys(value)) {
        transformed[key] = this.transform(
          (value as Record<string, unknown>)[key],
        );
      }
      return transformed;
    }

    return value;
  }
}
