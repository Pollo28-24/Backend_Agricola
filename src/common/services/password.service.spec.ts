import { PasswordService } from './password.service';

describe('PasswordService', () => {
  let service: PasswordService;

  beforeEach(() => {
    service = new PasswordService();
  });

  it('debe estar definido', () => {
    expect(service).toBeDefined();
  });

  it('debe generar un hash argon2 válido y no coincidir con texto plano (RN-040)', async () => {
    const plain = 'ContrasenaSegura2026!';
    const hash = await service.hash(plain);

    expect(hash).toBeDefined();
    expect(hash).not.toBe(plain);
    expect(hash.startsWith('$argon2id$')).toBe(true);
  });

  it('debe verificar correctamente contraseñas válidas', async () => {
    const plain = 'MiClaveSecreta123';
    const hash = await service.hash(plain);

    const esValida = await service.verify(hash, plain);
    expect(esValida).toBe(true);
  });

  it('debe rechazar contraseñas incorrectas', async () => {
    const plain = 'ClaveCorrecta';
    const hash = await service.hash(plain);

    const esValida = await service.verify(hash, 'ClaveIncorrecta');
    expect(esValida).toBe(false);
  });

  it('debe retornar false si el hash está corrupto o malformado', async () => {
    const esValida = await service.verify('invalid_hash_string', 'password');
    expect(esValida).toBe(false);
  });
});
