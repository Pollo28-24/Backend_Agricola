import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PlanResumenDto {
  @ApiProperty({ example: 'PRODUCTOR' })
  codigo!: string;

  @ApiProperty({ example: 'Productor' })
  nombre!: string;

  @ApiProperty({ example: '699.00' })
  precioMensual!: string;

  @ApiProperty({ example: 10 })
  maxParcelas!: number;

  @ApiProperty({ example: 3 })
  maxUsuarios!: number;

  @ApiProperty({ example: false })
  incluyeReportes!: boolean;
}

export class CuotasUsoDto {
  @ApiProperty({ example: 1 })
  usuariosActivos!: number;

  @ApiProperty({ example: 3 })
  maxUsuarios!: number;

  @ApiProperty({ example: 0 })
  parcelasActivas!: number;

  @ApiProperty({ example: 10 })
  maxParcelas!: number;
}

export class EmpresaResponseDto {
  @ApiProperty({ example: 1 })
  id!: number;

  @ApiProperty({ example: 'Rancho Los Pinos' })
  nombre!: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    example: 'Ramón Ortega S.P.R. de R.L.',
  })
  razonSocial?: string | null;

  @ApiProperty({ example: 'OERA700101XX0' })
  rfc!: string;

  @ApiProperty({ example: 'contacto@rancholospinos.com' })
  correo!: string;

  @ApiPropertyOptional({ type: String, nullable: true, example: '9515550101' })
  telefono?: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    example: 'Camino a la Presa Km 2, Zimatlán, Oaxaca',
  })
  direccion?: string | null;

  @ApiProperty({ example: 'MXN' })
  moneda!: string;

  @ApiProperty({ example: 'PRUEBA' })
  estadoSuscripcion!: string;

  @ApiProperty({ type: PlanResumenDto })
  plan!: PlanResumenDto;

  @ApiProperty({ type: CuotasUsoDto })
  cuotas!: CuotasUsoDto;
}
