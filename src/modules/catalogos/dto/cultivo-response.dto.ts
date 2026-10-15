import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CultivoResponseDto {
  @ApiProperty({ example: 1, description: 'ID del cultivo' })
  id!: number;

  @ApiProperty({ example: 'Tomate', description: 'Nombre comercial del cultivo' })
  nombre!: string;

  @ApiPropertyOptional({
    example: 'Solanum lycopersicum',
    nullable: true,
    description: 'Nombre científico botánico',
  })
  nombreCientifico!: string | null;

  @ApiPropertyOptional({
    example: 'Cultivo hortícola de fruto',
    nullable: true,
    description: 'Descripción agronómica',
  })
  descripcion!: string | null;

  @ApiProperty({ example: true, description: 'Indica si el cultivo está activo' })
  activo!: boolean;
}
