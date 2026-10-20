import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class FiltroActividadDto {
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

  @ApiPropertyOptional({ example: 1, description: 'Filtrar por ciclo de producción' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  cicloId?: number;

  @ApiPropertyOptional({ example: 2, description: 'Filtrar por tipo de actividad' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  tipoActividadId?: number;

  @ApiPropertyOptional({ example: 5, description: 'Filtrar por usuario responsable' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  responsableId?: number;

  @ApiPropertyOptional({ example: '2027-01-01', description: 'Fecha mínima de actividad' })
  @IsOptional()
  @IsDateString({ strict: true })
  fechaDesde?: string;

  @ApiPropertyOptional({ example: '2027-01-31', description: 'Fecha máxima de actividad' })
  @IsOptional()
  @IsDateString({ strict: true })
  fechaHasta?: string;

  @ApiPropertyOptional({ example: 'riego', description: 'Búsqueda por texto en descripción' })
  @IsOptional()
  @IsString()
  q?: string;
}
