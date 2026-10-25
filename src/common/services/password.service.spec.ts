import { PasswordService } from './password.service';

describe('PasswordService', () => {
  let service: PasswordService;

  beforeEach(() => {
    service = new PasswordService();
  });

  it('debe estar definido', () => {
    expect(service).toBeDefined();
  });

  it('debe generar un hash argon2id válido con m=19456, t=2, p=1 y no coincidir con texto plano (RN-040)', async () => {
    const plain = 'ContrasenaSegura2026!';
    const hash = await service.hash(plain);

    expect(hash).toBeDefined();
    expect(hash).not.toBe(plain);
    expect(hash.startsWith('$argon2id$')).toBe(true);
    expect(hash).toMatch(/\bm=19456\b/);
    expect(hash).toMatch(/\bt=2\b/);
    expect(hash).toMatch(/\bp=1\b/);
  });

  it('needsRehash debe retornar true solo cuando los parámetros son más débiles que los actuales y false cuando son iguales o más fuertes (nunca degradar)', async () => {
    const hashVigente = await service.hash('ClaveVigente123!');
    const hashMasFuerte =
      '$argon2id$v=19$m=65536,t=3,p=1$c2FsdHNhbHRzYWx0c2FsdA$aGFzaGhhc2hoYXNoaGFzaGhhc2g';
    const hashMasDebilMemoria =
      '$argon2id$v=19$m=4096,t=2,p=1$c2FsdHNhbHRzYWx0c2FsdA$aGFzaGhhc2hoYXNoaGFzaGhhc2g';
    const hashMasDebilTiempo =
      '$argon2id$v=19$m=19456,t=1,p=1$c2FsdHNhbHRzYWx0c2FsdA$aGFzaGhhc2hoYXNoaGFzaGhhc2g';
    const hashAlgoritmoDistinto =
      '$argon2i$v=19$m=65536,t=3,p=1$c2FsdHNhbHRzYWx0c2FsdA$aGFzaGhhc2hoYXNoaGFzaGhhc2g';

    expect(service.needsRehash(hashVigente)).toBe(false);
    expect(service.needsRehash(hashMasFuerte)).toBe(false);
    expect(service.needsRehash(hashMasDebilMemoria)).toBe(true);
    expect(service.needsRehash(hashMasDebilTiempo)).toBe(true);
    expect(service.needsRehash(hashAlgoritmoDistinto)).toBe(true);
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
