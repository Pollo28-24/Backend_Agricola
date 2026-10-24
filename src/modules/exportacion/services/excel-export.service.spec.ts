import { Workbook } from 'exceljs';
import { ExcelExportService } from './excel-export.service';
import { EstadoCiclo } from '@prisma/client';
import { RentabilidadCicloItemDto } from '../../reportes/dto/rentabilidad-ciclo-response.dto';
import { ComparativoParcelaItemDto } from '../../reportes/dto/comparativo-parcela-response.dto';
import { CuentasPorCobrarResponseDto } from '../../reportes/dto/cuentas-por-cobrar-response.dto';

describe('ExcelExportService', () => {
  let service: ExcelExportService;

  beforeEach(() => {
    service = new ExcelExportService();
  });

  it('debe exportar rentabilidad con celdas numéricas, formato correcto, nulls vacíos y texto escapado', async () => {
    const mockItem: RentabilidadCicloItemDto = {
      ciclo: {
        id: 10,
        nombre: '=HYPERLINK("http://malicious.site")',
        estado: EstadoCiclo.FINALIZADO,
        fechaInicio: '2026-01-01',
        fechaFin: '2026-06-30',
        parcela: 'Parcela Norte',
        predio: 'Predio El Encanto',
        variedad: 'Roma VF',
        cultivo: 'Tomate',
      },
      indicadores: {
        superficieSembrada: '2.50',
        costoTotal: '86000.00',
        kgCosechados: '8200.000',
        kgMermaPoscosecha: '50.000',
        kgMermaCampo: '300.000',
        kgNetos: '8150.000',
        kgVendidos: '8150.000',
        kgDisponibles: '0.000',
        ingresos: '121000.00',
        totalFacturado: '121000.00',
        cobrado: '121000.00',
        ganancia: '35000.00',
        margenPct: '28.93',
        roiPct: '40.70',
        costoPorKg: '10.49',
        precioPromedioKg: '14.76',
        mermaPct: '0.61',
        costoPorHectarea: '34400.00',
        rendimientoKgHa: '3280.00',
        porCobrar: '0.00',
      },
    };

    const mockItemConNulls: RentabilidadCicloItemDto = {
      ciclo: {
        id: 11,
        nombre: 'Ciclo Vacio',
        estado: EstadoCiclo.ACTIVO,
        fechaInicio: '2026-07-01',
        fechaFin: null,
        parcela: 'Parcela Sur',
        predio: 'Predio Sur',
        variedad: 'Saladette',
        cultivo: 'Tomate',
      },
      indicadores: {
        superficieSembrada: '1.00',
        costoTotal: '0.00',
        kgCosechados: '0.000',
        kgMermaPoscosecha: '0.000',
        kgMermaCampo: '0.000',
        kgNetos: '0.000',
        kgVendidos: '0.000',
        kgDisponibles: '0.000',
        ingresos: '0.00',
        totalFacturado: '0.00',
        cobrado: '0.00',
        ganancia: '0.00',
        margenPct: null,
        roiPct: null,
        costoPorKg: null,
        precioPromedioKg: null,
        mermaPct: null,
        costoPorHectarea: null,
        rendimientoKgHa: null,
        porCobrar: '0.00',
      },
    };

    const buffer = await service.exportarRentabilidad([
      mockItem,
      mockItemConNulls,
    ]);
    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(0);

    const wb = new Workbook();
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
    const sheet = wb.getWorksheet('Rentabilidad');
    expect(sheet).toBeDefined();

    // Fila 1: Encabezados
    expect(sheet!.getRow(1).getCell(1).value).toBe('ID Ciclo');

    // Fila 2: Item con fórmula escapada y números
    const row2 = sheet!.getRow(2);
    expect(row2.getCell(1).value).toBe(10);
    expect(row2.getCell(2).value).toBe('\'=HYPERLINK("http://malicious.site")');
    expect(row2.getCell(11).value).toBe(86000); // costoTotal numérico
    expect(row2.getCell(11).numFmt).toBe('#,##0.00');
    expect(row2.getCell(12).value).toBe(8200); // kg numérico
    expect(row2.getCell(12).numFmt).toBe('#,##0.000');
    expect(row2.getCell(21).value).toBe(35000); // ganancia

    // Fila 3: Item con nulls
    const row3 = sheet!.getRow(3);
    expect(row3.getCell(1).value).toBe(11);
    expect(row3.getCell(2).value).toBe('Ciclo Vacio');
    expect(row3.getCell(22).value).toBeNull(); // margenPct null -> celda vacía
    expect(row3.getCell(24).value).toBeNull(); // costoPorKg null -> celda vacía
  });

  it('debe exportar ciclo detalle con 4 hojas separadas', async () => {
    const mockItem: RentabilidadCicloItemDto = {
      ciclo: {
        id: 10,
        nombre: 'Ciclo Canvas',
        estado: EstadoCiclo.FINALIZADO,
        fechaInicio: '2026-01-01',
        fechaFin: '2026-06-30',
        parcela: 'Parcela Norte',
        predio: 'Predio El Encanto',
        variedad: 'Roma VF',
        cultivo: 'Tomate',
      },
      indicadores: {
        superficieSembrada: '2.50',
        costoTotal: '86000.00',
        kgCosechados: '8200.000',
        kgMermaPoscosecha: '50.000',
        kgMermaCampo: '300.000',
        kgNetos: '8150.000',
        kgVendidos: '8150.000',
        kgDisponibles: '0.000',
        ingresos: '121000.00',
        totalFacturado: '121000.00',
        cobrado: '121000.00',
        ganancia: '35000.00',
        margenPct: '28.93',
        roiPct: '40.70',
        costoPorKg: '10.49',
        precioPromedioKg: '14.76',
        mermaPct: '0.61',
        costoPorHectarea: '34400.00',
        rendimientoKgHa: '3280.00',
        porCobrar: '0.00',
      },
    };

    const categorias = [
      {
        categoriaRaizId: 1,
        categoriaRaiz: 'Fertilizantes',
        monto: '50000.00',
        porcentaje: '58.14',
      },
    ];

    const actividades = [
      {
        tipoActividadId: 2,
        tipoActividad: 'Riego',
        numeroActividades: 5,
        horasTotales: '20.00',
        costoTotal: '15000.00',
      },
    ];

    const mermas = [
      {
        motivo: 'Plaga',
        etapa: 'Poscosecha',
        kgMerma: '50.000',
      },
    ];

    const buffer = await service.exportarCicloDetalle(
      mockItem,
      categorias,
      actividades,
      mermas,
    );
    expect(buffer).toBeInstanceOf(Buffer);

    const wb = new Workbook();
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
    expect(wb.worksheets.length).toBe(4);
    expect(wb.getWorksheet('Rentabilidad')).toBeDefined();
    expect(wb.getWorksheet('Costos por Categoría')).toBeDefined();
    expect(wb.getWorksheet('Costos por Actividad')).toBeDefined();
    expect(wb.getWorksheet('Desglose de Mermas')).toBeDefined();

    const catSheet = wb.getWorksheet('Costos por Categoría')!;
    expect(catSheet.getRow(2).getCell(3).value).toBe(50000);
    expect(catSheet.getRow(2).getCell(3).numFmt).toBe('#,##0.00');
  });

  it('debe exportar comparativo con columnas históricas y formato numérico', async () => {
    const mockComp: ComparativoParcelaItemDto = {
      ciclo: {
        id: 2,
        nombre: 'Ciclo 2',
        estado: EstadoCiclo.FINALIZADO,
        fechaInicio: '2026-06-01',
        fechaFin: '2026-10-01',
        parcela: 'Parcela 1',
        predio: 'Predio 1',
        variedad: 'Roma',
        cultivo: 'Tomate',
      },
      indicadores: {
        superficieSembrada: '2.00',
        costoTotal: '50000.00',
        kgCosechados: '5000.000',
        kgMermaPoscosecha: '100.000',
        kgMermaCampo: '50.000',
        kgNetos: '4850.000',
        kgVendidos: '4850.000',
        kgDisponibles: '0.000',
        ingresos: '90000.00',
        totalFacturado: '90000.00',
        cobrado: '90000.00',
        ganancia: '40000.00',
        margenPct: '44.44',
        roiPct: '80.00',
        costoPorKg: '10.31',
        precioPromedioKg: '18.56',
        mermaPct: '2.00',
        costoPorHectarea: '25000.00',
        rendimientoKgHa: '2500.00',
        porCobrar: '0.00',
      },
      margenPctCicloAnterior: '30.00',
      costoPorKgCicloAnterior: '12.00',
      gananciaCicloAnterior: '25000.00',
    };

    const buffer = await service.exportarComparativo([mockComp]);
    const wb = new Workbook();
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
    const sheet = wb.getWorksheet('Comparativo')!;
    expect(sheet.getRow(2).getCell(18).value).toBe(30);
    expect(sheet.getRow(2).getCell(19).value).toBe(12);
    expect(sheet.getRow(2).getCell(20).value).toBe(25000);
  });

  it('debe exportar cuentas por cobrar con resumen y detalle', async () => {
    const mockRes: CuentasPorCobrarResponseDto = {
      data: [
        {
          ventaId: 1,
          folio: 'FAC-001',
          clienteId: 5,
          clienteNombre: 'Cliente A',
          cicloId: 10,
          fechaVenta: '2026-03-01',
          fechaVencimiento: '2026-03-15',
          montoTotal: '100000.00',
          montoCobrado: '40000.00',
          montoPendiente: '60000.00',
          diasVencimiento: 10,
          estadoCobro: 'PARCIAL',
          vencida: true,
        },
      ],
      resumen: {
        totalPorCobrar: '60000.00',
        totalVencido: '60000.00',
        totalVigente: '0.00',
        totalClientesMorosos: 1,
      },
      meta: {
        total: 1,
        page: 1,
        limit: 10,
        totalPages: 1,
      },
    };

    const buffer = await service.exportarCuentasPorCobrar(mockRes);
    const wb = new Workbook();
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
    expect(wb.worksheets.length).toBe(2);
    const sheetDetalle = wb.getWorksheet('Cuentas por Cobrar')!;
    expect(sheetDetalle.getRow(2).getCell(10).value).toBe(60000);
    expect(sheetDetalle.getRow(2).getCell(13).value).toBe('SÍ');
  });
});
