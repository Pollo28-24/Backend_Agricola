import {
  sanitizarValoresAuditoria,
  CAMPOS_EXCLUIDOS_AUDITORIA,
} from './audit.extension';

describe('Sanitización de Auditoría (RN-074)', () => {
  it('debe eliminar contrasenaHash y tokens de los objetos auditados', () => {
    const datosSensibles = {
      id: 1,
      nombre: 'Don Ramón',
      correo: 'ramon@correo.com',
      contrasenaHash: '$argon2id$v=19$m=65536,t=3,p=1$secretHash',
      tokenHash: 'hashed_refresh_token',
      jwt: 'header.payload.signature',
      activo: true,
    };

    const resultado = sanitizarValoresAuditoria(datosSensibles);

    expect(resultado).toBeDefined();
    expect(resultado?.contrasenaHash).toBeUndefined();
    expect(resultado?.tokenHash).toBeUndefined();
    expect(resultado?.jwt).toBeUndefined();
    expect(resultado?.id).toBe(1);
    expect(resultado?.nombre).toBe('Don Ramón');
    expect(resultado?.correo).toBe('ramon@correo.com');
  });

  it('debe convertir BigInt a string para almacenamiento JSON válido', () => {
    const datosConBigInt = {
      id: BigInt(9007199254740991),
      cantidad: 50,
    };

    const resultado = sanitizarValoresAuditoria(datosConBigInt);
    expect(resultado?.id).toBe('9007199254740991');
  });

  it('debe manejar valores nulos o indefinidos', () => {
    expect(sanitizarValoresAuditoria(null)).toBeNull();
    expect(sanitizarValoresAuditoria(undefined)).toBeNull();
  });
});
