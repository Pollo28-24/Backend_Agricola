export class SoftDeleteUtil {
  /**
   * Genera el valor anonimizado para liberar índices únicos durante la baja lógica (RN-041 / Sección 3.11).
   * Respeta la longitud máxima de la columna en base de datos recortando el valor base si es necesario.
   *
   * Formato: `${baseTruncada}#baja${idRegistro}`
   */
  public static generarValorBaja(
    valorOriginal: string,
    idRegistro: number,
    longitudMaxima: number,
  ): string {
    const sufijo = `#baja${idRegistro}`;

    if (longitudMaxima <= sufijo.length) {
      return sufijo.slice(0, longitudMaxima);
    }

    const longitudDisponible = longitudMaxima - sufijo.length;
    const baseTruncada = valorOriginal.slice(0, longitudDisponible);

    return `${baseTruncada}${sufijo}`;
  }
}
