import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ActividadResponseDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 1 })
  cicloId: number;

  @ApiProperty({ example: 2 })
  tipoActividadId: number;

  @ApiPropertyOptional({ example: 5, nullable: true })
  responsableId: number | null;

  @ApiProperty({ example: 1 })
  creadoPorId: number;

  @ApiProperty({
    example: '2027-01-15',
    description: 'Fecha en formato YYYY-MM-DD (3.23)',
  })
  fecha: string;

  @ApiPropertyOptional({
    example: 'Preparación de cama de siembra',
    nullable: true,
  })
  descripcion: string | null;

  @ApiPropertyOptional({
    example: '8.50',
    description: 'Horas trabajadas como string decimal',
    nullable: true,
  })
  horasTrabajadas: string | null;

  @ApiProperty({ example: '2027-01-15T10:00:00.000Z' })
  createdAt: Date;

  @ApiProperty({ example: '2027-01-15T10:00:00.000Z' })
  updatedAt: Date;
}
