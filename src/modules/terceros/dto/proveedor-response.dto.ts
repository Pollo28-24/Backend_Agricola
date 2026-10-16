import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ProveedorResponseDto {
  @ApiProperty({ example: 1, description: 'Identificador único del proveedor' })
  id!: number;

  @ApiProperty({
    example: 10,
    description: 'Identificador de la empresa propietaria',
  })
  empresaId!: number;

  @ApiProperty({
    example: 'Agroinsumos del Valle S.A. de C.V.',
    description: 'Nombre o razón social',
  })
  nombre!: string;

  @ApiPropertyOptional({
    example: 'AGR950101ABC',
    description: 'RFC del proveedor',
    nullable: true,
  })
  rfc!: string | null;

  @ApiPropertyOptional({
    example: '3312345678',
    description: 'Teléfono de contacto',
    nullable: true,
  })
  telefono!: string | null;

  @ApiPropertyOptional({
    example: 'ventas@agroinsumos.com',
    description: 'Correo electrónico',
    nullable: true,
  })
  correo!: string | null;

  @ApiPropertyOptional({
    example: 'Av. Industrial 120, Parque Industrial',
    description: 'Dirección física/fiscal',
    nullable: true,
  })
  direccion!: string | null;

  @ApiProperty({
    example: true,
    description: 'Indica si el proveedor está activo para operaciones',
  })
  activo!: boolean;

  @ApiProperty({
    example: 0,
    description: 'Cantidad de gastos registrados asociados a este proveedor',
  })
  totalGastos!: number;

  @ApiProperty({
    example: '2026-10-16T10:00:00.000Z',
    description: 'Fecha de creación del registro',
  })
  createdAt!: Date;

  @ApiProperty({
    example: '2026-10-16T10:00:00.000Z',
    description: 'Fecha de última modificación',
  })
  updatedAt!: Date;
}
