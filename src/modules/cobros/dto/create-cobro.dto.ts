import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MetodoPago } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

export class CreateCobroDto {
  @ApiProperty({
    example: '2026-03-15',
    description: 'Fecha del cobro en formato YYYY-MM-DD (RN-073)',
  })
  @IsNotEmpty()
  @IsDateString({ strict: true })
  fecha: string;

  @ApiProperty({
    example: '500.00',
    description:
      'Importe del cobro monetario, estrictamente positivo con hasta 2 decimales',
  })
  @IsNotEmpty()
  @IsString()
  @Matches(/^\d+(\.\d{1,2})?$/, {
    message: 'El monto debe ser un importe positivo con hasta 2 decimales',
  })
  monto: string;

  @ApiProperty({
    enum: MetodoPago,
    example: MetodoPago.EFECTIVO,
    description: 'Método de pago utilizado para el cobro',
  })
  @IsNotEmpty()
  @IsEnum(MetodoPago)
  metodo: MetodoPago;

  @ApiPropertyOptional({
    example: 'SPEI-847291',
    description:
      'Referencia bancaria o número de comprobante opcional (máx 100 caracteres)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  referencia?: string;
}
