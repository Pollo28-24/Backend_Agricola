import { ApiPropertyOptional } from '@nestjs/swagger';
import { CalidadCosecha } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNumberString,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * DTO explícito para actualización de cosecha.
 * Inmutable: prohíbe cicloId, empresaId, creadoPorId y createdAt.
 */
export class UpdateCosechaDto {
  @ApiPropertyOptional({
    example: 1,
    description: 'ID de la unidad de medida (tipo PESO)',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  unidadId?: number;

  @ApiPropertyOptional({
    type: String,
    format: 'date',
    example: '2027-02-11',
    description: 'Fecha de la cosecha (YYYY-MM-DD)',
  })
  @IsOptional()
  @IsDateString({ strict: true })
  fecha?: string;

  @ApiPropertyOptional({
    type: String,
    example: '1450.000',
    description: 'Cantidad física cosechada (> 0)',
  })
  @IsOptional()
  @IsNumberString({ no_symbols: true })
  cantidad?: string;

  @ApiPropertyOptional({ enum: CalidadCosecha })
  @IsOptional()
  @IsEnum(CalidadCosecha)
  calidad?: CalidadCosecha;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    example: 'Ajuste de pesaje tras calibración de báscula',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  observaciones?: string | null;
}
