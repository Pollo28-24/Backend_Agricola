import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  ParseIntPipe,
  ParseBoolPipe,
  HttpStatus,
  HttpCode,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { CatalogosService } from './catalogos.service';
import { CultivoResponseDto } from './dto/cultivo-response.dto';
import { VariedadResponseDto } from './dto/variedad-response.dto';
import { TipoSueloResponseDto } from './dto/tipo-suelo-response.dto';
import {
  FiltroUnidadMedidaDto,
  UnidadMedidaResponseDto,
} from './dto/unidad-medida-response.dto';
import { TipoActividadResponseDto } from './dto/tipo-actividad-response.dto';
import { MotivoMermaResponseDto } from './dto/motivo-merma-response.dto';
import {
  CreateCategoriaGastoDto,
  CategoriaGastoResponseDto,
} from './dto/categoria-gasto.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermisos } from '../../common/decorators/require-permisos.decorator';

@ApiTags('Catálogos')
@ApiBearerAuth('JWT-auth')
@Controller('catalogos')
export class CatalogosController {
  constructor(private readonly catalogosService: CatalogosService) {}

  @Get('cultivos')
  @ApiOperation({ summary: 'Consultar catálogo de cultivos agrícolas' })
  @ApiQuery({ name: 'activo', required: false, type: Boolean })
  @ApiResponse({ status: 200, type: [CultivoResponseDto] })
  async obtenerCultivos(
    @Query('activo', new ParseBoolPipe({ optional: true })) activo?: boolean,
  ): Promise<CultivoResponseDto[]> {
    return this.catalogosService.obtenerCultivos(activo);
  }

  @Get('cultivos/:id/variedades')
  @ApiOperation({ summary: 'Consultar variedades asociadas a un cultivo específico' })
  @ApiQuery({ name: 'activo', required: false, type: Boolean })
  @ApiResponse({ status: 200, type: [VariedadResponseDto] })
  @ApiResponse({ status: 404, description: 'Cultivo no encontrado' })
  async obtenerVariedadesPorCultivo(
    @Param('id', ParseIntPipe) cultivoId: number,
    @Query('activo', new ParseBoolPipe({ optional: true })) activo?: boolean,
  ): Promise<VariedadResponseDto[]> {
    return this.catalogosService.obtenerVariedades(cultivoId, activo);
  }

  @Get('tipos-suelo')
  @ApiOperation({ summary: 'Consultar catálogo de tipos agrológicos de suelo' })
  @ApiResponse({ status: 200, type: [TipoSueloResponseDto] })
  async obtenerTiposSuelo(): Promise<TipoSueloResponseDto[]> {
    return this.catalogosService.obtenerTiposSuelo();
  }

  @Get('unidades-medida')
  @ApiOperation({
    summary:
      'Consultar catálogo de unidades de medida (filtrable por tipo: PESO, VOLUMEN, AREA, TIEMPO, CONTEO)',
  })
  @ApiResponse({ status: 200, type: [UnidadMedidaResponseDto] })
  async obtenerUnidadesMedida(
    @Query() filtro: FiltroUnidadMedidaDto,
  ): Promise<UnidadMedidaResponseDto[]> {
    return this.catalogosService.obtenerUnidadesMedida(filtro.tipo);
  }

  @Get('tipos-actividad')
  @ApiOperation({ summary: 'Consultar catálogo de tipos de actividad agrícola' })
  @ApiQuery({ name: 'activo', required: false, type: Boolean })
  @ApiResponse({ status: 200, type: [TipoActividadResponseDto] })
  async obtenerTiposActividad(
    @Query('activo', new ParseBoolPipe({ optional: true })) activo?: boolean,
  ): Promise<TipoActividadResponseDto[]> {
    return this.catalogosService.obtenerTiposActividad(activo);
  }

  @Get('motivos-merma')
  @ApiOperation({ summary: 'Consultar catálogo de motivos de merma o pérdida' })
  @ApiQuery({ name: 'activo', required: false, type: Boolean })
  @ApiResponse({ status: 200, type: [MotivoMermaResponseDto] })
  async obtenerMotivosMerma(
    @Query('activo', new ParseBoolPipe({ optional: true })) activo?: boolean,
  ): Promise<MotivoMermaResponseDto[]> {
    return this.catalogosService.obtenerMotivosMerma(activo);
  }

  @Get('categorias-gasto')
  @ApiOperation({
    summary:
      'Consultar árbol de categorías de gasto (globales del sistema + personalizadas de la empresa, RN-047)',
    description:
      'Retorna el catálogo jerárquico de gastos de máximo dos niveles (raíces y subcategorías hijas) disponible para la empresa autenticada.',
  })
  @ApiResponse({ status: 200, type: [CategoriaGastoResponseDto] })
  async obtenerCategoriasGasto(
    @CurrentUser('empresaId') empresaId: number,
  ): Promise<CategoriaGastoResponseDto[]> {
    return this.catalogosService.obtenerCategoriasGasto(empresaId);
  }

  @RequirePermisos('catalogo:administrar')
  @Post('categorias-gasto')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary:
      'Crear una categoría o subcategoría de gasto personalizada para la empresa (RN-047, RN-048)',
    description:
      'Permite agregar categorías propias al árbol. Valida estrictamente la RN-048: máximo 2 niveles (no permite crear subcategorías de una subcategoría). Requiere permiso catalogo:administrar.',
  })
  @ApiResponse({ status: 201, type: CategoriaGastoResponseDto })
  @ApiResponse({
    status: 400,
    description: 'La categoría padre ya es de segundo nivel (RN-048)',
  })
  @ApiResponse({ status: 404, description: 'Categoría padre no encontrada' })
  @ApiResponse({
    status: 409,
    description: 'Ya existe una categoría con ese nombre en este nivel',
  })
  async crearCategoriaGasto(
    @CurrentUser('empresaId') empresaId: number,
    @Body() dto: CreateCategoriaGastoDto,
  ): Promise<CategoriaGastoResponseDto> {
    return this.catalogosService.crearCategoriaGasto(empresaId, dto);
  }
}
