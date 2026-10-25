import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CalidadCosecha } from '@prisma/client';

export class CosechaResponseDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 1 })
  cicloId: number;

  @ApiProperty({ example: 1 })
  unidadId: number;

  @ApiProperty({ example: 10 })
  creadoPorId: number;

  @ApiProperty({ type: String, format: 'date', example: '2027-02-10' })
  fecha: string;

  @ApiProperty({
    type: String,
    example: '1500.000',
    description: 'Cantidad física en unidad de origen',
  })
  cantidad: string;

  @ApiProperty({ enum: CalidadCosecha, example: CalidadCosecha.PRIMERA })
  calidad: CalidadCosecha;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    example: 'Primer corte de temporada',
  })
  observaciones: string | null;

  @ApiProperty({
    type: String,
    format: 'date-time',
    example: '2027-02-10T12:00:00.000Z',
  })
  createdAt: Date;

  @ApiProperty({
    type: String,
    format: 'date-time',
    example: '2027-02-10T12:00:00.000Z',
  })
  updatedAt: Date;
}
