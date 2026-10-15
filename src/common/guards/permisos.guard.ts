import {
  CanActivate,
  ExecutionContext,
  Injectable,
  HttpStatus,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { IS_PUBLIC_KEY } from '../../modules/auth/decorators/public.decorator';
import { PERMISOS_KEY } from '../decorators/require-permisos.decorator';
import { UsuarioAutenticado } from '../../modules/auth/interfaces/jwt-payload.interface';
import { CodigoError } from '../errors/codigos-error.enum';
import { DomainError } from '../errors/domain.error';

@Injectable()
export class PermisosGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const permisosRequeridos = this.reflector.getAllAndOverride<string[]>(
      PERMISOS_KEY,
      [context.getHandler(), context.getClass()],
    );

    // Si la ruta o controlador no exige permisos específicos, permitir acceso a usuarios autenticados
    if (!permisosRequeridos || permisosRequeridos.length === 0) {
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

    const permisosUsuario = new Set(user.permisos || []);
    const permisosFaltantes = permisosRequeridos.filter(
      (permiso) => !permisosUsuario.has(permiso),
    );

    if (permisosFaltantes.length > 0) {
      throw new DomainError(
        CodigoError.PERMISO_DENEGADO,
        'No cuenta con los permisos necesarios para realizar esta acción',
        HttpStatus.FORBIDDEN,
        {
          rol: user.rol,
          permisosRequeridos,
          permisosFaltantes,
        },
      );
    }

    return true;
  }
}
