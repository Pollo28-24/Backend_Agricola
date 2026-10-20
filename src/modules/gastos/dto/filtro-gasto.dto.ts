import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class FiltroGastoDto {
  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ example: 20, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({
    example: 1,
    description: 'Filtrar por ciclo de producción',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  cicloId?: number;

  @ApiPropertyOptional({
    example: 2,
    description: 'Filtrar por categoría de gasto',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  categoriaId?: number;

  @ApiPropertyOptional({ example: 5, description: 'Filtrar por proveedor' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  proveedorId?: number;

  @ApiPropertyOptional({
    example: 3,
    description: 'Filtrar por actividad agrícola vinculada',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  actividadId?: number;

  @ApiPropertyOptional({
    example: '2027-01-01',
    description: 'Fecha mínima del gasto',
  })
  @IsOptional()
  @IsDateString({ strict: true })
  fechaDesde?: string;

  @ApiPropertyOptional({
    example: '2027-01-31',
    description: 'Fecha máxima del gasto',
  })
  @IsOptional()
  @IsDateString({ strict: true })
  fechaHasta?: string;

  @ApiPropertyOptional({
    example: 'fertilizante',
    description: 'Búsqueda por texto en descripción o folio',
  })
  @IsOptional()
  @IsString()
  q?: string;
}
