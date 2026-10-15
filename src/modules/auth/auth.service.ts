import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AccionAuditoria } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import * as crypto from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../prisma/audit.service';
import { PasswordService } from '../../common/services/password.service';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { AuthResponseDto, UsuarioPerfilDto } from './dto/auth-response.dto';
import { JwtPayload } from './interfaces/jwt-payload.interface';
import { CodigoError } from '../../common/errors/codigos-error.enum';
import { DomainError } from '../../common/errors/domain.error';

@Injectable()
export class AuthService {
  private readonly jwtSecret: string;
  private readonly jwtExpiresIn: string;
  private readonly jwtRefreshSecret: string;
  private readonly jwtRefreshExpiresIn: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly passwordService: PasswordService,
    private readonly auditService: AuditService,
  ) {
    this.jwtSecret = this.configService.get<string>('JWT_SECRET')!;
    this.jwtExpiresIn = this.configService.get<string>('JWT_EXPIRES_IN', '15m');
    this.jwtRefreshSecret = this.configService.get<string>('JWT_REFRESH_SECRET')!;
    this.jwtRefreshExpiresIn = this.configService.get<string>(
      'JWT_REFRESH_EXPIRES_IN',
      '7d',
    );
  }

  /**
   * Autenticación de usuario con emisión de Access Token corto (15 min)
   * y Refresh Token rotatorio (Sección 3.23).
   * Registra auditoría INICIO_SESION y valida RN-040 y RN-072.
   */
  async login(dto: LoginDto, ip?: string): Promise<AuthResponseDto> {
    const usuario = await this.prisma.usuario.findUnique({
      where: { correo: dto.correo.toLowerCase().trim() },
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

    if (!usuario || usuario.deletedAt !== null) {
      throw new DomainError(
        CodigoError.NO_AUTENTICADO,
        'Credenciales incorrectas',
        401,
      );
    }

    const passwordValida = await this.passwordService.verify(
      usuario.contrasenaHash,
      dto.contrasena,
    );

    if (!passwordValida) {
      throw new DomainError(
        CodigoError.NO_AUTENTICADO,
        'Credenciales incorrectas',
        401,
      );
    }

    if (!usuario.activo) {
      throw new DomainError(
        CodigoError.NO_AUTENTICADO,
        'La cuenta de usuario está desactivada',
        401,
      );
    }

    if (!usuario.empresa || usuario.empresa.deletedAt !== null) {
      throw new DomainError(
        CodigoError.NO_AUTENTICADO,
        'La empresa asociada se encuentra inactiva',
        401,
      );
    }

    // Actualizar fecha de último acceso
    await this.prisma.usuario.update({
      where: { id: usuario.id },
      data: { ultimoAcceso: new Date() },
    });

    // Registrar INICIO_SESION en bitácora de auditoría
    await this.auditService.registrar({
      empresaId: usuario.empresaId,
      usuarioId: usuario.id,
      entidad: 'usuario',
      entidadId: usuario.id,
      accion: AccionAuditoria.INICIO_SESION,
      ip,
      valoresNuevos: { correo: usuario.correo, fecha: new Date().toISOString() },
    });

    const permisos = usuario.rol.permisos.map((rp) => rp.permiso.codigo);
    const tokens = await this.generarParTokens(
      usuario.id,
      usuario.empresaId,
      usuario.rol.codigo,
    );

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      usuario: {
        id: usuario.id,
        nombre: usuario.nombre,
        apellido: usuario.apellido,
        correo: usuario.correo,
        empresaId: usuario.empresaId,
        rol: usuario.rol.codigo,
        permisos,
        estadoSuscripcion: usuario.empresa.estadoSuscripcion,
      },
    };
  }

  /**
   * Rotación de Refresh Token (Sección 3.23).
   * Revoca el token anterior y emite un nuevo par de tokens.
   */
  async refresh(dto: RefreshTokenDto): Promise<AuthResponseDto> {
    let payload: { sub: number; jti: string };
    try {
      payload = this.jwtService.verify(dto.refreshToken, {
        secret: this.jwtRefreshSecret,
      });
    } catch {
      throw new DomainError(
        CodigoError.NO_AUTENTICADO,
        'Refresh token inválido o expirado',
        401,
      );
    }

    const tokenDb = await this.prisma.refreshToken.findUnique({
      where: { jti: payload.jti },
      include: {
        usuario: {
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
        },
      },
    });

    if (
      !tokenDb ||
      tokenDb.revocado ||
      tokenDb.expiraEn < new Date() ||
      tokenDb.usuarioId !== payload.sub
    ) {
      throw new DomainError(
        CodigoError.NO_AUTENTICADO,
        'Refresh token no válido o ya revocado',
        401,
      );
    }

    // Verificar hash del token
    const tokenHash = this.hashToken(dto.refreshToken);
    if (tokenDb.tokenHash !== tokenHash) {
      throw new DomainError(
        CodigoError.NO_AUTENTICADO,
        'Firma de refresh token no válida',
        401,
      );
    }

    const usuario = tokenDb.usuario;
    if (!usuario.activo || usuario.deletedAt !== null) {
      throw new DomainError(
        CodigoError.NO_AUTENTICADO,
        'El usuario ha sido desactivado',
        401,
      );
    }

    if (!usuario.empresa || usuario.empresa.deletedAt !== null) {
      throw new DomainError(
        CodigoError.NO_AUTENTICADO,
        'La empresa asociada está inactiva',
        401,
      );
    }

    // Rotación: revocar el token usado
    await this.prisma.refreshToken.update({
      where: { id: tokenDb.id },
      data: {
        revocado: true,
        revocadoEn: new Date(),
      },
    });

    const permisos = usuario.rol.permisos.map((rp) => rp.permiso.codigo);
    const tokens = await this.generarParTokens(
      usuario.id,
      usuario.empresaId,
      usuario.rol.codigo,
    );

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      usuario: {
        id: usuario.id,
        nombre: usuario.nombre,
        apellido: usuario.apellido,
        correo: usuario.correo,
        empresaId: usuario.empresaId,
        rol: usuario.rol.codigo,
        permisos,
        estadoSuscripcion: usuario.empresa.estadoSuscripcion,
      },
    };
  }

  /**
   * Cierre de sesión: revoca el refresh token
   */
  async logout(refreshToken?: string): Promise<{ mensaje: string }> {
    if (refreshToken) {
      try {
        const payload = this.jwtService.verify<{ jti: string }>(refreshToken, {
          secret: this.jwtRefreshSecret,
        });
        await this.prisma.refreshToken.updateMany({
          where: { jti: payload.jti, revocado: false },
          data: { revocado: true, revocadoEn: new Date() },
        });
      } catch {
        // Si el token es inválido, finaliza silenciosamente
      }
    }

    return { mensaje: 'Sesión cerrada exitosamente' };
  }

  /**
   * Consulta el perfil del usuario autenticado con sus permisos vigentes
   */
  async me(usuarioId: number): Promise<UsuarioPerfilDto> {
    const usuario = await this.prisma.usuario.findUnique({
      where: { id: usuarioId },
      include: {
        empresa: {
          select: {
            estadoSuscripcion: true,
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

    if (!usuario || !usuario.activo || usuario.deletedAt !== null) {
      throw new DomainError(
        CodigoError.NO_AUTENTICADO,
        'Usuario no encontrado o inactivo',
        401,
      );
    }

    const permisos = usuario.rol.permisos.map((rp) => rp.permiso.codigo);

    return {
      id: usuario.id,
      nombre: usuario.nombre,
      apellido: usuario.apellido,
      correo: usuario.correo,
      empresaId: usuario.empresaId,
      rol: usuario.rol.codigo,
      permisos,
      estadoSuscripcion: usuario.empresa.estadoSuscripcion,
    };
  }

  private async generarParTokens(
    usuarioId: number,
    empresaId: number,
    rol: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const payload: JwtPayload = {
      sub: usuarioId,
      empresaId,
      rol,
    };

    const accessToken = this.jwtService.sign(payload, {
      secret: this.jwtSecret,
      expiresIn: this.jwtExpiresIn as any,
    });

    const jti = uuidv4();
    const refreshToken = this.jwtService.sign(
      { sub: usuarioId, jti },
      {
        secret: this.jwtRefreshSecret,
        expiresIn: this.jwtRefreshExpiresIn as any,
      },
    );

    // Calcular fecha de expiración (default 7 días)
    const expiraEn = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const tokenHash = this.hashToken(refreshToken);

    await this.prisma.refreshToken.create({
      data: {
        usuarioId,
        jti,
        tokenHash,
        expiraEn,
        revocado: false,
      },
    });

    return { accessToken, refreshToken };
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }
}
