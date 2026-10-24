/**
 * Utilidad de seguridad contra inyección de fórmulas en hojas de cálculo (CSV / Excel Injection / CSV Formula Injection).
 *
 * RN-066 / Hito 10B / ADR-013:
 * Si una celda de texto de origen humano comienza con =, +, -, @, tab (\t) o retorno de carro (\r),
 * incluso tras espacios iniciales en blanco, se le antepone una comilla simple (') para neutralizar
 * su interpretación como fórmula ejecutable en Excel, LibreOffice o Google Sheets.
 *
 * IMPORTANTE:
 * NUNCA debe aplicarse a columnas numéricas ni a importes formateados por el servidor
 * (e.g. un importe negativo "-123.45" debe preservarse numérico y sin comilla).
 */
export class TextoSeguroUtil {
  private static readonly PATRON_CARACTERES_FORMULA = /^\s*[=+\-@\t\r]/;

  /**
   * Neutraliza inyección de fórmulas en cadenas de texto de origen humano.
   * Si el texto es nulo o indefinido, retorna cadena vacía ''.
   */
  public static escapar(texto: string | null | undefined): string {
    if (texto === null || texto === undefined) {
      return '';
    }

    const str = String(texto);
    if (this.PATRON_CARACTERES_FORMULA.test(str)) {
      return `'${str}`;
    }

    return str;
  }
}
