import {
  CanActivate,
  ExecutionContext,
  Injectable,
  HttpStatus,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { EstadoSuscripcion } from '@prisma/client';
import { IS_PUBLIC_KEY } from '../../modules/auth/decorators/public.decorator';
import { UsuarioAutenticado } from '../../modules/auth/interfaces/jwt-payload.interface';
import { CodigoError } from '../errors/codigos-error.enum';
import { DomainError } from '../errors/domain.error';

@Injectable()
export class AccesoVigenteGuard implements CanActivate {
  private readonly metodosLectura = new Set(['GET', 'HEAD', 'OPTIONS']);

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user as UsuarioAutenticado | undefined;

    if (!user) {
      throw new DomainError(
        CodigoError.NO_AUTENTICADO,
        'Usuario no autenticado',
        HttpStatus.UNAUTHORIZED,
      );
    }

    // RN-038: Suscripción VENCIDA o CANCELADA solo permite lectura
    const estado = user.estadoSuscripcion as EstadoSuscripcion;
    const esSuscripcionRestringida =
      estado === EstadoSuscripcion.VENCIDA ||
      estado === EstadoSuscripcion.CANCELADA;

    if (esSuscripcionRestringida) {
      const metodo = request.method.toUpperCase();
      const esLectura = this.metodosLectura.has(metodo);

      // Permitir logout (cierre de sesión, exento de mutación de negocio en RN-038)
      const esLogout = request.url.includes('/auth/logout');

      if (!esLectura && !esLogout) {
        throw new DomainError(
          CodigoError.SUSCRIPCION_INACTIVA,
          'La suscripción de la empresa se encuentra vencida o cancelada. El acceso está restringido a solo lectura (RN-038).',
          HttpStatus.FORBIDDEN,
          { estadoSuscripcion: estado, metodoSolicitado: metodo },
        );
      }
    }

    return true;
  }
}
