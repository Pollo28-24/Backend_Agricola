import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EstadoCiclo } from '@prisma/client';

export class CicloResponseDto {
  @ApiProperty({ example: 1, description: 'Identificador único del ciclo' })
  id!: number;

  @ApiProperty({ example: 10, description: 'Identificador de la empresa' })
  empresaId!: number;

  @ApiProperty({ example: 2, description: 'Identificador de la parcela' })
  parcelaId!: number;

  @ApiProperty({
    example: 5,
    description: 'Identificador de la variedad de cultivo',
  })
  variedadId!: number;

  @ApiPropertyOptional({
    type: String,
    example: 'Primavera 2027',
    description: 'Nombre descriptivo',
    nullable: true,
  })
  nombre!: string | null;

  @ApiProperty({
    type: String,
    format: 'date',
    example: '2027-01-10',
    description: 'Fecha de primera labor (YYYY-MM-DD)',
  })
  fechaInicio!: string;

  @ApiPropertyOptional({
    type: String,
    format: 'date',
    example: '2027-06-15',
    description: 'Fecha de fin (YYYY-MM-DD)',
    nullable: true,
  })
  fechaFin!: string | null;

  @ApiProperty({
    type: String,
    example: '2.50',
    description: 'Superficie sembrada en hectáreas (formato decimal string)',
  })
  superficieSembrada!: string;

  @ApiPropertyOptional({
    type: String,
    example: '9000.000',
    description: 'Meta de producción en kg (formato decimal string)',
    nullable: true,
  })
  metaProduccionKg!: string | null;

  @ApiProperty({
    enum: EstadoCiclo,
    example: EstadoCiclo.ACTIVO,
    description: 'Estado actual del ciclo',
  })
  estado!: EstadoCiclo;

  @ApiPropertyOptional({
    type: String,
    example: 'Riego por goteo',
    description: 'Observaciones agronómicas',
    nullable: true,
  })
  observaciones!: string | null;

  @ApiPropertyOptional({
    type: String,
    format: 'date-time',
    example: '2027-06-15T18:00:00.000Z',
    description: 'Fecha y hora de cierre formal',
    nullable: true,
  })
  cerradoEn!: Date | null;

  @ApiPropertyOptional({
    type: Number,
    example: 1,
    description: 'ID del usuario que cerró el ciclo',
    nullable: true,
  })
  cerradoPorId!: number | null;

  @ApiProperty({ example: 1, description: 'ID del usuario creador' })
  creadoPorId!: number;

  @ApiProperty({
    example: '2027-01-05T12:00:00.000Z',
    description: 'Fecha de creación del registro',
  })
  createdAt!: Date;

  @ApiProperty({
    example: '2027-01-10T08:00:00.000Z',
    description: 'Fecha de última modificación',
  })
  updatedAt!: Date;
}
