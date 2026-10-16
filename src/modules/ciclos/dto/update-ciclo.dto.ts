import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateCicloDto {
  @ApiPropertyOptional({
    example: 'Primavera 2027 - Corregido',
    maxLength: 120,
    description: 'Nombre descriptivo del ciclo',
  })
  @IsOptional()
  @IsString({ message: 'El nombre debe ser una cadena de texto' })
  @MaxLength(120, { message: 'El nombre no puede exceder 120 caracteres' })
  nombre?: string;

  @ApiPropertyOptional({
    example: 2.8,
    description:
      'Superficie sembrada en hectáreas (solo modificable si el ciclo aún no ha iniciado)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber(
    { maxDecimalPlaces: 2 },
    {
      message:
        'La superficie sembrada debe ser un número con hasta 2 decimales',
    },
  )
  @IsPositive({ message: 'La superficie sembrada debe ser mayor a 0 (RN-018)' })
  superficieSembrada?: number;

  @ApiPropertyOptional({
    example: 9500.0,
    description: 'Meta de producción esperada en kilogramos',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber(
    { maxDecimalPlaces: 3 },
    {
      message: 'La meta de producción debe ser un número con hasta 3 decimales',
    },
  )
  @IsPositive({ message: 'La meta de producción debe ser mayor a 0' })
  metaProduccionKg?: number;

  @ApiPropertyOptional({
    example: 'Se ajustó densidad de siembra',
    description: 'Observaciones agronómicas o notas del ciclo',
  })
  @IsOptional()
  @IsString({ message: 'Las observaciones deben ser una cadena de texto' })
  observaciones?: string;
}
