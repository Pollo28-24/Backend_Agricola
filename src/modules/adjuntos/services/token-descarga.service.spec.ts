import { ConfigService } from '@nestjs/config';
import { TokenDescargaService } from './token-descarga.service';
import { CodigoError } from '../../../common/errors/codigos-error.enum';
import { DomainError } from '../../../common/errors/domain.error';

describe('TokenDescargaService', () => {
  let service: TokenDescargaService;
  let tiempoVirtual: number;

  beforeEach(() => {
    tiempoVirtual = 1700000000;
    const mockConfigService = {
      get: jest.fn((key: string) => {
        if (key === 'STORAGE_SIGNED_URL_SECRET')
          return 'un_secreto_super_seguro_de_mas_de_32_caracteres_123';
        if (key === 'STORAGE_SIGNED_URL_TTL_SECONDS') return 300;
        return null;
      }),
    } as unknown as ConfigService;

    service = new TokenDescargaService(mockConfigService);
    service.setReloj(() => tiempoVirtual);
  });

  afterEach(() => {
    service.resetReloj();
  });

  it('debe generar un token válido y verificarlo exitosamente', () => {
    const { token, expiraEn } = service.generarToken(42, 10, 5);

    expect(token).toBeDefined();
    expect(expiraEn).toEqual(new Date((tiempoVirtual + 300) * 1000));

    const payload = service.verificarToken(token);
    expect(payload).toEqual({
      adjuntoId: 42,
      empresaId: 10,
      usuarioId: 5,
      exp: tiempoVirtual + 300,
    });
  });

  it('debe rechazar un token vencido con 403 ENLACE_DESCARGA_INVALIDO', () => {
    const { token } = service.generarToken(42, 10, 5, 60);

    // Avanzar reloj 61 segundos
    tiempoVirtual += 61;

    expect(() => service.verificarToken(token)).toThrow(DomainError);
    try {
      service.verificarToken(token);
    } catch (err) {
      const de = err as DomainError;
      expect(de.code).toBe(CodigoError.ENLACE_DESCARGA_INVALIDO);
      expect(de.getStatus()).toBe(403);
    }
  });

  it('debe rechazar un token con firma adulterada', () => {
    const { token } = service.generarToken(42, 10, 5);
    const [payloadB64] = token.split('.');
    const tokenAdulterado = `${payloadB64}.firmaInvalidaFalsa12345`;

    expect(() => service.verificarToken(tokenAdulterado)).toThrow(DomainError);
    try {
      service.verificarToken(tokenAdulterado);
    } catch (err) {
      const de = err as DomainError;
      expect(de.code).toBe(CodigoError.ENLACE_DESCARGA_INVALIDO);
      expect(de.getStatus()).toBe(403);
    }
  });

  it('debe rechazar tokens con payload modificado pero misma firma', () => {
    const { token } = service.generarToken(42, 10, 5);
    const [, signature] = token.split('.');

    // Crear payload adulterado
    const nuevoPayload = {
      adjuntoId: 999,
      empresaId: 10,
      usuarioId: 5,
      exp: tiempoVirtual + 300,
    };
    const nuevoPayloadB64 = Buffer.from(JSON.stringify(nuevoPayload)).toString(
      'base64url',
    );
    const tokenHack = `${nuevoPayloadB64}.${signature}`;

    expect(() => service.verificarToken(tokenHack)).toThrow(DomainError);
  });

  it('debe rechazar tokens con formato malformado o vacío', () => {
    expect(() => service.verificarToken('')).toThrow(DomainError);
    expect(() => service.verificarToken('sin_puntos')).toThrow(DomainError);
    expect(() => service.verificarToken('a.b.c')).toThrow(DomainError);
  });
});
