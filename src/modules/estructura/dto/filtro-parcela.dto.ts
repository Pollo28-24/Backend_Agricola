import { ApiPropertyOptional } from '@nestjs/swagger';
import { EstadoParcela } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Min } from 'class-validator';

export class FiltroParcelaDto {
  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'El ID del predio debe ser un número entero' })
  @Min(1, { message: 'El ID del predio debe ser mayor a 0' })
  predioId?: number;

  @ApiPropertyOptional({ enum: EstadoParcela })
  @IsOptional()
  @IsEnum(EstadoParcela, {
    message:
      'El estado debe ser uno de: DISPONIBLE, EN_USO, DESCANSO, INACTIVA',
  })
  estado?: EstadoParcela;
}
