import { ApiProperty } from '@nestjs/swagger';

export class CostoPorCategoriaDto {
  @ApiProperty({ example: 3, description: 'ID de la categoría raíz de gasto' })
  categoriaRaizId!: number;

  @ApiProperty({
    example: 'Fertilizantes',
    description: 'Nombre de la categoría raíz',
  })
  categoriaRaiz!: string;

  @ApiProperty({
    example: '45000.00',
    description: 'Monto total acumulado en la categoría (2 dec)',
  })
  monto!: string;

  @ApiProperty({
    example: '52.33',
    description: 'Porcentaje del costo total que representa (2 dec)',
  })
  porcentaje!: string;
}
