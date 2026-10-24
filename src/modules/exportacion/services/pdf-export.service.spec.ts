import { PdfExportService } from './pdf-export.service';
import { EstadoCiclo } from '@prisma/client';
import { RentabilidadCicloItemDto } from '../../reportes/dto/rentabilidad-ciclo-response.dto';
import { ComparativoParcelaItemDto } from '../../reportes/dto/comparativo-parcela-response.dto';
import { CuentasPorCobrarResponseDto } from '../../reportes/dto/cuentas-por-cobrar-response.dto';

describe('PdfExportService', () => {
  let service: PdfExportService;

  beforeEach(() => {
    service = new PdfExportService();
  });

  const mockCicloItem: RentabilidadCicloItemDto = {
    ciclo: {
      id: 1,
      nombre: 'Ciclo Piloto',
      estado: EstadoCiclo.FINALIZADO,
      fechaInicio: '2026-01-01',
      fechaFin: '2026-06-30',
      parcela: 'Parcela Norte',
      predio: 'Predio Central',
      variedad: 'Roma',
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

  it('debe exportar rentabilidad generando un buffer válido que empiece con %PDF y sea no vacío', async () => {
    const buffer = await service.exportarRentabilidad([mockCicloItem]);
    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(0);
    expect(buffer.subarray(0, 4).toString('utf-8')).toBe('%PDF');
  });

  it('debe exportar detalle de ciclo con sus secciones generando un PDF válido', async () => {
    const buffer = await service.exportarCicloDetalle(
      mockCicloItem,
      [
        {
          categoriaRaizId: 1,
          categoriaRaiz: 'Fertilizantes',
          monto: '50000.00',
          porcentaje: '58.14',
        },
      ],
      [
        {
          tipoActividadId: 2,
          tipoActividad: 'Riego',
          numeroActividades: 5,
          horasTotales: '20.00',
          costoTotal: '15000.00',
        },
      ],
      [
        {
          motivo: 'Plaga',
          etapa: 'Poscosecha',
          kgMerma: '50.000',
        },
      ],
    );

    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(0);
    expect(buffer.subarray(0, 4).toString('utf-8')).toBe('%PDF');
  });

  it('debe exportar comparativo generando un PDF válido', async () => {
    const mockComp: ComparativoParcelaItemDto = {
      ciclo: mockCicloItem.ciclo,
      indicadores: mockCicloItem.indicadores,
      margenPctCicloAnterior: '20.00',
      costoPorKgCicloAnterior: '11.00',
      gananciaCicloAnterior: '30000.00',
    };

    const buffer = await service.exportarComparativo([mockComp]);
    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(0);
    expect(buffer.subarray(0, 4).toString('utf-8')).toBe('%PDF');
  });

  it('debe exportar cuentas por cobrar generando un PDF válido', async () => {
    const mockRes: CuentasPorCobrarResponseDto = {
      data: [
        {
          ventaId: 1,
          folio: 'FAC-001',
          clienteId: 2,
          clienteNombre: 'Cliente X',
          cicloId: 1,
          fechaVenta: '2026-03-01',
          fechaVencimiento: '2026-03-31',
          montoTotal: '10000.00',
          montoCobrado: '5000.00',
          montoPendiente: '5000.00',
          diasVencimiento: 5,
          estadoCobro: 'PARCIAL',
          vencida: true,
        },
      ],
      resumen: {
        totalPorCobrar: '5000.00',
        totalVencido: '5000.00',
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
    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(0);
    expect(buffer.subarray(0, 4).toString('utf-8')).toBe('%PDF');
  });
});
