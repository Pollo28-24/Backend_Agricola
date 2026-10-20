import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateActividadDto {
  @ApiProperty({
    example: 1,
    description: 'ID del ciclo de producción (RN-010)',
  })
  @IsInt()
  @Min(1)
  cicloId: number;

  @ApiProperty({
    example: 2,
    description: 'ID del tipo de actividad de catálogo',
  })
  @IsInt()
  @Min(1)
  tipoActividadId: number;

  @ApiProperty({
    example: '2027-01-15',
    description: 'Fecha de la actividad (YYYY-MM-DD) (RN-044)',
  })
  @IsDateString({ strict: true })
  fecha: string;

  @ApiPropertyOptional({
    example: 5,
    description: 'ID del usuario responsable de la actividad',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  responsableId?: number;

  @ApiPropertyOptional({
    example: 'Desterronado y nivelación de cama de siembra con tractor',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  descripcion?: string;

  @ApiPropertyOptional({
    example: 8.5,
    description: 'Horas trabajadas (máximo 2 decimales)',
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(9999.99)
  horasTrabajadas?: number;
}
