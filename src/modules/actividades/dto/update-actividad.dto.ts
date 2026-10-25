import { ApiPropertyOptional } from '@nestjs/swagger';
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

/**
 * DTO explícito para actualización de actividades.
 * No contiene campos inmutables (cicloId, empresaId, creadoPorId, createdAt)
 * garantizando que ninguna mutación altere la pertenencia estructural de la actividad.
 */
export class UpdateActividadDto {
  @ApiPropertyOptional({ example: 3, description: 'ID del tipo de actividad' })
  @IsOptional()
  @IsInt()
  @Min(1)
  tipoActividadId?: number;

  @ApiPropertyOptional({
    type: String,
    format: 'date',
    example: '2027-01-16',
    description: 'Fecha de la actividad (YYYY-MM-DD)',
  })
  @IsOptional()
  @IsDateString({ strict: true })
  fecha?: string;

  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    example: 6,
    description: 'ID del usuario responsable (o null para desasignar)',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  responsableId?: number | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    example: 'Corrección de descripción y ajuste de horas',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  descripcion?: string | null;

  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    example: 6.5,
    description: 'Horas trabajadas (máximo 2 decimales)',
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(9999.99)
  horasTrabajadas?: number | null;
}
