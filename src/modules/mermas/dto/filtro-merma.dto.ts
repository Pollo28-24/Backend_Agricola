import { ApiPropertyOptional } from '@nestjs/swagger';
import { EtapaMerma } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  Max,
  Min,
} from 'class-validator';

export class FiltroMermaDto {
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
    description: 'Filtrar por motivo de merma',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  motivoId?: number;

  @ApiPropertyOptional({ enum: EtapaMerma, description: 'Filtrar por etapa' })
  @IsOptional()
  @IsEnum(EtapaMerma)
  etapa?: EtapaMerma;

  @ApiPropertyOptional({
    example: '2027-02-01',
    description: 'Fecha mínima de merma',
  })
  @IsOptional()
  @IsDateString({ strict: true })
  fechaDesde?: string;

  @ApiPropertyOptional({
    example: '2027-02-28',
    description: 'Fecha máxima de merma',
  })
  @IsOptional()
  @IsDateString({ strict: true })
  fechaHasta?: string;
}
