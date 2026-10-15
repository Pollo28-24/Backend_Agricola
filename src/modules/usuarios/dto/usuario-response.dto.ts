import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UsuarioResponseDto {
  @ApiProperty({ example: 2 })
  id!: number;

  @ApiProperty({ example: 10 })
  empresaId!: number;

  @ApiProperty({ example: 'Luis' })
  nombre!: string;

  @ApiProperty({ example: 'Pérez' })
  apellido!: string;

  @ApiProperty({ example: 'luis@correo.com' })
  correo!: string;

  @ApiPropertyOptional({ example: '9515550103' })
  telefono?: string | null;

  @ApiProperty({ example: true })
  activo!: boolean;

  @ApiProperty({ example: 'CAPTURISTA' })
  rol!: string;

  @ApiProperty({
    example: ['actividad:crear', 'gasto:crear', 'cosecha:crear', 'merma:crear'],
    type: [String],
  })
  permisos!: string[];

  @ApiPropertyOptional({ example: '2026-10-15T12:00:00.000Z' })
  ultimoAcceso?: string | null;

  @ApiProperty({ example: '2026-10-15T10:00:00.000Z' })
  createdAt!: string;
}
