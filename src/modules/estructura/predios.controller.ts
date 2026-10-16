import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
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
import { PrediosService } from './predios.service';
import { CreatePredioDto } from './dto/create-predio.dto';
import { UpdatePredioDto } from './dto/update-predio.dto';
import { PredioResponseDto } from './dto/predio-response.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermisos } from '../../common/decorators/require-permisos.decorator';

@ApiTags('Estructura Agrícola - Predios')
@ApiBearerAuth('JWT-auth')
@Controller('predios')
export class PrediosController {
  constructor(private readonly prediosService: PrediosService) {}

  @Post()
  @RequirePermisos('estructura:administrar')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Registrar un nuevo predio agrícola para la empresa (RN-003)' })
  @ApiResponse({ status: 201, type: PredioResponseDto })
  @ApiResponse({ status: 409, description: 'Ya existe un predio con ese nombre en la empresa' })
  async crear(
    @CurrentUser('empresaId') empresaId: number,
    @Body() dto: CreatePredioDto,
  ): Promise<PredioResponseDto> {
    return this.prediosService.crearPredio(empresaId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar predios activos de la empresa con conteo de parcelas' })
  @ApiResponse({ status: 200, type: [PredioResponseDto] })
  async listar(
    @CurrentUser('empresaId') empresaId: number,
  ): Promise<PredioResponseDto[]> {
    return this.prediosService.listarPredios(empresaId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Consultar detalle de un predio por ID (RN-068)' })
  @ApiResponse({ status: 200, type: PredioResponseDto })
  @ApiResponse({ status: 404, description: 'Predio no encontrado o no pertenece a la empresa' })
  async obtenerPorId(
    @CurrentUser('empresaId') empresaId: number,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<PredioResponseDto> {
    return this.prediosService.obtenerPredioPorId(empresaId, id);
  }

  @Patch(':id')
  @RequirePermisos('estructura:administrar')
  @ApiOperation({ summary: 'Actualizar datos de un predio' })
  @ApiResponse({ status: 200, type: PredioResponseDto })
  @ApiResponse({ status: 404, description: 'Predio no encontrado o no pertenece a la empresa' })
  @ApiResponse({ status: 409, description: 'Conflicto por duplicidad de nombre' })
  async actualizar(
    @CurrentUser('empresaId') empresaId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePredioDto,
  ): Promise<PredioResponseDto> {
    return this.prediosService.actualizarPredio(empresaId, id, dto);
  }

  @Delete(':id')
  @RequirePermisos('estructura:administrar')
  @ApiOperation({
    summary: 'Baja lógica de predio y liberación de nombre único (RN-041, Sección 3.11)',
  })
  @ApiResponse({ status: 200, description: 'Predio eliminado exitosamente' })
  @ApiResponse({ status: 404, description: 'Predio no encontrado o no pertenece a la empresa' })
  @ApiResponse({
    status: 409,
    description: 'No se puede eliminar porque contiene parcelas activas asociadas',
  })
  async eliminar(
    @CurrentUser('empresaId') empresaId: number,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<{ mensaje: string }> {
    return this.prediosService.eliminarPredio(empresaId, id);
  }
}
