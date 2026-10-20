import { ApiPropertyOptional } from '@nestjs/swagger';
import { GastoResponseDto } from './gasto-response.dto';

export class GastoDetalleResponseDto extends GastoResponseDto {
  @ApiPropertyOptional()
  ciclo?: {
    id: number;
    nombre: string | null;
    estado: string;
    parcelaId: number;
    parcelaNombre: string;
  };

  @ApiPropertyOptional()
  categoria?: {
    id: number;
    nombre: string;
    descripcion: string | null;
  };

  @ApiPropertyOptional()
  proveedor?: {
    id: number;
    nombre: string;
    rfc: string | null;
    telefono: string | null;
  } | null;

  @ApiPropertyOptional()
  actividad?: {
    id: number;
    fecha?: string;
    tipoActividadNombre?: string;
  } | null;

  @ApiPropertyOptional()
  unidad?: {
    id: number;
    codigo: string;
    nombre: string;
    tipo?: string;
  } | null;

  @ApiPropertyOptional()
  creadoPor?: {
    id: number;
    nombre: string;
    apellido: string;
  };
}
