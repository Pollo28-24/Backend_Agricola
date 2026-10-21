import { ApiProperty } from '@nestjs/swagger';
import { EstadoCobro } from '../../../common/domain/policies/venta-estado-cobro.policy';
import { CobroResponseDto } from './cobro-response.dto';

export class CobroDetalleResponseDto extends CobroResponseDto {
  @ApiProperty({
    example: '1000.00',
    description: 'Total de la venta asociada',
  })
  ventaTotal: string;

  @ApiProperty({
    example: '500.00',
    description: 'Total cobrado acumulado en la venta',
  })
  totalCobrado: string;

  @ApiProperty({
    example: '500.00',
    description: 'Saldo pendiente de cobro de la venta',
  })
  saldoPendiente: string;

  @ApiProperty({
    enum: EstadoCobro,
    example: EstadoCobro.PARCIAL,
    description: 'Estado de cobro derivado institucional de la venta',
  })
  estadoCobroVenta: EstadoCobro;

  @ApiProperty({
    example: false,
    description: 'Indica si la venta asociada está vencida',
  })
  vencida: boolean;
}
