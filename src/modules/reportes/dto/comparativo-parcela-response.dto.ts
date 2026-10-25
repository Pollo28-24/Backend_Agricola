import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  CicloInfoReporteDto,
  IndicadoresRentabilidadDto,
} from './rentabilidad-ciclo-response.dto';

export class ComparativoParcelaItemDto {
  @ApiProperty({ type: CicloInfoReporteDto })
  ciclo!: CicloInfoReporteDto;

  @ApiProperty({ type: IndicadoresRentabilidadDto })
  indicadores!: IndicadoresRentabilidadDto;

  @ApiPropertyOptional({
    type: String,
    example: '25.50',
    description:
      'Margen porcentual del ciclo anterior cronológico en la parcela (2 dec)',
    nullable: true,
  })
  margenPctCicloAnterior!: string | null;

  @ApiPropertyOptional({
    type: String,
    example: '11.20',
    description:
      'Costo unitario por kg del ciclo anterior cronológico en la parcela (2 dec)',
    nullable: true,
  })
  costoPorKgCicloAnterior!: string | null;

  @ApiPropertyOptional({
    type: String,
    example: '30000.00',
    description:
      'Ganancia del ciclo anterior cronológico en la parcela (2 dec)',
    nullable: true,
  })
  gananciaCicloAnterior!: string | null;
}
