import { IsEmail, IsOptional, IsString, Length } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateEmpresaDto {
  @ApiPropertyOptional({ example: 'Rancho Los Pinos SPR de RL' })
  @IsOptional()
  @IsString()
  @Length(3, 150)
  nombre?: string;

  @ApiPropertyOptional({ example: 'Ramón Ortega S.P.R. de R.L.' })
  @IsOptional()
  @IsString()
  @Length(3, 200)
  razonSocial?: string;

  @ApiPropertyOptional({ example: 'contacto@rancholospinos.com' })
  @IsOptional()
  @IsEmail()
  correo?: string;

  @ApiPropertyOptional({ example: '9515550101' })
  @IsOptional()
  @IsString()
  telefono?: string;

  @ApiPropertyOptional({ example: 'Camino a la Presa Km 2, Zimatlán, Oaxaca' })
  @IsOptional()
  @IsString()
  direccion?: string;
}
