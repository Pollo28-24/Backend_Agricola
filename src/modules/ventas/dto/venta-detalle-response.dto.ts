import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CalidadCosecha } from '@prisma/client';

export class VentaDetalleResponseDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 1 })
  ventaId: number;

  @ApiPropertyOptional({ type: Number, nullable: true, example: 1 })
  cosechaId: number | null;

  @ApiProperty({ example: 1 })
  unidadId: number;

  @ApiPropertyOptional({ example: 'Kilogramo' })
  unidadNombre?: string;

  @ApiProperty({ enum: CalidadCosecha, example: CalidadCosecha.PRIMERA })
  calidad: CalidadCosecha;

  @ApiProperty({
    example: '100.000',
    description: 'Cantidad física en unidad de medida',
  })
  cantidad: string;

  @ApiProperty({
    example: '25.50',
    description: 'Precio unitario pactado',
  })
  precioUnitario: string;

  @ApiProperty({
    example: '2550.00',
    description: 'Subtotal calculado del renglón (cantidad × precioUnitario)',
  })
  subtotal: string;
}
