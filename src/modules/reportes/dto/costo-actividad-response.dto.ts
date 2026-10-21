import { ApiProperty } from '@nestjs/swagger';

export class CostoPorActividadDto {
  @ApiProperty({ example: 2, description: 'ID del tipo de actividad' })
  tipoActividadId!: number;

  @ApiProperty({
    example: 'Riego',
    description: 'Nombre del tipo de actividad',
  })
  tipoActividad!: string;

  @ApiProperty({
    example: 12,
    description: 'Número de actividades registradas del tipo',
  })
  numeroActividades!: number;

  @ApiProperty({
    example: '48.50',
    description: 'Horas totales trabajadas (2 dec)',
  })
  horasTotales!: string;

  @ApiProperty({
    example: '15400.00',
    description: 'Costo total acumulado en las actividades (2 dec)',
  })
  costoTotal!: string;
}
