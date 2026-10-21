import { ApiProperty } from '@nestjs/swagger';

export class MermaDesgloseDto {
  @ApiProperty({
    example: 'Plaga / Enfermedad',
    description: 'Nombre del motivo de la merma',
  })
  motivo!: string;

  @ApiProperty({
    example: 'POSCOSECHA',
    description: 'Etapa donde ocurrió la merma (CAMPO o POSCOSECHA)',
  })
  etapa!: string;

  @ApiProperty({
    example: '50.000',
    description: 'Kilogramos de merma (3 dec)',
  })
  kgMerma!: string;
}
