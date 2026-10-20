import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EtapaMerma } from '@prisma/client';

export class MermaResponseDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 1 })
  cicloId: number;

  @ApiProperty({ example: 2 })
  motivoId: number;

  @ApiPropertyOptional({ example: 5 })
  cosechaId: number | null;

  @ApiProperty({ example: 1 })
  unidadId: number;

  @ApiProperty({ example: 10 })
  creadoPorId: number;

  @ApiProperty({ example: '2027-02-12' })
  fecha: string;

  @ApiProperty({
    example: '50.000',
    description: 'Cantidad física en unidad de origen',
  })
  cantidad: string;

  @ApiProperty({ enum: EtapaMerma, example: EtapaMerma.POSCOSECHA })
  etapa: EtapaMerma;

  @ApiPropertyOptional({ example: 'Fruto con daño mecánico' })
  observaciones: string | null;

  @ApiProperty({ example: '2027-02-12T10:00:00.000Z' })
  createdAt: Date;

  @ApiProperty({ example: '2027-02-12T10:00:00.000Z' })
  updatedAt: Date;
}
