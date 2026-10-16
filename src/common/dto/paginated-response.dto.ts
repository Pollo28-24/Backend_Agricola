import { ApiProperty } from '@nestjs/swagger';

export class PaginacionMetaDto {
  @ApiProperty({ example: 45, description: 'Total de registros encontrados' })
  total!: number;

  @ApiProperty({ example: 1, description: 'Página actual consultada' })
  page!: number;

  @ApiProperty({
    example: 20,
    description: 'Cantidad máxima de registros por página',
  })
  limit!: number;

  @ApiProperty({ example: 3, description: 'Total de páginas disponibles' })
  totalPages!: number;
}

export class PaginatedResponseDto<T> {
  @ApiProperty({
    isArray: true,
    description: 'Listado de elementos de la página actual',
  })
  data!: T[];

  @ApiProperty({
    type: PaginacionMetaDto,
    description: 'Metadatos de la paginación',
  })
  meta!: PaginacionMetaDto;
}
