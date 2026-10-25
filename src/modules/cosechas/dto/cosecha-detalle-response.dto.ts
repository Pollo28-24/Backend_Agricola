import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CosechaResponseDto } from './cosecha-response.dto';

export class CosechaCicloResumenDto {
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

export class CosechaUnidadResumenDto {
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

export class CosechaUsuarioResumenDto {
  @ApiProperty({ example: 10 })
  id!: number;

  @ApiProperty({ example: 'Juan' })
  nombre!: string;

  @ApiProperty({ example: 'Pérez' })
  apellido!: string;
}

export class CosechaDetalleResponseDto extends CosechaResponseDto {
  @ApiPropertyOptional({ type: () => CosechaCicloResumenDto })
  ciclo?: CosechaCicloResumenDto;

  @ApiPropertyOptional({ type: () => CosechaUnidadResumenDto })
  unidad?: CosechaUnidadResumenDto;

  @ApiPropertyOptional({ type: () => CosechaUsuarioResumenDto })
  creadoPor?: CosechaUsuarioResumenDto;

  @ApiPropertyOptional({
    type: Number,
    example: 0,
    description: 'Conteo de mermas vinculadas directamente a esta cosecha',
  })
  mermasVinculadasCount?: number;
}
