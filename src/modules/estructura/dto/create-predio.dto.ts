import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreatePredioDto {
  @ApiProperty({
    example: 'Rancho Santa Fe',
    description: 'Nombre descriptivo del predio agrícola',
  })
  @IsString({ message: 'El nombre debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'El nombre es obligatorio' })
  @Length(2, 120, { message: 'El nombre debe tener entre 2 y 120 caracteres' })
  nombre!: string;

  @ApiPropertyOptional({
    example: 'Carretera Federal Km 45.5',
    description: 'Dirección o descripción de la ubicación física',
  })
  @IsOptional()
  @IsString({ message: 'La ubicación debe ser una cadena de texto' })
  @MaxLength(255, { message: 'La ubicación no puede exceder 255 caracteres' })
  ubicacion?: string;

  @ApiPropertyOptional({
    example: 'Villa de Zaachila',
    description: 'Municipio donde se encuentra el predio',
  })
  @IsOptional()
  @IsString({ message: 'El municipio debe ser una cadena de texto' })
  @MaxLength(100, { message: 'El municipio no puede exceder 100 caracteres' })
  municipio?: string;

  @ApiPropertyOptional({
    example: 'Oaxaca',
    description: 'Entidad federativa o estado',
  })
  @IsOptional()
  @IsString({ message: 'La entidad federativa debe ser una cadena de texto' })
  @MaxLength(100, {
    message: 'La entidad federativa no puede exceder 100 caracteres',
  })
  entidadFederativa?: string;

  @ApiProperty({
    example: 25.5,
    description: 'Superficie total del predio en hectáreas',
  })
  @Type(() => Number)
  @IsNumber({}, { message: 'La superficie total debe ser un valor numérico' })
  @Min(0.01, { message: 'La superficie total debe ser mayor a cero' })
  superficieTotal!: number;

  @ApiPropertyOptional({
    example: 16.9531234,
    description: 'Coordenada geográfica de latitud',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'La latitud debe ser un valor numérico' })
  latitud?: number;

  @ApiPropertyOptional({
    example: -96.7215678,
    description: 'Coordenada geográfica de longitud',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'La longitud debe ser un valor numérico' })
  longitud?: number;
}
