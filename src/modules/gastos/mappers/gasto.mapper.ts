import { Gasto } from '@prisma/client';
import { GastoResponseDto } from '../dto/gasto-response.dto';
import { GastoDetalleResponseDto } from '../dto/gasto-detalle-response.dto';
import { FechaUtil } from '../../../common/utils/fechas';

export interface GastoConRelacionesDetalle extends Gasto {
  ciclo: {
    id: number;
    nombre: string | null;
    estado: string;
    parcelaId: number;
    parcela: { nombre: string };
  };
  categoria: {
    id: number;
    nombre: string;
    descripcion: string | null;
  };
  proveedor: {
    id: number;
    nombre: string;
    rfc: string | null;
    telefono: string | null;
  } | null;
  actividad: {
    id: number;
    fecha: Date;
    tipoActividad: { id: number; nombre: string };
  } | null;
  unidad: {
    id: number;
    codigo: string;
    nombre: string;
    tipo?: string;
  } | null;
  creadoPor: {
    id: number;
    nombre: string;
    apellido: string;
  };
}

/**
 * Mapper puro para la entidad Gasto.
 * Convierte montos Prisma.Decimal a strings sin conversión intermedia a flotantes IEEE 754.
 */
export class GastoMapper {
  public static toResponseDto(gasto: Gasto): GastoResponseDto {
    return {
      id: gasto.id,
      cicloId: gasto.cicloId,
      categoriaId: gasto.categoriaId,
      proveedorId: gasto.proveedorId,
      actividadId: gasto.actividadId,
      unidadId: gasto.unidadId,
      creadoPorId: gasto.creadoPorId,
      fecha: FechaUtil.toDateOnly(gasto.fecha),
      descripcion: gasto.descripcion,
      cantidad: gasto.cantidad.toString(),
      costoUnitario: gasto.costoUnitario.toString(),
      impuesto: gasto.impuesto.toString(),
      total: gasto.total.toString(),
      numeroComprobante: gasto.numeroComprobante,
      createdAt: gasto.createdAt,
      updatedAt: gasto.updatedAt,
    };
  }

  public static toDetalleResponseDto(
    gasto: GastoConRelacionesDetalle,
  ): GastoDetalleResponseDto {
    return {
      ...this.toResponseDto(gasto),
      ciclo: {
        id: gasto.ciclo.id,
        nombre: gasto.ciclo.nombre,
        estado: gasto.ciclo.estado,
        parcelaId: gasto.ciclo.parcelaId,
        parcelaNombre: gasto.ciclo.parcela.nombre,
      },
      categoria: {
        id: gasto.categoria.id,
        nombre: gasto.categoria.nombre,
        descripcion: gasto.categoria.descripcion,
      },
      proveedor: gasto.proveedor
        ? {
            id: gasto.proveedor.id,
            nombre: gasto.proveedor.nombre,
            rfc: gasto.proveedor.rfc,
            telefono: gasto.proveedor.telefono,
          }
        : null,
      actividad: gasto.actividad
        ? {
            id: gasto.actividad.id,
            fecha: FechaUtil.toDateOnly(gasto.actividad.fecha),
            tipoActividadNombre: gasto.actividad.tipoActividad.nombre,
          }
        : null,
      unidad: gasto.unidad
        ? {
            id: gasto.unidad.id,
            codigo: gasto.unidad.codigo,
            nombre: gasto.unidad.nombre,
            tipo: gasto.unidad.tipo,
          }
        : null,
      creadoPor: {
        id: gasto.creadoPor.id,
        nombre: gasto.creadoPor.nombre,
        apellido: gasto.creadoPor.apellido,
      },
    };
  }
}
