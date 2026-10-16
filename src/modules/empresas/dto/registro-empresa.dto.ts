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

export enum PlanCodigoEnum {
  BASICO = 'BASICO',
  PRODUCTOR = 'PRODUCTOR',
  PROFESIONAL = 'PROFESIONAL',
}

export class RegistroEmpresaDto {
  // ================= EMPRESA =================
  @ApiProperty({
    example: 'Rancho Los Pinos',
    description: 'Nombre comercial de la empresa agrícola (F-01)',
  })
  @IsString({ message: 'El nombre de la empresa debe ser texto' })
  @IsNotEmpty({ message: 'El nombre de la empresa es obligatorio' })
  @Length(3, 150, { message: 'El nombre debe tener entre 3 y 150 caracteres' })
  nombre!: string;

  @ApiPropertyOptional({
    example: 'Ramón Ortega S.P.R. de R.L.',
    description: 'Razón social fiscal de la empresa',
  })
  @IsOptional()
  @IsString()
  @Length(3, 200)
  razonSocial?: string;

  @ApiProperty({
    example: 'OERA700101XX0',
    description: 'RFC fiscal único en el sistema (F-01)',
  })
  @IsString()
  @IsNotEmpty({ message: 'El RFC es obligatorio' })
  @Length(12, 13, { message: 'El RFC debe tener 12 o 13 caracteres' })
  rfc!: string;

  @ApiProperty({
    example: 'contacto@rancholospinos.com',
    description: 'Correo de contacto general de la empresa',
  })
  @IsEmail({}, { message: 'El correo de la empresa no es válido' })
  @IsNotEmpty({ message: 'El correo de la empresa es obligatorio' })
  correo!: string;

  @ApiPropertyOptional({
    example: '9515550101',
    description: 'Teléfono de contacto de la empresa',
  })
  @IsOptional()
  @IsString()
  telefono?: string;

  @ApiPropertyOptional({
    example: 'Camino a la Presa Km 2, Zimatlán, Oaxaca',
    description: 'Dirección física o fiscal',
  })
  @IsOptional()
  @IsString()
  direccion?: string;

  @ApiProperty({
    enum: PlanCodigoEnum,
    example: PlanCodigoEnum.PRODUCTOR,
    description:
      'Código del plan comercial seleccionado (define límites de usuarios y parcelas)',
  })
  @IsEnum(PlanCodigoEnum, {
    message: 'El plan debe ser BASICO, PRODUCTOR o PROFESIONAL',
  })
  @IsNotEmpty({ message: 'El plan comercial es obligatorio' })
  planCodigo!: PlanCodigoEnum;

  // ================= PRIMER USUARIO (ADMIN) =================
  @ApiProperty({
    example: 'Ramón',
    description: 'Nombre del productor o administrador principal',
  })
  @IsString()
  @IsNotEmpty({ message: 'El nombre del administrador es obligatorio' })
  @Length(2, 80)
  usuarioNombre!: string;

  @ApiProperty({
    example: 'Ortega',
    description: 'Apellido del administrador',
  })
  @IsString()
  @IsNotEmpty({ message: 'El apellido del administrador es obligatorio' })
  @Length(2, 80)
  usuarioApellido!: string;

  @ApiProperty({
    example: 'ramon@correo.com',
    description:
      'Correo de acceso del administrador (único en todo el sistema, RN-002)',
  })
  @IsEmail({}, { message: 'El correo del usuario no es válido' })
  @IsNotEmpty({ message: 'El correo del usuario es obligatorio' })
  usuarioCorreo!: string;

  @ApiProperty({
    example: 'ClaveSegura2026!',
    description: 'Contraseña del usuario administrador',
    minLength: 6,
  })
  @IsString()
  @IsNotEmpty({ message: 'La contraseña es obligatoria' })
  @MinLength(6, { message: 'La contraseña debe tener al menos 6 caracteres' })
  usuarioContrasena!: string;

  @ApiPropertyOptional({
    example: '9515550102',
    description: 'Teléfono móvil del usuario administrador',
  })
  @IsOptional()
  @IsString()
  usuarioTelefono?: string;
}
