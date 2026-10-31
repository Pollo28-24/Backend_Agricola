import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min, Max, IsBoolean } from 'class-validator';
import { ToBoolean } from '../../../common/decorators/to-boolean.decorator';

export class FiltroComparativoDto {
  @ApiPropertyOptional({
    default: 1,
    minimum: 1,
    description: 'Número de página',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    default: 10,
    minimum: 1,
    maximum: 100,
    description: 'Cantidad de elementos por página (máximo 100)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 10;

  @ApiPropertyOptional({
    default: false,
    description:
      'Si es true incluye ciclos ACTIVO y SUSPENDIDO además de FINALIZADO. Por defecto solo FINALIZADO.',
  })
  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  incluirActivos?: boolean = false;
}
