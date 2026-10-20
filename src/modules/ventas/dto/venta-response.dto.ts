import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EstadoVenta } from '@prisma/client';
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

  @ApiProperty({ type: [VentaDetalleResponseDto] })
  renglones: VentaDetalleResponseDto[];

  @ApiProperty({ example: '2027-02-15T12:00:00.000Z' })
  createdAt: Date;

  @ApiProperty({ example: '2027-02-15T12:00:00.000Z' })
  updatedAt: Date;
}
