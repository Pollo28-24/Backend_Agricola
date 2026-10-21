import {
  ReporteFormatoUtil,
  ValorDecimalEntrada,
} from '../../../common/utils/reporte-formato.util';
import {
  CicloInfoReporteDto,
  IndicadoresRentabilidadDto,
  RentabilidadCicloItemDto,
} from '../dto/rentabilidad-ciclo-response.dto';
import { CostoPorCategoriaDto } from '../dto/costo-categoria-response.dto';
import { CostoPorActividadDto } from '../dto/costo-actividad-response.dto';
import { MermaDesgloseDto } from '../dto/merma-desglose-response.dto';
import { ComparativoParcelaItemDto } from '../dto/comparativo-parcela-response.dto';
import { EstadoCiclo } from '@prisma/client';

export interface CicloConRelaciones {
  id: number;
  nombre: string | null;
  estado: EstadoCiclo;
  fechaInicio: Date | string;
  fechaFin: Date | string | null;
  parcela: {
    nombre: string;
    predio: {
      nombre: string;
    };
  };
  variedad: {
    nombre: string;
    cultivo: {
      nombre: string;
    };
  };
}

export interface FilaRentabilidadCiclo {
  cicloId: number;
  empresaId: number;
  parcelaId: number;
  variedadId: number;
  estado: string;
  fechaInicio: Date | string;
  superficieSembrada: ValorDecimalEntrada;
  costoTotal: ValorDecimalEntrada;
  kgCosechados: ValorDecimalEntrada;
  kgMerma: ValorDecimalEntrada;
  kgMermaCampo: ValorDecimalEntrada;
  kgNetos: ValorDecimalEntrada;
  kgVendidos: ValorDecimalEntrada;
  kgDisponibles: ValorDecimalEntrada;
  ingresos: ValorDecimalEntrada;
  totalFacturado: ValorDecimalEntrada;
  cobrado: ValorDecimalEntrada;
  ganancia: ValorDecimalEntrada;
  margenPct: ValorDecimalEntrada;
  roiPct: ValorDecimalEntrada;
  costoPorKg: ValorDecimalEntrada;
  precioPromedioKg: ValorDecimalEntrada;
  mermaPct: ValorDecimalEntrada;
  costoPorHectarea: ValorDecimalEntrada;
  rendimientoKgHa: ValorDecimalEntrada;
  porCobrar: ValorDecimalEntrada;
}

export interface FilaComparativoParcela extends FilaRentabilidadCiclo {
  margenPctCicloAnterior?: ValorDecimalEntrada;
  costoPorKgCicloAnterior?: ValorDecimalEntrada;
  gananciaCicloAnterior?: ValorDecimalEntrada;
}

export interface FilaCostoCategoria {
  categoriaRaizId: number;
  categoriaRaiz: string;
  monto: ValorDecimalEntrada;
  porcentaje: ValorDecimalEntrada;
}

export interface FilaCostoActividad {
  tipoActividadId: number;
  tipoActividad: string;
  numeroActividades: bigint | number;
  horasTotales: ValorDecimalEntrada;
  costoTotal: ValorDecimalEntrada;
}

export interface FilaMermaDesglose {
  motivo: string;
  etapa: string;
  kgMerma: ValorDecimalEntrada;
}

export class IndicadoresMapper {
  public static toCicloInfo(ciclo: CicloConRelaciones): CicloInfoReporteDto {
    return {
      id: ciclo.id,
      nombre: ciclo.nombre,
      estado: ciclo.estado,
      fechaInicio:
        ciclo.fechaInicio instanceof Date
          ? ciclo.fechaInicio.toISOString().split('T')[0]
          : String(ciclo.fechaInicio).split('T')[0],
      fechaFin: ciclo.fechaFin
        ? ciclo.fechaFin instanceof Date
          ? ciclo.fechaFin.toISOString().split('T')[0]
          : String(ciclo.fechaFin).split('T')[0]
        : null,
      parcela: ciclo.parcela.nombre,
      predio: ciclo.parcela.predio.nombre,
      variedad: ciclo.variedad.nombre,
      cultivo: ciclo.variedad.cultivo.nombre,
    };
  }

  public static toIndicadoresRentabilidad(
    fila?: FilaRentabilidadCiclo | null,
    superficieFallback?: ValorDecimalEntrada,
  ): IndicadoresRentabilidadDto {
    const f = fila ?? ({} as Partial<FilaRentabilidadCiclo>);

    return {
      superficieSembrada:
        ReporteFormatoUtil.formatearSuperficie(
          f.superficieSembrada ?? superficieFallback,
        ) ?? '0.00',
      costoTotal: ReporteFormatoUtil.formatearImporte(f.costoTotal) ?? '0.00',
      kgCosechados: ReporteFormatoUtil.formatearKg(f.kgCosechados) ?? '0.000',
      // Renombre explícito de kgMerma a kgMermaPoscosecha (R3 / ADR-010)
      kgMermaPoscosecha: ReporteFormatoUtil.formatearKg(f.kgMerma) ?? '0.000',
      kgMermaCampo: ReporteFormatoUtil.formatearKg(f.kgMermaCampo) ?? '0.000',
      kgNetos: ReporteFormatoUtil.formatearKg(f.kgNetos) ?? '0.000',
      kgVendidos: ReporteFormatoUtil.formatearKg(f.kgVendidos) ?? '0.000',
      kgDisponibles: ReporteFormatoUtil.formatearKg(f.kgDisponibles) ?? '0.000',
      ingresos: ReporteFormatoUtil.formatearImporte(f.ingresos) ?? '0.00',
      totalFacturado:
        ReporteFormatoUtil.formatearImporte(f.totalFacturado) ?? '0.00',
      cobrado: ReporteFormatoUtil.formatearImporte(f.cobrado) ?? '0.00',
      ganancia: ReporteFormatoUtil.formatearImporte(f.ganancia) ?? '0.00',
      margenPct: ReporteFormatoUtil.formatearPorcentaje(f.margenPct),
      roiPct: ReporteFormatoUtil.formatearPorcentaje(f.roiPct),
      costoPorKg: ReporteFormatoUtil.formatearImporte(f.costoPorKg),
      precioPromedioKg: ReporteFormatoUtil.formatearImporte(f.precioPromedioKg),
      mermaPct: ReporteFormatoUtil.formatearPorcentaje(f.mermaPct),
      costoPorHectarea: ReporteFormatoUtil.formatearImporte(f.costoPorHectarea),
      rendimientoKgHa: ReporteFormatoUtil.formatearRendimiento(
        f.rendimientoKgHa,
      ),
      porCobrar: ReporteFormatoUtil.formatearImporte(f.porCobrar) ?? '0.00',
    };
  }

  public static toRentabilidadItem(
    ciclo: CicloConRelaciones,
    fila?: FilaRentabilidadCiclo | null,
  ): RentabilidadCicloItemDto {
    return {
      ciclo: this.toCicloInfo(ciclo),
      indicadores: this.toIndicadoresRentabilidad(fila),
    };
  }

  public static toCostoCategoriaList(
    filas: FilaCostoCategoria[],
  ): CostoPorCategoriaDto[] {
    return filas.map((fila) => ({
      categoriaRaizId: Number(fila.categoriaRaizId),
      categoriaRaiz: fila.categoriaRaiz,
      monto: ReporteFormatoUtil.formatearImporte(fila.monto) ?? '0.00',
      porcentaje:
        ReporteFormatoUtil.formatearPorcentaje(fila.porcentaje) ?? '0.00',
    }));
  }

  public static toCostoActividadList(
    filas: FilaCostoActividad[],
  ): CostoPorActividadDto[] {
    return filas.map((fila) => ({
      tipoActividadId: Number(fila.tipoActividadId),
      tipoActividad: fila.tipoActividad,
      numeroActividades: Number(fila.numeroActividades),
      horasTotales:
        ReporteFormatoUtil.formatearHoras(fila.horasTotales) ?? '0.00',
      costoTotal:
        ReporteFormatoUtil.formatearImporte(fila.costoTotal) ?? '0.00',
    }));
  }

  public static toMermaDesgloseList(
    filas: FilaMermaDesglose[],
  ): MermaDesgloseDto[] {
    return filas.map((fila) => ({
      motivo: fila.motivo,
      etapa: fila.etapa,
      kgMerma: ReporteFormatoUtil.formatearKg(fila.kgMerma) ?? '0.000',
    }));
  }

  public static toComparativoItem(
    ciclo: CicloConRelaciones,
    fila: FilaComparativoParcela,
  ): ComparativoParcelaItemDto {
    return {
      ciclo: this.toCicloInfo(ciclo),
      indicadores: this.toIndicadoresRentabilidad(fila),
      margenPctCicloAnterior: ReporteFormatoUtil.formatearPorcentaje(
        fila.margenPctCicloAnterior,
      ),
      costoPorKgCicloAnterior: ReporteFormatoUtil.formatearImporte(
        fila.costoPorKgCicloAnterior,
      ),
      gananciaCicloAnterior: ReporteFormatoUtil.formatearImporte(
        fila.gananciaCicloAnterior,
      ),
    };
  }
}
