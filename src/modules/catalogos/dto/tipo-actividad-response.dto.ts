import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class TipoActividadResponseDto {
  @ApiProperty({ example: 1, description: 'ID del tipo de actividad' })
  id!: number;

  @ApiProperty({
    example: 'Riego',
    description: 'Nombre de la actividad agrícola',
  })
  nombre!: string;

  @ApiPropertyOptional({
    example:
      'Aplicación de agua al cultivo mediante sistema tecnificado o gravedad',
    nullable: true,
    description: 'Descripción de la labor',
  })
  descripcion!: string | null;

  @ApiProperty({
    example: true,
    description: 'Indica si la actividad está habilitada',
  })
  activo!: boolean;
}
