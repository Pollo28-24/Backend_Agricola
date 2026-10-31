import { ApiPropertyOptional } from '@nestjs/swagger';
import { TipoCliente } from '@prisma/client';
import { IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { ToBoolean } from '../../../common/decorators/to-boolean.decorator';

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
    description:
      'Filtrar por estado activo (true/false). Si se omite, retorna ambos.',
    example: true,
  })
  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  activo?: boolean;
}
