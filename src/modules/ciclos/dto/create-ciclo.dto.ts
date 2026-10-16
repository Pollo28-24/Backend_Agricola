import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateCicloDto {
  @ApiProperty({
    example: 1,
    description: 'Identificador de la parcela donde se establecerá el ciclo',
  })
  @Type(() => Number)
  @IsInt({ message: 'El ID de la parcela debe ser un número entero' })
  @Min(1, { message: 'El ID de la parcela debe ser mayor a 0' })
  parcelaId!: number;

  @ApiProperty({
    example: 3,
    description: 'Identificador de la variedad de cultivo del catálogo global',
  })
  @Type(() => Number)
  @IsInt({ message: 'El ID de la variedad debe ser un número entero' })
  @Min(1, { message: 'El ID de la variedad debe ser mayor a 0' })
  variedadId!: number;

  @ApiPropertyOptional({
    example: 'Primavera 2027',
    maxLength: 120,
    description: 'Nombre descriptivo o comercial del ciclo (opcional)',
  })
  @IsOptional()
  @IsString({ message: 'El nombre debe ser una cadena de texto' })
  @MaxLength(120, { message: 'El nombre no puede exceder 120 caracteres' })
  nombre?: string;

  @ApiProperty({
    example: '2027-01-10',
    description: 'Fecha de la primera labor o preparación del suelo (YYYY-MM-DD)',
  })
  @IsNotEmpty({ message: 'La fecha de inicio es obligatoria (RN-044)' })
  @IsString({ message: 'La fecha de inicio debe ser una cadena de texto' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'La fecha de inicio debe tener el formato YYYY-MM-DD',
  })
  fechaInicio!: string;

  @ApiPropertyOptional({
    example: '2027-06-30',
    description: 'Fecha estimada o límite de fin del ciclo (YYYY-MM-DD, opcional)',
  })
  @IsOptional()
  @IsString({ message: 'La fecha de fin debe ser una cadena de texto' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'La fecha de fin debe tener el formato YYYY-MM-DD',
  })
  fechaFin?: string;

  @ApiProperty({
    example: 2.5,
    description: 'Superficie sembrada en hectáreas (debe ser mayor a 0 y no exceder la parcela)',
  })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'La superficie sembrada debe ser un número con hasta 2 decimales' })
  @IsPositive({ message: 'La superficie sembrada debe ser mayor a 0 (RN-018)' })
  superficieSembrada!: number;

  @ApiPropertyOptional({
    example: 9000.0,
    description: 'Meta de producción esperada en kilogramos (opcional)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 }, { message: 'La meta de producción debe ser un número con hasta 3 decimales' })
  @IsPositive({ message: 'La meta de producción debe ser mayor a 0 si se especifica' })
  metaProduccionKg?: number;

  @ApiPropertyOptional({
    example: 'Riego por goteo, acolchado plástico negro',
    description: 'Observaciones agronómicas o notas del ciclo',
  })
  @IsOptional()
  @IsString({ message: 'Las observaciones deben ser una cadena de texto' })
  observaciones?: string;
}
