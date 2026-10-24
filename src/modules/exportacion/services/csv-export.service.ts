import { Injectable } from '@nestjs/common';
import { TextoSeguroUtil } from '../utils/texto-seguro.util';
import {
  RentabilidadCicloItemDto,
  CicloInfoReporteDto,
  IndicadoresRentabilidadDto,
} from '../../reportes/dto/rentabilidad-ciclo-response.dto';
import { CostoPorCategoriaDto } from '../../reportes/dto/costo-categoria-response.dto';
import { CostoPorActividadDto } from '../../reportes/dto/costo-actividad-response.dto';
import { MermaDesgloseDto } from '../../reportes/dto/merma-desglose-response.dto';
import { ComparativoParcelaItemDto } from '../../reportes/dto/comparativo-parcela-response.dto';
import { CuentasPorCobrarResponseDto } from '../../reportes/dto/cuentas-por-cobrar-response.dto';

/**
 * Servicio de exportación a CSV conforme a RFC 4180.
 *
 * Características (RN-066 / Hito 10B / ADR-013):
 * 1. Codificación UTF-8 con BOM (\uFEFF) para interoperabilidad automática en Excel.
 * 2. Delimitador coma (,), salto de línea estándar CRLF (\r\n).
 * 3. Envoltura con comillas dobles (") cuando un campo contenga coma, comillas o saltos de línea.
 * 4. Las comillas interiores se duplican (" -> "").
 * 5. Valores nulos representados como campos vacíos.
 * 6. Escape de inyección de fórmulas con TextoSeguroUtil en textos de origen humano.
 */
@Injectable()
export class CsvExportService {
  private readonly BOM = '\uFEFF';

  /**
   * Exporta el listado de rentabilidad a CSV.
   */
  exportarRentabilidad(items: RentabilidadCicloItemDto[]): Buffer {
    const filas: string[][] = [];

    filas.push([
      'ID Ciclo',
      'Ciclo',
      'Estado',
      'Fecha Inicio',
      'Fecha Fin',
      'Parcela',
      'Predio',
      'Variedad',
      'Cultivo',
      'Superficie (ha)',
      'Costo Total ($)',
      'Kg Cosechados',
      'Kg Merma Poscosecha',
      'Kg Merma Campo',
      'Kg Netos',
      'Kg Vendidos',
      'Kg Disponibles',
      'Ingresos ($)',
      'Total Facturado ($)',
      'Cobrado ($)',
      'Ganancia ($)',
      'Margen (%)',
      'ROI (%)',
      'Costo / kg ($)',
      'Precio Prom. / kg ($)',
      'Merma (%)',
      'Costo / ha ($)',
      'Rendimiento (kg/ha)',
      'Por Cobrar ($)',
    ]);

    for (const it of items) {
      filas.push(this.mapearFilaRentabilidad(it.ciclo, it.indicadores));
    }

    return this.compilarCsv(filas);
  }

  /**
   * Exporta el detalle completo de un ciclo (indicadores y las 3 tablas de desglose) a CSV con secciones.
   */
  exportarCicloDetalle(
    ciclo: RentabilidadCicloItemDto,
    costosCategoria: CostoPorCategoriaDto[],
    costosActividad: CostoPorActividadDto[],
    mermas: MermaDesgloseDto[],
  ): Buffer {
    const filas: string[][] = [];

    // Sección 1: Indicadores generales del ciclo
    filas.push(['=== RENTABILIDAD DEL CICLO ===']);
    filas.push([
      'ID Ciclo',
      'Ciclo',
      'Estado',
      'Fecha Inicio',
      'Fecha Fin',
      'Parcela',
      'Predio',
      'Variedad',
      'Cultivo',
      'Superficie (ha)',
      'Costo Total ($)',
      'Kg Cosechados',
      'Kg Merma Poscosecha',
      'Kg Merma Campo',
      'Kg Netos',
      'Kg Vendidos',
      'Kg Disponibles',
      'Ingresos ($)',
      'Total Facturado ($)',
      'Cobrado ($)',
      'Ganancia ($)',
      'Margen (%)',
      'ROI (%)',
      'Costo / kg ($)',
      'Precio Prom. / kg ($)',
      'Merma (%)',
      'Costo / ha ($)',
      'Rendimiento (kg/ha)',
      'Por Cobrar ($)',
    ]);
    filas.push(this.mapearFilaRentabilidad(ciclo.ciclo, ciclo.indicadores));
    filas.push([]);

    // Sección 2: Costos por Categoría
    filas.push(['=== COSTOS POR CATEGORIA ===']);
    filas.push([
      'ID Categoria Raiz',
      'Categoria Raiz',
      'Monto ($)',
      'Porcentaje (%)',
    ]);
    for (const cat of costosCategoria) {
      filas.push([
        String(cat.categoriaRaizId),
        TextoSeguroUtil.escapar(cat.categoriaRaiz),
        cat.monto,
        cat.porcentaje,
      ]);
    }
    filas.push([]);

    // Sección 3: Costos por Actividad
    filas.push(['=== COSTOS POR ACTIVIDAD ===']);
    filas.push([
      'ID Tipo Actividad',
      'Tipo de Actividad',
      'Numero de Actividades',
      'Horas Totales',
      'Costo Total ($)',
    ]);
    for (const act of costosActividad) {
      filas.push([
        String(act.tipoActividadId),
        TextoSeguroUtil.escapar(act.tipoActividad),
        String(act.numeroActividades),
        act.horasTotales,
        act.costoTotal,
      ]);
    }
    filas.push([]);

    // Sección 4: Desglose de Mermas
    filas.push(['=== DESGLOSE DE MERMAS ===']);
    filas.push(['Motivo de Merma', 'Etapa', 'Merma (kg)']);
    for (const merma of mermas) {
      filas.push([
        TextoSeguroUtil.escapar(merma.motivo),
        TextoSeguroUtil.escapar(merma.etapa),
        merma.kgMerma,
      ]);
    }

    return this.compilarCsv(filas);
  }

  /**
   * Exporta el comparativo cronológico de ciclos a CSV.
   */
  exportarComparativo(items: ComparativoParcelaItemDto[]): Buffer {
    const filas: string[][] = [];

    filas.push([
      'ID Ciclo',
      'Ciclo',
      'Estado',
      'Fecha Inicio',
      'Fecha Fin',
      'Parcela',
      'Predio',
      'Variedad',
      'Cultivo',
      'Superficie (ha)',
      'Costo Total ($)',
      'Ingresos ($)',
      'Ganancia ($)',
      'Margen (%)',
      'ROI (%)',
      'Costo / kg ($)',
      'Precio Prom. / kg ($)',
      'Margen Ciclo Ant. (%)',
      'Costo / kg Ciclo Ant. ($)',
      'Ganancia Ciclo Ant. ($)',
    ]);

    for (const it of items) {
      filas.push([
        String(it.ciclo.id),
        TextoSeguroUtil.escapar(it.ciclo.nombre),
        it.ciclo.estado,
        it.ciclo.fechaInicio,
        it.ciclo.fechaFin ?? '',
        TextoSeguroUtil.escapar(it.ciclo.parcela),
        TextoSeguroUtil.escapar(it.ciclo.predio),
        TextoSeguroUtil.escapar(it.ciclo.variedad),
        TextoSeguroUtil.escapar(it.ciclo.cultivo),
        it.indicadores.superficieSembrada,
        it.indicadores.costoTotal,
        it.indicadores.ingresos,
        it.indicadores.ganancia,
        it.indicadores.margenPct ?? '',
        it.indicadores.roiPct ?? '',
        it.indicadores.costoPorKg ?? '',
        it.indicadores.precioPromedioKg ?? '',
        it.margenPctCicloAnterior ?? '',
        it.costoPorKgCicloAnterior ?? '',
        it.gananciaCicloAnterior ?? '',
      ]);
    }

    return this.compilarCsv(filas);
  }

  /**
   * Exporta el reporte de cuentas por cobrar a CSV.
   */
  exportarCuentasPorCobrar(res: CuentasPorCobrarResponseDto): Buffer {
    const filas: string[][] = [];

    // Sección de Resumen
    filas.push(['=== RESUMEN DE CARTERA ===']);
    filas.push(['Concepto', 'Valor']);
    filas.push(['Total por Cobrar ($)', res.resumen.totalPorCobrar]);
    filas.push(['Total Vencido ($)', res.resumen.totalVencido]);
    filas.push(['Total Vigente ($)', res.resumen.totalVigente]);
    filas.push([
      'Clientes con Cartera Vencida',
      String(res.resumen.totalClientesMorosos),
    ]);
    filas.push([]);

    // Listado de facturas / ventas por cobrar
    filas.push(['=== CUENTAS POR COBRAR ===']);
    filas.push([
      'ID Venta',
      'Folio / Factura',
      'ID Cliente',
      'Cliente',
      'ID Ciclo',
      'Fecha Venta',
      'Fecha Vencimiento',
      'Monto Total ($)',
      'Monto Cobrado ($)',
      'Monto Pendiente ($)',
      'Dias Vencimiento',
      'Estado Cobro',
      'Vencida',
    ]);

    for (const it of res.data) {
      filas.push([
        String(it.ventaId),
        TextoSeguroUtil.escapar(it.folio),
        String(it.clienteId),
        TextoSeguroUtil.escapar(it.clienteNombre),
        String(it.cicloId),
        it.fechaVenta,
        it.fechaVencimiento ?? '',
        it.montoTotal,
        it.montoCobrado,
        it.montoPendiente,
        it.diasVencimiento !== null ? String(it.diasVencimiento) : '',
        it.estadoCobro,
        it.vencida ? 'SI' : 'NO',
      ]);
    }

    return this.compilarCsv(filas);
  }

  private mapearFilaRentabilidad(
    ciclo: CicloInfoReporteDto,
    ind: IndicadoresRentabilidadDto,
  ): string[] {
    return [
      String(ciclo.id),
      TextoSeguroUtil.escapar(ciclo.nombre),
      ciclo.estado,
      ciclo.fechaInicio,
      ciclo.fechaFin ?? '',
      TextoSeguroUtil.escapar(ciclo.parcela),
      TextoSeguroUtil.escapar(ciclo.predio),
      TextoSeguroUtil.escapar(ciclo.variedad),
      TextoSeguroUtil.escapar(ciclo.cultivo),
      ind.superficieSembrada,
      ind.costoTotal,
      ind.kgCosechados,
      ind.kgMermaPoscosecha,
      ind.kgMermaCampo,
      ind.kgNetos,
      ind.kgVendidos,
      ind.kgDisponibles,
      ind.ingresos,
      ind.totalFacturado,
      ind.cobrado,
      ind.ganancia,
      ind.margenPct ?? '',
      ind.roiPct ?? '',
      ind.costoPorKg ?? '',
      ind.precioPromedioKg ?? '',
      ind.mermaPct ?? '',
      ind.costoPorHectarea ?? '',
      ind.rendimientoKgHa ?? '',
      ind.porCobrar,
    ];
  }

  private compilarCsv(filas: string[][]): Buffer {
    const lineas = filas.map((fila) =>
      fila.map((campo) => this.escaparCampoRfc4180(campo)).join(','),
    );
    const contenido = this.BOM + lineas.join('\r\n');
    return Buffer.from(contenido, 'utf-8');
  }

  private escaparCampoRfc4180(val: string | null | undefined): string {
    if (val === null || val === undefined) {
      return '';
    }
    const str = String(val);
    if (
      str.includes(',') ||
      str.includes('"') ||
      str.includes('\n') ||
      str.includes('\r')
    ) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  }
}
