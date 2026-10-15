import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../../../prisma/prisma.service';
import { JwtPayload, UsuarioAutenticado } from '../interfaces/jwt-payload.interface';
import { AppClsStore } from '../../../common/context/app-cls.store';
import { CodigoError } from '../../../common/errors/codigos-error.enum';
import { DomainError } from '../../../common/errors/domain.error';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly cls: ClsService<AppClsStore>,
  ) {
    const secret = configService.get<string>('JWT_SECRET');
    if (!secret) {
      throw new Error('JWT_SECRET no configurado');
    }

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  /**
   * Revalidación continua de acceso en cada petición (RN-072).
   * Comprueba que el usuario y la empresa sigan activos, y obtiene los permisos vigentes del rol.
   */
  async validate(payload: JwtPayload): Promise<UsuarioAutenticado> {
    const usuario = await this.prisma.usuario.findUnique({
      where: { id: payload.sub },
      include: {
        empresa: {
          select: {
            id: true,
            nombre: true,
            estadoSuscripcion: true,
            deletedAt: true,
          },
        },
        rol: {
          include: {
            permisos: {
              include: {
                permiso: true,
              },
            },
          },
        },
      },
    });

    if (!usuario || usuario.deletedAt !== null || !usuario.activo) {
      throw new DomainError(
        CodigoError.NO_AUTENTICADO,
        'Usuario inactivo, eliminado o no encontrado',
        401,
      );
    }

    if (!usuario.empresa || usuario.empresa.deletedAt !== null) {
      throw new DomainError(
        CodigoError.NO_AUTENTICADO,
        'La empresa asociada se encuentra inactiva o eliminada',
        401,
      );
    }

    const permisos = usuario.rol.permisos.map((rp) => rp.permiso.codigo);

    // Propagar al contexto por petición (CLS) para auditoría y multi-tenancy
    this.cls.set('usuarioId', usuario.id);
    this.cls.set('empresaId', usuario.empresaId);
    this.cls.set('rolCodigo', usuario.rol.codigo);
    this.cls.set('permisos', permisos);

    return {
      id: usuario.id,
      empresaId: usuario.empresaId,
      nombre: usuario.nombre,
      apellido: usuario.apellido,
      correo: usuario.correo,
      rol: usuario.rol.codigo,
      permisos,
      estadoSuscripcion: usuario.empresa.estadoSuscripcion,
    };
  }
}
