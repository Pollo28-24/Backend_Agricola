import { ApiProperty } from '@nestjs/swagger';
import { PaginacionMetaDto } from '../../../common/dto/paginated-response.dto';

export class ResumenCuentasPorCobrarDto {
  @ApiProperty({
    example: '$125,400.00',
    description: 'Total de saldo pendiente por cobrar',
  })
  totalPorCobrar!: string;

  @ApiProperty({
    example: '$45,000.00',
    description: 'Total de saldo vencido (fecha límite anterior a corte)',
  })
  totalVencido!: string;

  @ApiProperty({
    example: '$80,400.00',
    description: 'Total de saldo vigente no vencido',
  })
  totalVigente!: string;

  @ApiProperty({
    example: 3,
    description: 'Cantidad de clientes distintos con al menos un saldo vencido',
  })
  totalClientesMorosos!: number;
}

export class CuentaPorCobrarItemDto {
  @ApiProperty({ example: 42, description: 'ID de la venta' })
  ventaId!: number;

  @ApiProperty({
    example: 'FAC-2026-001',
    nullable: true,
    description: 'Folio o número de factura de la venta',
  })
  folio!: string | null;

  @ApiProperty({ example: 5, description: 'ID del cliente' })
  clienteId!: number;

  @ApiProperty({
    example: 'Agrícola San Juan S.A. de C.V.',
    description: 'Razón social o nombre del cliente',
  })
  clienteNombre!: string;

  @ApiProperty({
    example: 12,
    description: 'ID del ciclo de producción asociado',
  })
  cicloId!: number;

  @ApiProperty({
    example: '2026-03-15',
    description: 'Fecha de emisión de la venta (YYYY-MM-DD)',
  })
  fechaVenta!: string;

  @ApiProperty({
    example: '2026-04-15',
    nullable: true,
    description: 'Fecha límite de pago (YYYY-MM-DD)',
  })
  fechaVencimiento!: string | null;

  @ApiProperty({ example: '$150,000.00', description: 'Monto total facturado' })
  montoTotal!: string;

  @ApiProperty({
    example: '$50,000.00',
    description: 'Monto total cobrado hasta la fecha',
  })
  montoCobrado!: string;

  @ApiProperty({
    example: '$100,000.00',
    description: 'Saldo pendiente por cobrar',
  })
  montoPendiente!: string;

  @ApiProperty({
    example: 15,
    nullable: true,
    description:
      'Días transcurridos desde el vencimiento (positivo: vencida hace N días; negativo: faltan N días; 0: vence hoy; null: sin fecha límite)',
  })
  diasVencimiento!: number | null;

  @ApiProperty({
    example: 'VENCIDA',
    description:
      'Estado de cobro derivado (PENDIENTE, PARCIAL, VENCIDA, PAGADA)',
  })
  estadoCobro!: string;

  @ApiProperty({
    example: true,
    description: 'Bandera booleana que indica si la cuenta está vencida',
  })
  vencida!: boolean;
}

export class CuentasPorCobrarResponseDto {
  @ApiProperty({
    type: [CuentaPorCobrarItemDto],
    description: 'Listado de cuentas por cobrar paginadas',
  })
  data!: CuentaPorCobrarItemDto[];

  @ApiProperty({
    type: ResumenCuentasPorCobrarDto,
    description: 'Métricas agregadas de la cartera',
  })
  resumen!: ResumenCuentasPorCobrarDto;

  @ApiProperty({
    type: PaginacionMetaDto,
    description: 'Metadatos de la paginación',
  })
  meta!: PaginacionMetaDto;
}
