import { Prisma } from '@prisma/client';
import {
  ActividadMapper,
  ActividadConRelacionesDetalle,
} from './actividad.mapper';

describe('ActividadMapper', () => {
  it('toResponseDto debe mapear campos correctamente y formatear fecha y horasTrabajadas', () => {
    const raw = {
      id: 1,
      cicloId: 2,
      tipoActividadId: 3,
      responsableId: 4,
      creadoPorId: 5,
      fecha: new Date('2027-01-15T00:00:00.000Z'),
      descripcion: 'Labor agronómica',
      horasTrabajadas: new Prisma.Decimal(8.5),
      createdAt: new Date('2027-01-15T10:00:00.000Z'),
      updatedAt: new Date('2027-01-15T12:00:00.000Z'),
      deletedAt: null,
    };

    const res = ActividadMapper.toResponseDto(raw);

    expect(res.id).toBe(1);
    expect(res.fecha).toBe('2027-01-15');
    expect(res.horasTrabajadas).toBe('8.50');
    expect(res.descripcion).toBe('Labor agronómica');
  });

  it('toDetalleResponseDto debe incluir relaciones y conteo de gastos vinculados', () => {
    const rawConRelaciones: ActividadConRelacionesDetalle = {
      id: 1,
      cicloId: 2,
      tipoActividadId: 3,
      responsableId: 4,
      creadoPorId: 5,
      fecha: new Date('2027-01-15T00:00:00.000Z'),
      descripcion: 'Labor agronómica',
      horasTrabajadas: null,
      createdAt: new Date('2027-01-15T10:00:00.000Z'),
      updatedAt: new Date('2027-01-15T12:00:00.000Z'),
      deletedAt: null,
      ciclo: {
        id: 2,
        nombre: 'Primavera 2027',
        estado: 'ACTIVO',
        parcelaId: 10,
        parcela: { nombre: 'Parcela Norte' },
      },
      tipoActividad: {
        id: 3,
        nombre: 'Riego',
      },
      responsable: {
        id: 4,
        nombre: 'Juan',
        apellido: 'Pérez',
      },
      creadoPor: {
        id: 5,
        nombre: 'Carlos',
        apellido: 'Gómez',
      },
    };

    const res = ActividadMapper.toDetalleResponseDto(rawConRelaciones, 3);

    expect(res.id).toBe(1);
    expect(res.horasTrabajadas).toBeNull();
    expect(res.gastosVinculadosCount).toBe(3);
    expect(res.ciclo.parcelaNombre).toBe('Parcela Norte');
    expect(res.tipoActividad.nombre).toBe('Riego');
    expect(res.responsable?.nombre).toBe('Juan');
    expect(res.creadoPor.nombre).toBe('Carlos');
  });
});
