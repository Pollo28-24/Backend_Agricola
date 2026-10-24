import { Injectable } from '@nestjs/common';
import { Workbook, Worksheet, Cell } from 'exceljs';
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
 * Servicio de exportación a formato Microsoft Excel (.xlsx) con exceljs.
 *
 * Principios de diseño (RN-066 / Hito 10B / ADR-013):
 * 1. Columnas numéricas (importes, porcentajes, kg) se escriben como tipos numéricos
 *    con formato explícito de visualización (#,##0.00 o #,##0.000).
 *    Excel almacena números con precisión IEEE 754 de 64 bits (doble precisión).
 *    NO se calculan fórmulas ni totales en JavaScript para evitar divergencias con BD.
 * 2. Valores nulos resultan en celdas vacías (cell.value = null).
 * 3. Columnas de texto de origen humano son neutralizadas contra inyección de fórmulas
 *    mediante TextoSeguroUtil. NUNCA se aplica a importes ni columnas numéricas.
 */
@Injectable()
export class ExcelExportService {
  private readonly FMT_MONEDA = '#,##0.00';
  private readonly FMT_PORCENTAJE = '0.00%';
  private readonly FMT_NUMERO_2DEC = '#,##0.00';
  private readonly FMT_KG = '#,##0.000';

  /**
   * Genera el libro Excel para el listado paginado de rentabilidad de ciclos.
   */
  async exportarRentabilidad(
    items: RentabilidadCicloItemDto[],
  ): Promise<Buffer> {
    const workbook = new Workbook();
    workbook.creator = 'Rentabilidad Agrícola';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Rentabilidad');
    this.configurarColumnasRentabilidad(sheet);

    for (const item of items) {
      this.agregarFilaRentabilidad(sheet, item.ciclo, item.indicadores);
    }

    this.estilizarEncabezados(sheet);
    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  /**
   * Genera el libro Excel para el detalle de un ciclo con cuatro hojas separadas:
   * 1. Rentabilidad (indicadores del ciclo)
   * 2. Costos por Categoría
   * 3. Costos por Actividad
   * 4. Desglose de Mermas
   */
  async exportarCicloDetalle(
    ciclo: RentabilidadCicloItemDto,
    costosCategoria: CostoPorCategoriaDto[],
    costosActividad: CostoPorActividadDto[],
    mermas: MermaDesgloseDto[],
  ): Promise<Buffer> {
    const workbook = new Workbook();
    workbook.creator = 'Rentabilidad Agrícola';
    workbook.created = new Date();

    // Hoja 1: Rentabilidad
    const sheetRentabilidad = workbook.addWorksheet('Rentabilidad');
    this.configurarColumnasRentabilidad(sheetRentabilidad);
    this.agregarFilaRentabilidad(
      sheetRentabilidad,
      ciclo.ciclo,
      ciclo.indicadores,
    );
    this.estilizarEncabezados(sheetRentabilidad);

    // Hoja 2: Costos por Categoría
    const sheetCategorias = workbook.addWorksheet('Costos por Categoría');
    sheetCategorias.columns = [
      { header: 'ID Categoría Raíz', key: 'categoriaRaizId', width: 18 },
      { header: 'Categoría Raíz', key: 'categoriaRaiz', width: 30 },
      { header: 'Monto ($)', key: 'monto', width: 18 },
      { header: 'Porcentaje (%)', key: 'porcentaje', width: 16 },
    ];
    for (const cat of costosCategoria) {
      const row = sheetCategorias.addRow([]);
      row.getCell(1).value = cat.categoriaRaizId;
      this.setCellText(row.getCell(2), cat.categoriaRaiz);
      this.setCellNumber(row.getCell(3), cat.monto, this.FMT_MONEDA);
      this.setCellNumber(row.getCell(4), cat.porcentaje, this.FMT_NUMERO_2DEC);
    }
    this.estilizarEncabezados(sheetCategorias);

    // Hoja 3: Costos por Actividad
    const sheetActividades = workbook.addWorksheet('Costos por Actividad');
    sheetActividades.columns = [
      { header: 'ID Tipo Actividad', key: 'tipoActividadId', width: 18 },
      { header: 'Tipo de Actividad', key: 'tipoActividad', width: 30 },
      { header: 'Número de Actividades', key: 'numeroActividades', width: 22 },
      { header: 'Horas Totales', key: 'horasTotales', width: 18 },
      { header: 'Costo Total ($)', key: 'costoTotal', width: 18 },
    ];
    for (const act of costosActividad) {
      const row = sheetActividades.addRow([]);
      row.getCell(1).value = act.tipoActividadId;
      this.setCellText(row.getCell(2), act.tipoActividad);
      row.getCell(3).value = act.numeroActividades;
      this.setCellNumber(
        row.getCell(4),
        act.horasTotales,
        this.FMT_NUMERO_2DEC,
      );
      this.setCellNumber(row.getCell(5), act.costoTotal, this.FMT_MONEDA);
    }
    this.estilizarEncabezados(sheetActividades);

    // Hoja 4: Desglose de Mermas
    const sheetMermas = workbook.addWorksheet('Desglose de Mermas');
    sheetMermas.columns = [
      { header: 'Motivo de Merma', key: 'motivo', width: 25 },
      { header: 'Etapa', key: 'etapa', width: 18 },
      { header: 'Merma (kg)', key: 'kgMerma', width: 18 },
    ];
    for (const merma of mermas) {
      const row = sheetMermas.addRow([]);
      this.setCellText(row.getCell(1), merma.motivo);
      this.setCellText(row.getCell(2), merma.etapa);
      this.setCellNumber(row.getCell(3), merma.kgMerma, this.FMT_KG);
    }
    this.estilizarEncabezados(sheetMermas);

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  /**
   * Genera el libro Excel para el reporte comparativo cronológico de ciclos en una parcela.
   */
  async exportarComparativo(
    items: ComparativoParcelaItemDto[],
  ): Promise<Buffer> {
    const workbook = new Workbook();
    workbook.creator = 'Rentabilidad Agrícola';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Comparativo');
    sheet.columns = [
      { header: 'ID Ciclo', key: 'id', width: 12 },
      { header: 'Ciclo', key: 'nombre', width: 25 },
      { header: 'Estado', key: 'estado', width: 15 },
      { header: 'Fecha Inicio', key: 'fechaInicio', width: 15 },
      { header: 'Fecha Fin', key: 'fechaFin', width: 15 },
      { header: 'Parcela', key: 'parcela', width: 20 },
      { header: 'Predio', key: 'predio', width: 20 },
      { header: 'Variedad', key: 'variedad', width: 20 },
      { header: 'Cultivo', key: 'cultivo', width: 20 },
      { header: 'Superficie (ha)', key: 'superficieSembrada', width: 16 },
      { header: 'Costo Total ($)', key: 'costoTotal', width: 16 },
      { header: 'Ingresos ($)', key: 'ingresos', width: 16 },
      { header: 'Ganancia ($)', key: 'ganancia', width: 16 },
      { header: 'Margen (%)', key: 'margenPct', width: 14 },
      { header: 'ROI (%)', key: 'roiPct', width: 14 },
      { header: 'Costo / kg ($)', key: 'costoPorKg', width: 15 },
      { header: 'Precio Prom. / kg ($)', key: 'precioPromedioKg', width: 20 },
      { header: 'Margen Ciclo Ant. (%)', key: 'margenPctAnt', width: 22 },
      { header: 'Costo/kg Ciclo Ant. ($)', key: 'costoKgAnt', width: 22 },
      { header: 'Ganancia Ciclo Ant. ($)', key: 'gananciaAnt', width: 22 },
    ];

    for (const item of items) {
      const row = sheet.addRow([]);
      row.getCell(1).value = item.ciclo.id;
      this.setCellText(row.getCell(2), item.ciclo.nombre);
      row.getCell(3).value = item.ciclo.estado;
      row.getCell(4).value = item.ciclo.fechaInicio;
      row.getCell(5).value = item.ciclo.fechaFin ?? '';
      this.setCellText(row.getCell(6), item.ciclo.parcela);
      this.setCellText(row.getCell(7), item.ciclo.predio);
      this.setCellText(row.getCell(8), item.ciclo.variedad);
      this.setCellText(row.getCell(9), item.ciclo.cultivo);

      this.setCellNumber(
        row.getCell(10),
        item.indicadores.superficieSembrada,
        this.FMT_NUMERO_2DEC,
      );
      this.setCellNumber(
        row.getCell(11),
        item.indicadores.costoTotal,
        this.FMT_MONEDA,
      );
      this.setCellNumber(
        row.getCell(12),
        item.indicadores.ingresos,
        this.FMT_MONEDA,
      );
      this.setCellNumber(
        row.getCell(13),
        item.indicadores.ganancia,
        this.FMT_MONEDA,
      );
      this.setCellNumber(
        row.getCell(14),
        item.indicadores.margenPct,
        this.FMT_NUMERO_2DEC,
      );
      this.setCellNumber(
        row.getCell(15),
        item.indicadores.roiPct,
        this.FMT_NUMERO_2DEC,
      );
      this.setCellNumber(
        row.getCell(16),
        item.indicadores.costoPorKg,
        this.FMT_MONEDA,
      );
      this.setCellNumber(
        row.getCell(17),
        item.indicadores.precioPromedioKg,
        this.FMT_MONEDA,
      );

      this.setCellNumber(
        row.getCell(18),
        item.margenPctCicloAnterior,
        this.FMT_NUMERO_2DEC,
      );
      this.setCellNumber(
        row.getCell(19),
        item.costoPorKgCicloAnterior,
        this.FMT_MONEDA,
      );
      this.setCellNumber(
        row.getCell(20),
        item.gananciaCicloAnterior,
        this.FMT_MONEDA,
      );
    }

    this.estilizarEncabezados(sheet);
    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  /**
   * Genera el libro Excel para el reporte de cuentas por cobrar.
   */
  async exportarCuentasPorCobrar(
    res: CuentasPorCobrarResponseDto,
  ): Promise<Buffer> {
    const workbook = new Workbook();
    workbook.creator = 'Rentabilidad Agrícola';
    workbook.created = new Date();

    // Hoja 1: Resumen de Cartera
    const sheetResumen = workbook.addWorksheet('Resumen de Cartera');
    sheetResumen.columns = [
      { header: 'Concepto', key: 'concepto', width: 35 },
      { header: 'Monto ($) / Valor', key: 'valor', width: 25 },
    ];
    const r1 = sheetResumen.addRow(['Total por Cobrar']);
    this.setCellNumber(
      r1.getCell(2),
      res.resumen.totalPorCobrar,
      this.FMT_MONEDA,
    );

    const r2 = sheetResumen.addRow(['Total Vencido']);
    this.setCellNumber(
      r2.getCell(2),
      res.resumen.totalVencido,
      this.FMT_MONEDA,
    );

    const r3 = sheetResumen.addRow(['Total Vigente']);
    this.setCellNumber(
      r3.getCell(2),
      res.resumen.totalVigente,
      this.FMT_MONEDA,
    );

    const r4 = sheetResumen.addRow(['Clientes con Cartera Vencida']);
    r4.getCell(2).value = res.resumen.totalClientesMorosos;

    this.estilizarEncabezados(sheetResumen);

    // Hoja 2: Cuentas por Cobrar Detalle
    const sheet = workbook.addWorksheet('Cuentas por Cobrar');
    sheet.columns = [
      { header: 'ID Venta', key: 'ventaId', width: 12 },
      { header: 'Folio / Factura', key: 'folio', width: 18 },
      { header: 'ID Cliente', key: 'clienteId', width: 12 },
      { header: 'Cliente', key: 'clienteNombre', width: 30 },
      { header: 'ID Ciclo', key: 'cicloId', width: 12 },
      { header: 'Fecha Venta', key: 'fechaVenta', width: 15 },
      { header: 'Fecha Vencimiento', key: 'fechaVencimiento', width: 18 },
      { header: 'Monto Total ($)', key: 'montoTotal', width: 18 },
      { header: 'Monto Cobrado ($)', key: 'montoCobrado', width: 18 },
      { header: 'Monto Pendiente ($)', key: 'montoPendiente', width: 20 },
      { header: 'Días Vencimiento', key: 'diasVencimiento', width: 18 },
      { header: 'Estado Cobro', key: 'estadoCobro', width: 16 },
      { header: '¿Vencida?', key: 'vencida', width: 12 },
    ];

    for (const item of res.data) {
      const row = sheet.addRow([]);
      row.getCell(1).value = item.ventaId;
      this.setCellText(row.getCell(2), item.folio);
      row.getCell(3).value = item.clienteId;
      this.setCellText(row.getCell(4), item.clienteNombre);
      row.getCell(5).value = item.cicloId;
      row.getCell(6).value = item.fechaVenta;
      row.getCell(7).value = item.fechaVencimiento ?? '';
      this.setCellNumber(row.getCell(8), item.montoTotal, this.FMT_MONEDA);
      this.setCellNumber(row.getCell(9), item.montoCobrado, this.FMT_MONEDA);
      this.setCellNumber(row.getCell(10), item.montoPendiente, this.FMT_MONEDA);
      row.getCell(11).value = item.diasVencimiento;
      row.getCell(12).value = item.estadoCobro;
      row.getCell(13).value = item.vencida ? 'SÍ' : 'NO';
    }

    this.estilizarEncabezados(sheet);
    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  private configurarColumnasRentabilidad(sheet: Worksheet): void {
    sheet.columns = [
      { header: 'ID Ciclo', key: 'id', width: 12 },
      { header: 'Ciclo', key: 'nombre', width: 25 },
      { header: 'Estado', key: 'estado', width: 15 },
      { header: 'Fecha Inicio', key: 'fechaInicio', width: 15 },
      { header: 'Fecha Fin', key: 'fechaFin', width: 15 },
      { header: 'Parcela', key: 'parcela', width: 20 },
      { header: 'Predio', key: 'predio', width: 20 },
      { header: 'Variedad', key: 'variedad', width: 20 },
      { header: 'Cultivo', key: 'cultivo', width: 20 },
      { header: 'Superficie (ha)', key: 'superficieSembrada', width: 16 },
      { header: 'Costo Total ($)', key: 'costoTotal', width: 16 },
      { header: 'Kg Cosechados', key: 'kgCosechados', width: 16 },
      { header: 'Kg Merma Poscosecha', key: 'kgMermaPoscosecha', width: 20 },
      { header: 'Kg Merma Campo', key: 'kgMermaCampo', width: 18 },
      { header: 'Kg Netos', key: 'kgNetos', width: 16 },
      { header: 'Kg Vendidos', key: 'kgVendidos', width: 16 },
      { header: 'Kg Disponibles', key: 'kgDisponibles', width: 16 },
      { header: 'Ingresos ($)', key: 'ingresos', width: 16 },
      { header: 'Total Facturado ($)', key: 'totalFacturado', width: 18 },
      { header: 'Cobrado ($)', key: 'cobrado', width: 16 },
      { header: 'Ganancia ($)', key: 'ganancia', width: 16 },
      { header: 'Margen (%)', key: 'margenPct', width: 14 },
      { header: 'ROI (%)', key: 'roiPct', width: 14 },
      { header: 'Costo / kg ($)', key: 'costoPorKg', width: 15 },
      { header: 'Precio Prom. / kg ($)', key: 'precioPromedioKg', width: 20 },
      { header: 'Merma (%)', key: 'mermaPct', width: 14 },
      { header: 'Costo / ha ($)', key: 'costoPorHectarea', width: 16 },
      { header: 'Rendimiento (kg/ha)', key: 'rendimientoKgHa', width: 20 },
      { header: 'Por Cobrar ($)', key: 'porCobrar', width: 16 },
    ];
  }

  private agregarFilaRentabilidad(
    sheet: Worksheet,
    ciclo: CicloInfoReporteDto,
    ind: IndicadoresRentabilidadDto,
  ): void {
    const row = sheet.addRow([]);
    row.getCell(1).value = ciclo.id;
    this.setCellText(row.getCell(2), ciclo.nombre);
    row.getCell(3).value = ciclo.estado;
    row.getCell(4).value = ciclo.fechaInicio;
    row.getCell(5).value = ciclo.fechaFin ?? '';
    this.setCellText(row.getCell(6), ciclo.parcela);
    this.setCellText(row.getCell(7), ciclo.predio);
    this.setCellText(row.getCell(8), ciclo.variedad);
    this.setCellText(row.getCell(9), ciclo.cultivo);

    this.setCellNumber(
      row.getCell(10),
      ind.superficieSembrada,
      this.FMT_NUMERO_2DEC,
    );
    this.setCellNumber(row.getCell(11), ind.costoTotal, this.FMT_MONEDA);
    this.setCellNumber(row.getCell(12), ind.kgCosechados, this.FMT_KG);
    this.setCellNumber(row.getCell(13), ind.kgMermaPoscosecha, this.FMT_KG);
    this.setCellNumber(row.getCell(14), ind.kgMermaCampo, this.FMT_KG);
    this.setCellNumber(row.getCell(15), ind.kgNetos, this.FMT_KG);
    this.setCellNumber(row.getCell(16), ind.kgVendidos, this.FMT_KG);
    this.setCellNumber(row.getCell(17), ind.kgDisponibles, this.FMT_KG);
    this.setCellNumber(row.getCell(18), ind.ingresos, this.FMT_MONEDA);
    this.setCellNumber(row.getCell(19), ind.totalFacturado, this.FMT_MONEDA);
    this.setCellNumber(row.getCell(20), ind.cobrado, this.FMT_MONEDA);
    this.setCellNumber(row.getCell(21), ind.ganancia, this.FMT_MONEDA);
    this.setCellNumber(row.getCell(22), ind.margenPct, this.FMT_NUMERO_2DEC);
    this.setCellNumber(row.getCell(23), ind.roiPct, this.FMT_NUMERO_2DEC);
    this.setCellNumber(row.getCell(24), ind.costoPorKg, this.FMT_MONEDA);
    this.setCellNumber(row.getCell(25), ind.precioPromedioKg, this.FMT_MONEDA);
    this.setCellNumber(row.getCell(26), ind.mermaPct, this.FMT_NUMERO_2DEC);
    this.setCellNumber(row.getCell(27), ind.costoPorHectarea, this.FMT_MONEDA);
    this.setCellNumber(
      row.getCell(28),
      ind.rendimientoKgHa,
      this.FMT_NUMERO_2DEC,
    );
    this.setCellNumber(row.getCell(29), ind.porCobrar, this.FMT_MONEDA);
  }

  private setCellNumber(
    cell: Cell,
    strVal: string | null | undefined,
    fmt: string,
  ): void {
    if (strVal === null || strVal === undefined || strVal === '') {
      cell.value = null;
      return;
    }
    const num = Number(strVal);
    if (Number.isNaN(num)) {
      cell.value = null;
      return;
    }
    cell.value = num;
    cell.numFmt = fmt;
  }

  private setCellText(cell: Cell, text: string | null | undefined): void {
    cell.value = TextoSeguroUtil.escapar(text);
  }

  private estilizarEncabezados(sheet: Worksheet): void {
    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF2D5A27' }, // Verde agrícola institucional
    };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
  }
}
