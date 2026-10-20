import { ApiPropertyOptional } from '@nestjs/swagger';
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

export class UpdateVentaDto {
  @ApiPropertyOptional({
    example: 1,
    description:
      'Nuevo ID del cliente comprador (debe pertenecer a la empresa y estar activo)',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  clienteId?: number;

  @ApiPropertyOptional({
    example: '2027-02-16',
    description:
      'Nueva fecha de la venta (YYYY-MM-DD, >= fechaInicio del ciclo, RN-044)',
  })
  @IsOptional()
  @IsDateString({ strict: true })
  fecha?: string;

  @ApiPropertyOptional({
    example: 'FAC-2027-002',
    maxLength: 50,
    description: 'Número de factura fiscal asociada',
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  numeroFactura?: string;

  @ApiPropertyOptional({
    example: '5.00',
    description: 'Descuento total aplicado (>= 0, máx 2 decimales)',
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
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d+(\.\d{1,2})?$/, {
    message: 'El impuesto debe ser un número positivo con máximo 2 decimales',
  })
  impuesto?: string;

  @ApiPropertyOptional({
    example: '2500.00',
    description: 'Total facturado de la venta (>= 0, máx 2 decimales, RN-052)',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d+(\.\d{1,2})?$/, {
    message: 'El total debe ser un número positivo con máximo 2 decimales',
  })
  total?: string;

  @ApiPropertyOptional({
    example: '2027-03-20',
    description: 'Fecha límite de pago acordada (YYYY-MM-DD)',
  })
  @IsOptional()
  @IsDateString({ strict: true })
  fechaLimitePago?: string;

  @ApiPropertyOptional({
    example: 'Ajuste de notas en la venta',
    maxLength: 500,
    description: 'Notas u observaciones de la transacción',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notas?: string;

  @ApiPropertyOptional({
    type: [CreateDetalleVentaDto],
    description: `Reemplazo total atómico de renglones si se proporciona (mínimo ${VENTA_CONSTANTS.MIN_RENGLONES}, máximo ${VENTA_CONSTANTS.MAX_RENGLONES})`,
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(VENTA_CONSTANTS.MIN_RENGLONES, {
    message: `Si se actualizan los renglones, debe incluir al menos ${VENTA_CONSTANTS.MIN_RENGLONES}`,
  })
  @ArrayMaxSize(VENTA_CONSTANTS.MAX_RENGLONES, {
    message: `Los renglones no pueden superar los ${VENTA_CONSTANTS.MAX_RENGLONES}`,
  })
  @ValidateNested({ each: true })
  @Type(() => CreateDetalleVentaDto)
  renglones?: CreateDetalleVentaDto[];
}
