import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EstadoCiclo } from '@prisma/client';

export class CicloInfoReporteDto {
  @ApiProperty({ example: 1, description: 'ID del ciclo de producción' })
  id!: number;

  @ApiPropertyOptional({
    type: String,
    example: 'Ciclo Canvas 2026',
    nullable: true,
  })
  nombre!: string | null;

  @ApiProperty({ enum: EstadoCiclo, example: EstadoCiclo.FINALIZADO })
  estado!: EstadoCiclo;

  @ApiProperty({
    type: String,
    format: 'date',
    example: '2026-01-15',
    description: 'Fecha de inicio (YYYY-MM-DD)',
  })
  fechaInicio!: string;

  @ApiPropertyOptional({
    type: String,
    format: 'date',
    example: '2026-06-30',
    description: 'Fecha de fin (YYYY-MM-DD)',
    nullable: true,
  })
  fechaFin!: string | null;

  @ApiProperty({
    example: 'Parcela Norte',
    description: 'Nombre de la parcela',
  })
  parcela!: string;

  @ApiProperty({
    example: 'Predio El Encanto',
    description: 'Nombre del predio',
  })
  predio!: string;

  @ApiProperty({ example: 'Roma VF', description: 'Nombre de la variedad' })
  variedad!: string;

  @ApiProperty({ example: 'Tomate', description: 'Nombre del cultivo' })
  cultivo!: string;
}

export class IndicadoresRentabilidadDto {
  @ApiProperty({
    example: '2.50',
    description: 'Superficie sembrada en hectáreas (2 dec)',
  })
  superficieSembrada!: string;

  @ApiProperty({
    example: '86000.00',
    description: 'Costo total acumulado en pesos (2 dec)',
  })
  costoTotal!: string;

  @ApiProperty({
    example: '8200.000',
    description: 'Total kilogramos cosechados brutos (3 dec)',
  })
  kgCosechados!: string;

  @ApiProperty({
    example: '50.000',
    description:
      'Total kilogramos de merma en poscosecha (3 dec, renombre de kgMerma)',
  })
  kgMermaPoscosecha!: string;

  @ApiProperty({
    example: '300.000',
    description: 'Total kilogramos de merma en campo (3 dec)',
  })
  kgMermaCampo!: string;

  @ApiProperty({
    example: '8150.000',
    description: 'Kilogramos netos aptos para venta (3 dec)',
  })
  kgNetos!: string;

  @ApiProperty({
    example: '8198.000',
    description: 'Kilogramos vendidos acumulados (3 dec)',
  })
  kgVendidos!: string;

  @ApiProperty({
    example: '0.000',
    description: 'Kilogramos disponibles remanentes (3 dec)',
  })
  kgDisponibles!: string;

  @ApiProperty({
    example: '121000.00',
    description: 'Ingresos netos por ventas sin impuestos (2 dec)',
  })
  ingresos!: string;

  @ApiProperty({
    example: '121000.00',
    description: 'Total facturado incluyendo impuestos (2 dec)',
  })
  totalFacturado!: string;

  @ApiProperty({
    example: '0.00',
    description: 'Total cobrado acumulado (2 dec)',
  })
  cobrado!: string;

  @ApiProperty({
    example: '35000.00',
    description: 'Ganancia neta (ingresos - costoTotal) (2 dec)',
  })
  ganancia!: string;

  @ApiPropertyOptional({
    type: String,
    example: '28.93',
    description: 'Margen de ganancia porcentual (2 dec)',
    nullable: true,
  })
  margenPct!: string | null;

  @ApiPropertyOptional({
    type: String,
    example: '40.70',
    description: 'Retorno sobre la inversión (ROI %) (2 dec)',
    nullable: true,
  })
  roiPct!: string | null;

  @ApiPropertyOptional({
    type: String,
    example: '10.49',
    description: 'Costo unitario por kg neto (2 dec)',
    nullable: true,
  })
  costoPorKg!: string | null;

  @ApiPropertyOptional({
    type: String,
    example: '14.76',
    description: 'Precio promedio de venta por kg (2 dec)',
    nullable: true,
  })
  precioPromedioKg!: string | null;

  @ApiPropertyOptional({
    type: String,
    example: '0.61',
    description: 'Porcentaje de merma respecto a cosecha (2 dec)',
    nullable: true,
  })
  mermaPct!: string | null;

  @ApiPropertyOptional({
    type: String,
    example: '34400.00',
    description: 'Costo por hectárea sembrada (2 dec)',
    nullable: true,
  })
  costoPorHectarea!: string | null;

  @ApiPropertyOptional({
    type: String,
    example: '3280.00',
    description: 'Rendimiento en kg por hectárea (2 dec)',
    nullable: true,
  })
  rendimientoKgHa!: string | null;

  @ApiProperty({
    example: '121000.00',
    description: 'Saldo por cobrar pendiente (2 dec)',
  })
  porCobrar!: string;
}

export class RentabilidadCicloItemDto {
  @ApiProperty({ type: CicloInfoReporteDto })
  ciclo!: CicloInfoReporteDto;

  @ApiProperty({ type: IndicadoresRentabilidadDto })
  indicadores!: IndicadoresRentabilidadDto;
}
