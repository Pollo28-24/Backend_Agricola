import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type, Transform } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  Min,
  Max,
  IsEnum,
  IsBoolean,
  IsDateString,
} from 'class-validator';
import { EstadoCobro } from '../../../common/domain/policies/venta-estado-cobro.policy';

export class FiltroCuentasPorCobrarDto {
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
    enum: EstadoCobro,
    description:
      'Filtrar por estado de cobro derivado (PENDIENTE, PARCIAL, VENCIDA, PAGADA)',
  })
  @IsOptional()
  @IsEnum(EstadoCobro)
  estadoCobro?: EstadoCobro;

  @ApiPropertyOptional({
    description:
      'Filtrar por bandera de vencida (saldo > 0 y fechaLimitePago < hoy)',
  })
  @IsOptional()
  @Transform(
    ({
      obj,
      key,
      value,
    }: {
      obj?: Record<string, unknown>;
      key?: string;
      value: unknown;
    }) => {
      const raw = obj && key ? obj[key] : value;
      if (raw === 'true' || raw === true || raw === 1 || raw === '1') {
        return true;
      }
      if (raw === 'false' || raw === false || raw === 0 || raw === '0') {
        return false;
      }
      return undefined;
    },
  )
  @IsBoolean()
  vencida?: boolean;

  @ApiPropertyOptional({
    description: 'Filtrar por ID de cliente específico',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  clienteId?: number;

  @ApiPropertyOptional({
    example: '2026-10-21',
    description:
      'Fecha de corte (YYYY-MM-DD) para cálculo de mora y vencimiento (default: hoy en America/Mexico_City)',
  })
  @IsOptional()
  @IsDateString()
  hoy?: string;
}
