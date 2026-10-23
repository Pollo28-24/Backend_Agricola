import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import { LocalStorageService } from './local-storage.service';

describe('LocalStorageService', () => {
  let service: LocalStorageService;
  let tempStorageDir: string;

  beforeEach(() => {
    tempStorageDir = path.resolve(
      process.cwd(),
      'storage_uploads_test_' + Date.now(),
    );
    const mockConfigService = {
      get: jest.fn((key: string) => {
        if (key === 'STORAGE_LOCAL_PATH') return tempStorageDir;
        return null;
      }),
    } as unknown as ConfigService;

    service = new LocalStorageService(mockConfigService);
  });

  afterEach(async () => {
    if (fs.existsSync(tempStorageDir)) {
      await fs.promises.rm(tempStorageDir, { recursive: true, force: true });
    }
  });

  it('debe inicializar y asegurar que el directorio base exista', () => {
    expect(fs.existsSync(tempStorageDir)).toBe(true);
    expect(service.getBasePath()).toBe(tempStorageDir);
  });

  it('debe resolver rutas válidas con formato empresa/uuid.ext', () => {
    const clave = '1/f47ac10b-58cc-4372-a567-0e02b2c3d479.jpg';
    const ruta = service.resolverRutaSegura(clave);
    expect(ruta).toBe(path.resolve(tempStorageDir, clave));
  });

  it('debe rechazar claves con path traversal o formatos inválidos', () => {
    expect(() => service.resolverRutaSegura('../../etc/passwd')).toThrow();
    expect(() => service.resolverRutaSegura('1/../secret.txt')).toThrow();
    expect(() => service.resolverRutaSegura('invalid_key')).toThrow();
    expect(() => service.resolverRutaSegura('')).toThrow();
  });

  it('debe guardar un archivo, verificar existencia, leer stream y borrarlo', async () => {
    const clave = '1/a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d.png';
    const contenido = Buffer.from('contenido de prueba');

    await service.guardar(clave, contenido);
    expect(await service.existe(clave)).toBe(true);

    const stream = await service.leerStream(clave);
    expect(stream).toBeDefined();

    // Consumir stream
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(chunk as Buffer);
    }
    const resultado = Buffer.concat(chunks);
    expect(resultado.toString()).toBe('contenido de prueba');

    await service.borrar(clave);
    expect(await service.existe(clave)).toBe(false);
  });

  it('debe lanzar error al leerStream de un archivo inexistente', async () => {
    const clave = '1/b1c2d3e4-f5a6-7b8c-9d0e-1f2a3b4c5d6e.pdf';
    await expect(service.leerStream(clave)).rejects.toThrow(
      'Archivo no encontrado en disco',
    );
  });
});
