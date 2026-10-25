import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CodigoError } from '../errors/codigos-error.enum';

export class ErrorResponseDto {
  @ApiProperty({
    type: Number,
    example: 400,
    description: 'Código de estado HTTP de la respuesta',
  })
  statusCode!: number;

  @ApiProperty({
    enum: CodigoError,
    enumName: 'CodigoError',
    example: CodigoError.PETICION_INVALIDA,
    description: 'Código único de error de dominio',
  })
  code!: CodigoError;

  @ApiProperty({
    type: String,
    example: 'Los datos enviados en la petición son inválidos',
    description: 'Mensaje descriptivo del error en español',
  })
  message!: string;

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: true,
    nullable: true,
    example: { errores: ['El campo nombre es obligatorio'] },
    description:
      'Detalles estructurados adicionales del error (errores de validación, límites, metadatos)',
  })
  details?: Record<string, unknown>;
}
