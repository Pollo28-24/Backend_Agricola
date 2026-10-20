import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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

export class CreateCosechaDto {
  @ApiProperty({
    example: 1,
    description: 'ID del ciclo de producción (RN-010)',
  })
  @IsInt()
  @Min(1)
  cicloId: number;

  @ApiProperty({
    example: 1,
    description: 'ID de la unidad de medida (RN-024 / tipo PESO RN-069)',
  })
  @IsInt()
  @Min(1)
  unidadId: number;

  @ApiProperty({
    example: '2027-02-10',
    description: 'Fecha de la cosecha (YYYY-MM-DD) (RN-044)',
  })
  @IsDateString({ strict: true })
  fecha: string;

  @ApiProperty({
    example: '1500.000',
    description: 'Cantidad física cosechada (> 0, máx 3 decimales) (RN-026)',
  })
  @IsNumberString({ no_symbols: true })
  cantidad: string;

  @ApiPropertyOptional({
    enum: CalidadCosecha,
    default: CalidadCosecha.PRIMERA,
    description: 'Clasificación de calidad del corte/cosecha',
  })
  @IsOptional()
  @IsEnum(CalidadCosecha)
  calidad?: CalidadCosecha = CalidadCosecha.PRIMERA;

  @ApiPropertyOptional({
    example: 'Primer corte de temporada en sección norte de la parcela',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  observaciones?: string;
}
