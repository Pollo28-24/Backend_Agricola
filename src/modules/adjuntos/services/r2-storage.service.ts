import { Injectable, Logger, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { IStorageService } from '../interfaces/storage-service.interface';
import { CLAVE_ALMACENAMIENTO_REGEX } from '../constants/adjuntos.constants';
import { DomainError } from '../../../common/errors/domain.error';
import { CodigoError } from '../../../common/errors/codigos-error.enum';

@Injectable()
export class R2StorageService implements IStorageService {
  private readonly logger = new Logger(R2StorageService.name);
  private readonly s3Client: S3Client;
  private readonly bucketName: string;

  constructor(private readonly configService: ConfigService) {
    this.bucketName = this.configService.get<string>('R2_BUCKET_NAME') ?? '';
    const endpoint = this.configService.get<string>('R2_ENDPOINT') ?? '';
    const accessKeyId =
      this.configService.get<string>('R2_ACCESS_KEY_ID') ?? '';
    const secretAccessKey =
      this.configService.get<string>('R2_SECRET_ACCESS_KEY') ?? '';

    this.s3Client = new S3Client({
      region: 'auto',
      endpoint,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    });
  }

  /**
   * Valida que la clave de almacenamiento cumpla el formato estricto
   * <empresaId>/<uuid>.<ext> sin secuencias de path traversal ni barra inicial.
   */
  public validarClaveSegura(clave: string): string {
    if (
      !clave ||
      clave.startsWith('/') ||
      clave.startsWith('\\') ||
      clave.includes('..') ||
      !CLAVE_ALMACENAMIENTO_REGEX.test(clave)
    ) {
      throw new DomainError(
        CodigoError.PETICION_INVALIDA,
        `Clave de almacenamiento con formato inválido: ${clave}`,
        HttpStatus.BAD_REQUEST,
      );
    }

    return clave;
  }

  public async guardar(clave: string, buffer: Buffer): Promise<void> {
    const claveSegura = this.validarClaveSegura(clave);

    try {
      await this.s3Client.send(
        new PutObjectCommand({
          Bucket: this.bucketName,
          Key: claveSegura,
          Body: buffer,
        }),
      );
    } catch {
      this.logger.error(
        `Error al almacenar objeto en Cloudflare R2 para la clave ${claveSegura}`,
      );
      throw new DomainError(
        CodigoError.ERROR_INTERNO,
        'Error al almacenar el archivo en el servicio de almacenamiento',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  public async leerStream(clave: string): Promise<NodeJS.ReadableStream> {
    const claveSegura = this.validarClaveSegura(clave);

    try {
      const response = await this.s3Client.send(
        new GetObjectCommand({
          Bucket: this.bucketName,
          Key: claveSegura,
        }),
      );

      if (!response.Body) {
        throw new DomainError(
          CodigoError.RECURSO_NO_ENCONTRADO,
          'El archivo no se encuentra disponible en el almacenamiento del servidor',
          HttpStatus.NOT_FOUND,
        );
      }

      return response.Body as unknown as NodeJS.ReadableStream;
    } catch (err) {
      if (err instanceof DomainError) {
        throw err;
      }
      if (this.esErrorNoEncontrado(err)) {
        throw new DomainError(
          CodigoError.RECURSO_NO_ENCONTRADO,
          'El archivo no se encuentra disponible en el almacenamiento del servidor',
          HttpStatus.NOT_FOUND,
        );
      }

      this.logger.error(
        `Error al leer flujo desde Cloudflare R2 para la clave ${claveSegura}`,
      );
      throw new DomainError(
        CodigoError.ERROR_INTERNO,
        'Error al leer el archivo desde el servicio de almacenamiento',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  public async borrar(clave: string): Promise<void> {
    const claveSegura = this.validarClaveSegura(clave);

    try {
      await this.s3Client.send(
        new DeleteObjectCommand({
          Bucket: this.bucketName,
          Key: claveSegura,
        }),
      );
    } catch (err) {
      if (this.esErrorNoEncontrado(err)) {
        return;
      }

      this.logger.warn(
        `Error al eliminar objeto en Cloudflare R2 para la clave ${claveSegura}`,
      );
      throw new DomainError(
        CodigoError.ERROR_INTERNO,
        'Error al eliminar el archivo del servicio de almacenamiento',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  public async existe(clave: string): Promise<boolean> {
    const claveSegura = this.validarClaveSegura(clave);

    try {
      await this.s3Client.send(
        new HeadObjectCommand({
          Bucket: this.bucketName,
          Key: claveSegura,
        }),
      );
      return true;
    } catch (err) {
      if (this.esErrorNoEncontrado(err)) {
        return false;
      }

      this.logger.error(
        `Error al verificar existencia en Cloudflare R2 para la clave ${claveSegura}`,
      );
      throw new DomainError(
        CodigoError.ERROR_INTERNO,
        'Error al verificar la existencia del archivo en el servicio de almacenamiento',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  private esErrorNoEncontrado(err: unknown): boolean {
    if (typeof err !== 'object' || err === null) {
      return false;
    }
    const candidate = err as {
      name?: string;
      $metadata?: { httpStatusCode?: number };
    };
    return (
      candidate.name === 'NoSuchKey' ||
      candidate.name === 'NotFound' ||
      candidate.$metadata?.httpStatusCode === 404
    );
  }
}
