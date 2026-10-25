import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EstadoParcela } from '@prisma/client';

export class ParcelaResponseDto {
  @ApiProperty({ example: 1, description: 'ID de la parcela' })
  id!: number;

  @ApiProperty({ example: 1, description: 'ID del predio al que pertenece' })
  predioId!: number;

  @ApiProperty({ example: 'Rancho Santa Fe', description: 'Nombre del predio' })
  predioNombre!: string;

  @ApiPropertyOptional({
    type: Number,
    example: 2,
    nullable: true,
    description: 'ID del tipo agrológico de suelo',
  })
  tipoSueloId!: number | null;

  @ApiPropertyOptional({
    type: String,
    example: 'Franco',
    nullable: true,
    description: 'Nombre del tipo de suelo',
  })
  tipoSueloNombre!: string | null;

  @ApiProperty({
    example: 'Parcela Norte A',
    description: 'Nombre de la parcela',
  })
  nombre!: string;

  @ApiProperty({
    type: String,
    example: '5.25',
    description: 'Superficie en hectáreas (Decimal a string)',
  })
  superficie!: string;

  @ApiPropertyOptional({
    type: String,
    example: '16.9540123',
    nullable: true,
    description: 'Latitud de referencia',
  })
  latitud!: string | null;

  @ApiPropertyOptional({
    type: String,
    example: '-96.7220456',
    nullable: true,
    description: 'Longitud de referencia',
  })
  longitud!: string | null;

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: true,
    example: { type: 'Polygon', coordinates: [] },
    nullable: true,
    description: 'Perímetro GeoJSON de la parcela',
  })
  poligono!: unknown;

  @ApiProperty({
    enum: EstadoParcela,
    example: EstadoParcela.DISPONIBLE,
    description: 'Estado operativo actual de la parcela',
  })
  estado!: EstadoParcela;

  @ApiProperty({
    type: String,
    format: 'date-time',
    example: '2026-10-15T18:00:00.000Z',
    description: 'Fecha de creación',
  })
  createdAt!: string;

  @ApiProperty({
    type: String,
    format: 'date-time',
    example: '2026-10-15T18:00:00.000Z',
    description: 'Fecha de última actualización',
  })
  updatedAt!: string;
}
