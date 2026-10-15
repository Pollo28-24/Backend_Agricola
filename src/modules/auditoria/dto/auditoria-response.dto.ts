import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AccionAuditoria } from '@prisma/client';

export class AuditoriaUsuarioDto {
  @ApiProperty({ example: 1, description: 'ID del usuario' })
  id!: number;

  @ApiProperty({ example: 'Ramón', description: 'Nombre del usuario' })
  nombre!: string;

  @ApiProperty({ example: 'Ortega', description: 'Apellido del usuario' })
  apellido!: string;

  @ApiProperty({ example: 'admin@rancho.com', description: 'Correo del usuario' })
  correo!: string;

  @ApiProperty({ example: 'ADMIN', description: 'Código del rol activo' })
  rol!: string;
}

export class AuditoriaResponseDto {
  @ApiProperty({
    example: '10452',
    description: 'Identificador único BigInt serializado en cadena (Sección 3.23)',
  })
  id!: string;

  @ApiProperty({ example: 1, description: 'ID de la empresa tenant' })
  empresaId!: number;

  @ApiPropertyOptional({
    example: 3,
    nullable: true,
    description: 'ID del usuario ejecutor (null si fue una acción del sistema o usuario eliminado)',
  })
  usuarioId!: number | null;

  @ApiPropertyOptional({
    type: AuditoriaUsuarioDto,
    nullable: true,
    description: 'Datos del usuario que ejecutó la acción',
  })
  usuario!: AuditoriaUsuarioDto | null;

  @ApiProperty({
    example: 'usuario',
    description: 'Nombre de la tabla o entidad intervenida',
  })
  entidad!: string;

  @ApiProperty({
    example: 12,
    description: 'ID de la fila o registro intervenido',
  })
  entidadId!: number;

  @ApiProperty({
    enum: AccionAuditoria,
    example: AccionAuditoria.CREAR,
    description: 'Acción ejecutada sobre la entidad',
  })
  accion!: AccionAuditoria;

  @ApiPropertyOptional({
    example: { activo: false },
    nullable: true,
    description: 'Valores previos antes de la modificación o baja',
  })
  valoresAnteriores!: Record<string, any> | null;

  @ApiPropertyOptional({
    example: { activo: true },
    nullable: true,
    description: 'Valores posteriores aplicados',
  })
  valoresNuevos!: Record<string, any> | null;

  @ApiPropertyOptional({
    example: '192.168.1.10',
    nullable: true,
    description: 'Dirección IP de origen capturada de la petición',
  })
  direccionIp!: string | null;

  @ApiProperty({
    example: '2026-10-15T18:00:00.000Z',
    description: 'Fecha y hora exacta del evento en formato ISO 8601',
  })
  createdAt!: string;
}
