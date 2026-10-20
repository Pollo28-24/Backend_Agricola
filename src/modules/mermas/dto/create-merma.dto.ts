import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EtapaMerma } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNumberString,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateMermaDto {
  @ApiProperty({
    example: 1,
    description: 'ID del ciclo de producción (RN-010)',
  })
  @IsInt()
  @Min(1)
  cicloId: number;

  @ApiProperty({ example: 2, description: 'ID del motivo de merma (RN-033)' })
  @IsInt()
  @Min(1)
  motivoId: number;

  @ApiProperty({
    example: 1,
    description: 'ID de la unidad de medida (tipo PESO RN-069)',
  })
  @IsInt()
  @Min(1)
  unidadId: number;

  @ApiProperty({
    example: '2027-02-12',
    description: 'Fecha de la merma (YYYY-MM-DD) (RN-044)',
  })
  @IsDateString({ strict: true })
  fecha: string;

  @ApiProperty({
    example: '50.000',
    description: 'Cantidad física mermada (> 0, máx 3 decimales) (RN-026)',
  })
  @IsNumberString({ no_symbols: true })
  cantidad: string;

  @ApiPropertyOptional({
    enum: EtapaMerma,
    default: EtapaMerma.POSCOSECHA,
    description:
      'Etapa en que ocurre la merma (CAMPO no descuenta de cosechado; POSCOSECHA/TRANSPORTE/ALMACEN sí descuentan) (RN-031)',
  })
  @IsOptional()
  @IsEnum(EtapaMerma)
  etapa?: EtapaMerma = EtapaMerma.POSCOSECHA;

  @ApiPropertyOptional({
    example: 5,
    description:
      'ID de la cosecha de origen (opcional, debe ser del mismo ciclo) (RN-049)',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  cosechaId?: number;

  @ApiPropertyOptional({
    example: 'Fruto con daño mecánico durante el empaque en tarimas',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  observaciones?: string;
}
