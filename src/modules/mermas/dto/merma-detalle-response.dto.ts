import { ApiPropertyOptional } from '@nestjs/swagger';
import { MermaResponseDto } from './merma-response.dto';

export class MermaDetalleResponseDto extends MermaResponseDto {
  @ApiPropertyOptional()
  ciclo?: {
    id: number;
    nombre: string | null;
    estado: string;
    parcelaId: number;
    parcelaNombre: string;
  };

  @ApiPropertyOptional()
  motivo?: {
    id: number;
    nombre: string;
    descripcion: string | null;
  };

  @ApiPropertyOptional()
  cosecha?: {
    id: number;
    fecha: string;
    cantidad: string;
    calidad: string;
  } | null;

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
}
