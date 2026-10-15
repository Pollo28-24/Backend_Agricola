import { IsEnum, IsInt, IsOptional, IsString } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { AccionAuditoria } from '@prisma/client';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class FiltroAuditoriaDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    example: 3,
    description: 'Filtrar eventos por ID del usuario ejecutor',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'El usuarioId debe ser un número entero' })
  usuarioId?: number;

  @ApiPropertyOptional({
    example: 'usuario',
    description: 'Filtrar por nombre de la entidad afectada (ej. usuario, parcela, ciclo_produccion)',
  })
  @IsOptional()
  @IsString({ message: 'La entidad debe ser una cadena de texto' })
  entidad?: string;

  @ApiPropertyOptional({
    enum: AccionAuditoria,
    example: AccionAuditoria.CREAR,
    description: 'Filtrar por acción realizada en la auditoría',
  })
  @IsOptional()
  @IsEnum(AccionAuditoria, {
    message: 'La acción debe ser un valor válido de AccionAuditoria',
  })
  accion?: AccionAuditoria;
}
