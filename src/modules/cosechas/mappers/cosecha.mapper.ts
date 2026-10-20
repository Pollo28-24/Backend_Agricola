import { Cosecha } from '@prisma/client';
import { CosechaResponseDto } from '../dto/cosecha-response.dto';
import { CosechaDetalleResponseDto } from '../dto/cosecha-detalle-response.dto';
import { FechaUtil } from '../../../common/utils/fechas';

export interface CosechaConRelacionesDetalle extends Cosecha {
  ciclo: {
    id: number;
    nombre: string | null;
    estado: string;
    parcelaId: number;
    parcela: { nombre: string };
  };
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

export class CosechaMapper {
  public static toResponseDto(cosecha: Cosecha): CosechaResponseDto {
    return {
      id: cosecha.id,
      cicloId: cosecha.cicloId,
      unidadId: cosecha.unidadId,
      creadoPorId: cosecha.creadoPorId,
      fecha: FechaUtil.toDateOnly(cosecha.fecha),
      cantidad: cosecha.cantidad.toString(),
      calidad: cosecha.calidad,
      observaciones: cosecha.observaciones,
      createdAt: cosecha.createdAt,
      updatedAt: cosecha.updatedAt,
    };
  }

  public static toDetalleResponseDto(
    cosecha: CosechaConRelacionesDetalle,
    mermasVinculadasCount = 0,
  ): CosechaDetalleResponseDto {
    return {
      ...this.toResponseDto(cosecha),
      ciclo: {
        id: cosecha.ciclo.id,
        nombre: cosecha.ciclo.nombre,
        estado: cosecha.ciclo.estado,
        parcelaId: cosecha.ciclo.parcelaId,
        parcelaNombre: cosecha.ciclo.parcela.nombre,
      },
      unidad: {
        id: cosecha.unidad.id,
        codigo: cosecha.unidad.codigo,
        nombre: cosecha.unidad.nombre,
        tipo: cosecha.unidad.tipo,
        factorABase: cosecha.unidad.factorABase.toString(),
      },
      creadoPor: {
        id: cosecha.creadoPor.id,
        nombre: cosecha.creadoPor.nombre,
        apellido: cosecha.creadoPor.apellido,
      },
      mermasVinculadasCount,
    };
  }
}
