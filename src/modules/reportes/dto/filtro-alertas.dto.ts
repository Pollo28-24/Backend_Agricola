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
import {
  SeveridadAlerta,
  CodigoAlerta,
  ReferenciaTipoAlerta,
} from '../constants/alertas.constants';

export class FiltroAlertasDto {
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
    enum: SeveridadAlerta,
    description:
      'Filtrar por nivel de severidad (ALTA, MEDIA, BAJA, INFORMATIVA)',
  })
  @IsOptional()
  @IsEnum(SeveridadAlerta)
  severidad?: SeveridadAlerta;

  @ApiPropertyOptional({
    enum: CodigoAlerta,
    description: 'Filtrar por tipo/código de alerta específico',
  })
  @IsOptional()
  @IsEnum(CodigoAlerta)
  tipo?: CodigoAlerta;

  @ApiPropertyOptional({
    enum: ReferenciaTipoAlerta,
    description:
      'Filtrar por entidad de referencia (CICLO, VENTA, CLIENTE, EMPRESA)',
  })
  @IsOptional()
  @IsEnum(ReferenciaTipoAlerta)
  referenciaTipo?: ReferenciaTipoAlerta;

  @ApiPropertyOptional({
    description: 'Filtrar por ID de ciclo de producción',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  cicloId?: number;

  @ApiPropertyOptional({
    example: '2026-10-21',
    description:
      'Fecha de corte (YYYY-MM-DD) para cálculo temporal (default: hoy en America/Mexico_City)',
  })
  @IsOptional()
  @IsDateString()
  hoy?: string;
}
