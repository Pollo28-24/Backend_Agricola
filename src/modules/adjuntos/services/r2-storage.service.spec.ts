import { ConfigService } from '@nestjs/config';
import { Readable } from 'stream';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { R2StorageService } from './r2-storage.service';
import { DomainError } from '../../../common/errors/domain.error';
import { CodigoError } from '../../../common/errors/codigos-error.enum';

jest.mock('@aws-sdk/client-s3', () => {
  const actual =
    jest.requireActual<typeof import('@aws-sdk/client-s3')>(
      '@aws-sdk/client-s3',
    );
  return {
    ...actual,
    S3Client: jest.fn().mockImplementation(() => ({
      send: jest.fn(),
    })),
  };
});

describe('R2StorageService', () => {
  let service: R2StorageService;
  let mockSend: jest.Mock<Promise<unknown>, [unknown]>;
  const fakeConfig: Record<string, string> = {
    R2_BUCKET_NAME: 'bucket-agricola-privado',
    R2_ENDPOINT: 'https://fake-account.r2.cloudflarestorage.com',
    R2_ACCESS_KEY_ID: 'FAKE_KEY_ID_SECRET_12345',
    R2_SECRET_ACCESS_KEY: 'FAKE_SECRET_ACCESS_KEY_67890',
  };

  const claveValida = '1/f47ac10b-58cc-4372-a567-0e02b2c3d479.pdf';

  beforeEach(() => {
    jest.clearAllMocks();

    const mockConfigService = {
      get: jest.fn((key: string) => fakeConfig[key]),
    } as unknown as ConfigService;

    service = new R2StorageService(mockConfigService);
    const clientInstance = (S3Client as unknown as jest.Mock).mock.results[0]
      .value as { send: jest.Mock<Promise<unknown>, [unknown]> };
    mockSend = clientInstance.send;
  });

  it('debe configurar S3Client con region auto, endpoint, credenciales y checksums WHEN_REQUIRED', () => {
    expect(S3Client).toHaveBeenCalledWith({
      region: 'auto',
      endpoint: fakeConfig.R2_ENDPOINT,
      credentials: {
        accessKeyId: fakeConfig.R2_ACCESS_KEY_ID,
        secretAccessKey: fakeConfig.R2_SECRET_ACCESS_KEY,
      },
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    });
  });

  it('debe usar strings vacíos por defecto si ConfigService devuelve undefined', () => {
    const emptyConfig = {
      get: jest.fn(() => undefined),
    } as unknown as ConfigService;

    const emptyService = new R2StorageService(emptyConfig);
    expect(emptyService).toBeDefined();
  });

  describe('validación de clave contra path traversal', () => {
    it.each([
      [''],
      ['../../etc/passwd'],
      ['1/../secret.pdf'],
      ['/1/f47ac10b-58cc-4372-a567-0e02b2c3d479.pdf'],
      ['\\1\\f47ac10b-58cc-4372-a567-0e02b2c3d479.pdf'],
      ['clave_invalida.exe'],
    ])(
      'debe rechazar clave inválida "%s" con PETICION_INVALIDA',
      async (claveInvalida) => {
        await expect(
          service.guardar(claveInvalida, Buffer.from('test')),
        ).rejects.toMatchObject({
          code: CodigoError.PETICION_INVALIDA,
        });
        await expect(service.leerStream(claveInvalida)).rejects.toMatchObject({
          code: CodigoError.PETICION_INVALIDA,
        });
        await expect(service.borrar(claveInvalida)).rejects.toMatchObject({
          code: CodigoError.PETICION_INVALIDA,
        });
        await expect(service.existe(claveInvalida)).rejects.toMatchObject({
          code: CodigoError.PETICION_INVALIDA,
        });
        expect(mockSend).not.toHaveBeenCalled();
      },
    );
  });

  describe('guardar', () => {
    it('debe enviar PutObjectCommand con Bucket, Key y Body', async () => {
      mockSend.mockResolvedValueOnce({});
      const buffer = Buffer.from('%PDF-1.4 contenido');

      await service.guardar(claveValida, buffer);

      expect(mockSend).toHaveBeenCalledTimes(1);
      const cmd = mockSend.mock.calls[0][0] as PutObjectCommand;
      expect(cmd).toBeInstanceOf(PutObjectCommand);
      expect(cmd.input).toEqual({
        Bucket: fakeConfig.R2_BUCKET_NAME,
        Key: claveValida,
        Body: buffer,
      });
    });

    it('debe lanzar DomainError ERROR_INTERNO sin filtrar secretos si falla S3 en guardar', async () => {
      mockSend.mockRejectedValueOnce(
        new Error(
          `Connection failed to ${fakeConfig.R2_ENDPOINT} with key ${fakeConfig.R2_SECRET_ACCESS_KEY}`,
        ),
      );

      let capturado: DomainError | undefined;
      try {
        await service.guardar(claveValida, Buffer.from('datos'));
      } catch (err) {
        capturado = err as DomainError;
      }

      expect(capturado).toBeInstanceOf(DomainError);
      expect(capturado?.code).toBe(CodigoError.ERROR_INTERNO);
      expect(capturado?.message).not.toContain(fakeConfig.R2_SECRET_ACCESS_KEY);
      expect(capturado?.message).not.toContain(fakeConfig.R2_ACCESS_KEY_ID);
      expect(capturado?.message).not.toContain(fakeConfig.R2_ENDPOINT);
    });
  });

  describe('leerStream', () => {
    it('debe enviar GetObjectCommand y devolver el stream de Node', async () => {
      const fakeStream = Readable.from([Buffer.from('contenido binario')]);
      mockSend.mockResolvedValueOnce({ Body: fakeStream });

      const result = await service.leerStream(claveValida);

      expect(mockSend).toHaveBeenCalledTimes(1);
      const cmd = mockSend.mock.calls[0][0] as GetObjectCommand;
      expect(cmd).toBeInstanceOf(GetObjectCommand);
      expect(cmd.input).toEqual({
        Bucket: fakeConfig.R2_BUCKET_NAME,
        Key: claveValida,
      });
      expect(result).toBe(fakeStream);
    });

    it('debe mapear NoSuchKey, NotFound, 404 o Body vacío a RECURSO_NO_ENCONTRADO (404)', async () => {
      const noSuchKeyErr = Object.assign(new Error('NoSuchKey'), {
        name: 'NoSuchKey',
      });
      mockSend.mockRejectedValueOnce(noSuchKeyErr);
      await expect(service.leerStream(claveValida)).rejects.toMatchObject({
        code: CodigoError.RECURSO_NO_ENCONTRADO,
      });

      const http404Err = Object.assign(new Error('Not Found'), {
        $metadata: { httpStatusCode: 404 },
      });
      mockSend.mockRejectedValueOnce(http404Err);
      await expect(service.leerStream(claveValida)).rejects.toMatchObject({
        code: CodigoError.RECURSO_NO_ENCONTRADO,
      });

      mockSend.mockResolvedValueOnce({ Body: undefined });
      await expect(service.leerStream(claveValida)).rejects.toMatchObject({
        code: CodigoError.RECURSO_NO_ENCONTRADO,
      });
    });

    it('debe lanzar ERROR_INTERNO sin secretos ante otros errores del SDK en leerStream', async () => {
      mockSend.mockRejectedValueOnce(
        new Error(`Auth error for ${fakeConfig.R2_SECRET_ACCESS_KEY}`),
      );

      let capturado: DomainError | undefined;
      try {
        await service.leerStream(claveValida);
      } catch (err) {
        capturado = err as DomainError;
      }

      expect(capturado).toBeInstanceOf(DomainError);
      expect(capturado?.code).toBe(CodigoError.ERROR_INTERNO);
      expect(capturado?.message).not.toContain(fakeConfig.R2_SECRET_ACCESS_KEY);
    });
  });

  describe('borrar', () => {
    it('debe enviar DeleteObjectCommand con Bucket y Key', async () => {
      mockSend.mockResolvedValueOnce({});

      await service.borrar(claveValida);

      expect(mockSend).toHaveBeenCalledTimes(1);
      const cmd = mockSend.mock.calls[0][0] as DeleteObjectCommand;
      expect(cmd).toBeInstanceOf(DeleteObjectCommand);
      expect(cmd.input).toEqual({
        Bucket: fakeConfig.R2_BUCKET_NAME,
        Key: claveValida,
      });
    });

    it('debe ser idempotente cuando el objeto no existe (NoSuchKey / NotFound / 404)', async () => {
      const notFoundErr = Object.assign(new Error('NotFound'), {
        name: 'NotFound',
      });
      mockSend.mockRejectedValueOnce(notFoundErr);

      await expect(service.borrar(claveValida)).resolves.toBeUndefined();
    });

    it('debe lanzar ERROR_INTERNO sin secretos si falla S3 con otro error en borrar', async () => {
      mockSend.mockRejectedValueOnce(
        new Error(`Internal error on ${fakeConfig.R2_ENDPOINT}`),
      );

      let capturado: DomainError | undefined;
      try {
        await service.borrar(claveValida);
      } catch (err) {
        capturado = err as DomainError;
      }

      expect(capturado).toBeInstanceOf(DomainError);
      expect(capturado?.code).toBe(CodigoError.ERROR_INTERNO);
      expect(capturado?.message).not.toContain(fakeConfig.R2_ENDPOINT);
    });
  });

  describe('existe', () => {
    it('debe enviar HeadObjectCommand y retornar true si existe', async () => {
      mockSend.mockResolvedValueOnce({});

      const existe = await service.existe(claveValida);

      expect(existe).toBe(true);
      expect(mockSend).toHaveBeenCalledTimes(1);
      const cmd = mockSend.mock.calls[0][0] as HeadObjectCommand;
      expect(cmd).toBeInstanceOf(HeadObjectCommand);
      expect(cmd.input).toEqual({
        Bucket: fakeConfig.R2_BUCKET_NAME,
        Key: claveValida,
      });
    });

    it('debe retornar false si HeadObjectCommand responde NotFound, NoSuchKey o 404', async () => {
      const notFoundErr = Object.assign(new Error('NotFound'), {
        name: 'NotFound',
      });
      mockSend.mockRejectedValueOnce(notFoundErr);
      expect(await service.existe(claveValida)).toBe(false);

      const status404Err = { $metadata: { httpStatusCode: 404 } };
      mockSend.mockRejectedValueOnce(status404Err);
      expect(await service.existe(claveValida)).toBe(false);
    });

    it('debe lanzar ERROR_INTERNO sin secretos ante errores distintos de 404 en existe', async () => {
      mockSend.mockRejectedValueOnce('string error');

      let capturado: DomainError | undefined;
      try {
        await service.existe(claveValida);
      } catch (err) {
        capturado = err as DomainError;
      }

      expect(capturado).toBeInstanceOf(DomainError);
      expect(capturado?.code).toBe(CodigoError.ERROR_INTERNO);
      expect(capturado?.message).not.toContain(fakeConfig.R2_SECRET_ACCESS_KEY);
    });
  });
});
