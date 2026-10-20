import { Actividad } from '@prisma/client';
import { ActividadResponseDto } from '../dto/actividad-response.dto';
import { ActividadDetalleResponseDto } from '../dto/actividad-detalle-response.dto';
import { FechaUtil } from '../../../common/utils/fechas';

export interface ActividadConRelacionesDetalle extends Actividad {
  ciclo: {
    id: number;
    nombre: string | null;
    estado: string;
    parcelaId: number;
    parcela: { nombre: string };
  };
  tipoActividad: {
    id: number;
    nombre: string;
  };
  responsable: {
    id: number;
    nombre: string;
    apellido: string;
  } | null;
  creadoPor: {
    id: number;
    nombre: string;
    apellido: string;
  };
}

/**
 * Mapper desacoplado para transformar entidades de persistencia en DTOs de salida.
 * Evita inflar los servicios de aplicación con lógica de formateo y serialización.
 */
export class ActividadMapper {
  /**
   * Mapea una entidad Actividad a ActividadResponseDto.
   */
  public static toResponseDto(actividad: Actividad): ActividadResponseDto {
    return {
      id: actividad.id,
      cicloId: actividad.cicloId,
      tipoActividadId: actividad.tipoActividadId,
      responsableId: actividad.responsableId,
      creadoPorId: actividad.creadoPorId,
      fecha: FechaUtil.toDateOnly(actividad.fecha),
      descripcion: actividad.descripcion,
      horasTrabajadas:
        actividad.horasTrabajadas !== null
          ? Number(actividad.horasTrabajadas).toFixed(2)
          : null,
      createdAt: actividad.createdAt,
      updatedAt: actividad.updatedAt,
    };
  }

  /**
   * Mapea una entidad Actividad con relaciones completas a ActividadDetalleResponseDto.
   */
  public static toDetalleResponseDto(
    actividad: ActividadConRelacionesDetalle,
    gastosVinculadosCount: number,
  ): ActividadDetalleResponseDto {
    return {
      ...this.toResponseDto(actividad),
      ciclo: {
        id: actividad.ciclo.id,
        nombre: actividad.ciclo.nombre,
        estado: actividad.ciclo.estado,
        parcelaId: actividad.ciclo.parcelaId,
        parcelaNombre: actividad.ciclo.parcela.nombre,
      },
      tipoActividad: {
        id: actividad.tipoActividad.id,
        nombre: actividad.tipoActividad.nombre,
      },
      responsable: actividad.responsable
        ? {
            id: actividad.responsable.id,
            nombre: actividad.responsable.nombre,
            apellido: actividad.responsable.apellido,
          }
        : null,
      creadoPor: {
        id: actividad.creadoPor.id,
        nombre: actividad.creadoPor.nombre,
        apellido: actividad.creadoPor.apellido,
      },
      gastosVinculadosCount,
    };
  }
}
