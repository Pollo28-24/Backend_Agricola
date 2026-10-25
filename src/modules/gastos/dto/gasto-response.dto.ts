import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class GastoResponseDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 1 })
  cicloId: number;

  @ApiProperty({ example: 2 })
  categoriaId: number;

  @ApiPropertyOptional({ type: Number, nullable: true, example: 5 })
  proveedorId: number | null;

  @ApiPropertyOptional({ type: Number, nullable: true, example: 3 })
  actividadId: number | null;

  @ApiPropertyOptional({ type: Number, nullable: true, example: 1 })
  unidadId: number | null;

  @ApiProperty({ example: 10 })
  creadoPorId: number;

  @ApiProperty({ type: String, format: 'date', example: '2027-01-15' })
  fecha: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    example: 'Compra de fertilizante soluble triple 16',
  })
  descripcion: string | null;

  @ApiProperty({ type: String, example: '10.000' })
  cantidad: string;

  @ApiProperty({ type: String, example: '130.00' })
  costoUnitario: string;

  @ApiProperty({ type: String, example: '200.50' })
  impuesto: string;

  @ApiProperty({ type: String, example: '1500.50' })
  total: string;

  @ApiPropertyOptional({ type: String, nullable: true, example: 'FAC-A-98432' })
  numeroComprobante: string | null;

  @ApiProperty({
    type: String,
    format: 'date-time',
    example: '2027-01-15T10:30:00.000Z',
  })
  createdAt: Date;

  @ApiProperty({
    type: String,
    format: 'date-time',
    example: '2027-01-15T10:30:00.000Z',
  })
  updatedAt: Date;
}
