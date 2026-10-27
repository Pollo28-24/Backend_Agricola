import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class RestablecerContrasenaDto {
  @ApiProperty({
    example:
      'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90',
    description: 'Token uniuso de recuperación recibido por correo',
  })
  @IsString({ message: 'El token debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'El token es obligatorio' })
  token!: string;

  @ApiProperty({
    example: 'NuevaClaveSegura2026!',
    description: 'Nueva contraseña que reemplazará a la actual',
    minLength: 6,
  })
  @IsString({ message: 'La nueva contraseña debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'La nueva contraseña es obligatoria' })
  @MinLength(6, {
    message: 'La nueva contraseña debe tener al menos 6 caracteres',
  })
  nuevaContrasena!: string;
}
