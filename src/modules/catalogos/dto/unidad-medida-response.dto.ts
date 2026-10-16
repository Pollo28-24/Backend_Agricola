import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TipoUnidad } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';

export class FiltroUnidadMedidaDto {
  @ApiPropertyOptional({
    enum: TipoUnidad,
    example: TipoUnidad.PESO,
    description:
      'Filtrar por tipo de magnitud física (PESO, VOLUMEN, AREA, TIEMPO, CONTEO)',
  })
  @IsOptional()
  @IsEnum(TipoUnidad, {
    message: 'El tipo debe ser PESO, VOLUMEN, AREA, TIEMPO o CONTEO',
  })
  tipo?: TipoUnidad;
}

export class UnidadMedidaResponseDto {
  @ApiProperty({ example: 1, description: 'ID de la unidad' })
  id!: number;

  @ApiProperty({ example: 'KG', description: 'Código de la unidad' })
  codigo!: string;

  @ApiProperty({
    example: 'Kilogramo',
    description: 'Nombre completo de la unidad',
  })
  nombre!: string;

  @ApiProperty({
    enum: TipoUnidad,
    example: TipoUnidad.PESO,
    description: 'Tipo de magnitud (PESO, VOLUMEN, AREA, TIEMPO, CONTEO)',
  })
  tipo!: TipoUnidad;

  @ApiProperty({
    example: '1.000000',
    description: 'Factor de conversión a la unidad base de su tipo',
  })
  factorABase!: string;
}
