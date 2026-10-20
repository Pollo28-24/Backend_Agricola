import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsInt,
  IsNumberString,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * DTO explícito para actualización de gastos.
 * Inmutable por diseño: NO incluye cicloId, empresaId, creadoPorId ni createdAt.
 * No hereda de PartialType para asegurar la inmutabilidad de la estructura financiera.
 */
export class UpdateGastoDto {
  @ApiPropertyOptional({
    example: 2,
    description: 'ID de la categoría de gasto',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  categoriaId?: number;

  @ApiPropertyOptional({
    example: '2027-01-16',
    description: 'Fecha del gasto (YYYY-MM-DD)',
  })
  @IsOptional()
  @IsDateString({ strict: true })
  fecha?: string;

  @ApiPropertyOptional({
    example: '1550.00',
    description: 'Total del gasto (estrictamente > 0)',
  })
  @IsOptional()
  @IsNumberString({ no_symbols: true })
  total?: string;

  @ApiPropertyOptional({
    example: 5,
    description: 'ID del proveedor (o null para desasociar)',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  proveedorId?: number | null;

  @ApiPropertyOptional({
    example: 4,
    description: 'ID de la actividad vinculada (o null para desasociar)',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  actividadId?: number | null;

  @ApiPropertyOptional({
    example: 1,
    description: 'ID de la unidad de medida (o null para desasociar)',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  unidadId?: number | null;

  @ApiPropertyOptional({
    example: 'Corrección de descripción y ajuste de comprobante',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  descripcion?: string | null;

  @ApiPropertyOptional({
    example: '12.000',
    description: 'Cantidad física adquirida/consumida',
  })
  @IsOptional()
  @IsNumberString({ no_symbols: true })
  cantidad?: string | null;

  @ApiPropertyOptional({
    example: '125.00',
    description: 'Costo unitario sin impuestos',
  })
  @IsOptional()
  @IsNumberString({ no_symbols: true })
  costoUnitario?: string | null;

  @ApiPropertyOptional({
    example: '50.00',
    description: 'Importe de impuestos aplicados',
  })
  @IsOptional()
  @IsNumberString({ no_symbols: true })
  impuesto?: string | null;

  @ApiPropertyOptional({
    example: 'FAC-B-10293',
    description: 'Número o folio de comprobante',
    maxLength: 60,
  })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  numeroComprobante?: string | null;
}
