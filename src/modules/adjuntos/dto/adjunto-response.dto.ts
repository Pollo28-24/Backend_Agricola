import { ApiProperty } from '@nestjs/swagger';

export class AdjuntoResponseDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 1 })
  empresaId: number;

  @ApiProperty({ example: 'gasto' })
  entidad: string;

  @ApiProperty({ example: 10 })
  entidadId: number;

  @ApiProperty({ example: 'factura_abono.pdf' })
  nombreArchivo: string;

  @ApiProperty({ example: 'application/pdf' })
  tipoMime: string;

  @ApiProperty({ example: 1048576 })
  tamanoBytes: number;

  @ApiProperty({ example: 2 })
  subidoPorId: number;

  @ApiProperty({
    type: String,
    format: 'date-time',
    example: '2026-10-22T12:00:00.000Z',
  })
  createdAt: string;
}

export class EnlaceDescargaDto {
  @ApiProperty({
    example: '/api/v1/adjuntos/descarga?token=eyJhbGciOiJIUzI1NiJ9.signature',
  })
  urlDescarga: string;

  @ApiProperty({ example: 'eyJhbGciOiJIUzI1NiJ9.signature' })
  token: string;

  @ApiProperty({
    type: String,
    format: 'date-time',
    example: '2026-10-22T12:05:00.000Z',
  })
  expiraEn: string;
}
