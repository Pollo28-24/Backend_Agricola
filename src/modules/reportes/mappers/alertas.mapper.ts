import { AlertaItemDto, ResumenAlertasDto } from '../dto/alertas-response.dto';
import { SeveridadAlerta } from '../constants/alertas.constants';

const SEVERIDAD_PESO: Record<SeveridadAlerta, number> = {
  [SeveridadAlerta.ALTA]: 1,
  [SeveridadAlerta.MEDIA]: 2,
  [SeveridadAlerta.BAJA]: 3,
  [SeveridadAlerta.INFORMATIVA]: 4,
};

export class AlertasMapper {
  /**
   * Ordena las alertas por severidad canónica y desempates.
   */
  public static ordenarAlertas(alertas: AlertaItemDto[]): AlertaItemDto[] {
    return [...alertas].sort((a, b) => {
      const pesoA = SEVERIDAD_PESO[a.severidad] ?? 99;
      const pesoB = SEVERIDAD_PESO[b.severidad] ?? 99;
      if (pesoA !== pesoB) {
        return pesoA - pesoB;
      }
      if (a.cicloId !== null && b.cicloId !== null && a.cicloId !== b.cicloId) {
        return a.cicloId - b.cicloId;
      }
      if (a.ventaId !== null && b.ventaId !== null && a.ventaId !== b.ventaId) {
        return a.ventaId - b.ventaId;
      }
      return a.codigo.localeCompare(b.codigo);
    });
  }

  /**
   * Genera el resumen cuantitativo de las alertas clasificadas.
   */
  public static toResumenDto(alertas: AlertaItemDto[]): ResumenAlertasDto {
    let totalAltas = 0;
    let totalMedias = 0;
    let totalBajas = 0;
    let totalInformativas = 0;

    for (const a of alertas) {
      switch (a.severidad) {
        case SeveridadAlerta.ALTA:
          totalAltas++;
          break;
        case SeveridadAlerta.MEDIA:
          totalMedias++;
          break;
        case SeveridadAlerta.BAJA:
          totalBajas++;
          break;
        case SeveridadAlerta.INFORMATIVA:
          totalInformativas++;
          break;
      }
    }

    return {
      totalAltas,
      totalMedias,
      totalBajas,
      totalInformativas,
      total: alertas.length,
    };
  }
}
