import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches } from 'class-validator';

export class FinalizarCicloDto {
  @ApiProperty({
    example: '2027-06-15',
    description:
      'Fecha formal de finalización de labores del ciclo (F-14, obligatoria)',
  })
  @IsNotEmpty({
    message: 'La fecha de fin es obligatoria para cerrar el ciclo (F-14)',
  })
  @IsString({ message: 'La fecha de fin debe ser una cadena de texto' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'La fecha de fin debe tener el formato YYYY-MM-DD',
  })
  fechaFin!: string;
}
