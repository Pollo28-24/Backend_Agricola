import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PredioResponseDto {
  @ApiProperty({ example: 1, description: 'ID del predio' })
  id!: number;

  @ApiProperty({
    example: 5,
    description: 'ID de la empresa tenant propietaria',
  })
  empresaId!: number;

  @ApiProperty({ example: 'Rancho Santa Fe', description: 'Nombre del predio' })
  nombre!: string;

  @ApiPropertyOptional({
    type: String,
    example: 'Carretera Federal Km 45.5',
    nullable: true,
    description: 'Ubicación física',
  })
  ubicacion!: string | null;

  @ApiPropertyOptional({
    type: String,
    example: 'Villa de Zaachila',
    nullable: true,
    description: 'Municipio',
  })
  municipio!: string | null;

  @ApiPropertyOptional({
    type: String,
    example: 'Oaxaca',
    nullable: true,
    description: 'Entidad federativa',
  })
  entidadFederativa!: string | null;

  @ApiProperty({
    type: String,
    example: '25.50',
    description: 'Superficie total en hectáreas (Decimal a string)',
  })
  superficieTotal!: string;

  @ApiPropertyOptional({
    type: String,
    example: '16.9531234',
    nullable: true,
    description: 'Coordenada de latitud',
  })
  latitud!: string | null;

  @ApiPropertyOptional({
    type: String,
    example: '-96.7215678',
    nullable: true,
    description: 'Coordenada de longitud',
  })
  longitud!: string | null;

  @ApiPropertyOptional({
    type: Number,
    example: 3,
    description: 'Cantidad de parcelas activas asociadas al predio',
  })
  parcelasCount?: number;

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
