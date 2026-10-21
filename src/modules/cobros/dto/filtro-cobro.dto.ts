import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';
import { COBRO_CONSTANTS } from '../constants/cobro.constants';

export class FiltroCobroDto {
  @ApiPropertyOptional({
    example: 1,
    description: 'Número de página',
    default: COBRO_CONSTANTS.PAGINACION.DEFAULT_PAGE,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = COBRO_CONSTANTS.PAGINACION.DEFAULT_PAGE;

  @ApiPropertyOptional({
    example: 20,
    description: 'Cantidad de elementos por página (máximo 100)',
    default: COBRO_CONSTANTS.PAGINACION.DEFAULT_LIMIT,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(COBRO_CONSTANTS.PAGINACION.MAX_LIMIT)
  limit?: number = COBRO_CONSTANTS.PAGINACION.DEFAULT_LIMIT;

  @ApiPropertyOptional({
    example: false,
    description:
      'Si es true, incluye cobros anulados en la consulta. Por defecto false (solo vigentes).',
    default: false,
  })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  incluirAnulados?: boolean = false;
}
