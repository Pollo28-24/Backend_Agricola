import { ExportacionController } from './exportacion.controller';
import {
  ExportacionService,
  ResultadoExportacion,
} from './services/exportacion.service';
import { FormatoExportacion } from './constants/exportacion.constants';
import type { UsuarioAutenticado } from '../auth/interfaces/jwt-payload.interface';
import { StreamableFile } from '@nestjs/common';

describe('ExportacionController', () => {
  let controller: ExportacionController;
  let mockExportacionService: {
    exportarRentabilidad: jest.Mock;
    exportarCicloDetalle: jest.Mock;
    exportarComparativo: jest.Mock;
    exportarCuentasPorCobrar: jest.Mock;
  };

  const usuarioMock: UsuarioAutenticado = {
    sub: 1,
    id: 1,
    correo: 'admin@empresa.com',
    rol: 'ADMIN',
    empresaId: 10,
    permisos: ['reporte:exportar'],
  };

  beforeEach(() => {
    mockExportacionService = {
      exportarRentabilidad: jest.fn(),
      exportarCicloDetalle: jest.fn(),
      exportarComparativo: jest.fn(),
      exportarCuentasPorCobrar: jest.fn(),
    };

    controller = new ExportacionController(
      mockExportacionService as unknown as ExportacionService,
    );
  });

  it('debe exportar rentabilidad retornando StreamableFile con opciones de descarga', async () => {
    const mockRes: ResultadoExportacion = {
      buffer: Buffer.from('xlsx-data'),
      mimeType:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      filename: 'rentabilidad_20261023.xlsx',
    };
    mockExportacionService.exportarRentabilidad.mockResolvedValue(mockRes);

    const result = await controller.exportarRentabilidad(usuarioMock, {
      formato: FormatoExportacion.XLSX,
    });

    expect(mockExportacionService.exportarRentabilidad).toHaveBeenCalledWith(
      10,
      { formato: FormatoExportacion.XLSX },
    );
    expect(result).toBeInstanceOf(StreamableFile);
  });

  it('debe exportar ciclo detalle delegando al servicio', async () => {
    const mockRes: ResultadoExportacion = {
      buffer: Buffer.from('%PDF-1.4'),
      mimeType: 'application/pdf',
      filename: 'ciclo_5_20261023.pdf',
    };
    mockExportacionService.exportarCicloDetalle.mockResolvedValue(mockRes);

    const result = await controller.exportarCicloDetalle(usuarioMock, 5, {
      formato: FormatoExportacion.PDF,
    });

    expect(mockExportacionService.exportarCicloDetalle).toHaveBeenCalledWith(
      10,
      5,
      FormatoExportacion.PDF,
    );
    expect(result).toBeInstanceOf(StreamableFile);
  });

  it('debe exportar comparativo delegando al servicio', async () => {
    const mockRes: ResultadoExportacion = {
      buffer: Buffer.from('csv-data'),
      mimeType: 'text/csv; charset=utf-8',
      filename: 'comparativo_parcela_3_20261023.csv',
    };
    mockExportacionService.exportarComparativo.mockResolvedValue(mockRes);

    const result = await controller.exportarComparativo(usuarioMock, 3, {
      formato: FormatoExportacion.CSV,
    });

    expect(mockExportacionService.exportarComparativo).toHaveBeenCalledWith(
      10,
      3,
      { formato: FormatoExportacion.CSV },
    );
    expect(result).toBeInstanceOf(StreamableFile);
  });

  it('debe exportar cuentas por cobrar delegando al servicio', async () => {
    const mockRes: ResultadoExportacion = {
      buffer: Buffer.from('csv-data'),
      mimeType: 'text/csv; charset=utf-8',
      filename: 'cuentas_por_cobrar_20261023.csv',
    };
    mockExportacionService.exportarCuentasPorCobrar.mockResolvedValue(mockRes);

    const result = await controller.exportarCuentasPorCobrar(usuarioMock, {
      formato: FormatoExportacion.CSV,
    });

    expect(
      mockExportacionService.exportarCuentasPorCobrar,
    ).toHaveBeenCalledWith(10, { formato: FormatoExportacion.CSV });
    expect(result).toBeInstanceOf(StreamableFile);
  });
});
