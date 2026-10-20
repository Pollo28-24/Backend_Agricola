import { ApiPropertyOptional } from '@nestjs/swagger';
import { EtapaMerma } from '@prisma/client';
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
 * DTO explícito para actualización de merma.
 * Inmutable: prohíbe cicloId, empresaId, creadoPorId y createdAt.
 */
export class UpdateMermaDto {
  @ApiPropertyOptional({ example: 3, description: 'ID del motivo de merma' })
  @IsOptional()
  @IsInt()
  @Min(1)
  motivoId?: number;

  @ApiPropertyOptional({
    example: 1,
    description: 'ID de la unidad de medida (tipo PESO)',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  unidadId?: number;

  @ApiPropertyOptional({
    example: '2027-02-13',
    description: 'Fecha de la merma (YYYY-MM-DD)',
  })
  @IsOptional()
  @IsDateString({ strict: true })
  fecha?: string;

  @ApiPropertyOptional({
    example: '45.000',
    description: 'Cantidad física mermada (> 0)',
  })
  @IsOptional()
  @IsNumberString({ no_symbols: true })
  cantidad?: string;

  @ApiPropertyOptional({ enum: EtapaMerma })
  @IsOptional()
  @IsEnum(EtapaMerma)
  etapa?: EtapaMerma;

  @ApiPropertyOptional({
    example: 6,
    description:
      'ID de la cosecha de origen vinculada (o null para desvincular)',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  cosechaId?: number | null;

  @ApiPropertyOptional({
    example: 'Corrección de etapa y ajuste de pesaje',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  observaciones?: string | null;
}
