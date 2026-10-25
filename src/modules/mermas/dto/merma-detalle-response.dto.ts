import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MermaResponseDto } from './merma-response.dto';

export class MermaCicloResumenDto {
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

export class MermaMotivoResumenDto {
  @ApiProperty({ example: 2 })
  id!: number;

  @ApiProperty({ example: 'Plaga o enfermedad' })
  nombre!: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    example: 'Daño fitosanitario',
  })
  descripcion!: string | null;
}

export class MermaCosechaResumenDto {
  @ApiProperty({ example: 5 })
  id!: number;

  @ApiProperty({ type: String, format: 'date', example: '2027-02-10' })
  fecha!: string;

  @ApiProperty({ type: String, example: '1500.000' })
  cantidad!: string;

  @ApiProperty({ example: 'PRIMERA' })
  calidad!: string;
}

export class MermaUnidadResumenDto {
  @ApiProperty({ example: 1 })
  id!: number;

  @ApiProperty({ example: 'KG' })
  codigo!: string;

  @ApiProperty({ example: 'Kilogramo' })
  nombre!: string;

  @ApiProperty({ example: 'PESO' })
  tipo!: string;

  @ApiProperty({ type: String, example: '1.0000' })
  factorABase!: string;
}

export class MermaUsuarioResumenDto {
  @ApiProperty({ example: 10 })
  id!: number;

  @ApiProperty({ example: 'Juan' })
  nombre!: string;

  @ApiProperty({ example: 'Pérez' })
  apellido!: string;
}

export class MermaDetalleResponseDto extends MermaResponseDto {
  @ApiPropertyOptional({ type: () => MermaCicloResumenDto })
  ciclo?: MermaCicloResumenDto;

  @ApiPropertyOptional({ type: () => MermaMotivoResumenDto })
  motivo?: MermaMotivoResumenDto;

  @ApiPropertyOptional({ type: () => MermaCosechaResumenDto, nullable: true })
  cosecha?: MermaCosechaResumenDto | null;

  @ApiPropertyOptional({ type: () => MermaUnidadResumenDto })
  unidad?: MermaUnidadResumenDto;

  @ApiPropertyOptional({ type: () => MermaUsuarioResumenDto })
  creadoPor?: MermaUsuarioResumenDto;
}
