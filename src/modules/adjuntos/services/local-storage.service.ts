import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import { IStorageService } from '../interfaces/storage-service.interface';
import { CLAVE_ALMACENAMIENTO_REGEX } from '../constants/adjuntos.constants';

@Injectable()
export class LocalStorageService implements IStorageService {
  private readonly logger = new Logger(LocalStorageService.name);
  private readonly basePath: string;

  constructor(private readonly configService: ConfigService) {
    const configuredPath =
      this.configService.get<string>('STORAGE_LOCAL_PATH') ||
      './storage_uploads';
    this.basePath = path.resolve(process.cwd(), configuredPath);

    // Asegurar que el directorio base exista
    if (!fs.existsSync(this.basePath)) {
      fs.mkdirSync(this.basePath, { recursive: true });
    }
  }

  public getBasePath(): string {
    return this.basePath;
  }

  /**
   * Valida el formato de la clave y resuelve la ruta absoluta verificando
   * que no escape del directorio base (previene path traversal).
   */
  public resolverRutaSegura(clave: string): string {
    if (!clave || !CLAVE_ALMACENAMIENTO_REGEX.test(clave)) {
      throw new Error(`Clave de almacenamiento con formato inválido: ${clave}`);
    }

    const rutaResuelta = path.resolve(this.basePath, clave);
    const rutaBaseNormalizada = path.resolve(this.basePath);

    // Verificación de contención estricta
    if (
      !rutaResuelta.startsWith(rutaBaseNormalizada + path.sep) &&
      rutaResuelta !== rutaBaseNormalizada
    ) {
      throw new Error(
        `Intento de escape del directorio base detectado: ${clave}`,
      );
    }

    return rutaResuelta;
  }

  public async guardar(clave: string, buffer: Buffer): Promise<void> {
    const rutaArchivo = this.resolverRutaSegura(clave);
    const directorio = path.dirname(rutaArchivo);

    await fs.promises.mkdir(directorio, { recursive: true });
    await fs.promises.writeFile(rutaArchivo, buffer);
  }

  public async leerStream(clave: string): Promise<NodeJS.ReadableStream> {
    const rutaArchivo = this.resolverRutaSegura(clave);
    const existe = await this.existe(clave);
    if (!existe) {
      throw new Error(`Archivo no encontrado en disco: ${clave}`);
    }

    return fs.createReadStream(rutaArchivo);
  }

  public async borrar(clave: string): Promise<void> {
    try {
      const rutaArchivo = this.resolverRutaSegura(clave);
      if (fs.existsSync(rutaArchivo)) {
        await fs.promises.unlink(rutaArchivo);
      }
    } catch (err) {
      this.logger.warn(
        `Error al intentar borrar archivo ${clave}: ${(err as Error).message}`,
      );
    }
  }

  public async existe(clave: string): Promise<boolean> {
    try {
      const rutaArchivo = this.resolverRutaSegura(clave);
      await fs.promises.access(rutaArchivo, fs.constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  public obtenerRutaAbsoluta(clave: string): string {
    return this.resolverRutaSegura(clave);
  }
}
