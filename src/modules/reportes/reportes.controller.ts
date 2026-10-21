import {
  Controller,
  Get,
  Param,
  Query,
  ParseIntPipe,
  HttpStatus,
  HttpCode,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { IndicadoresService } from './services/indicadores.service';
import { FiltroRentabilidadDto } from './dto/filtro-rentabilidad.dto';
import { FiltroComparativoDto } from './dto/filtro-comparativo.dto';
import { RentabilidadCicloItemDto } from './dto/rentabilidad-ciclo-response.dto';
import { CostoPorCategoriaDto } from './dto/costo-categoria-response.dto';
import { CostoPorActividadDto } from './dto/costo-actividad-response.dto';
import { MermaDesgloseDto } from './dto/merma-desglose-response.dto';
import { ComparativoParcelaItemDto } from './dto/comparativo-parcela-response.dto';
import { PaginatedResponseDto } from '../../common/dto/paginated-response.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { UsuarioAutenticado } from '../auth/interfaces/jwt-payload.interface';
import { RequirePermisos } from '../../common/decorators/require-permisos.decorator';

@ApiTags('Reportes e Indicadores')
@ApiBearerAuth('JWT-auth')
@Controller('reportes')
export class ReportesController {
  constructor(private readonly indicadoresService: IndicadoresService) {}

  @Get('rentabilidad')
  @HttpCode(HttpStatus.OK)
  @RequirePermisos('reporte:ver')
  @ApiOperation({
    summary: 'Listado paginado de rentabilidad de ciclos en 2 pasos (RN-066)',
  })
  @ApiResponse({ status: 200, description: 'Listado obtenido exitosamente' })
  async obtenerRentabilidad(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Query() filtro: FiltroRentabilidadDto,
  ): Promise<PaginatedResponseDto<RentabilidadCicloItemDto>> {
    return this.indicadoresService.obtenerRentabilidad(
      usuario.empresaId,
      filtro,
    );
  }

  @Get('ciclos/:cicloId/rentabilidad')
  @HttpCode(HttpStatus.OK)
  @RequirePermisos('reporte:ver')
  @ApiOperation({
    summary: 'Indicadores detallados de rentabilidad de un ciclo (RN-066)',
  })
  @ApiResponse({ status: 200, type: RentabilidadCicloItemDto })
  async obtenerRentabilidadCiclo(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('cicloId', ParseIntPipe) cicloId: number,
  ): Promise<RentabilidadCicloItemDto> {
    return this.indicadoresService.obtenerRentabilidadCiclo(
      usuario.empresaId,
      cicloId,
    );
  }

  @Get('ciclos/:cicloId/costos-por-categoria')
  @HttpCode(HttpStatus.OK)
  @RequirePermisos('reporte:ver')
  @ApiOperation({
    summary: 'Desglose de costos por categoría raíz para un ciclo',
  })
  @ApiResponse({ status: 200, type: [CostoPorCategoriaDto] })
  async obtenerCostosPorCategoria(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('cicloId', ParseIntPipe) cicloId: number,
  ): Promise<CostoPorCategoriaDto[]> {
    return this.indicadoresService.obtenerCostosPorCategoria(
      usuario.empresaId,
      cicloId,
    );
  }

  @Get('ciclos/:cicloId/costos-por-actividad')
  @HttpCode(HttpStatus.OK)
  @RequirePermisos('reporte:ver')
  @ApiOperation({
    summary: 'Desglose de costos por tipo de actividad para un ciclo',
  })
  @ApiResponse({ status: 200, type: [CostoPorActividadDto] })
  async obtenerCostosPorActividad(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('cicloId', ParseIntPipe) cicloId: number,
  ): Promise<CostoPorActividadDto[]> {
    return this.indicadoresService.obtenerCostosPorActividad(
      usuario.empresaId,
      cicloId,
    );
  }

  @Get('ciclos/:cicloId/mermas')
  @HttpCode(HttpStatus.OK)
  @RequirePermisos('reporte:ver')
  @ApiOperation({
    summary: 'Desglose de mermas por motivo y etapa para un ciclo',
  })
  @ApiResponse({ status: 200, type: [MermaDesgloseDto] })
  async obtenerMermas(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('cicloId', ParseIntPipe) cicloId: number,
  ): Promise<MermaDesgloseDto[]> {
    return this.indicadoresService.obtenerMermasDesglose(
      usuario.empresaId,
      cicloId,
    );
  }

  @Get('parcelas/:parcelaId/comparativo')
  @HttpCode(HttpStatus.OK)
  @RequirePermisos('reporte:ver')
  @ApiOperation({
    summary:
      'Comparativo analítico histórico de ciclos en una parcela (LAG / RN-058)',
  })
  @ApiResponse({ status: 200 })
  async obtenerComparativoParcela(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('parcelaId', ParseIntPipe) parcelaId: number,
    @Query() filtro: FiltroComparativoDto,
  ): Promise<PaginatedResponseDto<ComparativoParcelaItemDto>> {
    return this.indicadoresService.obtenerComparativoParcela(
      usuario.empresaId,
      parcelaId,
      filtro,
    );
  }
}
