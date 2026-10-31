import { Prisma } from '@prisma/client';
import { sanitizeLog, CAMPOS_SENSIBLES } from './sanitizer.util';

describe('SanitizerUtil (RN-074)', () => {
  it('debe contener los campos sensibles clave', () => {
    expect(CAMPOS_SENSIBLES.has('password')).toBe(true);
    expect(CAMPOS_SENSIBLES.has('contrasena')).toBe(true);
    expect(CAMPOS_SENSIBLES.has('contrasenahash')).toBe(true);
    expect(CAMPOS_SENSIBLES.has('token')).toBe(true);
    expect(CAMPOS_SENSIBLES.has('refreshtoken')).toBe(true);
    expect(CAMPOS_SENSIBLES.has('secret')).toBe(true);
    expect(CAMPOS_SENSIBLES.has('jwt')).toBe(true);
    expect(CAMPOS_SENSIBLES.has('authorization')).toBe(true);
    expect(CAMPOS_SENSIBLES.has('cookie')).toBe(true);
    expect(CAMPOS_SENSIBLES.has('set-cookie')).toBe(true);
    expect(CAMPOS_SENSIBLES.has('apikey')).toBe(true);
    expect(CAMPOS_SENSIBLES.has('api-key')).toBe(true);
    expect(CAMPOS_SENSIBLES.has('x-api-key')).toBe(true);
    expect(CAMPOS_SENSIBLES.has('client-secret')).toBe(true);
    expect(CAMPOS_SENSIBLES.has('clientsecret')).toBe(true);
  });

  it('debe eliminar campos sensibles de un objeto simple', () => {
    const input = {
      id: 1,
      nombre: 'Juan',
      correo: 'juan@test.com',
      contrasenaHash: '$argon2id$v=19$m=65536...',
      password: 'secretPassword123',
      token: 'jwt.token.here',
      refreshToken: 'refresh.token.here',
      authorization: 'Bearer xyz',
    };

    const resultado = sanitizeLog(input);

    expect(resultado).toEqual({
      id: 1,
      nombre: 'Juan',
      correo: 'juan@test.com',
    });
    expect(resultado?.contrasenaHash).toBeUndefined();
    expect(resultado?.password).toBeUndefined();
    expect(resultado?.token).toBeUndefined();
    expect(resultado?.authorization).toBeUndefined();
  });

  it('debe sanitizar recursivamente objetos anidados', () => {
    const input = {
      usuario: {
        id: 10,
        nombre: 'Admin',
        contrasena: 'clave123',
      },
      metadata: {
        ip: '127.0.0.1',
        secret: 'api_secret_key',
      },
    };

    const resultado = sanitizeLog(input);

    expect(resultado).toEqual({
      usuario: {
        id: 10,
        nombre: 'Admin',
      },
      metadata: {
        ip: '127.0.0.1',
      },
    });
  });

  it('debe convertir BigInt a string para evitar errores de serialización JSON', () => {
    const input = {
      id: BigInt(9007199254740991),
      cantidad: 100,
    };

    const resultado = sanitizeLog(input);

    expect(resultado).toEqual({
      id: '9007199254740991',
      cantidad: 100,
    });
  });

  it('debe convertir Prisma.Decimal y Date a string sin descomponer {s,e,d} (C5)', () => {
    const fecha = new Date('2026-10-30T12:00:00.000Z');
    const input = {
      monto: new Prisma.Decimal('1234.56'),
      superficie: new Prisma.Decimal('10.50'),
      fechaCreacion: fecha,
      anidado: {
        precio: new Prisma.Decimal('99.90'),
        fecha: fecha,
      },
    };

    const resultado = sanitizeLog(input);

    expect(resultado).toEqual({
      monto: '1234.56',
      superficie: '10.5',
      fechaCreacion: '2026-10-30T12:00:00.000Z',
      anidado: {
        precio: '99.9',
        fecha: '2026-10-30T12:00:00.000Z',
      },
    });
  });

  it('debe retornar null para valores no válidos (null, undefined, primitivos)', () => {
    expect(sanitizeLog(null)).toBeNull();
    expect(sanitizeLog(undefined)).toBeNull();
    expect(sanitizeLog('string')).toBeNull();
    expect(sanitizeLog(123)).toBeNull();
    expect(sanitizeLog([])).toBeNull();
  });
});
