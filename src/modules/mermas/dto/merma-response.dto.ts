import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EtapaMerma } from '@prisma/client';

export class MermaResponseDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 1 })
  cicloId: number;

  @ApiProperty({ example: 2 })
  motivoId: number;

  @ApiPropertyOptional({ type: Number, nullable: true, example: 5 })
  cosechaId: number | null;

  @ApiProperty({ example: 1 })
  unidadId: number;

  @ApiProperty({ example: 10 })
  creadoPorId: number;

  @ApiProperty({ type: String, format: 'date', example: '2027-02-12' })
  fecha: string;

  @ApiProperty({
    type: String,
    example: '50.000',
    description: 'Cantidad física en unidad de origen',
  })
  cantidad: string;

  @ApiProperty({ enum: EtapaMerma, example: EtapaMerma.POSCOSECHA })
  etapa: EtapaMerma;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    example: 'Fruto con daño mecánico',
  })
  observaciones: string | null;

  @ApiProperty({
    type: String,
    format: 'date-time',
    example: '2027-02-12T10:00:00.000Z',
  })
  createdAt: Date;

  @ApiProperty({
    type: String,
    format: 'date-time',
    example: '2027-02-12T10:00:00.000Z',
  })
  updatedAt: Date;
}
