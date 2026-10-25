import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class TipoSueloResponseDto {
  @ApiProperty({ example: 1, description: 'ID del tipo de suelo' })
  id!: number;

  @ApiProperty({
    example: 'Franco',
    description: 'Nombre del tipo agrológico de suelo',
  })
  nombre!: string;

  @ApiPropertyOptional({
    type: String,
    example:
      'Suelo equilibrado con proporciones óptimas de arena, limo y arcilla',
    nullable: true,
    description: 'Descripción de propiedades edafológicas',
  })
  descripcion!: string | null;
}
