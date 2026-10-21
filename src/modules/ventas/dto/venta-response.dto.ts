import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EstadoVenta } from '@prisma/client';
import { EstadoCobro } from '../../../common/domain/policies/venta-estado-cobro.policy';
import { VentaDetalleResponseDto } from './venta-detalle-response.dto';

export class VentaResponseDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 1 })
  cicloId: number;

  @ApiProperty({ example: 1 })
  clienteId: number;

  @ApiPropertyOptional({ example: 'Agrícola San José S.A. de C.V.' })
  clienteNombre?: string;

  @ApiProperty({ example: 10 })
  creadoPorId: number;

  @ApiProperty({ example: '2027-02-15' })
  fecha: string;

  @ApiPropertyOptional({ example: 'FAC-2027-001' })
  numeroFactura: string | null;

  @ApiProperty({ example: '0.00' })
  descuento: string;

  @ApiProperty({ example: '0.00' })
  impuesto: string;

  @ApiProperty({ example: '2550.00' })
  total: string;

  @ApiPropertyOptional({ example: '2027-03-15' })
  fechaLimitePago: string | null;

  @ApiProperty({ enum: EstadoVenta, example: EstadoVenta.REGISTRADA })
  estado: EstadoVenta;

  @ApiPropertyOptional({ example: 'Venta de cosecha de primera a granel' })
  notas: string | null;

  @ApiProperty({
    example: '0.00',
    description: 'Monto total cobrado de cobros vigentes',
  })
  totalCobrado: string;

  @ApiProperty({
    example: '2550.00',
    description: 'Saldo por cobrar pendiente',
  })
  saldoPendiente: string;

  @ApiProperty({
    enum: EstadoCobro,
    example: EstadoCobro.PENDIENTE,
    description: 'Estado de cobro derivado institucional (RN-055)',
  })
  estadoCobro: EstadoCobro;

  @ApiProperty({
    example: false,
    description:
      'Indica si la venta tiene saldo pendiente y venció su fecha límite de pago',
  })
  vencida: boolean;

  @ApiProperty({ type: [VentaDetalleResponseDto] })
  renglones: VentaDetalleResponseDto[];

  @ApiProperty({ example: '2027-02-15T12:00:00.000Z' })
  createdAt: Date;

  @ApiProperty({ example: '2027-02-15T12:00:00.000Z' })
  updatedAt: Date;
}
