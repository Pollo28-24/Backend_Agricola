import { ApiProperty } from '@nestjs/swagger';

export class MensajeResponseDto {
  @ApiProperty({
    type: String,
    example: 'Operación realizada exitosamente',
    description: 'Mensaje de confirmación de la operación',
  })
  mensaje!: string;
}

export class MessageResponseDto {
  @ApiProperty({
    type: String,
    example: 'Registro eliminado exitosamente',
    description: 'Mensaje de confirmación de la operación',
  })
  message!: string;
}
