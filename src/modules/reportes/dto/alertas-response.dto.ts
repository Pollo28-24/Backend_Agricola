import { ApiProperty } from '@nestjs/swagger';
import { PaginacionMetaDto } from '../../../common/dto/paginated-response.dto';
import {
  CodigoAlerta,
  SeveridadAlerta,
  ReferenciaTipoAlerta,
} from '../constants/alertas.constants';

export class ResumenAlertasDto {
  @ApiProperty({
    example: 2,
    description: 'Cantidad total de alertas críticas o altas',
  })
  totalAltas!: number;

  @ApiProperty({ example: 4, description: 'Cantidad total de alertas medias' })
  totalMedias!: number;

  @ApiProperty({ example: 1, description: 'Cantidad total de alertas bajas' })
  totalBajas!: number;

  @ApiProperty({
    example: 1,
    description: 'Cantidad total de alertas informativas',
  })
  totalInformativas!: number;

  @ApiProperty({
    example: 8,
    description: 'Total general de alertas detectadas',
  })
  total!: number;
}

export class AlertaItemDto {
  @ApiProperty({
    enum: CodigoAlerta,
    example: CodigoAlerta.CICLO_EN_PERDIDA,
    description: 'Código de identificación de la regla de alerta',
  })
  codigo!: CodigoAlerta;

  @ApiProperty({
    enum: SeveridadAlerta,
    example: SeveridadAlerta.ALTA,
    description:
      'Nivel de severidad de la alerta (ALTA, MEDIA, BAJA, INFORMATIVA)',
  })
  severidad!: SeveridadAlerta;

  @ApiProperty({
    type: Number,
    example: 12,
    nullable: true,
    description: 'ID del ciclo involucrado si aplica',
  })
  cicloId!: number | null;

  @ApiProperty({
    type: Number,
    example: 45,
    nullable: true,
    description: 'ID de la venta involucrada si aplica',
  })
  ventaId!: number | null;

  @ApiProperty({
    type: Number,
    example: 3,
    nullable: true,
    description: 'ID del cliente involucrado si aplica',
  })
  clienteId!: number | null;

  @ApiProperty({
    example: '-$15,000.00',
    description: 'Valor o condición observada formateada',
  })
  observado!: string;

  @ApiProperty({
    example: '$0.00',
    description: 'Umbral o valor de referencia esperado formateado',
  })
  umbral!: string;

  @ApiProperty({
    example: 'El ciclo Ciclo Norte 2026 presenta margen negativo (-$15,000.00)',
    description: 'Mensaje descriptivo y accionable para el productor',
  })
  mensaje!: string;

  @ApiProperty({
    enum: ReferenciaTipoAlerta,
    example: ReferenciaTipoAlerta.CICLO,
    description: 'Tipo de entidad a la que apunta la alerta',
  })
  referenciaTipo!: ReferenciaTipoAlerta;

  @ApiProperty({
    type: Number,
    example: 12,
    nullable: true,
    description: 'Identificador único de la entidad de referencia',
  })
  referenciaId!: number | null;

  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    example: { porcentaje: -12.5 },
    nullable: true,
    description: 'Metadatos adicionales en formato JSON estructurado',
  })
  metadata!: Record<string, unknown> | null;
}

export class AlertasResponseDto {
  @ApiProperty({
    type: [AlertaItemDto],
    description: 'Listado de alertas paginadas',
  })
  data!: AlertaItemDto[];

  @ApiProperty({
    type: ResumenAlertasDto,
    description: 'Distribución de alertas por severidad',
  })
  resumen!: ResumenAlertasDto;

  @ApiProperty({
    type: PaginacionMetaDto,
    description: 'Metadatos de la paginación',
  })
  meta!: PaginacionMetaDto;
}
