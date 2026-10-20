import { Prisma, Venta, DetalleVenta } from '@prisma/client';
import { VentaResponseDto } from '../dto/venta-response.dto';
import { VentaDetalleResponseDto } from '../dto/venta-detalle-response.dto';
import { FechaUtil } from '../../../common/utils/fechas';

export type DetalleVentaConRelaciones = DetalleVenta & {
  unidad?: {
    id: number;
    nombre: string;
    codigo: string;
  };
};

export type VentaConRelaciones = Venta & {
  cliente?: {
    id: number;
    nombre: string;
  };
  detalles?: DetalleVentaConRelaciones[];
};

export class VentaMapper {
  public static toDetalleResponseDto(
    detalle: DetalleVentaConRelaciones,
  ): VentaDetalleResponseDto {
    const cant = new Prisma.Decimal(detalle.cantidad);
    const precio = new Prisma.Decimal(detalle.precioUnitario);
    const subtotal = cant.mul(precio).toFixed(2);

    return {
      id: detalle.id,
      ventaId: detalle.ventaId,
      cosechaId: detalle.cosechaId,
      unidadId: detalle.unidadId,
      unidadNombre: detalle.unidad?.nombre,
      calidad: detalle.calidad,
      cantidad: cant.toString(),
      precioUnitario: precio.toString(),
      subtotal,
    };
  }

  public static toResponseDto(venta: VentaConRelaciones): VentaResponseDto {
    return {
      id: venta.id,
      cicloId: venta.cicloId,
      clienteId: venta.clienteId,
      clienteNombre: venta.cliente?.nombre,
      creadoPorId: venta.creadoPorId,
      fecha: FechaUtil.toDateOnly(venta.fecha),
      numeroFactura: venta.numeroFactura,
      descuento: new Prisma.Decimal(venta.descuento).toString(),
      impuesto: new Prisma.Decimal(venta.impuesto).toString(),
      total: new Prisma.Decimal(venta.total).toString(),
      fechaLimitePago: venta.fechaLimitePago
        ? FechaUtil.toDateOnly(venta.fechaLimitePago)
        : null,
      estado: venta.estado,
      notas: venta.notas,
      renglones: (venta.detalles ?? []).map((d) =>
        this.toDetalleResponseDto(d),
      ),
      createdAt: venta.createdAt,
      updatedAt: venta.updatedAt,
    };
  }
}
