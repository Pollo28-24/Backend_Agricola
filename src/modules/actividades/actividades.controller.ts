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
import { ActividadesService } from './actividades.service';
import { CreateActividadDto } from './dto/create-actividad.dto';
import { UpdateActividadDto } from './dto/update-actividad.dto';
import { FiltroActividadDto } from './dto/filtro-actividad.dto';
import { ActividadResponseDto } from './dto/actividad-response.dto';
import { ActividadDetalleResponseDto } from './dto/actividad-detalle-response.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { UsuarioAutenticado } from '../auth/interfaces/jwt-payload.interface';
import { RequirePermisos } from '../../common/decorators/require-permisos.decorator';
import { PaginatedResponseDto } from '../../common/dto/paginated-response.dto';
import { ApiPaginatedResponse } from '../../common/decorators/api-paginated-response.decorator';
import { MessageResponseDto } from '../../common/dto/mensaje-response.dto';

@ApiTags('Núcleo Productivo - Actividades Agrícolas')
@ApiBearerAuth('JWT-auth')
@Controller('actividades')
export class ActividadesController {
  constructor(private readonly actividadesService: ActividadesService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermisos('actividad:crear')
  @ApiOperation({
    summary:
      'Registrar una nueva labor o actividad agrícola en el ciclo (F-08 / RN-010 / RN-015 / RN-044)',
  })
  @ApiResponse({ status: 201, type: ActividadResponseDto })
  @ApiResponse({
    status: 400,
    description:
      'Fecha anterior al inicio del ciclo (RN-044) o datos inválidos',
  })
  @ApiResponse({
    status: 404,
    description: 'Ciclo o responsable no encontrado en su empresa (RN-068)',
  })
  @ApiResponse({
    status: 409,
    description: 'Ciclo cerrado (RN-015) o tipo/responsable inactivo',
  })
  async crearActividad(
    @CurrentUser() user: UsuarioAutenticado,
    @Body() dto: CreateActividadDto,
  ): Promise<ActividadResponseDto> {
    return this.actividadesService.crearActividad(user.empresaId, user.id, dto);
  }

  @Get()
  @RequirePermisos('actividad:crear')
  @ApiOperation({
    summary:
      'Listar actividades de la empresa con filtros opcionales y paginación (RN-068 / Contrato 3.23)',
  })
  @ApiPaginatedResponse(ActividadResponseDto)
  async listarActividades(
    @CurrentUser('empresaId') empresaId: number,
    @Query() filtro: FiltroActividadDto,
  ): Promise<PaginatedResponseDto<ActividadResponseDto>> {
    return this.actividadesService.listarActividades(empresaId, filtro);
  }

  @Get(':id')
  @RequirePermisos('actividad:crear')
  @ApiOperation({
    summary:
      'Obtener detalle enriquecido de una actividad por ID (incluye conteo de gastos vinculados)',
  })
  @ApiResponse({ status: 200, type: ActividadDetalleResponseDto })
  @ApiResponse({
    status: 404,
    description: 'Actividad no encontrada en su empresa (RN-068)',
  })
  async obtenerActividadPorId(
    @CurrentUser('empresaId') empresaId: number,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<ActividadDetalleResponseDto> {
    return this.actividadesService.obtenerActividadPorId(empresaId, id);
  }

  @Patch(':id')
  @RequirePermisos('actividad:crear')
  @ApiOperation({
    summary:
      'Actualizar una actividad existente sujeta a ventana de 48h (RN-062) y ciclo abierto (RN-015)',
  })
  @ApiResponse({ status: 200, type: ActividadResponseDto })
  @ApiResponse({
    status: 400,
    description: 'Fecha incoherente con inicio de ciclo (RN-044)',
  })
  @ApiResponse({
    status: 403,
    description: 'No es el creador de la actividad (RN-062)',
  })
  @ApiResponse({
    status: 404,
    description: 'Actividad no encontrada en su empresa (RN-068)',
  })
  @ApiResponse({
    status: 409,
    description: 'Ventana de 48h vencida (RN-062) o ciclo cerrado (RN-015)',
  })
  async actualizarActividad(
    @CurrentUser() user: UsuarioAutenticado,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateActividadDto,
  ): Promise<ActividadResponseDto> {
    const tienePermisoAdministrar =
      user.permisos?.includes('registro:administrar') ?? false;
    return this.actividadesService.actualizarActividad(
      user.empresaId,
      user.id,
      tienePermisoAdministrar,
      id,
      dto,
    );
  }

  @Delete(':id')
  @RequirePermisos('registro:administrar')
  @ApiOperation({
    summary:
      'Baja lógica de una actividad bajo ventana de 48h (RN-062) e integridad con gastos (RN-046)',
  })
  @ApiResponse({
    status: 200,
    type: MessageResponseDto,
  })
  @ApiResponse({
    status: 403,
    description: 'No es el creador de la actividad (RN-062)',
  })
  @ApiResponse({
    status: 404,
    description: 'Actividad no encontrada en su empresa (RN-068)',
  })
  @ApiResponse({
    status: 409,
    description:
      'Ventana de 48h vencida, ciclo cerrado o gastos activos vinculados',
  })
  async eliminarActividad(
    @CurrentUser() user: UsuarioAutenticado,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<MessageResponseDto> {
    const tienePermisoAdministrar =
      user.permisos?.includes('registro:administrar') ?? false;
    return this.actividadesService.eliminarActividad(
      user.empresaId,
      user.id,
      tienePermisoAdministrar,
      id,
    );
  }
}
