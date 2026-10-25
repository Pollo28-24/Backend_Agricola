import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class VariedadResponseDto {
  @ApiProperty({ example: 1, description: 'ID de la variedad' })
  id!: number;

  @ApiProperty({ example: 1, description: 'ID del cultivo al que pertenece' })
  cultivoId!: number;

  @ApiProperty({ example: 'Saladette', description: 'Nombre de la variedad' })
  nombre!: string;

  @ApiPropertyOptional({
    type: String,
    example: 'Variedad determinada de alto rendimiento',
    nullable: true,
    description: 'Descripción de características agronómicas',
  })
  descripcion!: string | null;

  @ApiPropertyOptional({
    type: Number,
    example: 90,
    nullable: true,
    description: 'Duración estimada del ciclo en días',
  })
  duracionCicloDias!: number | null;

  @ApiProperty({
    example: true,
    description: 'Indica si la variedad está activa',
  })
  activo!: boolean;
}
