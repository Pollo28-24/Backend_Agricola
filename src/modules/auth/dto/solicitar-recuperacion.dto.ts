import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty } from 'class-validator';

export class SolicitarRecuperacionDto {
  @ApiProperty({
    example: 'usuario@correo.com',
    description:
      'Correo electrónico registrado del usuario para restablecimiento de contraseña',
  })
  @Transform(({ value }: { value: unknown }): string =>
    typeof value === 'string' ? value.trim().toLowerCase() : '',
  )
  @IsEmail({}, { message: 'El formato de correo no es válido' })
  @IsNotEmpty({ message: 'El correo es obligatorio' })
  correo!: string;
}
