import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Length,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EstadoParcela } from '@prisma/client';

export class CreateParcelaDto {
  @ApiProperty({
    example: 1,
    description: 'ID del predio al que pertenece la parcela',
  })
  @Type(() => Number)
  @IsInt({ message: 'El predioId debe ser un número entero' })
  @Min(1, { message: 'El predioId debe ser mayor a 0' })
  @IsNotEmpty({ message: 'El predioId es obligatorio' })
  predioId!: number;

  @ApiPropertyOptional({
    example: 2,
    description: 'ID del tipo agrológico de suelo (opcional)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'El tipoSueloId debe ser un número entero' })
  @Min(1, { message: 'El tipoSueloId debe ser mayor a 0' })
  tipoSueloId?: number;

  @ApiProperty({
    example: 'Parcela Norte A',
    description:
      'Nombre o clave identificadora de la parcela dentro del predio',
  })
  @IsString({ message: 'El nombre debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'El nombre es obligatorio' })
  @Length(2, 120, { message: 'El nombre debe tener entre 2 y 120 caracteres' })
  nombre!: string;

  @ApiProperty({
    example: 5.25,
    description: 'Superficie de la parcela en hectáreas',
  })
  @Type(() => Number)
  @IsNumber({}, { message: 'La superficie debe ser un valor numérico' })
  @Min(0.01, { message: 'La superficie debe ser mayor a cero' })
  superficie!: number;

  @ApiPropertyOptional({
    example: 16.9540123,
    description: 'Coordenada de latitud del punto de referencia de la parcela',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'La latitud debe ser un valor numérico' })
  latitud?: number;

  @ApiPropertyOptional({
    example: -96.7220456,
    description: 'Coordenada de longitud del punto de referencia de la parcela',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'La longitud debe ser un valor numérico' })
  longitud?: number;

  @ApiPropertyOptional({
    example: {
      type: 'Polygon',
      coordinates: [
        [
          [-96.722, 16.954],
          [-96.721, 16.954],
          [-96.721, 16.953],
          [-96.722, 16.953],
          [-96.722, 16.954],
        ],
      ],
    },
    description: 'Geometría del perímetro de la parcela en formato GeoJSON',
  })
  @IsOptional()
  @IsObject({ message: 'El polígono debe ser un objeto GeoJSON válido' })
  poligono?: Record<string, any>;

  @ApiPropertyOptional({
    enum: EstadoParcela,
    example: EstadoParcela.DISPONIBLE,
    default: EstadoParcela.DISPONIBLE,
    description: 'Estado operativo actual de la parcela',
  })
  @IsOptional()
  @IsEnum(EstadoParcela, {
    message: 'El estado debe ser DISPONIBLE, EN_USO, DESCANSO o INACTIVA',
  })
  estado?: EstadoParcela = EstadoParcela.DISPONIBLE;
}
