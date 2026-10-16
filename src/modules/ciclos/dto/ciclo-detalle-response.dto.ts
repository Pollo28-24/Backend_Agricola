import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CicloResponseDto } from './ciclo-response.dto';

export class ParcelaResumenDto {
  @ApiProperty({ example: 2 })
  id!: number;

  @ApiProperty({ example: 'Parcela Norte' })
  nombre!: string;

  @ApiProperty({ example: '5.00' })
  superficie!: string;

  @ApiProperty({ example: 'Predio El Encino' })
  predioNombre!: string;
}

export class VariedadResumenDto {
  @ApiProperty({ example: 5 })
  id!: number;

  @ApiProperty({ example: 'Saladette' })
  nombre!: string;

  @ApiProperty({ example: 'Tomate' })
  cultivoNombre!: string;
}

export class CicloDetalleResponseDto extends CicloResponseDto {
  @ApiProperty({ type: ParcelaResumenDto })
  parcelaInfo!: ParcelaResumenDto;

  @ApiProperty({ type: VariedadResumenDto })
  variedadInfo!: VariedadResumenDto;

  @ApiPropertyOptional({ example: 'Don Ramón' })
  creadoPorNombre!: string;

  @ApiPropertyOptional({ example: 'Don Ramón', nullable: true })
  cerradoPorNombre!: string | null;
}
