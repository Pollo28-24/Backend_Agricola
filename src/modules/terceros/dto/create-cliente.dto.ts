import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TipoCliente } from '@prisma/client';
import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateClienteDto {
  @ApiProperty({
    example: 'Central de Abastos Guadalajara',
    maxLength: 150,
    description:
      'Nombre comercial o razón social del cliente (único por empresa)',
  })
  @IsString({ message: 'El nombre debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'El nombre del cliente es obligatorio' })
  @MaxLength(150, { message: 'El nombre no puede exceder 150 caracteres' })
  nombre!: string;

  @ApiPropertyOptional({
    example: 'CAG880512XYZ',
    maxLength: 13,
    description: 'Registro Federal de Contribuyentes (RFC)',
  })
  @IsOptional()
  @IsString({ message: 'El RFC debe ser una cadena de texto' })
  @MaxLength(13, { message: 'El RFC no puede exceder 13 caracteres' })
  rfc?: string;

  @ApiPropertyOptional({
    example: '3398765432',
    maxLength: 30,
    description: 'Teléfono de contacto',
  })
  @IsOptional()
  @IsString({ message: 'El teléfono debe ser una cadena de texto' })
  @MaxLength(30, { message: 'El teléfono no puede exceder 30 caracteres' })
  telefono?: string;

  @ApiPropertyOptional({
    example: 'compras@centralabastos.com',
    maxLength: 150,
    description: 'Correo electrónico de contacto',
  })
  @IsOptional()
  @IsEmail({}, { message: 'El correo electrónico no tiene un formato válido' })
  @MaxLength(150, { message: 'El correo no puede exceder 150 caracteres' })
  correo?: string;

  @ApiPropertyOptional({
    enum: TipoCliente,
    default: TipoCliente.OTRO,
    description: 'Canal de comercialización o tipo de cliente (F-06)',
    example: TipoCliente.MERCADO_MAYOREO,
  })
  @IsOptional()
  @IsEnum(TipoCliente, {
    message:
      'El tipo de cliente debe ser uno de: MERCADO_MAYOREO, DISTRIBUIDOR, SUPERMERCADO, RESTAURANTE, EXPORTADOR, MENUDEO, OTRO',
  })
  tipo?: TipoCliente = TipoCliente.OTRO;
}
