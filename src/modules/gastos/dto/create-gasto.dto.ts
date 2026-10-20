import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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
 * DTO para la creación de un gasto operativo (F-09 / RN-019 / RN-020 / RN-045).
 * Los importes monetarios y cantidades se reciben como strings numéricos
 * para evitar la pérdida de precisión de flotantes IEEE 754 antes de convertirse en Prisma.Decimal.
 */
export class CreateGastoDto {
  @ApiProperty({
    example: 1,
    description: 'ID del ciclo de producción (RN-010)',
  })
  @IsInt()
  @Min(1)
  cicloId: number;

  @ApiProperty({
    example: 2,
    description: 'ID de la categoría de gasto (RN-019)',
  })
  @IsInt()
  @Min(1)
  categoriaId: number;

  @ApiProperty({
    example: '2027-01-15',
    description: 'Fecha del gasto (YYYY-MM-DD) (RN-044)',
  })
  @IsDateString({ strict: true })
  fecha: string;

  @ApiProperty({
    example: '1500.50',
    description:
      'Total del gasto (estrictamente > 0, máx 2 decimales) (RN-020)',
  })
  @IsNumberString({ no_symbols: true })
  total: string;

  @ApiPropertyOptional({
    example: 5,
    description: 'ID del proveedor (opcional) (RN-022)',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  proveedorId?: number;

  @ApiPropertyOptional({
    example: 3,
    description:
      'ID de la actividad agrícola vinculada (opcional, mismo ciclo) (RN-046)',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  actividadId?: number;

  @ApiPropertyOptional({
    example: 1,
    description:
      'ID de la unidad de medida (obligatorio si se especifica cantidad) (RN-024)',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  unidadId?: number;

  @ApiPropertyOptional({
    example: 'Compra de fertilizante soluble triple 16 para fertirriego',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  descripcion?: string;

  @ApiPropertyOptional({
    example: '10.000',
    description: 'Cantidad física adquirida/consumida (máx 3 decimales)',
  })
  @IsOptional()
  @IsNumberString({ no_symbols: true })
  cantidad?: string;

  @ApiPropertyOptional({
    example: '130.00',
    description: 'Costo unitario sin impuestos (máx 2 decimales)',
  })
  @IsOptional()
  @IsNumberString({ no_symbols: true })
  costoUnitario?: string;

  @ApiPropertyOptional({
    example: '200.50',
    description: 'Importe de impuestos aplicados (máx 2 decimales, default 0)',
  })
  @IsOptional()
  @IsNumberString({ no_symbols: true })
  impuesto?: string;

  @ApiPropertyOptional({
    example: 'FAC-A-98432',
    description: 'Número o folio de comprobante/factura física',
    maxLength: 60,
  })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  numeroComprobante?: string;
}
