import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { VentaEstadoCobroPolicy } from '../../../common/domain/policies/venta-estado-cobro.policy';
import { TextoSeguroUtil } from '../utils/texto-seguro.util';
import { RentabilidadCicloItemDto } from '../../reportes/dto/rentabilidad-ciclo-response.dto';
import { CostoPorCategoriaDto } from '../../reportes/dto/costo-categoria-response.dto';
import { CostoPorActividadDto } from '../../reportes/dto/costo-actividad-response.dto';
import { MermaDesgloseDto } from '../../reportes/dto/merma-desglose-response.dto';
import { ComparativoParcelaItemDto } from '../../reportes/dto/comparativo-parcela-response.dto';
import { CuentasPorCobrarResponseDto } from '../../reportes/dto/cuentas-por-cobrar-response.dto';

/**
 * Servicio de exportación a documentos PDF mediante PDFKit.
 *
 * Características (RN-066 / Hito 10B / ADR-013):
 * 1. Generación 100% en memoria mediante streaming de chunks.
 * 2. Emisión con firma estándar %PDF y cabecera institucional.
 * 3. Fecha de generación formateada en zona horaria America/Mexico_City.
 * 4. Paginación y tablas estructuradas con fuente base estandarizada.
 */
@Injectable()
export class PdfExportService {
  /**
   * Genera PDF para el reporte de rentabilidad de ciclos.
   */
  async exportarRentabilidad(
    items: RentabilidadCicloItemDto[],
  ): Promise<Buffer> {
    return new Promise<Buffer>((resolve, reject) => {
      try {
        const doc = new PDFDocument({
          margin: 30,
          size: 'A4',
          bufferPages: true,
        });
        const chunks: Buffer[] = [];

        doc.on('data', (c: Buffer) => chunks.push(c));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', (err: Error) => reject(err));

        const hoy = VentaEstadoCobroPolicy.obtenerHoyMexico();

        this.imprimirEncabezado(
          doc,
          'Reporte General de Rentabilidad de Ciclos',
          `Generado: ${hoy} | Total ciclos: ${items.length}`,
        );

        for (const [idx, it] of items.entries()) {
          doc.fontSize(11).font('Helvetica-Bold').fillColor('#2D5A27');
          doc.text(
            `${idx + 1}. Ciclo: ${TextoSeguroUtil.escapar(it.ciclo.nombre || 'Sin nombre')} [${it.ciclo.estado}]`,
          );
          doc.fontSize(9).font('Helvetica').fillColor('#333333');
          doc.text(
            `Parcela: ${TextoSeguroUtil.escapar(it.ciclo.parcela)} | Predio: ${TextoSeguroUtil.escapar(it.ciclo.predio)} | Variedad: ${TextoSeguroUtil.escapar(it.ciclo.variedad)} | Cultivo: ${TextoSeguroUtil.escapar(it.ciclo.cultivo)}`,
          );
          doc.text(
            `Periodo: ${it.ciclo.fechaInicio} a ${it.ciclo.fechaFin || 'Activo'} | Superficie: ${it.indicadores.superficieSembrada} ha`,
          );
          doc.text(
            `Costos: $${it.indicadores.costoTotal} | Ingresos: $${it.indicadores.ingresos} | Ganancia: $${it.indicadores.ganancia} | Margen: ${it.indicadores.margenPct ?? 'N/A'}% | ROI: ${it.indicadores.roiPct ?? 'N/A'}%`,
          );
          doc.text(
            `Cosecha: ${it.indicadores.kgCosechados} kg | Netos: ${it.indicadores.kgNetos} kg | Vendidos: ${it.indicadores.kgVendidos} kg | Disponibles: ${it.indicadores.kgDisponibles} kg`,
          );
          doc.text(
            `Costo/kg: $${it.indicadores.costoPorKg ?? 'N/A'} | Precio Prom./kg: $${it.indicadores.precioPromedioKg ?? 'N/A'} | Merma: ${it.indicadores.mermaPct ?? 'N/A'}%`,
          );
          doc.moveDown(0.5);

          if (doc.y > 750) {
            doc.addPage();
          }
        }

        this.aplicarNumeracionPaginas(doc);
        doc.end();
      } catch (error: unknown) {
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  /**
   * Genera PDF para el detalle de un ciclo específico (indicadores y las 3 tablas de desglose).
   */
  async exportarCicloDetalle(
    ciclo: RentabilidadCicloItemDto,
    costosCategoria: CostoPorCategoriaDto[],
    costosActividad: CostoPorActividadDto[],
    mermas: MermaDesgloseDto[],
  ): Promise<Buffer> {
    return new Promise<Buffer>((resolve, reject) => {
      try {
        const doc = new PDFDocument({
          margin: 30,
          size: 'A4',
          bufferPages: true,
        });
        const chunks: Buffer[] = [];

        doc.on('data', (c: Buffer) => chunks.push(c));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', (err: Error) => reject(err));

        const hoy = VentaEstadoCobroPolicy.obtenerHoyMexico();

        this.imprimirEncabezado(
          doc,
          `Reporte Integral de Ciclo: ${TextoSeguroUtil.escapar(ciclo.ciclo.nombre || 'Ciclo #' + ciclo.ciclo.id)}`,
          `Generado: ${hoy} | Estado: ${ciclo.ciclo.estado}`,
        );

        // Sección 1: Datos generales e indicadores
        doc
          .fontSize(12)
          .font('Helvetica-Bold')
          .fillColor('#2D5A27')
          .text('1. Indicadores Financieros y Operativos');
        doc.moveDown(0.3);
        doc.fontSize(9).font('Helvetica').fillColor('#333333');
        doc.text(
          `Parcela: ${TextoSeguroUtil.escapar(ciclo.ciclo.parcela)} | Predio: ${TextoSeguroUtil.escapar(ciclo.ciclo.predio)}`,
        );
        doc.text(
          `Cultivo: ${TextoSeguroUtil.escapar(ciclo.ciclo.cultivo)} | Variedad: ${TextoSeguroUtil.escapar(ciclo.ciclo.variedad)}`,
        );
        doc.text(
          `Fechas: Inicio ${ciclo.ciclo.fechaInicio} | Fin ${ciclo.ciclo.fechaFin || 'En curso'}`,
        );
        doc.text(
          `Superficie sembrada: ${ciclo.indicadores.superficieSembrada} ha`,
        );
        doc.moveDown(0.3);

        doc.font('Helvetica-Bold').text('Resultados Económicos:');
        doc
          .font('Helvetica')
          .text(
            `Costo Total: $${ciclo.indicadores.costoTotal} | Ingresos Netos: $${ciclo.indicadores.ingresos} | Facturado: $${ciclo.indicadores.totalFacturado}`,
          );
        doc.text(
          `Cobrado: $${ciclo.indicadores.cobrado} | Por Cobrar: $${ciclo.indicadores.porCobrar} | Ganancia: $${ciclo.indicadores.ganancia}`,
        );
        doc.text(
          `Margen: ${ciclo.indicadores.margenPct ?? 'N/A'}% | ROI: ${ciclo.indicadores.roiPct ?? 'N/A'}% | Costo/kg: $${ciclo.indicadores.costoPorKg ?? 'N/A'} | Precio Promedio: $${ciclo.indicadores.precioPromedioKg ?? 'N/A'}`,
        );
        doc.moveDown(0.3);

        doc.font('Helvetica-Bold').text('Balance de Masa (Cosechas y Mermas):');
        doc
          .font('Helvetica')
          .text(
            `Cosechados: ${ciclo.indicadores.kgCosechados} kg | Merma Poscosecha: ${ciclo.indicadores.kgMermaPoscosecha} kg | Merma Campo: ${ciclo.indicadores.kgMermaCampo} kg`,
          );
        doc.text(
          `Netos: ${ciclo.indicadores.kgNetos} kg | Vendidos: ${ciclo.indicadores.kgVendidos} kg | Disponibles: ${ciclo.indicadores.kgDisponibles} kg | Merma: ${ciclo.indicadores.mermaPct ?? 'N/A'}%`,
        );
        doc.moveDown(0.8);

        // Sección 2: Costos por Categoría
        doc
          .fontSize(12)
          .font('Helvetica-Bold')
          .fillColor('#2D5A27')
          .text('2. Desglose de Costos por Categoría');
        doc.moveDown(0.3);
        doc.fontSize(9).font('Helvetica').fillColor('#333333');
        if (costosCategoria.length === 0) {
          doc.text('No hay registros de costos por categoría para este ciclo.');
        } else {
          for (const cat of costosCategoria) {
            doc.text(
              `- ${TextoSeguroUtil.escapar(cat.categoriaRaiz)}: $${cat.monto} (${cat.porcentaje}%)`,
            );
          }
        }
        doc.moveDown(0.8);

        // Sección 3: Costos por Actividad
        doc
          .fontSize(12)
          .font('Helvetica-Bold')
          .fillColor('#2D5A27')
          .text('3. Desglose de Costos por Actividad');
        doc.moveDown(0.3);
        doc.fontSize(9).font('Helvetica').fillColor('#333333');
        if (costosActividad.length === 0) {
          doc.text(
            'No hay registros de actividades operativas para este ciclo.',
          );
        } else {
          for (const act of costosActividad) {
            doc.text(
              `- ${TextoSeguroUtil.escapar(act.tipoActividad)}: ${act.numeroActividades} act. | ${act.horasTotales} hrs | Costo: $${act.costoTotal}`,
            );
          }
        }
        doc.moveDown(0.8);

        // Sección 4: Desglose de Mermas
        doc
          .fontSize(12)
          .font('Helvetica-Bold')
          .fillColor('#2D5A27')
          .text('4. Desglose de Mermas Registradas');
        doc.moveDown(0.3);
        doc.fontSize(9).font('Helvetica').fillColor('#333333');
        if (mermas.length === 0) {
          doc.text('No se registraron mermas en este ciclo.');
        } else {
          for (const m of mermas) {
            doc.text(
              `- Motivo: ${TextoSeguroUtil.escapar(m.motivo)} | Etapa: ${TextoSeguroUtil.escapar(m.etapa)} | Cantidad: ${m.kgMerma} kg`,
            );
          }
        }

        this.aplicarNumeracionPaginas(doc);
        doc.end();
      } catch (error: unknown) {
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  /**
   * Genera PDF para el comparativo de ciclos en una parcela.
   */
  async exportarComparativo(
    items: ComparativoParcelaItemDto[],
  ): Promise<Buffer> {
    return new Promise<Buffer>((resolve, reject) => {
      try {
        const doc = new PDFDocument({
          margin: 30,
          size: 'A4',
          bufferPages: true,
        });
        const chunks: Buffer[] = [];

        doc.on('data', (c: Buffer) => chunks.push(c));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', (err: Error) => reject(err));

        const hoy = VentaEstadoCobroPolicy.obtenerHoyMexico();

        this.imprimirEncabezado(
          doc,
          'Comparativo Cronológico de Ciclos en Parcela',
          `Generado: ${hoy} | Total ciclos analizados: ${items.length}`,
        );

        for (const [idx, it] of items.entries()) {
          doc.fontSize(11).font('Helvetica-Bold').fillColor('#2D5A27');
          doc.text(
            `${idx + 1}. ${TextoSeguroUtil.escapar(it.ciclo.nombre || 'Ciclo #' + it.ciclo.id)} (${it.ciclo.estado}) - Inicio: ${it.ciclo.fechaInicio}`,
          );
          doc.fontSize(9).font('Helvetica').fillColor('#333333');
          doc.text(
            `Parcela: ${TextoSeguroUtil.escapar(it.ciclo.parcela)} | Variedad: ${TextoSeguroUtil.escapar(it.ciclo.variedad)} | Superficie: ${it.indicadores.superficieSembrada} ha`,
          );
          doc.text(
            `Costo Total: $${it.indicadores.costoTotal} | Ingresos: $${it.indicadores.ingresos} | Ganancia: $${it.indicadores.ganancia}`,
          );
          doc.text(
            `Margen Actual: ${it.indicadores.margenPct ?? 'N/A'}% | Margen Ciclo Anterior: ${it.margenPctCicloAnterior !== null ? it.margenPctCicloAnterior + '%' : 'N/A'}`,
          );
          doc.text(
            `Costo/kg Actual: $${it.indicadores.costoPorKg ?? 'N/A'} | Costo/kg Ciclo Anterior: ${it.costoPorKgCicloAnterior !== null ? '$' + it.costoPorKgCicloAnterior : 'N/A'}`,
          );
          doc.text(
            `Ganancia Ciclo Anterior: ${it.gananciaCicloAnterior !== null ? '$' + it.gananciaCicloAnterior : 'N/A'}`,
          );
          doc.moveDown(0.5);

          if (doc.y > 750) {
            doc.addPage();
          }
        }

        this.aplicarNumeracionPaginas(doc);
        doc.end();
      } catch (error: unknown) {
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  /**
   * Genera PDF para el reporte de cuentas por cobrar y cartera.
   */
  async exportarCuentasPorCobrar(
    res: CuentasPorCobrarResponseDto,
  ): Promise<Buffer> {
    return new Promise<Buffer>((resolve, reject) => {
      try {
        const doc = new PDFDocument({
          margin: 30,
          size: 'A4',
          bufferPages: true,
        });
        const chunks: Buffer[] = [];

        doc.on('data', (c: Buffer) => chunks.push(c));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', (err: Error) => reject(err));

        const hoy = VentaEstadoCobroPolicy.obtenerHoyMexico();

        this.imprimirEncabezado(
          doc,
          'Reporte de Cuentas por Cobrar y Cartera Vencida',
          `Fecha de corte: ${hoy} | Total registros: ${res.data.length}`,
        );

        // Resumen
        doc
          .fontSize(11)
          .font('Helvetica-Bold')
          .fillColor('#2D5A27')
          .text('Resumen General de Cartera:');
        doc.fontSize(9).font('Helvetica').fillColor('#333333');
        doc.text(
          `Total por Cobrar: $${res.resumen.totalPorCobrar} | Total Vencido: $${res.resumen.totalVencido} | Total Vigente: $${res.resumen.totalVigente} | Clientes Morosos: ${res.resumen.totalClientesMorosos}`,
        );
        doc.moveDown(0.8);

        // Detalle de cuentas
        doc
          .fontSize(11)
          .font('Helvetica-Bold')
          .fillColor('#2D5A27')
          .text('Detalle de Ventas y Saldos:');
        doc.moveDown(0.3);

        for (const [idx, it] of res.data.entries()) {
          doc.fontSize(9).font('Helvetica-Bold').fillColor('#333333');
          doc.text(
            `${idx + 1}. Factura: ${TextoSeguroUtil.escapar(it.folio || 'S/F')} | Cliente: ${TextoSeguroUtil.escapar(it.clienteNombre)} (ID: ${it.clienteId})`,
          );
          doc.font('Helvetica').fillColor('#555555');
          doc.text(
            `Fecha Venta: ${it.fechaVenta} | Vencimiento: ${it.fechaVencimiento || 'Sin fecha'} | Estado: ${it.estadoCobro} (${it.vencida ? 'VENCIDA' : 'Al corriente'})`,
          );
          doc.text(
            `Total: $${it.montoTotal} | Cobrado: $${it.montoCobrado} | Pendiente: $${it.montoPendiente} | Días de Vencimiento: ${it.diasVencimiento !== null ? it.diasVencimiento : 'N/A'}`,
          );
          doc.moveDown(0.4);

          if (doc.y > 750) {
            doc.addPage();
          }
        }

        this.aplicarNumeracionPaginas(doc);
        doc.end();
      } catch (error: unknown) {
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  private imprimirEncabezado(
    doc: PDFKit.PDFDocument,
    titulo: string,
    subtitulo: string,
  ): void {
    doc
      .fontSize(16)
      .font('Helvetica-Bold')
      .fillColor('#2D5A27')
      .text(titulo, { align: 'center' });
    doc.moveDown(0.2);
    doc
      .fontSize(10)
      .font('Helvetica')
      .fillColor('#666666')
      .text(subtitulo, { align: 'center' });
    doc.moveDown(0.8);
    doc
      .strokeColor('#CCCCCC')
      .lineWidth(1)
      .moveTo(30, doc.y)
      .lineTo(565, doc.y)
      .stroke();
    doc.moveDown(0.8);
  }

  private aplicarNumeracionPaginas(doc: PDFKit.PDFDocument): void {
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      doc
        .fontSize(8)
        .font('Helvetica')
        .fillColor('#888888')
        .text(
          `Página ${i + 1} de ${range.count} - Plataforma de Rentabilidad Agrícola`,
          30,
          800,
          { align: 'center', width: 535 },
        );
    }
  }
}
