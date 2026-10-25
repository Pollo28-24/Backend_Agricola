import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class MotivoMermaResponseDto {
  @ApiProperty({ example: 1, description: 'ID del motivo de merma' })
  id!: number;

  @ApiProperty({
    example: 'Plaga o enfermedad',
    description: 'Nombre del motivo de pérdida',
  })
  nombre!: string;

  @ApiPropertyOptional({
    type: String,
    example:
      'Daño por insectos, hongos, bacterias o virus en campo o poscosecha',
    nullable: true,
    description: 'Descripción detallada',
  })
  descripcion!: string | null;

  @ApiProperty({
    example: true,
    description: 'Indica si el motivo está habilitado',
  })
  activo!: boolean;
}
