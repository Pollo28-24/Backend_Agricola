import * as crypto from 'crypto';
import { ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import {
  ThrottlerGuard,
  ThrottlerLimitDetail,
  ThrottlerModuleOptions,
} from '@nestjs/throttler';
import { CodigoError } from '../../../common/errors/codigos-error.enum';
import { DomainError } from '../../../common/errors/domain.error';

export interface ThrottlerConfigParams {
  enabled: boolean;
  defaultLimit?: number;
  defaultTtlMs?: number;
  loginIpLimit?: number;
  loginIpTtlMs?: number;
  loginCorreoLimit?: number;
  loginCorreoTtlMs?: number;
  loginCorreoBlockDurationMs?: number;
  recuperarIpLimit?: number;
  recuperarIpTtlMs?: number;
  recuperarCorreoLimit?: number;
  recuperarCorreoTtlMs?: number;
  restablecerIpLimit?: number;
  restablecerIpTtlMs?: number;
  cambiarUsuarioLimit?: number;
  cambiarUsuarioTtlMs?: number;
}

export function extraerIpCliente(req: Record<string, unknown>): string {
  const ip = typeof req.ip === 'string' && req.ip.trim() ? req.ip.trim() : '';
  if (ip) {
    return ip;
  }
  const socket = req.socket as { remoteAddress?: string } | undefined;
  if (socket && typeof socket.remoteAddress === 'string') {
    return socket.remoteAddress;
  }
  return '127.0.0.1';
}

/**
 * Tracker compuesto IP + sha256(correo normalizado) para /auth/login.
 * Evita que un atacante bloquee globalmente la cuenta de una víctima desde otra IP
 * y nunca almacena el correo electrónico en claro en la memoria del throttler.
 */
export function obtenerTrackerLoginCorreo(
  req: Record<string, unknown>,
): string {
  const ip = extraerIpCliente(req);
  const body = req.body as Record<string, unknown> | undefined;
  const rawCorreo =
    body && typeof body.correo === 'string'
      ? body.correo.toLowerCase().trim()
      : '';
  const hashCorreo = crypto
    .createHash('sha256')
    .update(rawCorreo)
    .digest('hex');
  return `${ip}:${hashCorreo}`;
}

function esControladorSalud(context: ExecutionContext): boolean {
  const className = context.getClass()?.name ?? '';
  return className === 'HealthController';
}

function esRutaAuthLogin(context: ExecutionContext): boolean {
  const className = context.getClass()?.name ?? '';
  const handlerName = context.getHandler()?.name ?? '';
  return className === 'AuthController' && handlerName === 'login';
}

function esRutaAuthLoginORefresh(context: ExecutionContext): boolean {
  const className = context.getClass()?.name ?? '';
  const handlerName = context.getHandler()?.name ?? '';
  return (
    className === 'AuthController' &&
    (handlerName === 'login' || handlerName === 'refresh')
  );
}

function esRutaSolicitarRecuperacion(context: ExecutionContext): boolean {
  const className = context.getClass()?.name ?? '';
  const handlerName = context.getHandler()?.name ?? '';
  return (
    className === 'AuthController' && handlerName === 'solicitarRecuperacion'
  );
}

export function obtenerTrackerRecuperarCorreo(
  req: Record<string, unknown>,
): string {
  const ip = extraerIpCliente(req);
  const body = req.body as Record<string, unknown> | undefined;
  const rawCorreo =
    body && typeof body.correo === 'string'
      ? body.correo.toLowerCase().trim()
      : '';
  const hashCorreo = crypto
    .createHash('sha256')
    .update(rawCorreo)
    .digest('hex');
  return `${ip}:${hashCorreo}`;
}

export function obtenerTrackerCambiarUsuario(
  req: Record<string, unknown>,
): string {
  const ip = extraerIpCliente(req);
  const user = req.user as { id?: number } | undefined;
  if (user?.id) {
    return `${ip}:user:${user.id}`;
  }
  const headers = req.headers as Record<string, string> | undefined;
  const authHeader = headers?.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    try {
      const parts = token.split('.');
      if (parts.length === 3) {
        const payload = JSON.parse(
          Buffer.from(parts[1], 'base64url').toString('utf8'),
        ) as { sub?: number };
        if (payload?.sub) {
          return `${ip}:user:${payload.sub}`;
        }
      }
    } catch {
      // Ignorar fallo de decodificación y fallback a IP
    }
  }
  return ip;
}

function esRutaRestablecer(context: ExecutionContext): boolean {
  const className = context.getClass()?.name ?? '';
  const handlerName = context.getHandler()?.name ?? '';
  return (
    className === 'AuthController' && handlerName === 'restablecerContrasena'
  );
}

function esRutaCambiarContrasena(context: ExecutionContext): boolean {
  const className = context.getClass()?.name ?? '';
  const handlerName = context.getHandler()?.name ?? '';
  return className === 'AuthController' && handlerName === 'cambiarContrasena';
}

export function crearThrottlerOptions(
  params: ThrottlerConfigParams,
): ThrottlerModuleOptions {
  const enabled = params.enabled;
  const defaultLimit = params.defaultLimit ?? 300;
  const defaultTtlMs = params.defaultTtlMs ?? 60_000;
  const loginIpLimit = params.loginIpLimit ?? 10;
  const loginIpTtlMs = params.loginIpTtlMs ?? 60_000;
  const loginCorreoLimit = params.loginCorreoLimit ?? 5;
  const loginCorreoTtlMs = params.loginCorreoTtlMs ?? 60_000;
  const loginCorreoBlockDurationMs =
    params.loginCorreoBlockDurationMs ?? 15 * 60 * 1000;

  return {
    throttlers: [
      {
        name: 'default',
        ttl: defaultTtlMs,
        limit: defaultLimit,
        skipIf: (ctx: ExecutionContext) => !enabled || esControladorSalud(ctx),
      },
      {
        name: 'login-ip',
        ttl: loginIpTtlMs,
        limit: loginIpLimit,
        skipIf: (ctx: ExecutionContext) =>
          !enabled || !esRutaAuthLoginORefresh(ctx),
      },
      {
        name: 'login-correo',
        ttl: loginCorreoTtlMs,
        limit: loginCorreoLimit,
        blockDuration: loginCorreoBlockDurationMs,
        getTracker: (req: Record<string, unknown>) =>
          obtenerTrackerLoginCorreo(req),
        skipIf: (ctx: ExecutionContext) => !enabled || !esRutaAuthLogin(ctx),
      },
      {
        name: 'recuperar-ip',
        ttl: params.recuperarIpTtlMs ?? 900_000,
        limit: params.recuperarIpLimit ?? 5,
        getTracker: (req: Record<string, unknown>) => extraerIpCliente(req),
        skipIf: (ctx: ExecutionContext) =>
          !enabled || !esRutaSolicitarRecuperacion(ctx),
      },
      {
        name: 'recuperar-correo',
        ttl: params.recuperarCorreoTtlMs ?? 900_000,
        limit: params.recuperarCorreoLimit ?? 3,
        getTracker: (req: Record<string, unknown>) =>
          obtenerTrackerRecuperarCorreo(req),
        skipIf: (ctx: ExecutionContext) =>
          !enabled || !esRutaSolicitarRecuperacion(ctx),
      },
      {
        name: 'restablecer-ip',
        ttl: params.restablecerIpTtlMs ?? 900_000,
        limit: params.restablecerIpLimit ?? 10,
        getTracker: (req: Record<string, unknown>) => extraerIpCliente(req),
        skipIf: (ctx: ExecutionContext) => !enabled || !esRutaRestablecer(ctx),
      },
      {
        name: 'cambiar-usuario',
        ttl: params.cambiarUsuarioTtlMs ?? 900_000,
        limit: params.cambiarUsuarioLimit ?? 5,
        getTracker: (req: Record<string, unknown>) =>
          obtenerTrackerCambiarUsuario(req),
        skipIf: (ctx: ExecutionContext) =>
          !enabled || !esRutaCambiarContrasena(ctx),
      },
    ],
  };
}

@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  protected override throwThrottlingException(
    context: ExecutionContext,
    throttlerLimitDetail: ThrottlerLimitDetail,
  ): Promise<void> {
    const { res } = this.getRequestResponse(context);
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil(
        throttlerLimitDetail.timeToBlockExpire ||
          throttlerLimitDetail.timeToExpire ||
          60,
      ),
    );
    this.setResponseHeader(res, 'Retry-After', String(retryAfterSeconds));

    return Promise.reject(
      new DomainError(
        CodigoError.DEMASIADAS_PETICIONES,
        'Demasiadas peticiones. Por favor, intente de nuevo más tarde.',
        HttpStatus.TOO_MANY_REQUESTS,
        { retryAfter: retryAfterSeconds },
      ),
    );
  }
}
