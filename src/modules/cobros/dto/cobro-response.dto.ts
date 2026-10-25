import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MetodoPago } from '@prisma/client';

export class CobroRegistradorResponseDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 'Juan Pérez' })
  nombre: string;
}

export class CobroResponseDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 10 })
  ventaId: number;

  @ApiProperty({ type: String, format: 'date', example: '2026-03-15' })
  fecha: string;

  @ApiProperty({ type: String, example: '500.00' })
  monto: string;

  @ApiProperty({ enum: MetodoPago, example: MetodoPago.EFECTIVO })
  metodo: MetodoPago;

  @ApiPropertyOptional({ type: String, nullable: true, example: 'SPEI-847291' })
  referencia: string | null;

  @ApiProperty({ type: CobroRegistradorResponseDto })
  registradoPor: CobroRegistradorResponseDto;

  @ApiProperty({
    type: String,
    format: 'date-time',
    example: '2026-03-15T10:00:00.000Z',
  })
  createdAt: Date;

  @ApiPropertyOptional({
    type: String,
    format: 'date-time',
    nullable: true,
    example: null,
  })
  deletedAt: Date | null;
}
