import { ExportacionService } from './exportacion.service';
import { IndicadoresService } from '../../reportes/services/indicadores.service';
import { CuentasPorCobrarService } from '../../reportes/services/cuentas-por-cobrar.service';
import { ExcelExportService } from './excel-export.service';
import { CsvExportService } from './csv-export.service';
import { PdfExportService } from './pdf-export.service';
import { DomainError } from '../../../common/errors/domain.error';
import { CodigoError } from '../../../common/errors/codigos-error.enum';
import { FormatoExportacion } from '../constants/exportacion.constants';
import { EstadoCiclo } from '@prisma/client';
import { RentabilidadCicloItemDto } from '../../reportes/dto/rentabilidad-ciclo-response.dto';

describe('ExportacionService', () => {
  let service: ExportacionService;
  let mockIndicadoresService: {
    obtenerRentabilidad: jest.Mock;
    obtenerRentabilidadCiclo: jest.Mock;
    obtenerCostosPorCategoria: jest.Mock;
    obtenerCostosPorActividad: jest.Mock;
    obtenerMermasDesglose: jest.Mock;
    obtenerComparativoParcela: jest.Mock;
  };
  let mockCuentasPorCobrarService: {
    obtenerCuentasPorCobrar: jest.Mock;
  };
  let mockExcelExportService: {
    exportarRentabilidad: jest.Mock;
    exportarCicloDetalle: jest.Mock;
    exportarComparativo: jest.Mock;
    exportarCuentasPorCobrar: jest.Mock;
  };
  let mockCsvExportService: {
    exportarRentabilidad: jest.Mock;
    exportarCicloDetalle: jest.Mock;
    exportarComparativo: jest.Mock;
    exportarCuentasPorCobrar: jest.Mock;
  };
  let mockPdfExportService: {
    exportarRentabilidad: jest.Mock;
    exportarCicloDetalle: jest.Mock;
    exportarComparativo: jest.Mock;
    exportarCuentasPorCobrar: jest.Mock;
  };

  const dummyItem: RentabilidadCicloItemDto = {
    ciclo: {
      id: 1,
      nombre: 'Ciclo 1',
      estado: EstadoCiclo.FINALIZADO,
      fechaInicio: '2026-01-01',
      fechaFin: '2026-06-30',
      parcela: 'P1',
      predio: 'PR1',
      variedad: 'V1',
      cultivo: 'C1',
    },
    indicadores: {
      superficieSembrada: '1.00',
      costoTotal: '1000.00',
      kgCosechados: '100.000',
      kgMermaPoscosecha: '0.000',
      kgMermaCampo: '0.000',
      kgNetos: '100.000',
      kgVendidos: '100.000',
      kgDisponibles: '0.000',
      ingresos: '2000.00',
      totalFacturado: '2000.00',
      cobrado: '2000.00',
      ganancia: '1000.00',
      margenPct: '50.00',
      roiPct: '100.00',
      costoPorKg: '10.00',
      precioPromedioKg: '20.00',
      mermaPct: '0.00',
      costoPorHectarea: '1000.00',
      rendimientoKgHa: '100.00',
      porCobrar: '0.00',
    },
  };

  beforeEach(() => {
    mockIndicadoresService = {
      obtenerRentabilidad: jest.fn(),
      obtenerRentabilidadCiclo: jest.fn(),
      obtenerCostosPorCategoria: jest.fn(),
      obtenerCostosPorActividad: jest.fn(),
      obtenerMermasDesglose: jest.fn(),
      obtenerComparativoParcela: jest.fn(),
    };
    mockCuentasPorCobrarService = {
      obtenerCuentasPorCobrar: jest.fn(),
    };
    mockExcelExportService = {
      exportarRentabilidad: jest
        .fn()
        .mockResolvedValue(Buffer.from('mock-xlsx')),
      exportarCicloDetalle: jest
        .fn()
        .mockResolvedValue(Buffer.from('mock-xlsx')),
      exportarComparativo: jest
        .fn()
        .mockResolvedValue(Buffer.from('mock-xlsx')),
      exportarCuentasPorCobrar: jest
        .fn()
        .mockResolvedValue(Buffer.from('mock-xlsx')),
    };
    mockCsvExportService = {
      exportarRentabilidad: jest.fn().mockReturnValue(Buffer.from('mock-csv')),
      exportarCicloDetalle: jest.fn().mockReturnValue(Buffer.from('mock-csv')),
      exportarComparativo: jest.fn().mockReturnValue(Buffer.from('mock-csv')),
      exportarCuentasPorCobrar: jest
        .fn()
        .mockReturnValue(Buffer.from('mock-csv')),
    };
    mockPdfExportService = {
      exportarRentabilidad: jest
        .fn()
        .mockResolvedValue(Buffer.from('mock-pdf')),
      exportarCicloDetalle: jest
        .fn()
        .mockResolvedValue(Buffer.from('mock-pdf')),
      exportarComparativo: jest.fn().mockResolvedValue(Buffer.from('mock-pdf')),
      exportarCuentasPorCobrar: jest
        .fn()
        .mockResolvedValue(Buffer.from('mock-pdf')),
    };

    service = new ExportacionService(
      mockIndicadoresService as unknown as IndicadoresService,
      mockCuentasPorCobrarService as unknown as CuentasPorCobrarService,
      mockExcelExportService as unknown as ExcelExportService,
      mockCsvExportService as unknown as CsvExportService,
      mockPdfExportService as unknown as PdfExportService,
    );
  });

  it('debe rechazar con 400 EXPORTACION_EXCEDE_LIMITE si el total excede 5000 antes de generar', async () => {
    mockIndicadoresService.obtenerRentabilidad.mockResolvedValue({
      data: [dummyItem],
      meta: {
        total: 5001,
        page: 1,
        limit: 100,
        totalPages: 51,
      },
    });

    await expect(
      service.exportarRentabilidad(1, {
        formato: FormatoExportacion.XLSX,
      }),
    ).rejects.toThrow(DomainError);

    try {
      await service.exportarRentabilidad(1, {
        formato: FormatoExportacion.XLSX,
      });
    } catch (e: unknown) {
      const err = e as DomainError;
      expect(err.code).toBe(CodigoError.EXPORTACION_EXCEDE_LIMITE);
      expect(err.getStatus()).toBe(400);
    }

    expect(mockExcelExportService.exportarRentabilidad).not.toHaveBeenCalled();
  });

  it('debe recorrer todas las páginas para total <= 5000 sin exceder límite y generar archivo', async () => {
    mockIndicadoresService.obtenerRentabilidad
      .mockResolvedValueOnce({
        data: [dummyItem],
        meta: { total: 150, page: 1, limit: 100, totalPages: 2 },
      })
      .mockResolvedValueOnce({
        data: [dummyItem],
        meta: { total: 150, page: 2, limit: 100, totalPages: 2 },
      });

    const resultado = await service.exportarRentabilidad(1, {
      formato: FormatoExportacion.CSV,
    });

    expect(mockIndicadoresService.obtenerRentabilidad).toHaveBeenCalledTimes(2);
    expect(mockCsvExportService.exportarRentabilidad).toHaveBeenCalledWith([
      dummyItem,
      dummyItem,
    ]);
    expect(resultado.filename).toMatch(/^rentabilidad_\d{8}\.csv$/);
    expect(resultado.mimeType).toBe('text/csv; charset=utf-8');
  });

  it('debe ejecutar un número fijo de exactamente 4 consultas para exportarCicloDetalle (sin N+1)', async () => {
    mockIndicadoresService.obtenerRentabilidadCiclo.mockResolvedValue(
      dummyItem,
    );
    mockIndicadoresService.obtenerCostosPorCategoria.mockResolvedValue([]);
    mockIndicadoresService.obtenerCostosPorActividad.mockResolvedValue([]);
    mockIndicadoresService.obtenerMermasDesglose.mockResolvedValue([]);

    const resultado = await service.exportarCicloDetalle(
      1,
      10,
      FormatoExportacion.PDF,
    );

    expect(
      mockIndicadoresService.obtenerRentabilidadCiclo,
    ).toHaveBeenCalledTimes(1);
    expect(
      mockIndicadoresService.obtenerCostosPorCategoria,
    ).toHaveBeenCalledTimes(1);
    expect(
      mockIndicadoresService.obtenerCostosPorActividad,
    ).toHaveBeenCalledTimes(1);
    expect(mockIndicadoresService.obtenerMermasDesglose).toHaveBeenCalledTimes(
      1,
    );
    expect(mockPdfExportService.exportarCicloDetalle).toHaveBeenCalledTimes(1);
    expect(resultado.filename).toMatch(/^ciclo_10_\d{8}\.pdf$/);
    expect(resultado.mimeType).toBe('application/pdf');
  });
});
