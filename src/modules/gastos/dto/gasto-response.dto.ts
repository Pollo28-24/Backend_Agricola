import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class GastoResponseDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 1 })
  cicloId: number;

  @ApiProperty({ example: 2 })
  categoriaId: number;

  @ApiPropertyOptional({ example: 5 })
  proveedorId: number | null;

  @ApiPropertyOptional({ example: 3 })
  actividadId: number | null;

  @ApiPropertyOptional({ example: 1 })
  unidadId: number | null;

  @ApiProperty({ example: 10 })
  creadoPorId: number;

  @ApiProperty({ example: '2027-01-15' })
  fecha: string;

  @ApiPropertyOptional({ example: 'Compra de fertilizante soluble triple 16' })
  descripcion: string | null;

  @ApiProperty({ example: '10.000' })
  cantidad: string;

  @ApiProperty({ example: '130.00' })
  costoUnitario: string;

  @ApiProperty({ example: '200.50' })
  impuesto: string;

  @ApiProperty({ example: '1500.50' })
  total: string;

  @ApiPropertyOptional({ example: 'FAC-A-98432' })
  numeroComprobante: string | null;

  @ApiProperty({ example: '2027-01-15T10:30:00.000Z' })
  createdAt: Date;

  @ApiProperty({ example: '2027-01-15T10:30:00.000Z' })
  updatedAt: Date;
}
