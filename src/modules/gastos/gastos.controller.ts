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
import { GastosService } from './gastos.service';
import { CreateGastoDto } from './dto/create-gasto.dto';
import { UpdateGastoDto } from './dto/update-gasto.dto';
import { FiltroGastoDto } from './dto/filtro-gasto.dto';
import { GastoResponseDto } from './dto/gasto-response.dto';
import { GastoDetalleResponseDto } from './dto/gasto-detalle-response.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { UsuarioAutenticado } from '../auth/interfaces/jwt-payload.interface';
import { RequirePermisos } from '../../common/decorators/require-permisos.decorator';
import { PaginatedResponseDto } from '../../common/dto/paginated-response.dto';

@ApiTags('Costos Operativos - Gastos')
@ApiBearerAuth('JWT-auth')
@Controller('gastos')
export class GastosController {
  constructor(private readonly gastosService: GastosService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermisos('gasto:crear', 'registro:administrar')
  @ApiOperation({
    summary:
      'Registrar un nuevo gasto o costo operativo en el ciclo (F-09 / RN-019 / RN-020 / RN-045)',
  })
  @ApiResponse({ status: 201, type: GastoResponseDto })
  @ApiResponse({
    status: 400,
    description:
      'Tolerancia aritmética no coincide (RN-045) o fecha anterior al ciclo (RN-044)',
  })
  @ApiResponse({
    status: 404,
    description:
      'Ciclo, categoría, proveedor o actividad no encontrada en la empresa (RN-068)',
  })
  @ApiResponse({
    status: 409,
    description: 'Ciclo en estado cerrado (RN-015 / RN-023)',
  })
  async crearGasto(
    @CurrentUser() user: UsuarioAutenticado,
    @Body() dto: CreateGastoDto,
  ): Promise<GastoResponseDto> {
    return this.gastosService.crearGasto(user.empresaId, user.id, dto);
  }

  @Get()
  @RequirePermisos('gasto:crear', 'gasto:editar_todos', 'registro:administrar')
  @ApiOperation({
    summary:
      'Listar gastos operativos con scoped visibility (CAPTURISTA solo ve sus propios gastos) y paginación (Contrato 3.23)',
  })
  @ApiResponse({ status: 200, type: PaginatedResponseDto<GastoResponseDto> })
  async listarGastos(
    @CurrentUser() user: UsuarioAutenticado,
    @Query() filtro: FiltroGastoDto,
  ): Promise<PaginatedResponseDto<GastoResponseDto>> {
    const tienePermisoEditarTodos =
      user.permisos?.includes('gasto:editar_todos') ||
      user.permisos?.includes('registro:administrar') ||
      false;

    return this.gastosService.listarGastos(
      user.empresaId,
      user.id,
      tienePermisoEditarTodos,
      filtro,
    );
  }

  @Get(':id')
  @RequirePermisos('gasto:crear', 'gasto:editar_todos', 'registro:administrar')
  @ApiOperation({
    summary:
      'Obtener detalle de un gasto por ID con relaciones precargadas (404 si es ajeno a un CAPTURISTA)',
  })
  @ApiResponse({ status: 200, type: GastoDetalleResponseDto })
  @ApiResponse({
    status: 404,
    description: 'Gasto no encontrado en la empresa o no pertenece al usuario',
  })
  async obtenerGastoPorId(
    @CurrentUser() user: UsuarioAutenticado,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<GastoDetalleResponseDto> {
    const tienePermisoEditarTodos =
      user.permisos?.includes('gasto:editar_todos') ||
      user.permisos?.includes('registro:administrar') ||
      false;

    return this.gastosService.obtenerGastoPorId(
      user.empresaId,
      user.id,
      tienePermisoEditarTodos,
      id,
    );
  }

  @Patch(':id')
  @RequirePermisos('gasto:crear', 'gasto:editar_todos', 'registro:administrar')
  @ApiOperation({
    summary:
      'Actualizar un gasto existente sujeto a ventana de 48h (RN-062), ciclo abierto (RN-015) y recálculo fusionado (RN-045)',
  })
  @ApiResponse({ status: 200, type: GastoResponseDto })
  @ApiResponse({
    status: 400,
    description: 'Recálculo aritmético excede tolerancia de 0.05 (RN-045)',
  })
  @ApiResponse({
    status: 403,
    description: 'No es el creador del gasto (RN-062)',
  })
  @ApiResponse({
    status: 404,
    description: 'Gasto no encontrado en su empresa (RN-068)',
  })
  @ApiResponse({
    status: 409,
    description: 'Ventana de 48h expirada (RN-062) o ciclo cerrado (RN-015)',
  })
  async actualizarGasto(
    @CurrentUser() user: UsuarioAutenticado,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateGastoDto,
  ): Promise<GastoResponseDto> {
    const tienePermisoAdministrar =
      user.permisos?.includes('registro:administrar') ?? false;
    const tienePermisoEditarTodos =
      user.permisos?.includes('gasto:editar_todos') ?? false;

    return this.gastosService.actualizarGasto(
      user.empresaId,
      user.id,
      tienePermisoAdministrar,
      tienePermisoEditarTodos,
      id,
      dto,
    );
  }

  @Delete(':id')
  @RequirePermisos('registro:administrar')
  @ApiOperation({
    summary:
      'Baja lógica de un gasto. Exclusivo para ADMIN con registro:administrar (Sección 2.12 / A2)',
  })
  @ApiResponse({
    status: 200,
    schema: { example: { message: 'Gasto eliminado exitosamente' } },
  })
  @ApiResponse({
    status: 403,
    description: 'Permiso denegado: solo ADMIN puede eliminar gastos',
  })
  @ApiResponse({
    status: 404,
    description: 'Gasto no encontrado en su empresa (RN-068)',
  })
  @ApiResponse({ status: 409, description: 'Ciclo cerrado (RN-015)' })
  async eliminarGasto(
    @CurrentUser() user: UsuarioAutenticado,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<{ message: string }> {
    const tienePermisoAdministrar =
      user.permisos?.includes('registro:administrar') ?? false;

    return this.gastosService.eliminarGasto(
      user.empresaId,
      user.id,
      tienePermisoAdministrar,
      id,
    );
  }
}
