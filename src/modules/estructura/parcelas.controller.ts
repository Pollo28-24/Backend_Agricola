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
  ApiQuery,
} from '@nestjs/swagger';
import { EstadoParcela } from '@prisma/client';
import { ParcelasService } from './parcelas.service';
import { CreateParcelaDto } from './dto/create-parcela.dto';
import { UpdateParcelaDto } from './dto/update-parcela.dto';
import { ParcelaResponseDto } from './dto/parcela-response.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermisos } from '../../common/decorators/require-permisos.decorator';
import { MensajeResponseDto } from '../../common/dto/mensaje-response.dto';

@ApiTags('Estructura Agrícola - Parcelas')
@ApiBearerAuth('JWT-auth')
@Controller('parcelas')
export class ParcelasController {
  constructor(private readonly parcelasService: ParcelasService) {}

  @Post()
  @RequirePermisos('estructura:administrar')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary:
      'Registrar una nueva parcela validando límite de plan comercial (RN-037)',
  })
  @ApiResponse({ status: 201, type: ParcelaResponseDto })
  @ApiResponse({
    status: 403,
    description: 'Límite de parcelas del plan alcanzado (RN-037)',
  })
  @ApiResponse({
    status: 404,
    description: 'Predio o tipo de suelo no encontrado',
  })
  @ApiResponse({
    status: 409,
    description: 'Ya existe una parcela con ese nombre en el predio',
  })
  async crear(
    @CurrentUser('empresaId') empresaId: number,
    @Body() dto: CreateParcelaDto,
  ): Promise<ParcelaResponseDto> {
    return this.parcelasService.crearParcela(empresaId, dto);
  }

  @Get()
  @ApiOperation({
    summary: 'Listar parcelas de la empresa (con filtros opcionales)',
  })
  @ApiQuery({ name: 'predioId', required: false, type: Number })
  @ApiQuery({
    name: 'estado',
    required: false,
    enum: EstadoParcela,
  })
  @ApiResponse({ status: 200, type: [ParcelaResponseDto] })
  async listar(
    @CurrentUser('empresaId') empresaId: number,
    @Query('predioId') predioId?: number,
    @Query('estado') estado?: EstadoParcela,
  ): Promise<ParcelaResponseDto[]> {
    return this.parcelasService.listarParcelas(
      empresaId,
      predioId ? Number(predioId) : undefined,
      estado,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Consultar parcela por ID (RN-068)' })
  @ApiResponse({ status: 200, type: ParcelaResponseDto })
  @ApiResponse({
    status: 404,
    description: 'Parcela no encontrada o no pertenece a la empresa',
  })
  async obtenerPorId(
    @CurrentUser('empresaId') empresaId: number,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<ParcelaResponseDto> {
    return this.parcelasService.obtenerParcelaPorId(empresaId, id);
  }

  @Patch(':id')
  @RequirePermisos('estructura:administrar')
  @ApiOperation({ summary: 'Actualizar datos de una parcela' })
  @ApiResponse({ status: 200, type: ParcelaResponseDto })
  @ApiResponse({
    status: 404,
    description: 'Parcela no encontrada o no pertenece a la empresa',
  })
  @ApiResponse({
    status: 409,
    description: 'Conflicto por duplicidad de nombre en el predio',
  })
  async actualizar(
    @CurrentUser('empresaId') empresaId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateParcelaDto,
  ): Promise<ParcelaResponseDto> {
    return this.parcelasService.actualizarParcela(empresaId, id, dto);
  }

  @Delete(':id')
  @RequirePermisos('estructura:administrar')
  @ApiOperation({
    summary:
      'Baja lógica de parcela y liberación de nombre (RN-041, Sección 3.11)',
  })
  @ApiResponse({
    status: 200,
    description: 'Parcela dada de baja exitosamente',
    type: MensajeResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Parcela no encontrada o no pertenece a la empresa',
  })
  @ApiResponse({
    status: 409,
    description:
      'No se puede eliminar porque tiene ciclos de producción activos o planificados',
  })
  async eliminar(
    @CurrentUser('empresaId') empresaId: number,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<MensajeResponseDto> {
    return this.parcelasService.eliminarParcela(empresaId, id);
  }
}
