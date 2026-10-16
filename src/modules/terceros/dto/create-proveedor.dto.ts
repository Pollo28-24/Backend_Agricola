import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateProveedorDto {
  @ApiProperty({
    example: 'Agroinsumos del Valle S.A. de C.V.',
    maxLength: 150,
    description: 'Nombre comercial o razón social del proveedor (único por empresa)',
  })
  @IsString({ message: 'El nombre debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'El nombre del proveedor es obligatorio' })
  @MaxLength(150, { message: 'El nombre no puede exceder 150 caracteres' })
  nombre!: string;

  @ApiPropertyOptional({
    example: 'AGR950101ABC',
    maxLength: 13,
    description: 'Registro Federal de Contribuyentes (RFC)',
  })
  @IsOptional()
  @IsString({ message: 'El RFC debe ser una cadena de texto' })
  @MaxLength(13, { message: 'El RFC no puede exceder 13 caracteres' })
  rfc?: string;

  @ApiPropertyOptional({
    example: '3312345678',
    maxLength: 30,
    description: 'Teléfono de contacto',
  })
  @IsOptional()
  @IsString({ message: 'El teléfono debe ser una cadena de texto' })
  @MaxLength(30, { message: 'El teléfono no puede exceder 30 caracteres' })
  telefono?: string;

  @ApiPropertyOptional({
    example: 'ventas@agroinsumos.com',
    maxLength: 150,
    description: 'Correo electrónico de contacto',
  })
  @IsOptional()
  @IsEmail({}, { message: 'El correo electrónico no tiene un formato válido' })
  @MaxLength(150, { message: 'El correo no puede exceder 150 caracteres' })
  correo?: string;

  @ApiPropertyOptional({
    example: 'Av. Industrial 120, Parque Industrial',
    maxLength: 300,
    description: 'Dirección física o fiscal del proveedor',
  })
  @IsOptional()
  @IsString({ message: 'La dirección debe ser una cadena de texto' })
  @MaxLength(300, { message: 'La dirección no puede exceder 300 caracteres' })
  direccion?: string;
}
