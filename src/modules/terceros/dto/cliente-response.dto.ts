import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TipoCliente } from '@prisma/client';

export class ClienteResponseDto {
  @ApiProperty({ example: 1, description: 'Identificador único del cliente' })
  id!: number;

  @ApiProperty({ example: 10, description: 'Identificador de la empresa propietaria' })
  empresaId!: number;

  @ApiProperty({ example: 'Central de Abastos Guadalajara', description: 'Nombre comercial o razón social' })
  nombre!: string;

  @ApiPropertyOptional({ example: 'CAG880512XYZ', description: 'RFC del cliente', nullable: true })
  rfc!: string | null;

  @ApiPropertyOptional({ example: '3398765432', description: 'Teléfono de contacto', nullable: true })
  telefono!: string | null;

  @ApiPropertyOptional({ example: 'compras@centralabastos.com', description: 'Correo electrónico', nullable: true })
  correo!: string | null;

  @ApiProperty({
    enum: TipoCliente,
    example: TipoCliente.MERCADO_MAYOREO,
    description: 'Canal de comercialización o tipo de cliente',
  })
  tipo!: TipoCliente;

  @ApiProperty({ example: true, description: 'Indica si el cliente está activo para operaciones' })
  activo!: boolean;

  @ApiProperty({ example: 0, description: 'Cantidad de ventas registradas asociadas a este cliente' })
  totalVentas!: number;

  @ApiProperty({ example: '2026-10-16T10:00:00.000Z', description: 'Fecha de creación del registro' })
  createdAt!: Date;

  @ApiProperty({ example: '2026-10-16T10:00:00.000Z', description: 'Fecha de última modificación' })
  updatedAt!: Date;
}
