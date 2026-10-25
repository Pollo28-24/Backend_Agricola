import { ApiProperty } from '@nestjs/swagger';

export class HealthResponseDto {
  @ApiProperty({
    type: String,
    example: 'ok',
    description: 'Estado operativo general del servicio',
  })
  status!: string;

  @ApiProperty({
    type: String,
    format: 'date-time',
    example: '2026-10-25T18:00:00.000Z',
    description: 'Fecha y hora UTC de la verificación en formato ISO-8601',
  })
  timestamp!: string;

  @ApiProperty({
    type: String,
    enum: ['ok', 'disconnected'],
    example: 'ok',
    description: 'Estado de conectividad con la base de datos MySQL',
  })
  database!: string;

  @ApiProperty({
    type: String,
    example: '1.0.0',
    description: 'Versión semántica actual del backend',
  })
  version!: string;
}
