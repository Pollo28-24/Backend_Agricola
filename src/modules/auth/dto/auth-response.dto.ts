import { ApiProperty } from '@nestjs/swagger';

export class UsuarioPerfilDto {
  @ApiProperty({ example: 1 })
  id!: number;

  @ApiProperty({ example: 'Ramón' })
  nombre!: string;

  @ApiProperty({ example: 'Ortega' })
  apellido!: string;

  @ApiProperty({ example: 'ramon@correo.com' })
  correo!: string;

  @ApiProperty({ example: 1 })
  empresaId!: number;

  @ApiProperty({ example: 'ADMIN' })
  rol!: string;

  @ApiProperty({
    example: ['empresa:administrar', 'usuario:administrar'],
    type: [String],
  })
  permisos!: string[];

  @ApiProperty({ example: 'PRUEBA' })
  estadoSuscripcion!: string;
}

export class AuthResponseDto {
  @ApiProperty({
    description: 'JWT Access Token con vigencia corta de 15 minutos',
  })
  accessToken!: string;

  @ApiProperty({
    description: 'Refresh Token rotatorio',
  })
  refreshToken!: string;

  @ApiProperty({ type: UsuarioPerfilDto })
  usuario!: UsuarioPerfilDto;
}
