import { Merma } from '@prisma/client';
import { MermaResponseDto } from '../dto/merma-response.dto';
import { MermaDetalleResponseDto } from '../dto/merma-detalle-response.dto';
import { FechaUtil } from '../../../common/utils/fechas';

export interface MermaConRelacionesDetalle extends Merma {
  ciclo: {
    id: number;
    nombre: string | null;
    estado: string;
    parcelaId: number;
    parcela: { nombre: string };
  };
  motivo: {
    id: number;
    nombre: string;
    descripcion: string | null;
  };
  cosecha: {
    id: number;
    fecha: Date;
    cantidad: { toString(): string };
    calidad: string;
  } | null;
  unidad: {
    id: number;
    codigo: string;
    nombre: string;
    tipo: string;
    factorABase: { toString(): string };
  };
  creadoPor: {
    id: number;
    nombre: string;
    apellido: string;
  };
}

export class MermaMapper {
  public static toResponseDto(merma: Merma): MermaResponseDto {
    return {
      id: merma.id,
      cicloId: merma.cicloId,
      motivoId: merma.motivoId,
      cosechaId: merma.cosechaId,
      unidadId: merma.unidadId,
      creadoPorId: merma.creadoPorId,
      fecha: FechaUtil.toDateOnly(merma.fecha),
      cantidad: merma.cantidad.toString(),
      etapa: merma.etapa,
      observaciones: merma.observaciones,
      createdAt: merma.createdAt,
      updatedAt: merma.updatedAt,
    };
  }

  public static toDetalleResponseDto(
    merma: MermaConRelacionesDetalle,
  ): MermaDetalleResponseDto {
    return {
      ...this.toResponseDto(merma),
      ciclo: {
        id: merma.ciclo.id,
        nombre: merma.ciclo.nombre,
        estado: merma.ciclo.estado,
        parcelaId: merma.ciclo.parcelaId,
        parcelaNombre: merma.ciclo.parcela.nombre,
      },
      motivo: {
        id: merma.motivo.id,
        nombre: merma.motivo.nombre,
        descripcion: merma.motivo.descripcion,
      },
      cosecha: merma.cosecha
        ? {
            id: merma.cosecha.id,
            fecha: FechaUtil.toDateOnly(merma.cosecha.fecha),
            cantidad: merma.cosecha.cantidad.toString(),
            calidad: merma.cosecha.calidad,
          }
        : null,
      unidad: {
        id: merma.unidad.id,
        codigo: merma.unidad.codigo,
        nombre: merma.unidad.nombre,
        tipo: merma.unidad.tipo,
        factorABase: merma.unidad.factorABase.toString(),
      },
      creadoPor: {
        id: merma.creadoPor.id,
        nombre: merma.creadoPor.nombre,
        apellido: merma.creadoPor.apellido,
      },
    };
  }
}
