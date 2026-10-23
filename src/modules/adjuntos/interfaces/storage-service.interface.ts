export const STORAGE_SERVICE = 'STORAGE_SERVICE';

export interface IStorageService {
  guardar(clave: string, buffer: Buffer): Promise<void>;
  leerStream(clave: string): Promise<NodeJS.ReadableStream>;
  borrar(clave: string): Promise<void>;
  existe(clave: string): Promise<boolean>;
  obtenerRutaAbsoluta?(clave: string): string;
}
