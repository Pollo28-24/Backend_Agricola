import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { FormatoExportacion } from '../constants/exportacion.constants';
import { FiltroRentabilidadDto } from '../../reportes/dto/filtro-rentabilidad.dto';
import { FiltroComparativoDto } from '../../reportes/dto/filtro-comparativo.dto';
import { FiltroCuentasPorCobrarDto } from '../../reportes/dto/filtro-cuentas-por-cobrar.dto';

export class QueryExportacionDto {
  @ApiProperty({
    enum: FormatoExportacion,
    description: 'Formato del archivo exportado (xlsx, pdf, csv)',
    example: FormatoExportacion.XLSX,
  })
  @IsEnum(FormatoExportacion, {
    message: 'El formato debe ser xlsx, pdf o csv',
  })
  formato!: FormatoExportacion;
}

export class ExportarRentabilidadDto extends FiltroRentabilidadDto {
  @ApiProperty({
    enum: FormatoExportacion,
    description: 'Formato del archivo exportado (xlsx, pdf, csv)',
    example: FormatoExportacion.XLSX,
  })
  @IsEnum(FormatoExportacion, {
    message: 'El formato debe ser xlsx, pdf o csv',
  })
  formato!: FormatoExportacion;
}

export class ExportarComparativoDto extends FiltroComparativoDto {
  @ApiProperty({
    enum: FormatoExportacion,
    description: 'Formato del archivo exportado (xlsx, pdf, csv)',
    example: FormatoExportacion.XLSX,
  })
  @IsEnum(FormatoExportacion, {
    message: 'El formato debe ser xlsx, pdf o csv',
  })
  formato!: FormatoExportacion;
}

export class ExportarCuentasPorCobrarDto extends FiltroCuentasPorCobrarDto {
  @ApiProperty({
    enum: FormatoExportacion,
    description: 'Formato del archivo exportado (xlsx, pdf, csv)',
    example: FormatoExportacion.XLSX,
  })
  @IsEnum(FormatoExportacion, {
    message: 'El formato debe ser xlsx, pdf o csv',
  })
  formato!: FormatoExportacion;
}
