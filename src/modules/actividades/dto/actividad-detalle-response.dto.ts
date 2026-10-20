import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ActividadResponseDto } from './actividad-response.dto';

export class CicloResumenDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiPropertyOptional({ example: 'Primavera 2027', nullable: true })
  nombre: string | null;

  @ApiProperty({ example: 'ACTIVO' })
  estado: string;

  @ApiProperty({ example: 2 })
  parcelaId: number;

  @ApiProperty({ example: 'Parcela Norte' })
  parcelaNombre: string;
}

export class TipoActividadResumenDto {
  @ApiProperty({ example: 2 })
  id: number;

  @ApiProperty({ example: 'Siembra' })
  nombre: string;
}

export class UsuarioResumenDto {
  @ApiProperty({ example: 5 })
  id: number;

  @ApiProperty({ example: 'Juan' })
  nombre: string;

  @ApiProperty({ example: 'Pérez' })
  apellido: string;
}

export class ActividadDetalleResponseDto extends ActividadResponseDto {
  @ApiProperty({ type: CicloResumenDto })
  ciclo: CicloResumenDto;

  @ApiProperty({ type: TipoActividadResumenDto })
  tipoActividad: TipoActividadResumenDto;

  @ApiPropertyOptional({ type: UsuarioResumenDto, nullable: true })
  responsable: UsuarioResumenDto | null;

  @ApiProperty({ type: UsuarioResumenDto })
  creadoPor: UsuarioResumenDto;

  @ApiProperty({ example: 2, description: 'Cantidad de gastos activos vinculados a esta actividad' })
  gastosVinculadosCount: number;
}
