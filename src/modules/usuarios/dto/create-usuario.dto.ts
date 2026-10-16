import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum RolCodigoEnum {
  ADMIN = 'ADMIN',
  CAPTURISTA = 'CAPTURISTA',
  CONTADOR = 'CONTADOR',
}

export class CreateUsuarioDto {
  @ApiProperty({
    example: 'Luis',
    description: 'Nombre del usuario (F-02)',
  })
  @IsString({ message: 'El nombre debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'El nombre es obligatorio' })
  @Length(2, 80)
  nombre!: string;

  @ApiProperty({
    example: 'Pérez',
    description: 'Apellido del usuario (F-02)',
  })
  @IsString({ message: 'El apellido debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'El apellido es obligatorio' })
  @Length(2, 80)
  apellido!: string;

  @ApiProperty({
    example: 'luis@correo.com',
    description: 'Correo electrónico único en todo el sistema (RN-002)',
  })
  @IsEmail({}, { message: 'El correo electrónico no es válido' })
  @IsNotEmpty({ message: 'El correo es obligatorio' })
  correo!: string;

  @ApiProperty({
    example: 'ClaveTemporal2026!',
    description: 'Contraseña inicial del usuario (RN-040)',
    minLength: 6,
  })
  @IsString({ message: 'La contraseña debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'La contraseña es obligatoria' })
  @MinLength(6, { message: 'La contraseña debe tener al menos 6 caracteres' })
  contrasena!: string;

  @ApiProperty({
    enum: RolCodigoEnum,
    example: RolCodigoEnum.CAPTURISTA,
    description: 'Rol del usuario dentro del sistema (RN-061)',
  })
  @IsEnum(RolCodigoEnum, {
    message: 'El rol debe ser ADMIN, CAPTURISTA o CONTADOR',
  })
  @IsNotEmpty({ message: 'El rol es obligatorio' })
  rolCodigo!: RolCodigoEnum;

  @ApiPropertyOptional({
    example: '9515550103',
    description: 'Teléfono de contacto',
  })
  @IsOptional()
  @IsString()
  telefono?: string;
}
