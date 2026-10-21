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

  @ApiProperty({ example: '2026-03-15' })
  fecha: string;

  @ApiProperty({ example: '500.00' })
  monto: string;

  @ApiProperty({ enum: MetodoPago, example: MetodoPago.EFECTIVO })
  metodo: MetodoPago;

  @ApiPropertyOptional({ example: 'SPEI-847291' })
  referencia: string | null;

  @ApiProperty({ type: CobroRegistradorResponseDto })
  registradoPor: CobroRegistradorResponseDto;

  @ApiProperty({ example: '2026-03-15T10:00:00.000Z' })
  createdAt: Date;

  @ApiPropertyOptional({ example: null })
  deletedAt: Date | null;
}
