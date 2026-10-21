import { CobroVenta, Prisma } from '@prisma/client';
import { FechaUtil } from '../../../common/utils/fechas';
import { CobroResponseDto } from '../dto/cobro-response.dto';
import { CobroDetalleResponseDto } from '../dto/cobro-detalle-response.dto';
import { VentaEstadoCobroPolicy } from '../../../common/domain/policies/venta-estado-cobro.policy';

export type CobroConRegistrador = CobroVenta & {
  registradoPor: {
    id: number;
    nombre: string;
  };
  venta?: {
    id: number;
    total: Prisma.Decimal;
    estado: string;
    fechaLimitePago: Date | null;
  };
};

export class CobroMapper {
  public static toResponseDto(cobro: CobroConRegistrador): CobroResponseDto {
    return {
      id: cobro.id,
      ventaId: cobro.ventaId,
      fecha: FechaUtil.toDateOnly(cobro.fecha),
      monto: new Prisma.Decimal(cobro.monto).toFixed(2),
      metodo: cobro.metodo,
      referencia: cobro.referencia,
      registradoPor: {
        id: cobro.registradoPor.id,
        nombre: cobro.registradoPor.nombre,
      },
      createdAt: cobro.createdAt,
      deletedAt: cobro.deletedAt,
    };
  }

  public static toDetalleResponseDto(
    cobro: CobroConRegistrador,
    totalCobrado: Prisma.Decimal | string | number,
  ): CobroDetalleResponseDto {
    const base = this.toResponseDto(cobro);

    if (!cobro.venta) {
      throw new Error(
        'El objeto cobro debe incluir la relación venta para el detalle',
      );
    }

    const ventaTotalDec = new Prisma.Decimal(cobro.venta.total);
    const cobradoDec =
      totalCobrado instanceof Prisma.Decimal
        ? totalCobrado
        : new Prisma.Decimal(totalCobrado.toString());

    const { estadoCobro, saldoPendiente, vencida } =
      VentaEstadoCobroPolicy.calcularEstadoCobro({
        total: ventaTotalDec,
        totalCobrado: cobradoDec,
        estadoVenta: cobro.venta.estado,
        fechaLimitePago: cobro.venta.fechaLimitePago,
      });

    return {
      ...base,
      ventaTotal: ventaTotalDec.toFixed(2),
      totalCobrado: cobradoDec.toFixed(2),
      saldoPendiente,
      estadoCobroVenta: estadoCobro,
      vencida,
    };
  }
}
