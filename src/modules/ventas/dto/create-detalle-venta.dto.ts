import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CalidadCosecha } from '@prisma/client';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Min,
} from 'class-validator';

export class CreateDetalleVentaDto {
  @ApiProperty({
    example: 1,
    description: 'ID de la unidad de medida (RN-024 / tipo PESO RN-069)',
  })
  @IsInt()
  @Min(1)
  unidadId: number;

  @ApiProperty({
    enum: CalidadCosecha,
    example: CalidadCosecha.PRIMERA,
    description: 'Clasificación de calidad del producto vendido',
  })
  @IsEnum(CalidadCosecha)
  calidad: CalidadCosecha;

  @ApiProperty({
    example: '100.000',
    description:
      'Cantidad física vendida (> 0, máx 3 decimales) (RN-026 / RN-027)',
  })
  @IsString()
  @Matches(/^\d+(\.\d{1,3})?$/, {
    message: 'La cantidad debe ser un número positivo con máximo 3 decimales',
  })
  cantidad: string;

  @ApiProperty({
    example: '25.50',
    description: 'Precio unitario de venta (> 0, máx 2 decimales)',
  })
  @IsString()
  @Matches(/^\d+(\.\d{1,2})?$/, {
    message:
      'El precio unitario debe ser un número positivo con máximo 2 decimales',
  })
  precioUnitario: string;

  @ApiPropertyOptional({
    example: 1,
    description:
      'ID opcional de la cosecha de origen dentro del mismo ciclo (RN-053)',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  cosechaId?: number;
}
