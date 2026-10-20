import { ApiPropertyOptional } from '@nestjs/swagger';
import { EstadoVenta } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  Max,
  Min,
} from 'class-validator';

export class FiltroVentaDto {
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
    example: 1,
    description: 'Filtrar por cliente comprador',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  clienteId?: number;

  @ApiPropertyOptional({
    enum: EstadoVenta,
    description: 'Filtrar por estado de la venta (REGISTRADA, CANCELADA, etc.)',
  })
  @IsOptional()
  @IsEnum(EstadoVenta)
  estado?: EstadoVenta;

  @ApiPropertyOptional({
    example: '2027-02-01',
    description: 'Fecha mínima de venta (YYYY-MM-DD)',
  })
  @IsOptional()
  @IsDateString({ strict: true })
  fechaDesde?: string;

  @ApiPropertyOptional({
    example: '2027-02-28',
    description: 'Fecha máxima de venta (YYYY-MM-DD)',
  })
  @IsOptional()
  @IsDateString({ strict: true })
  fechaHasta?: string;
}
