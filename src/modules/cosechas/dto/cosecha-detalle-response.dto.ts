import { ApiPropertyOptional } from '@nestjs/swagger';
import { CosechaResponseDto } from './cosecha-response.dto';

export class CosechaDetalleResponseDto extends CosechaResponseDto {
  @ApiPropertyOptional()
  ciclo?: {
    id: number;
    nombre: string | null;
    estado: string;
    parcelaId: number;
    parcelaNombre: string;
  };

  @ApiPropertyOptional()
  unidad?: {
    id: number;
    codigo: string;
    nombre: string;
    tipo: string;
    factorABase: string;
  };

  @ApiPropertyOptional()
  creadoPor?: {
    id: number;
    nombre: string;
    apellido: string;
  };

  @ApiPropertyOptional({
    example: 0,
    description: 'Conteo de mermas vinculadas directamente a esta cosecha',
  })
  mermasVinculadasCount?: number;
}
