import { Injectable, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { DomainError } from '../../../common/errors/domain.error';
import { CodigoError } from '../../../common/errors/codigos-error.enum';

export interface TokenDescargaPayload {
  adjuntoId: number;
  empresaId: number;
  usuarioId: number;
  exp: number; // Unix timestamp en segundos
}

@Injectable()
export class TokenDescargaService {
  private readonly secret: string;
  private readonly ttlSeconds: number;
  private relojFn: () => number;

  constructor(private readonly configService: ConfigService) {
    this.secret =
      this.configService.get<string>('STORAGE_SIGNED_URL_SECRET') ||
      'storage_signed_url_default_secret_minimum_32_characters_long';
    this.ttlSeconds = Number(
      this.configService.get<number>('STORAGE_SIGNED_URL_TTL_SECONDS') || 300,
    );
    this.relojFn = () => Math.floor(Date.now() / 1000);
  }

  /**
   * Permite inyectar una función de reloj para pruebas sin requerir sleeps.
   */
  public setReloj(fn: () => number): void {
    this.relojFn = fn;
  }

  public resetReloj(): void {
    this.relojFn = () => Math.floor(Date.now() / 1000);
  }

  /**
   * Genera un token firmado HMAC-SHA256 base64url: payloadB64.signatureB64
   */
  public generarToken(
    adjuntoId: number,
    empresaId: number,
    usuarioId: number,
    ttlPersonalizado?: number,
  ): { token: string; expiraEn: Date } {
    const ttl =
      ttlPersonalizado !== undefined ? ttlPersonalizado : this.ttlSeconds;
    const now = this.relojFn();
    const exp = now + ttl;

    const payload: TokenDescargaPayload = {
      adjuntoId,
      empresaId,
      usuarioId,
      exp,
    };

    const payloadB64 = Buffer.from(JSON.stringify(payload)).toString(
      'base64url',
    );
    const signature = crypto
      .createHmac('sha256', this.secret)
      .update(payloadB64)
      .digest('base64url');

    const token = `${payloadB64}.${signature}`;
    const expiraEn = new Date(exp * 1000);

    return { token, expiraEn };
  }

  /**
   * Valida la firma HMAC-SHA256 y la expiración del token.
   * Lanza 403 ENLACE_DESCARGA_INVALIDO si es inválido, adulterado o vencido.
   */
  public verificarToken(token: string): TokenDescargaPayload {
    if (!token || typeof token !== 'string') {
      throw new DomainError(
        CodigoError.ENLACE_DESCARGA_INVALIDO,
        'Enlace de descarga inválido o no proporcionado',
        HttpStatus.FORBIDDEN,
      );
    }

    const partes = token.split('.');
    if (partes.length !== 2) {
      throw new DomainError(
        CodigoError.ENLACE_DESCARGA_INVALIDO,
        'Formato de enlace de descarga inválido',
        HttpStatus.FORBIDDEN,
      );
    }

    const [payloadB64, signature] = partes;

    // 1. Recalcular firma esperada
    const expectedSignature = crypto
      .createHmac('sha256', this.secret)
      .update(payloadB64)
      .digest('base64url');

    // 2. Comparación de tiempo constante (timingSafeEqual)
    const sigBuffer = Buffer.from(signature, 'utf8');
    const expectedBuffer = Buffer.from(expectedSignature, 'utf8');

    if (
      sigBuffer.length !== expectedBuffer.length ||
      !crypto.timingSafeEqual(sigBuffer, expectedBuffer)
    ) {
      throw new DomainError(
        CodigoError.ENLACE_DESCARGA_INVALIDO,
        'Firma de enlace de descarga no coincide o ha sido adulterada',
        HttpStatus.FORBIDDEN,
      );
    }

    // 3. Deserializar payload
    let payload: TokenDescargaPayload;
    try {
      const decodedJson = Buffer.from(payloadB64, 'base64url').toString('utf8');
      payload = JSON.parse(decodedJson) as TokenDescargaPayload;
    } catch {
      throw new DomainError(
        CodigoError.ENLACE_DESCARGA_INVALIDO,
        'Contenido del enlace de descarga corrupto',
        HttpStatus.FORBIDDEN,
      );
    }

    if (
      !payload.adjuntoId ||
      !payload.empresaId ||
      !payload.usuarioId ||
      !payload.exp
    ) {
      throw new DomainError(
        CodigoError.ENLACE_DESCARGA_INVALIDO,
        'Parámetros insuficientes en el enlace de descarga',
        HttpStatus.FORBIDDEN,
      );
    }

    // 4. Verificar vencimiento
    const now = this.relojFn();
    if (now > payload.exp) {
      throw new DomainError(
        CodigoError.ENLACE_DESCARGA_INVALIDO,
        'El enlace de descarga ha expirado',
        HttpStatus.FORBIDDEN,
      );
    }

    return payload;
  }
}
