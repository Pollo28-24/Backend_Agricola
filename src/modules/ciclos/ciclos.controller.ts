import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
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
import { CiclosService } from './ciclos.service';
import { AccionCiclo } from './constants/ciclo-state-machine.constant';
import { CreateCicloDto } from './dto/create-ciclo.dto';
import { UpdateCicloDto } from './dto/update-ciclo.dto';
import { FinalizarCicloDto } from './dto/finalizar-ciclo.dto';
import { FiltroCicloDto } from './dto/filtro-ciclo.dto';
import { CicloResponseDto } from './dto/ciclo-response.dto';
import { CicloDetalleResponseDto } from './dto/ciclo-detalle-response.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermisos } from '../../common/decorators/require-permisos.decorator';
import { PaginatedResponseDto } from '../../common/dto/paginated-response.dto';

@ApiTags('Núcleo Productivo - Ciclos de Producción')
@ApiBearerAuth('JWT-auth')
@Controller('ciclos')
export class CiclosController {
  constructor(private readonly ciclosService: CiclosService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermisos('ciclo:crear')
  @ApiOperation({
    summary: 'Programar un nuevo ciclo de producción (F-07, nace PLANIFICADO)',
  })
  @ApiResponse({ status: 201, type: CicloResponseDto })
  @ApiResponse({
    status: 400,
    description: 'Superficie sembrada inválida o fechas incoherentes',
  })
  @ApiResponse({ status: 404, description: 'Parcela o variedad no encontrada' })
  async crear(
    @CurrentUser('empresaId') empresaId: number,
    @CurrentUser('id') usuarioId: number,
    @Body() dto: CreateCicloDto,
  ): Promise<CicloResponseDto> {
    return this.ciclosService.crearCiclo(empresaId, usuarioId, dto);
  }

  @Get()
  @ApiOperation({
    summary:
      'Listar ciclos de producción de la empresa con filtros y paginación',
  })
  @ApiResponse({ status: 200, type: PaginatedResponseDto })
  async listar(
    @CurrentUser('empresaId') empresaId: number,
    @Query() filtro: FiltroCicloDto,
  ): Promise<PaginatedResponseDto<CicloResponseDto>> {
    return this.ciclosService.listarCiclos(empresaId, filtro);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Consultar detalle completo de un ciclo por ID (RN-068)',
  })
  @ApiResponse({ status: 200, type: CicloDetalleResponseDto })
  @ApiResponse({
    status: 404,
    description: 'Ciclo no encontrado o no pertenece a la empresa',
  })
  async obtenerPorId(
    @CurrentUser('empresaId') empresaId: number,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<CicloDetalleResponseDto> {
    return this.ciclosService.obtenerCicloPorId(empresaId, id);
  }

  @Patch(':id')
  @RequirePermisos('ciclo:crear')
  @ApiOperation({
    summary: 'Actualizar metadatos de un ciclo (bloqueado en ciclos cerrados)',
  })
  @ApiResponse({ status: 200, type: CicloResponseDto })
  @ApiResponse({ status: 404, description: 'Ciclo no encontrado' })
  @ApiResponse({
    status: 409,
    description: 'Ciclo cerrado o superficie inmodificable si ya inició',
  })
  async actualizar(
    @CurrentUser('empresaId') empresaId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCicloDto,
  ): Promise<CicloResponseDto> {
    return this.ciclosService.actualizarCiclo(empresaId, id, dto);
  }

  // =====================================================================
  // TRANSICIONES SEMÁNTICAS DE ESTADO
  // =====================================================================

  @Patch(':id/iniciar')
  @RequirePermisos('ciclo:crear')
  @ApiOperation({
    summary:
      'Iniciar formalmente un ciclo planificado (PLANIFICADO -> ACTIVO, RN-009)',
  })
  @ApiResponse({ status: 200, type: CicloResponseDto })
  @ApiResponse({
    status: 409,
    description:
      'Ya existe otro ciclo ACTIVO en la parcela o transición ilegal',
  })
  async iniciar(
    @CurrentUser('empresaId') empresaId: number,
    @CurrentUser('id') usuarioId: number,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<CicloResponseDto> {
    return this.ciclosService.ejecutarTransicion(
      empresaId,
      usuarioId,
      id,
      AccionCiclo.INICIAR,
    );
  }

  @Patch(':id/suspender')
  @RequirePermisos('ciclo:crear')
  @ApiOperation({
    summary: 'Pausar temporalmente un ciclo activo (ACTIVO -> SUSPENDIDO)',
  })
  @ApiResponse({ status: 200, type: CicloResponseDto })
  @ApiResponse({
    status: 409,
    description: 'Transición inválida si el ciclo no está activo',
  })
  async suspender(
    @CurrentUser('empresaId') empresaId: number,
    @CurrentUser('id') usuarioId: number,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<CicloResponseDto> {
    return this.ciclosService.ejecutarTransicion(
      empresaId,
      usuarioId,
      id,
      AccionCiclo.SUSPENDER,
    );
  }

  @Patch(':id/reanudar')
  @RequirePermisos('ciclo:crear')
  @ApiOperation({
    summary: 'Reanudar un ciclo suspendido (SUSPENDIDO -> ACTIVO, RN-065)',
  })
  @ApiResponse({ status: 200, type: CicloResponseDto })
  @ApiResponse({
    status: 409,
    description: 'Conflicto si entretanto se activó otro ciclo en la parcela',
  })
  async reanudar(
    @CurrentUser('empresaId') empresaId: number,
    @CurrentUser('id') usuarioId: number,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<CicloResponseDto> {
    return this.ciclosService.ejecutarTransicion(
      empresaId,
      usuarioId,
      id,
      AccionCiclo.REANUDAR,
    );
  }

  @Patch(':id/finalizar')
  @RequirePermisos('ciclo:cerrar')
  @ApiOperation({
    summary:
      'Finalizar formalmente la temporada (F-14, ACTIVO/SUSPENDIDO -> FINALIZADO)',
  })
  @ApiResponse({ status: 200, type: CicloResponseDto })
  @ApiResponse({
    status: 400,
    description: 'Fecha de fin requerida y coherente (RN-017)',
  })
  @ApiResponse({
    status: 409,
    description: 'Transición ilegal si no está activo o suspendido',
  })
  async finalizar(
    @CurrentUser('empresaId') empresaId: number,
    @CurrentUser('id') usuarioId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: FinalizarCicloDto,
  ): Promise<CicloResponseDto> {
    return this.ciclosService.ejecutarTransicion(
      empresaId,
      usuarioId,
      id,
      AccionCiclo.FINALIZAR,
      dto,
    );
  }

  @Patch(':id/cancelar')
  @RequirePermisos('ciclo:cerrar')
  @ApiOperation({
    summary:
      'Cancelar un ciclo en curso o planificado (excluido de comparativos RN-058)',
  })
  @ApiResponse({ status: 200, type: CicloResponseDto })
  @ApiResponse({
    status: 409,
    description: 'No se puede cancelar un ciclo finalizado o ya cancelado',
  })
  async cancelar(
    @CurrentUser('empresaId') empresaId: number,
    @CurrentUser('id') usuarioId: number,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<CicloResponseDto> {
    return this.ciclosService.ejecutarTransicion(
      empresaId,
      usuarioId,
      id,
      AccionCiclo.CANCELAR,
    );
  }

  @Patch(':id/reabrir')
  @RequirePermisos('ciclo:reabrir')
  @ApiOperation({
    summary:
      'Reapertura excepcional de un ciclo cerrado (FINALIZADO/CANCELADO -> ACTIVO, RN-067)',
  })
  @ApiResponse({ status: 200, type: CicloResponseDto })
  @ApiResponse({
    status: 403,
    description: 'Permiso denegado (exclusivo para rol ADMIN)',
  })
  @ApiResponse({
    status: 409,
    description: 'Conflicto si la parcela ya tiene otro ciclo activo',
  })
  async reabrir(
    @CurrentUser('empresaId') empresaId: number,
    @CurrentUser('id') usuarioId: number,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<CicloResponseDto> {
    return this.ciclosService.ejecutarTransicion(
      empresaId,
      usuarioId,
      id,
      AccionCiclo.REABRIR,
    );
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @RequirePermisos('ciclo:cerrar')
  @ApiOperation({
    summary: 'Eliminar un ciclo planificado sin registros vinculados (RN-016)',
  })
  @ApiResponse({ status: 200, description: 'Ciclo eliminado exitosamente' })
  @ApiResponse({ status: 404, description: 'Ciclo no encontrado' })
  @ApiResponse({
    status: 409,
    description: 'Ciclo finalizado o con historial de operaciones',
  })
  async eliminar(
    @CurrentUser('empresaId') empresaId: number,
    @CurrentUser('id') usuarioId: number,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<{ message: string }> {
    return this.ciclosService.eliminarCiclo(empresaId, usuarioId, id);
  }
}
