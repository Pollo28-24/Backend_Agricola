import { Injectable, HttpStatus } from '@nestjs/common';
import { IndicadoresService } from '../../reportes/services/indicadores.service';
import { CuentasPorCobrarService } from '../../reportes/services/cuentas-por-cobrar.service';
import { ExcelExportService } from './excel-export.service';
import { CsvExportService } from './csv-export.service';
import { PdfExportService } from './pdf-export.service';
import { DomainError } from '../../../common/errors/domain.error';
import { CodigoError } from '../../../common/errors/codigos-error.enum';
import { VentaEstadoCobroPolicy } from '../../../common/domain/policies/venta-estado-cobro.policy';
import {
  FormatoExportacion,
  MIME_TYPES_EXPORTACION,
  LIMITE_FILAS_EXPORTACION,
  TAMANO_PAGINA_EXPORTACION,
} from '../constants/exportacion.constants';
import {
  ExportarRentabilidadDto,
  ExportarComparativoDto,
  ExportarCuentasPorCobrarDto,
} from '../dto/exportacion-query.dto';
import { RentabilidadCicloItemDto } from '../../reportes/dto/rentabilidad-ciclo-response.dto';
import { ComparativoParcelaItemDto } from '../../reportes/dto/comparativo-parcela-response.dto';
import {
  CuentasPorCobrarResponseDto,
  CuentaPorCobrarItemDto,
} from '../../reportes/dto/cuentas-por-cobrar-response.dto';

export interface ResultadoExportacion {
  buffer: Buffer;
  mimeType: string;
  filename: string;
}

/**
 * Servicio orquestador del módulo de exportación (Hito 10B / ADR-013).
 *
 * Responsabilidades:
 * 1. Reutilización estricta de IndicadoresService y CuentasPorCobrarService (cero SQL/fórmulas duplicadas).
 * 2. Comprobación temprana de límite de 5000 filas antes de generar archivos (400 EXPORTACION_EXCEDE_LIMITE).
 * 3. Paginación segura para construir el universo completo sin N+1.
 * 4. Nombres de archivo generados por el servidor con fecha de México (America/Mexico_City).
 */
@Injectable()
export class ExportacionService {
  constructor(
    private readonly indicadoresService: IndicadoresService,
    private readonly cuentasPorCobrarService: CuentasPorCobrarService,
    private readonly excelExportService: ExcelExportService,
    private readonly csvExportService: CsvExportService,
    private readonly pdfExportService: PdfExportService,
  ) {}

  /**
   * Exporta el reporte de rentabilidad de ciclos en el formato solicitado.
   */
  async exportarRentabilidad(
    empresaId: number,
    filtro: ExportarRentabilidadDto,
  ): Promise<ResultadoExportacion> {
    const limiteMax =
      Number(process.env.EXPORTACION_MAX_FILAS) || LIMITE_FILAS_EXPORTACION;

    // 1. Obtener primera página para validar total antes de generar
    const primeraPagina = await this.indicadoresService.obtenerRentabilidad(
      empresaId,
      {
        ...filtro,
        page: 1,
        limit: TAMANO_PAGINA_EXPORTACION,
      },
    );

    const total = primeraPagina.meta.total;
    if (total > limiteMax) {
      throw new DomainError(
        CodigoError.EXPORTACION_EXCEDE_LIMITE,
        `La exportación excede el límite máximo permitido de ${limiteMax} filas (total: ${total})`,
        HttpStatus.BAD_REQUEST,
      );
    }

    const items: RentabilidadCicloItemDto[] = [...primeraPagina.data];
    const totalPaginas = primeraPagina.meta.totalPages;

    for (let p = 2; p <= totalPaginas; p++) {
      const pagina = await this.indicadoresService.obtenerRentabilidad(
        empresaId,
        {
          ...filtro,
          page: p,
          limit: TAMANO_PAGINA_EXPORTACION,
        },
      );
      items.push(...pagina.data);
    }

    const fechaStr = this.obtenerFechaNombreArchivo();
    const filename = `rentabilidad_${fechaStr}.${filtro.formato}`;
    const mimeType = MIME_TYPES_EXPORTACION[filtro.formato];

    let buffer: Buffer;
    switch (filtro.formato) {
      case FormatoExportacion.XLSX:
        buffer = await this.excelExportService.exportarRentabilidad(items);
        break;
      case FormatoExportacion.CSV:
        buffer = this.csvExportService.exportarRentabilidad(items);
        break;
      case FormatoExportacion.PDF:
        buffer = await this.pdfExportService.exportarRentabilidad(items);
        break;
    }

    return { buffer, mimeType, filename };
  }

  /**
   * Exporta el detalle integral de un ciclo (indicadores y las 3 tablas de desglose).
   * Número fijo de 4 consultas, garantizando 0 N+1.
   */
  async exportarCicloDetalle(
    empresaId: number,
    cicloId: number,
    formato: FormatoExportacion,
  ): Promise<ResultadoExportacion> {
    // 4 consultas fijas reutilizando IndicadoresService
    const [ciclo, categorias, actividades, mermas] = await Promise.all([
      this.indicadoresService.obtenerRentabilidadCiclo(empresaId, cicloId),
      this.indicadoresService.obtenerCostosPorCategoria(empresaId, cicloId),
      this.indicadoresService.obtenerCostosPorActividad(empresaId, cicloId),
      this.indicadoresService.obtenerMermasDesglose(empresaId, cicloId),
    ]);

    const fechaStr = this.obtenerFechaNombreArchivo();
    const filename = `ciclo_${cicloId}_${fechaStr}.${formato}`;
    const mimeType = MIME_TYPES_EXPORTACION[formato];

    let buffer: Buffer;
    switch (formato) {
      case FormatoExportacion.XLSX:
        buffer = await this.excelExportService.exportarCicloDetalle(
          ciclo,
          categorias,
          actividades,
          mermas,
        );
        break;
      case FormatoExportacion.CSV:
        buffer = this.csvExportService.exportarCicloDetalle(
          ciclo,
          categorias,
          actividades,
          mermas,
        );
        break;
      case FormatoExportacion.PDF:
        buffer = await this.pdfExportService.exportarCicloDetalle(
          ciclo,
          categorias,
          actividades,
          mermas,
        );
        break;
    }

    return { buffer, mimeType, filename };
  }

  /**
   * Exporta el comparativo cronológico de ciclos en una parcela.
   */
  async exportarComparativo(
    empresaId: number,
    parcelaId: number,
    filtro: ExportarComparativoDto,
  ): Promise<ResultadoExportacion> {
    const limiteMax =
      Number(process.env.EXPORTACION_MAX_FILAS) || LIMITE_FILAS_EXPORTACION;

    const primeraPagina =
      await this.indicadoresService.obtenerComparativoParcela(
        empresaId,
        parcelaId,
        {
          ...filtro,
          page: 1,
          limit: TAMANO_PAGINA_EXPORTACION,
        },
      );

    const total = primeraPagina.meta.total;
    if (total > limiteMax) {
      throw new DomainError(
        CodigoError.EXPORTACION_EXCEDE_LIMITE,
        `La exportación excede el límite máximo permitido de ${limiteMax} filas (total: ${total})`,
        HttpStatus.BAD_REQUEST,
      );
    }

    const items: ComparativoParcelaItemDto[] = [...primeraPagina.data];
    const totalPaginas = primeraPagina.meta.totalPages;

    for (let p = 2; p <= totalPaginas; p++) {
      const pagina = await this.indicadoresService.obtenerComparativoParcela(
        empresaId,
        parcelaId,
        {
          ...filtro,
          page: p,
          limit: TAMANO_PAGINA_EXPORTACION,
        },
      );
      items.push(...pagina.data);
    }

    const fechaStr = this.obtenerFechaNombreArchivo();
    const filename = `comparativo_parcela_${parcelaId}_${fechaStr}.${filtro.formato}`;
    const mimeType = MIME_TYPES_EXPORTACION[filtro.formato];

    let buffer: Buffer;
    switch (filtro.formato) {
      case FormatoExportacion.XLSX:
        buffer = await this.excelExportService.exportarComparativo(items);
        break;
      case FormatoExportacion.CSV:
        buffer = this.csvExportService.exportarComparativo(items);
        break;
      case FormatoExportacion.PDF:
        buffer = await this.pdfExportService.exportarComparativo(items);
        break;
    }

    return { buffer, mimeType, filename };
  }

  /**
   * Exporta la cartera de cuentas por cobrar.
   */
  async exportarCuentasPorCobrar(
    empresaId: number,
    filtro: ExportarCuentasPorCobrarDto,
  ): Promise<ResultadoExportacion> {
    const limiteMax =
      Number(process.env.EXPORTACION_MAX_FILAS) || LIMITE_FILAS_EXPORTACION;

    const primeraPagina =
      await this.cuentasPorCobrarService.obtenerCuentasPorCobrar(empresaId, {
        ...filtro,
        page: 1,
        limit: TAMANO_PAGINA_EXPORTACION,
      });

    const total = primeraPagina.meta.total;
    if (total > limiteMax) {
      throw new DomainError(
        CodigoError.EXPORTACION_EXCEDE_LIMITE,
        `La exportación excede el límite máximo permitido de ${limiteMax} filas (total: ${total})`,
        HttpStatus.BAD_REQUEST,
      );
    }

    const items: CuentaPorCobrarItemDto[] = [...primeraPagina.data];
    const totalPaginas = primeraPagina.meta.totalPages;

    for (let p = 2; p <= totalPaginas; p++) {
      const pagina = await this.cuentasPorCobrarService.obtenerCuentasPorCobrar(
        empresaId,
        {
          ...filtro,
          page: p,
          limit: TAMANO_PAGINA_EXPORTACION,
        },
      );
      items.push(...pagina.data);
    }

    const datosCompletos: CuentasPorCobrarResponseDto = {
      data: items,
      resumen: primeraPagina.resumen,
      meta: {
        total,
        page: 1,
        limit: total,
        totalPages: 1,
      },
    };

    const fechaStr = this.obtenerFechaNombreArchivo();
    const filename = `cuentas_por_cobrar_${fechaStr}.${filtro.formato}`;
    const mimeType = MIME_TYPES_EXPORTACION[filtro.formato];

    let buffer: Buffer;
    switch (filtro.formato) {
      case FormatoExportacion.XLSX:
        buffer =
          await this.excelExportService.exportarCuentasPorCobrar(
            datosCompletos,
          );
        break;
      case FormatoExportacion.CSV:
        buffer = this.csvExportService.exportarCuentasPorCobrar(datosCompletos);
        break;
      case FormatoExportacion.PDF:
        buffer =
          await this.pdfExportService.exportarCuentasPorCobrar(datosCompletos);
        break;
    }

    return { buffer, mimeType, filename };
  }

  private obtenerFechaNombreArchivo(): string {
    const hoy = VentaEstadoCobroPolicy.obtenerHoyMexico();
    return hoy.replace(/-/g, '');
  }
}
