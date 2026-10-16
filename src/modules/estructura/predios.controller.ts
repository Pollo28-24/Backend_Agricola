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
import { EstructuraService } from './estructura.service';
import { CreatePredioDto } from './dto/create-predio.dto';
import { UpdatePredioDto } from './dto/update-predio.dto';
import { PredioResponseDto } from './dto/predio-response.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermisos } from '../../common/decorators/require-permisos.decorator';

@ApiTags('Estructura Agrícola - Predios')
@ApiBearerAuth('JWT-auth')
@Controller('predios')
export class PrediosController {
  constructor(private readonly estructuraService: EstructuraService) {}

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
    return this.estructuraService.crearPredio(empresaId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar predios activos de la empresa con conteo de parcelas' })
  @ApiResponse({ status: 200, type: [PredioResponseDto] })
  async listar(
    @CurrentUser('empresaId') empresaId: number,
  ): Promise<PredioResponseDto[]> {
    return this.estructuraService.listarPredios(empresaId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Consultar detalle de un predio por ID (RN-068)' })
  @ApiResponse({ status: 200, type: PredioResponseDto })
  @ApiResponse({ status: 404, description: 'Predio no encontrado o no pertenece a la empresa' })
  async obtenerPorId(
    @CurrentUser('empresaId') empresaId: number,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<PredioResponseDto> {
    return this.estructuraService.obtenerPredioPorId(empresaId, id);
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
    return this.estructuraService.actualizarPredio(empresaId, id, dto);
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
    return this.estructuraService.eliminarPredio(empresaId, id);
  }
}
