import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateCategoriaGastoDto {
  @ApiProperty({
    example: 'Fertilizantes orgánicos',
    description: 'Nombre de la categoría de gasto',
  })
  @IsString({ message: 'El nombre debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'El nombre es obligatorio' })
  @Length(2, 100, { message: 'El nombre debe tener entre 2 y 100 caracteres' })
  nombre!: string;

  @ApiPropertyOptional({
    example: 'Composta, lixiviados y biofertilizantes artesanales',
    description: 'Descripción del tipo de gasto',
  })
  @IsOptional()
  @IsString({ message: 'La descripción debe ser una cadena de texto' })
  @MaxLength(255, { message: 'La descripción no puede exceder 255 caracteres' })
  descripcion?: string;

  @ApiPropertyOptional({
    example: 2,
    description:
      'ID de la categoría padre (si se omite, será una categoría raíz de nivel 1. Si se especifica, será una subcategoría de nivel 2 según RN-048)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'El ID de la categoría padre debe ser un número entero' })
  @Min(1, { message: 'El ID de la categoría padre debe ser mayor a 0' })
  categoriaPadreId?: number;
}

export class CategoriaGastoResponseDto {
  @ApiProperty({ example: 1, description: 'ID de la categoría de gasto' })
  id!: number;

  @ApiPropertyOptional({
    example: 5,
    nullable: true,
    description: 'ID de la empresa tenant propietaria (null si es global del sistema)',
  })
  empresaId!: number | null;

  @ApiProperty({
    example: true,
    description: 'Indica si es una categoría personalizada creada por la empresa (RN-047)',
  })
  esPersonalizada!: boolean;

  @ApiPropertyOptional({
    example: null,
    nullable: true,
    description: 'ID de la categoría padre (null si es raíz de nivel 1)',
  })
  categoriaPadreId!: number | null;

  @ApiProperty({ example: 'Insumos agrícolas', description: 'Nombre de la categoría' })
  nombre!: string;

  @ApiPropertyOptional({
    example: 'Semillas, fertilizantes y agroquímicos',
    nullable: true,
    description: 'Descripción',
  })
  descripcion!: string | null;

  @ApiProperty({ example: true, description: 'Indica si está activa' })
  activo!: boolean;

  @ApiPropertyOptional({
    type: () => [CategoriaGastoResponseDto],
    description: 'Subcategorías de segundo nivel hijas de esta categoría (RN-048)',
  })
  subcategorias?: CategoriaGastoResponseDto[];
}
