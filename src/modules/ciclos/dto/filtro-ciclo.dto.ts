import { ApiPropertyOptional } from '@nestjs/swagger';
import { EstadoCiclo } from '@prisma/client';
import { IsEnum, IsInt, IsOptional, IsString, Matches, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class FiltroCicloDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Filtrar por identificador de parcela',
    example: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  parcelaId?: number;

  @ApiPropertyOptional({
    description: 'Filtrar por variedad de cultivo',
    example: 3,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  variedadId?: number;

  @ApiPropertyOptional({
    enum: EstadoCiclo,
    description: 'Filtrar por estado del ciclo (PLANIFICADO, ACTIVO, SUSPENDIDO, FINALIZADO, CANCELADO)',
    example: EstadoCiclo.ACTIVO,
  })
  @IsOptional()
  @IsEnum(EstadoCiclo)
  estado?: EstadoCiclo;

  @ApiPropertyOptional({
    description: 'Fecha de inicio desde (YYYY-MM-DD)',
    example: '2027-01-01',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'fechaInicioDesde debe ser YYYY-MM-DD' })
  fechaInicioDesde?: string;

  @ApiPropertyOptional({
    description: 'Fecha de inicio hasta (YYYY-MM-DD)',
    example: '2027-12-31',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'fechaInicioHasta debe ser YYYY-MM-DD' })
  fechaInicioHasta?: string;

  @ApiPropertyOptional({
    description: 'Búsqueda por nombre o notas del ciclo',
    example: 'Primavera',
  })
  @IsOptional()
  @IsString()
  q?: string;
}
