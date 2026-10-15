import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  Length,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { RolCodigoEnum } from './create-usuario.dto';

export class UpdateUsuarioDto {
  @ApiPropertyOptional({ example: 'Luis Alberto' })
  @IsOptional()
  @IsString()
  @Length(2, 80)
  nombre?: string;

  @ApiPropertyOptional({ example: 'Pérez López' })
  @IsOptional()
  @IsString()
  @Length(2, 80)
  apellido?: string;

  @ApiPropertyOptional({ example: '9515550109' })
  @IsOptional()
  @IsString()
  telefono?: string;

  @ApiPropertyOptional({
    enum: RolCodigoEnum,
    example: RolCodigoEnum.CONTADOR,
    description: 'Actualización del rol de acceso (RN-061)',
  })
  @IsOptional()
  @IsEnum(RolCodigoEnum)
  rolCodigo?: RolCodigoEnum;

  @ApiPropertyOptional({
    example: true,
    description: 'Estado activo del usuario (reactivación o desactivación)',
  })
  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}
