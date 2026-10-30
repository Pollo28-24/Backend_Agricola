import { permitirRecuperacionClavePublica } from './database-security.config';

describe('permitirRecuperacionClavePublica', () => {
  const envOriginal = process.env;

  beforeEach(() => {
    process.env = { ...envOriginal };
  });

  afterAll(() => {
    process.env = envOriginal;
  });

  it('devuelve false en produccion aunque la variable este en true (fail-closed)', () => {
    process.env.NODE_ENV = 'production';
    process.env.DB_ALLOW_PUBLIC_KEY_RETRIEVAL = 'true';
    expect(permitirRecuperacionClavePublica()).toBe(false);
  });

  it('devuelve true en development cuando la variable esta en true', () => {
    process.env.NODE_ENV = 'development';
    process.env.DB_ALLOW_PUBLIC_KEY_RETRIEVAL = 'true';
    expect(permitirRecuperacionClavePublica()).toBe(true);
  });

  it('devuelve true en test cuando la variable esta en true', () => {
    process.env.NODE_ENV = 'test';
    process.env.DB_ALLOW_PUBLIC_KEY_RETRIEVAL = 'true';
    expect(permitirRecuperacionClavePublica()).toBe(true);
  });

  it('devuelve false cuando la variable no esta definida o esta en false', () => {
    process.env.NODE_ENV = 'development';
    delete process.env.DB_ALLOW_PUBLIC_KEY_RETRIEVAL;
    expect(permitirRecuperacionClavePublica()).toBe(false);

    process.env.DB_ALLOW_PUBLIC_KEY_RETRIEVAL = 'false';
    expect(permitirRecuperacionClavePublica()).toBe(false);
  });
});
