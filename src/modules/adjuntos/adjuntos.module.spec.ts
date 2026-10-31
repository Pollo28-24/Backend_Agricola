import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import { crearStorageService } from './adjuntos.module';
import { LocalStorageService } from './services/local-storage.service';
import { R2StorageService } from './services/r2-storage.service';

describe('AdjuntosModule - STORAGE_SERVICE factory', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = path.resolve(
      process.cwd(),
      'storage_uploads_module_test_' + Date.now(),
    );
  });

  afterEach(async () => {
    if (fs.existsSync(tempDir)) {
      await fs.promises.rm(tempDir, { recursive: true, force: true });
    }
  });

  it('debe instanciar LocalStorageService cuando STORAGE_DRIVER es local o no está definido', () => {
    const configLocal = {
      get: jest.fn((key: string) => {
        if (key === 'STORAGE_DRIVER') return 'local';
        if (key === 'STORAGE_LOCAL_PATH') return tempDir;
        return undefined;
      }),
    } as unknown as ConfigService;

    const storageLocal = crearStorageService(configLocal);
    expect(storageLocal).toBeInstanceOf(LocalStorageService);

    const configDefault = {
      get: jest.fn((key: string) => {
        if (key === 'STORAGE_LOCAL_PATH') return tempDir;
        return undefined;
      }),
    } as unknown as ConfigService;

    const storageDefault = crearStorageService(configDefault);
    expect(storageDefault).toBeInstanceOf(LocalStorageService);
  });

  it('debe instanciar R2StorageService cuando STORAGE_DRIVER es r2', () => {
    const configR2 = {
      get: jest.fn((key: string) => {
        const map: Record<string, string> = {
          STORAGE_DRIVER: 'r2',
          R2_BUCKET_NAME: 'bucket-test',
          R2_ENDPOINT: 'https://test.r2.cloudflarestorage.com',
          R2_ACCESS_KEY_ID: 'fake_key',
          R2_SECRET_ACCESS_KEY: 'fake_secret',
        };
        return map[key];
      }),
    } as unknown as ConfigService;

    const storageR2 = crearStorageService(configR2);
    expect(storageR2).toBeInstanceOf(R2StorageService);
  });
});
