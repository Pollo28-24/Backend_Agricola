import { CsvExportService } from './csv-export.service';
import { EstadoCiclo } from '@prisma/client';
import { RentabilidadCicloItemDto } from '../../reportes/dto/rentabilidad-ciclo-response.dto';
import { ComparativoParcelaItemDto } from '../../reportes/dto/comparativo-parcela-response.dto';
import { CuentasPorCobrarResponseDto } from '../../reportes/dto/cuentas-por-cobrar-response.dto';

describe('CsvExportService', () => {
  let service: CsvExportService;

  beforeEach(() => {
    service = new CsvExportService();
  });

  it('debe exportar CSV con BOM UTF-8, comillas RFC 4180 y escape de fórmulas', () => {
    const mockItem: RentabilidadCicloItemDto = {
      ciclo: {
        id: 1,
        nombre: '=HYPERLINK("http://malicious.com")',
        estado: EstadoCiclo.FINALIZADO,
        fechaInicio: '2026-01-01',
        fechaFin: '2026-06-30',
        parcela: 'Parcela, con coma y "comillas"',
        predio: 'Predio con\nsalto de línea',
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
        ganancia: '-5000.00', // Ganancia negativa nunca debe llevar comilla simple de fórmula
        margenPct: '-4.13',
        roiPct: '-5.81',
        costoPorKg: '10.55',
        precioPromedioKg: '14.85',
        mermaPct: '0.61',
        costoPorHectarea: '34400.00',
        rendimientoKgHa: '3280.00',
        porCobrar: '0.00',
      },
    };

    const buffer = service.exportarRentabilidad([mockItem]);
    expect(buffer).toBeInstanceOf(Buffer);

    const str = buffer.toString('utf-8');

    // 1. Debe incluir BOM UTF-8 al inicio
    expect(str.startsWith('\uFEFF')).toBe(true);

    // 2. Comillas RFC 4180 para campos con comas o saltos de línea
    expect(str).toContain('"Parcela, con coma y ""comillas"""');
    expect(str).toContain('"Predio con\nsalto de línea"');

    // 3. Texto con fórmula escapado con comilla simple (y comillas duplicadas por RFC 4180)
    expect(str).toContain('\'=HYPERLINK(""http://malicious.com"")');

    // 4. Ganancia negativa no alterada
    expect(str).toContain('-5000.00');
    expect(str).not.toContain("'-5000.00");
  });

  it('debe exportar ciclo detalle con sus cuatro secciones delimitadas', () => {
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
        categoriaRaiz: 'Semillas',
        monto: '15000.00',
        porcentaje: '17.44',
      },
    ];

    const actividades = [
      {
        tipoActividadId: 2,
        tipoActividad: 'Poda',
        numeroActividades: 3,
        horasTotales: '12.50',
        costoTotal: '8000.00',
      },
    ];

    const mermas = [
      {
        motivo: 'Maduración excesiva',
        etapa: 'Campo',
        kgMerma: '120.000',
      },
    ];

    const buffer = service.exportarCicloDetalle(
      mockItem,
      categorias,
      actividades,
      mermas,
    );
    const str = buffer.toString('utf-8');

    expect(str).toContain('=== RENTABILIDAD DEL CICLO ===');
    expect(str).toContain('=== COSTOS POR CATEGORIA ===');
    expect(str).toContain('Semillas,15000.00,17.44');
    expect(str).toContain('=== COSTOS POR ACTIVIDAD ===');
    expect(str).toContain('Poda,3,12.50,8000.00');
    expect(str).toContain('=== DESGLOSE DE MERMAS ===');
    expect(str).toContain('Maduración excesiva,Campo,120.000');
  });

  it('debe exportar comparativo a CSV con columnas de LAG', () => {
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

    const buffer = service.exportarComparativo([mockComp]);
    const str = buffer.toString('utf-8');
    expect(str).toContain(
      'Margen Ciclo Ant. (%),Costo / kg Ciclo Ant. ($),Ganancia Ciclo Ant. ($)',
    );
    expect(str).toContain('30.00,12.00,25000.00');
  });

  it('debe exportar cuentas por cobrar con resumen y detalle', () => {
    const mockRes: CuentasPorCobrarResponseDto = {
      data: [
        {
          ventaId: 10,
          folio: 'FACT-99',
          clienteId: 3,
          clienteNombre: 'Cliente Moroso',
          cicloId: 5,
          fechaVenta: '2026-02-01',
          fechaVencimiento: '2026-02-15',
          montoTotal: '50000.00',
          montoCobrado: '10000.00',
          montoPendiente: '40000.00',
          diasVencimiento: 30,
          estadoCobro: 'PARCIAL',
          vencida: true,
        },
      ],
      resumen: {
        totalPorCobrar: '40000.00',
        totalVencido: '40000.00',
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

    const buffer = service.exportarCuentasPorCobrar(mockRes);
    const str = buffer.toString('utf-8');
    expect(str).toContain('=== RESUMEN DE CARTERA ===');
    expect(str).toContain('Total por Cobrar ($),40000.00');
    expect(str).toContain('Total Vencido ($),40000.00');
    expect(str).toContain('=== CUENTAS POR COBRAR ===');
    expect(str).toContain(
      'FACT-99,3,Cliente Moroso,5,2026-02-01,2026-02-15,50000.00,10000.00,40000.00,30,PARCIAL,SI',
    );
  });
});
