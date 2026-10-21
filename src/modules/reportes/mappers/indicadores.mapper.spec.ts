import { Prisma, EstadoCiclo } from '@prisma/client';
import {
  IndicadoresMapper,
  FilaCostoActividad,
  CicloConRelaciones,
} from './indicadores.mapper';

describe('IndicadoresMapper (Unitario)', () => {
  const mockCiclo: CicloConRelaciones = {
    id: 10,
    nombre: 'Ciclo Verano 2026',
    estado: EstadoCiclo.FINALIZADO,
    fechaInicio: new Date('2026-02-01T00:00:00.000Z'),
    fechaFin: new Date('2026-07-15T00:00:00.000Z'),
    parcela: {
      nombre: 'Parcela 1',
      predio: { nombre: 'Predio San José' },
    },
    variedad: {
      nombre: 'Saladette',
      cultivo: { nombre: 'Jitomate' },
    },
  };

  it('debe mapear ciclo con relaciones a CicloInfoReporteDto correctamente', () => {
    const res = IndicadoresMapper.toCicloInfo(mockCiclo);
    expect(res).toEqual({
      id: 10,
      nombre: 'Ciclo Verano 2026',
      estado: EstadoCiclo.FINALIZADO,
      fechaInicio: '2026-02-01',
      fechaFin: '2026-07-15',
      parcela: 'Parcela 1',
      predio: 'Predio San José',
      variedad: 'Saladette',
      cultivo: 'Jitomate',
    });
  });

  it('debe convertir BigInt a number y formatear horas/costo en toCostoActividadList', () => {
    const fila: FilaCostoActividad = {
      tipoActividadId: 1,
      tipoActividad: 'Poda',
      numeroActividades: 15n, // BigInt proveniente de MySQL COUNT(*)
      horasTotales: new Prisma.Decimal('45.5'),
      costoTotal: new Prisma.Decimal('12000.00'),
    };

    const res = IndicadoresMapper.toCostoActividadList([fila]);
    expect(res).toHaveLength(1);
    expect(typeof res[0].numeroActividades).toBe('number');
    expect(res[0].numeroActividades).toBe(15);
    expect(res[0].horasTotales).toBe('45.50');
    expect(res[0].costoTotal).toBe('12000.00');
  });

  it('debe conservar los valores nulos en cocientes no definidos en toIndicadoresRentabilidad', () => {
    const res = IndicadoresMapper.toIndicadoresRentabilidad({
      cicloId: 10,
      empresaId: 1,
      parcelaId: 2,
      variedadId: 3,
      estado: 'ACTIVO',
      fechaInicio: '2026-01-01',
      superficieSembrada: '0.00',
      costoTotal: '0.00',
      kgCosechados: '0.000',
      kgMerma: '0.000',
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
    });

    expect(res.margenPct).toBeNull();
    expect(res.roiPct).toBeNull();
    expect(res.costoPorKg).toBeNull();
    expect(res.precioPromedioKg).toBeNull();
    expect(res.mermaPct).toBeNull();
    expect(res.costoPorHectarea).toBeNull();
    expect(res.rendimientoKgHa).toBeNull();
    expect(res.costoTotal).toBe('0.00');
    expect(res.kgMermaPoscosecha).toBe('0.000');
    expect(res.kgMermaCampo).toBe('0.000');
  });
});
