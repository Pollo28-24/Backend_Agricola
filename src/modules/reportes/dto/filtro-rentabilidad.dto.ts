import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  Min,
  Max,
  IsEnum,
  IsDateString,
} from 'class-validator';
import { EstadoCiclo } from '@prisma/client';

export class FiltroRentabilidadDto {
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
    enum: EstadoCiclo,
    description: 'Filtrar por estado del ciclo de producción',
  })
  @IsOptional()
  @IsEnum(EstadoCiclo)
  estado?: EstadoCiclo;

  @ApiPropertyOptional({
    description: 'Filtrar por ID de parcela específica',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  parcelaId?: number;

  @ApiPropertyOptional({
    example: '2026-01-01',
    description: 'Fecha de inicio del ciclo mayor o igual a (YYYY-MM-DD)',
  })
  @IsOptional()
  @IsDateString()
  fechaInicioDesde?: string;

  @ApiPropertyOptional({
    example: '2026-12-31',
    description: 'Fecha de inicio del ciclo menor o igual a (YYYY-MM-DD)',
  })
  @IsOptional()
  @IsDateString()
  fechaInicioHasta?: string;
}
