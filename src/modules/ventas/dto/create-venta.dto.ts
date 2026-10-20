import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { CreateDetalleVentaDto } from './create-detalle-venta.dto';
import { VENTA_CONSTANTS } from '../constants/venta.constants';

export class CreateVentaDto {
  @ApiProperty({
    example: 1,
    description: 'ID del ciclo de producción (RN-010 / RN-044)',
  })
  @IsInt()
  @Min(1)
  cicloId: number;

  @ApiProperty({
    example: 1,
    description:
      'ID del cliente comprador (debe pertenecer a la empresa y estar activo)',
  })
  @IsInt()
  @Min(1)
  clienteId: number;

  @ApiProperty({
    example: '2027-02-15',
    description:
      'Fecha de la venta (YYYY-MM-DD, >= fechaInicio del ciclo, RN-044)',
  })
  @IsDateString({ strict: true })
  fecha: string;

  @ApiPropertyOptional({
    example: 'FAC-2027-001',
    maxLength: 50,
    description: 'Número de factura fiscal asociada',
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  numeroFactura?: string;

  @ApiPropertyOptional({
    example: '10.00',
    description: 'Descuento total aplicado (>= 0, máx 2 decimales)',
    default: '0.00',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d+(\.\d{1,2})?$/, {
    message: 'El descuento debe ser un número positivo con máximo 2 decimales',
  })
  descuento?: string;

  @ApiPropertyOptional({
    example: '16.00',
    description: 'Impuesto total trasladado (>= 0 y <= total, máx 2 decimales)',
    default: '0.00',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d+(\.\d{1,2})?$/, {
    message: 'El impuesto debe ser un número positivo con máximo 2 decimales',
  })
  impuesto?: string;

  @ApiProperty({
    example: '2550.00',
    description: 'Total facturado de la venta (>= 0, máx 2 decimales, RN-052)',
  })
  @IsString()
  @Matches(/^\d+(\.\d{1,2})?$/, {
    message: 'El total debe ser un número positivo con máximo 2 decimales',
  })
  total: string;

  @ApiPropertyOptional({
    example: '2027-03-15',
    description: 'Fecha límite de pago acordada (YYYY-MM-DD)',
  })
  @IsOptional()
  @IsDateString({ strict: true })
  fechaLimitePago?: string;

  @ApiPropertyOptional({
    example: 'Venta de cosecha de primera a granel',
    maxLength: 500,
    description: 'Notas u observaciones de la transacción',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notas?: string;

  @ApiProperty({
    type: [CreateDetalleVentaDto],
    description: `Renglones de la venta (mínimo ${VENTA_CONSTANTS.MIN_RENGLONES}, máximo ${VENTA_CONSTANTS.MAX_RENGLONES})`,
  })
  @IsArray()
  @ArrayMinSize(VENTA_CONSTANTS.MIN_RENGLONES, {
    message: `La venta debe incluir al menos ${VENTA_CONSTANTS.MIN_RENGLONES} renglón`,
  })
  @ArrayMaxSize(VENTA_CONSTANTS.MAX_RENGLONES, {
    message: `La venta no puede superar los ${VENTA_CONSTANTS.MAX_RENGLONES} renglones`,
  })
  @ValidateNested({ each: true })
  @Type(() => CreateDetalleVentaDto)
  renglones: CreateDetalleVentaDto[];
}
