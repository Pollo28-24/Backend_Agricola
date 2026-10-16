import { ApiPropertyOptional } from '@nestjs/swagger';
import { TipoCliente } from '@prisma/client';
import { IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';
import { Transform } from 'class-transformer';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class FiltroClienteDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Texto de búsqueda por nombre, RFC o correo',
    example: 'Central de Abastos',
  })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({
    enum: TipoCliente,
    description: 'Filtrar por canal de comercialización',
    example: TipoCliente.MERCADO_MAYOREO,
  })
  @IsOptional()
  @IsEnum(TipoCliente)
  tipo?: TipoCliente;

  @ApiPropertyOptional({
    description: 'Filtrar por estado activo (true/false). Si se omite, retorna ambos.',
    example: true,
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return undefined;
  })
  @IsBoolean()
  activo?: boolean;
}
