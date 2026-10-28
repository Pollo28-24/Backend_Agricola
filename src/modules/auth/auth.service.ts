import { Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AccionAuditoria, EstadoSuscripcion, Prisma } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import * as crypto from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../prisma/audit.service';
import { PasswordService } from '../../common/services/password.service';
import { LoginDto } from './dto/login.dto';
import { CambiarContrasenaDto } from './dto/cambiar-contrasena.dto';
import { SolicitarRecuperacionDto } from './dto/solicitar-recuperacion.dto';
import { RestablecerContrasenaDto } from './dto/restablecer-contrasena.dto';
import { MailService } from '../mail/mail.service';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { AuthResponseDto, UsuarioPerfilDto } from './dto/auth-response.dto';
import { JwtPayload } from './interfaces/jwt-payload.interface';
import { CodigoError } from '../../common/errors/codigos-error.enum';
import { DomainError } from '../../common/errors/domain.error';

const DUMMY_ARGON2ID_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$Y29udHJhc2VuYWR1bW15c2FsdA$K8d3x9m2L5p7Q1v4W6z8B0n2M4k6J8h0G2f4D6s8A0q';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
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
    private readonly mailService: MailService,
  ) {
    this.jwtSecret = this.configService.get<string>('JWT_SECRET')!;
    this.jwtExpiresIn = this.configService.get<string>('JWT_EXPIRES_IN', '15m');
    this.jwtRefreshSecret =
      this.configService.get<string>('JWT_REFRESH_SECRET')!;
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
      await this.passwordService.verify(DUMMY_ARGON2ID_HASH, dto.contrasena);
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

    // Rehash transparente si los parámetros almacenados difieren de los vigentes (m=19456, t=2, p=1)
    let nuevoHash: string | undefined;
    const requiereRehash =
      typeof this.passwordService.needsRehash === 'function'
        ? this.passwordService.needsRehash(usuario.contrasenaHash)
        : false;
    if (requiereRehash && typeof this.passwordService.hash === 'function') {
      nuevoHash = await this.passwordService.hash(dto.contrasena);
    }

    // Actualizar fecha de último acceso (y contrasenaHash si hubo rehash)
    await this.prisma.usuario.update({
      where: { id: usuario.id },
      data: {
        ultimoAcceso: new Date(),
        ...(nuevoHash ? { contrasenaHash: nuevoHash } : {}),
      },
    });

    // Registrar INICIO_SESION en bitácora de auditoría
    await this.auditService.registrar({
      empresaId: usuario.empresaId,
      usuarioId: usuario.id,
      entidad: 'usuario',
      entidadId: usuario.id,
      accion: AccionAuditoria.INICIO_SESION,
      ip,
      valoresNuevos: {
        correo: usuario.correo,
        fecha: new Date().toISOString(),
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
                activo: true,
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

    if (!tokenDb || tokenDb.usuarioId !== payload.sub) {
      throw new DomainError(
        CodigoError.NO_AUTENTICADO,
        'Refresh token no válido o ya revocado',
        401,
      );
    }

    // Verificar hash del token antes de mutar estado
    const tokenHash = this.hashToken(dto.refreshToken);
    if (tokenDb.tokenHash !== tokenHash) {
      throw new DomainError(
        CodigoError.NO_AUTENTICADO,
        'Firma de refresh token no válida',
        401,
      );
    }

    // Reuso detectado: token ya revocado o rotado previamente -> revocar toda la familia y confirmar antes de lanzar 401
    if (tokenDb.revocado || tokenDb.revocadoEn !== null) {
      await this.revocarFamilia(tokenDb.familiaId);
      throw new DomainError(
        CodigoError.NO_AUTENTICADO,
        'Refresh token no válido o ya revocado',
        401,
      );
    }

    // Token expirado en BD: 401 sin revocar la familia
    if (tokenDb.expiraEn < new Date()) {
      throw new DomainError(
        CodigoError.NO_AUTENTICADO,
        'Refresh token expirado',
        401,
      );
    }

    const usuario = tokenDb.usuario;
    if (!usuario.activo || usuario.deletedAt !== null) {
      await this.revocarFamilia(tokenDb.familiaId);
      throw new DomainError(
        CodigoError.NO_AUTENTICADO,
        'El usuario ha sido desactivado',
        401,
      );
    }

    const suscripcionInactiva =
      !usuario.empresa ||
      usuario.empresa.deletedAt !== null ||
      usuario.empresa.activo === false ||
      usuario.empresa.estadoSuscripcion === EstadoSuscripcion.VENCIDA ||
      usuario.empresa.estadoSuscripcion === EstadoSuscripcion.CANCELADA;

    if (suscripcionInactiva) {
      await this.revocarFamilia(tokenDb.familiaId);
      throw new DomainError(
        CodigoError.NO_AUTENTICADO,
        'La empresa o suscripción asociada está inactiva',
        401,
      );
    }

    // Rotación atómica condicional: exigir count === 1; si count === 0 hubo reuso en carrera
    const ejecutarRotacion = async (
      tx: Prisma.TransactionClient | PrismaService,
    ): Promise<{ accessToken: string; refreshToken: string } | null> => {
      const rotacion = await tx.refreshToken.updateMany({
        where: {
          jti: payload.jti,
          revocado: false,
          revocadoEn: null,
        },
        data: {
          revocado: true,
          revocadoEn: new Date(),
        },
      });

      if (rotacion.count !== 1) {
        return null;
      }

      return this.generarParTokens(
        usuario.id,
        usuario.empresaId,
        usuario.rol.codigo,
        tokenDb.familiaId,
        tx,
      );
    };

    const tokens =
      typeof this.prisma.$transaction === 'function'
        ? await this.prisma.$transaction((tx) => ejecutarRotacion(tx))
        : await ejecutarRotacion(this.prisma);

    if (!tokens) {
      await this.revocarFamilia(tokenDb.familiaId);
      throw new DomainError(
        CodigoError.NO_AUTENTICADO,
        'Refresh token no válido o ya revocado',
        401,
      );
    }

    const permisos = usuario.rol.permisos.map((rp) => rp.permiso.codigo);

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
   * Cierre de sesión: revoca toda la familia del refresh token
   */
  async logout(refreshToken?: string): Promise<{ mensaje: string }> {
    if (refreshToken) {
      try {
        const payload = this.jwtService.verify<{ jti: string }>(refreshToken, {
          secret: this.jwtRefreshSecret,
        });
        const tokenDb = await this.prisma.refreshToken.findUnique({
          where: { jti: payload.jti },
          select: { familiaId: true },
        });
        if (tokenDb?.familiaId) {
          await this.revocarFamilia(tokenDb.familiaId);
        } else {
          await this.prisma.refreshToken.updateMany({
            where: { jti: payload.jti, revocado: false },
            data: { revocado: true, revocadoEn: new Date() },
          });
        }
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

  private async revocarFamilia(familiaId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: {
        familiaId,
        revocado: false,
      },
      data: {
        revocado: true,
        revocadoEn: new Date(),
      },
    });
  }

  private async generarParTokens(
    usuarioId: number,
    empresaId: number,
    rol: string,
    familiaId?: string,
    txClient?: Prisma.TransactionClient | PrismaService,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const payload: JwtPayload = {
      sub: usuarioId,
      empresaId,
      rol,
    };

    const accessToken = this.jwtService.sign(payload, {
      secret: this.jwtSecret,
      expiresIn: this.jwtExpiresIn as unknown as number,
    });

    const jti = uuidv4();
    const familiaFinal = familiaId ?? jti;
    const refreshToken = this.jwtService.sign(
      { sub: usuarioId, jti },
      {
        secret: this.jwtRefreshSecret,
        expiresIn: this.jwtRefreshExpiresIn as unknown as number,
      },
    );

    // Calcular fecha de expiración (default 7 días)
    const expiraEn = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const tokenHash = this.hashToken(refreshToken);
    const client = txClient ?? this.prisma;

    await client.refreshToken.create({
      data: {
        usuarioId,
        familiaId: familiaFinal,
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

  /**
   * Cambia la contraseña del usuario autenticado (RN-076 y §3.23.1).
   * Verifica la contraseña actual, actualiza al nuevo hash Argon2id,
   * revoca transaccionalmente todos los Refresh Tokens del usuario y
   * actualiza usuario.cambioContrasenaEn para invalidar Access Tokens previos.
   */
  async cambiarContrasena(
    usuarioId: number,
    dto: CambiarContrasenaDto,
    ip?: string,
  ): Promise<{ mensaje: string }> {
    const usuario = await this.prisma.usuario.findUnique({
      where: { id: usuarioId },
      include: {
        empresa: {
          select: {
            id: true,
            activo: true,
            deletedAt: true,
          },
        },
      },
    });

    if (!usuario || usuario.deletedAt !== null || !usuario.activo) {
      throw new DomainError(
        CodigoError.NO_AUTENTICADO,
        'Usuario no encontrado o inactivo',
        401,
      );
    }

    const contrasenaValida = await this.passwordService.verify(
      usuario.contrasenaHash,
      dto.contrasenaActual,
    );

    if (!contrasenaValida) {
      throw new DomainError(
        CodigoError.CONTRASENA_ACTUAL_INCORRECTA,
        'La contraseña actual es incorrecta',
        400,
      );
    }

    const nuevoHash = await this.passwordService.hash(dto.nuevaContrasena);
    const ahora = new Date();

    await this.prisma.$transaction(async (tx) => {
      await tx.usuario.update({
        where: { id: usuarioId },
        data: {
          contrasenaHash: nuevoHash,
          cambioContrasenaEn: ahora,
        },
      });

      // RN-076: Revoca transaccionalmente todos los Refresh Tokens activos del usuario
      await tx.refreshToken.updateMany({
        where: {
          usuarioId,
          revocado: false,
        },
        data: {
          revocado: true,
          revocadoEn: ahora,
        },
      });

      // Bitácora de auditoría inmutable (RN-074: no exponer contraseñas ni hashes)
      await this.auditService.registrar(
        {
          empresaId: usuario.empresaId,
          usuarioId: usuario.id,
          entidad: 'Usuario',
          entidadId: usuario.id,
          accion: AccionAuditoria.CAMBIO_CONTRASENA,
          valoresAnteriores: null,
          valoresNuevos: { cambioContrasena: true },
          ip,
        },
        tx,
      );
    });

    return {
      mensaje:
        'Contraseña actualizada exitosamente. Por favor, inicie sesión con su nueva clave.',
    };
  }

  /**
   * Solicita el restablecimiento de contraseña vía correo (RN-040 y §3.23.1).
   * Genera un token aleatorio criptográfico seguro de 32 bytes (64 caracteres hex)
   * y guarda su hash SHA-256 en password_reset_token con validez de 15 minutos.
   * Política estricta de anti-enumeración de cuentas: responde siempre 200 OK idéntico.
   */
  async solicitarRecuperacion(
    dto: SolicitarRecuperacionDto,
    ip?: string,
  ): Promise<{ mensaje: string }> {
    const MENSAJE_RESPUESTA =
      'Si el correo electrónico está registrado, recibirá las instrucciones para restablecer su contraseña.';

    const correoNormalizado = dto.correo.toLowerCase().trim();
    const usuario = await this.prisma.usuario.findUnique({
      where: { correo: correoNormalizado },
      include: {
        empresa: {
          select: {
            id: true,
            activo: true,
            deletedAt: true,
          },
        },
      },
    });

    // Anti-enumeración: si el usuario o la empresa no existen o están inactivos, responde idéntico
    if (
      !usuario ||
      usuario.deletedAt !== null ||
      !usuario.activo ||
      !usuario.empresa ||
      usuario.empresa.deletedAt !== null ||
      !usuario.empresa.activo
    ) {
      await this.passwordService.verify(DUMMY_ARGON2ID_HASH, 'dummy-password');
      return { mensaje: MENSAJE_RESPUESTA };
    }

    const hace15Min = new Date(Date.now() - 15 * 60 * 1000);
    const tokensRecientes = await this.prisma.passwordResetToken.count({
      where: {
        usuarioId: usuario.id,
        createdAt: { gte: hace15Min },
      },
    });

    if (tokensRecientes >= 3) {
      return { mensaje: MENSAJE_RESPUESTA };
    }

    const tokenCrudo = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto
      .createHash('sha256')
      .update(tokenCrudo)
      .digest('hex');
    const minutosExpiracion = this.configService.get<number>(
      'PASSWORD_RESET_EXPIRES_MINUTES',
      15,
    );
    const expiraEn = new Date(Date.now() + minutosExpiracion * 60 * 1000);

    // En BD revocar tokens previos y crear el nuevo token
    const tokenRecord = await this.prisma.$transaction(async (tx) => {
      await tx.passwordResetToken.updateMany({
        where: {
          usuarioId: usuario.id,
          usadoEn: null,
          revocadoEn: null,
        },
        data: {
          revocadoEn: new Date(),
        },
      });

      return tx.passwordResetToken.create({
        data: {
          usuarioId: usuario.id,
          tokenHash,
          expiraEn,
          ipSolicitud: ip,
        },
      });
    });

    const baseUrl = this.configService.get<string>(
      'PASSWORD_RESET_URL',
      'http://localhost:3000/restablecer-contrasena',
    );
    const separador = baseUrl.includes('?') ? '&' : '?';
    const enlaceRecuperacion = `${baseUrl}${separador}token=${tokenCrudo}`;

    // Trampa 5: la llamada a Brevo ocurre FUERA de la transacción.
    // Si Brevo falla, se revoca el token y se registra sin propagar 500/503 (R1).
    // B2: el envío se despacha de forma desacoplada del camino de respuesta HTTP
    // para evitar demoras, fugas de tiempo (timing attacks) y responder 200 inmediatamente.
    const despachoPromise = this.mailService
      .enviarRecuperacionContrasena(
        usuario.correo,
        usuario.nombre,
        enlaceRecuperacion,
        tokenCrudo,
      )
      .catch(async (error: unknown) => {
        try {
          await this.prisma.passwordResetToken.update({
            where: { id: tokenRecord.id },
            data: { revocadoEn: new Date() },
          });
        } catch (revocationError: unknown) {
          this.logger.error(
            `Fallo al revocar token tras error en transporte de correo: ${
              revocationError instanceof Error
                ? revocationError.message
                : 'Error desconocido'
            }`,
          );
        }
        this.logger.error(
          `Fallo al despachar correo de recuperación para usuarioId: ${usuario.id}. Token revocado. Motivo: ${
            error instanceof Error ? error.message : 'Error desconocido'
          }`,
        );
      });

    this.mailService.registrarEnvio(despachoPromise);

    return { mensaje: MENSAJE_RESPUESTA };
  }

  /**
   * Restablece la contraseña utilizando el token uniuso (§3.23.1).
   * Consume de manera atómica el token en BD (usadoEn = now()), actualiza
   * la contraseña a su nuevo hash Argon2id, revoca todos los Refresh Tokens
   * e invalida los Access Tokens previos.
   */
  async restablecerContrasena(
    dto: RestablecerContrasenaDto,
    ip?: string,
  ): Promise<{ mensaje: string }> {
    const tokenHash = crypto
      .createHash('sha256')
      .update(dto.token)
      .digest('hex');
    const nuevoHash = await this.passwordService.hash(dto.nuevaContrasena);
    const ahora = new Date();

    await this.prisma.$transaction(async (tx) => {
      // Trampa 2: Consumo atómico con updateMany
      const consumo = await tx.passwordResetToken.updateMany({
        where: {
          tokenHash,
          usadoEn: null,
          revocadoEn: null,
          expiraEn: { gt: ahora },
        },
        data: {
          usadoEn: ahora,
        },
      });

      if (consumo.count === 0) {
        throw new DomainError(
          CodigoError.TOKEN_RECUPERACION_INVALIDO,
          'El token de recuperación es inválido, expiró o ya fue utilizado',
          400,
        );
      }

      const resetToken = await tx.passwordResetToken.findUnique({
        where: { tokenHash },
        include: { usuario: true },
      });

      if (
        !resetToken ||
        !resetToken.usuario ||
        resetToken.usuario.deletedAt !== null
      ) {
        throw new DomainError(
          CodigoError.TOKEN_RECUPERACION_INVALIDO,
          'El usuario asociado al token no es válido o fue eliminado',
          400,
        );
      }

      const usuarioId = resetToken.usuarioId;

      await tx.usuario.update({
        where: { id: usuarioId },
        data: {
          contrasenaHash: nuevoHash,
          cambioContrasenaEn: ahora,
        },
      });

      // Revoca cualquier otro token de recuperación pendiente
      await tx.passwordResetToken.updateMany({
        where: {
          usuarioId,
          id: { not: resetToken.id },
          usadoEn: null,
          revocadoEn: null,
        },
        data: {
          revocadoEn: ahora,
        },
      });

      // RN-076: Revoca transaccionalmente todos los Refresh Tokens activos del usuario
      await tx.refreshToken.updateMany({
        where: {
          usuarioId,
          revocado: false,
        },
        data: {
          revocado: true,
          revocadoEn: ahora,
        },
      });

      // Auditoría RESTABLECIMIENTO_CONTRASENA
      await this.auditService.registrar(
        {
          empresaId: resetToken.usuario.empresaId,
          usuarioId,
          entidad: 'Usuario',
          entidadId: usuarioId,
          accion: AccionAuditoria.RESTABLECIMIENTO_CONTRASENA,
          valoresAnteriores: null,
          valoresNuevos: { restablecimientoContrasena: true },
          ip,
        },
        tx,
      );
    });

    return {
      mensaje:
        'Contraseña restablecida exitosamente. Inicie sesión con su nueva clave.',
    };
  }
}
