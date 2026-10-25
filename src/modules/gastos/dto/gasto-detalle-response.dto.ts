import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { GastoResponseDto } from './gasto-response.dto';

export class GastoCicloResumenDto {
  @ApiProperty({ example: 1 })
  id!: number;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    example: 'Primavera 2027',
  })
  nombre!: string | null;

  @ApiProperty({ example: 'ACTIVO' })
  estado!: string;

  @ApiProperty({ example: 2 })
  parcelaId!: number;

  @ApiProperty({ example: 'Parcela Norte' })
  parcelaNombre!: string;
}

export class GastoCategoriaResumenDto {
  @ApiProperty({ example: 2 })
  id!: number;

  @ApiProperty({ example: 'Fertilizantes' })
  nombre!: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    example: 'Insumos nutricionales',
  })
  descripcion!: string | null;
}

export class GastoProveedorResumenDto {
  @ApiProperty({ example: 5 })
  id!: number;

  @ApiProperty({ example: 'Agroinsumos del Valle' })
  nombre!: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    example: 'AGR950101ABC',
  })
  rfc!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, example: '9515550101' })
  telefono!: string | null;
}

export class GastoActividadResumenDto {
  @ApiProperty({ example: 3 })
  id!: number;

  @ApiPropertyOptional({ type: String, format: 'date', example: '2027-01-15' })
  fecha?: string;

  @ApiPropertyOptional({ type: String, example: 'Fertilización' })
  tipoActividadNombre?: string;
}

export class GastoUnidadResumenDto {
  @ApiProperty({ example: 1 })
  id!: number;

  @ApiProperty({ example: 'KG' })
  codigo!: string;

  @ApiProperty({ example: 'Kilogramo' })
  nombre!: string;

  @ApiPropertyOptional({ type: String, example: 'PESO' })
  tipo?: string;
}

export class GastoUsuarioResumenDto {
  @ApiProperty({ example: 10 })
  id!: number;

  @ApiProperty({ example: 'Juan' })
  nombre!: string;

  @ApiProperty({ example: 'Pérez' })
  apellido!: string;
}

export class GastoDetalleResponseDto extends GastoResponseDto {
  @ApiPropertyOptional({ type: () => GastoCicloResumenDto })
  ciclo?: GastoCicloResumenDto;

  @ApiPropertyOptional({ type: () => GastoCategoriaResumenDto })
  categoria?: GastoCategoriaResumenDto;

  @ApiPropertyOptional({ type: () => GastoProveedorResumenDto, nullable: true })
  proveedor?: GastoProveedorResumenDto | null;

  @ApiPropertyOptional({ type: () => GastoActividadResumenDto, nullable: true })
  actividad?: GastoActividadResumenDto | null;

  @ApiPropertyOptional({ type: () => GastoUnidadResumenDto, nullable: true })
  unidad?: GastoUnidadResumenDto | null;

  @ApiPropertyOptional({ type: () => GastoUsuarioResumenDto })
  creadoPor?: GastoUsuarioResumenDto;
}
