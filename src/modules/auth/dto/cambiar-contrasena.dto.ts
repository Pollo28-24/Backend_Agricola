import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class CambiarContrasenaDto {
  @ApiProperty({
    example: 'ClaveActual2026!',
    description: 'Contraseña vigente del usuario',
  })
  @IsString({ message: 'La contraseña actual debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'La contraseña actual es obligatoria' })
  contrasenaActual!: string;

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
