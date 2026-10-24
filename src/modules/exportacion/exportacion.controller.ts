import {
  Controller,
  Get,
  Param,
  Query,
  ParseIntPipe,
  StreamableFile,
  Header,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { RequirePermisos } from '../../common/decorators/require-permisos.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { UsuarioAutenticado } from '../auth/interfaces/jwt-payload.interface';
import { ExportacionService } from './services/exportacion.service';
import {
  ExportarRentabilidadDto,
  ExportarComparativoDto,
  ExportarCuentasPorCobrarDto,
  QueryExportacionDto,
} from './dto/exportacion-query.dto';

@ApiTags('Exportación de Reportes')
@ApiBearerAuth('JWT-auth')
@Controller('reportes/exportaciones')
export class ExportacionController {
  constructor(private readonly exportacionService: ExportacionService) {}

  @Get('rentabilidad')
  @RequirePermisos('reporte:exportar')
  @Header('X-Content-Type-Options', 'nosniff')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary:
      'Exporta el reporte general de rentabilidad de ciclos a Excel, PDF o CSV (Hito 10B / ADR-013)',
  })
  @ApiResponse({ status: 200, description: 'Archivo binario descargable' })
  @ApiResponse({
    status: 400,
    description: 'Parámetros inválidos o límite de 5000 filas excedido',
  })
  @ApiResponse({
    status: 403,
    description: 'Permiso reporte:exportar denegado',
  })
  async exportarRentabilidad(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Query() filtro: ExportarRentabilidadDto,
  ): Promise<StreamableFile> {
    const resultado = await this.exportacionService.exportarRentabilidad(
      usuario.empresaId,
      filtro,
    );

    return new StreamableFile(resultado.buffer, {
      type: resultado.mimeType,
      disposition: `attachment; filename="${resultado.filename}"`,
      length: resultado.buffer.length,
    });
  }

  @Get('ciclos/:cicloId')
  @RequirePermisos('reporte:exportar')
  @Header('X-Content-Type-Options', 'nosniff')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary:
      'Exporta el reporte integral de un ciclo específico (rentabilidad y desgloses)',
  })
  @ApiResponse({ status: 200, description: 'Archivo binario descargable' })
  @ApiResponse({ status: 404, description: 'Ciclo inexistente o ajeno' })
  async exportarCicloDetalle(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('cicloId', ParseIntPipe) cicloId: number,
    @Query() query: QueryExportacionDto,
  ): Promise<StreamableFile> {
    const resultado = await this.exportacionService.exportarCicloDetalle(
      usuario.empresaId,
      cicloId,
      query.formato,
    );

    return new StreamableFile(resultado.buffer, {
      type: resultado.mimeType,
      disposition: `attachment; filename="${resultado.filename}"`,
      length: resultado.buffer.length,
    });
  }

  @Get('parcelas/:parcelaId/comparativo')
  @RequirePermisos('reporte:exportar')
  @Header('X-Content-Type-Options', 'nosniff')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary:
      'Exporta el comparativo cronológico de ciclos en una parcela específica',
  })
  @ApiResponse({ status: 200, description: 'Archivo binario descargable' })
  @ApiResponse({ status: 404, description: 'Parcela inexistente o ajena' })
  async exportarComparativo(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('parcelaId', ParseIntPipe) parcelaId: number,
    @Query() filtro: ExportarComparativoDto,
  ): Promise<StreamableFile> {
    const resultado = await this.exportacionService.exportarComparativo(
      usuario.empresaId,
      parcelaId,
      filtro,
    );

    return new StreamableFile(resultado.buffer, {
      type: resultado.mimeType,
      disposition: `attachment; filename="${resultado.filename}"`,
      length: resultado.buffer.length,
    });
  }

  @Get('cuentas-por-cobrar')
  @RequirePermisos('reporte:exportar')
  @Header('X-Content-Type-Options', 'nosniff')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'Exporta la cartera de cuentas por cobrar y saldos vencidos',
  })
  @ApiResponse({ status: 200, description: 'Archivo binario descargable' })
  async exportarCuentasPorCobrar(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Query() filtro: ExportarCuentasPorCobrarDto,
  ): Promise<StreamableFile> {
    const resultado = await this.exportacionService.exportarCuentasPorCobrar(
      usuario.empresaId,
      filtro,
    );

    return new StreamableFile(resultado.buffer, {
      type: resultado.mimeType,
      disposition: `attachment; filename="${resultado.filename}"`,
      length: resultado.buffer.length,
    });
  }
}
