import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { ToBoolean } from '../../../common/decorators/to-boolean.decorator';

export class FiltroProveedorDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Texto de búsqueda por nombre, RFC o correo',
    example: 'Agroinsumos',
  })
  @IsOptional()
  @IsString()
  q?: string;

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
