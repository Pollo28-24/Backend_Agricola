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
import { CosechasService } from './cosechas.service';
import { CreateCosechaDto } from './dto/create-cosecha.dto';
import { UpdateCosechaDto } from './dto/update-cosecha.dto';
import { FiltroCosechaDto } from './dto/filtro-cosecha.dto';
import { CosechaResponseDto } from './dto/cosecha-response.dto';
import { CosechaDetalleResponseDto } from './dto/cosecha-detalle-response.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { UsuarioAutenticado } from '../auth/interfaces/jwt-payload.interface';
import { RequirePermisos } from '../../common/decorators/require-permisos.decorator';
import { PaginatedResponseDto } from '../../common/dto/paginated-response.dto';

@ApiTags('Producción - Cosechas')
@ApiBearerAuth('JWT-auth')
@Controller('cosechas')
export class CosechasController {
  constructor(private readonly cosechasService: CosechasService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermisos('cosecha:crear')
  @ApiOperation({
    summary:
      'Registrar un corte o recolección de cosecha (F-11 / RN-024 / RN-026 / RN-069)',
  })
  @ApiResponse({ status: 201, type: CosechaResponseDto })
  @ApiResponse({
    status: 400,
    description:
      'Unidad no es de peso (RN-069) o fecha anterior al ciclo (RN-044)',
  })
  @ApiResponse({
    status: 404,
    description: 'Ciclo o unidad de medida no encontrada (RN-068)',
  })
  @ApiResponse({
    status: 409,
    description: 'Ciclo cerrado o en estado PLANIFICADO (Tabla 2.6)',
  })
  async crearCosecha(
    @CurrentUser() user: UsuarioAutenticado,
    @Body() dto: CreateCosechaDto,
  ): Promise<CosechaResponseDto> {
    return this.cosechasService.crearCosecha(user.empresaId, user.id, dto);
  }

  @Get()
  @RequirePermisos('cosecha:crear')
  @ApiOperation({
    summary:
      'Listar cosechas con scoped visibility y paginación (Contrato 3.23)',
  })
  @ApiResponse({ status: 200, type: PaginatedResponseDto<CosechaResponseDto> })
  async listarCosechas(
    @CurrentUser() user: UsuarioAutenticado,
    @Query() filtro: FiltroCosechaDto,
  ): Promise<PaginatedResponseDto<CosechaResponseDto>> {
    const tienePermisoAdministrar =
      user.permisos?.includes('registro:administrar') ?? false;

    return this.cosechasService.listarCosechas(
      user.empresaId,
      user.id,
      tienePermisoAdministrar,
      filtro,
    );
  }

  @Get(':id')
  @RequirePermisos('cosecha:crear')
  @ApiOperation({
    summary:
      'Obtener detalle de cosecha por ID (404 si es ajena a un CAPTURISTA)',
  })
  @ApiResponse({ status: 200, type: CosechaDetalleResponseDto })
  @ApiResponse({
    status: 404,
    description: 'Cosecha no encontrada en la empresa o ajena al usuario',
  })
  async obtenerCosechaPorId(
    @CurrentUser() user: UsuarioAutenticado,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<CosechaDetalleResponseDto> {
    const tienePermisoAdministrar =
      user.permisos?.includes('registro:administrar') ?? false;

    return this.cosechasService.obtenerCosechaPorId(
      user.empresaId,
      user.id,
      tienePermisoAdministrar,
      id,
    );
  }

  @Patch(':id')
  @RequirePermisos('cosecha:crear')
  @ApiOperation({
    summary:
      'Actualizar una cosecha sujeta a ventana de 48h (RN-062) y balance de mermas (RN-070)',
  })
  @ApiResponse({ status: 200, type: CosechaResponseDto })
  @ApiResponse({ status: 400, description: 'Fecha o cantidad inválida' })
  @ApiResponse({
    status: 403,
    description: 'No es el creador de la cosecha (RN-062)',
  })
  @ApiResponse({
    status: 404,
    description: 'Cosecha no encontrada en su empresa (RN-068)',
  })
  @ApiResponse({
    status: 409,
    description:
      'Ventana de 48h vencida o reducción viola balance de mermas (RN-032)',
  })
  async actualizarCosecha(
    @CurrentUser() user: UsuarioAutenticado,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCosechaDto,
  ): Promise<CosechaResponseDto> {
    const tienePermisoAdministrar =
      user.permisos?.includes('registro:administrar') ?? false;

    return this.cosechasService.actualizarCosecha(
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
    summary: 'Baja lógica de cosecha. Exclusivo para ADMIN (RN-050 / RN-062)',
  })
  @ApiResponse({
    status: 200,
    schema: { example: { message: 'Cosecha eliminada exitosamente' } },
  })
  @ApiResponse({
    status: 403,
    description: 'Permiso denegado: solo ADMIN puede eliminar cosechas',
  })
  @ApiResponse({
    status: 404,
    description: 'Cosecha no encontrada en su empresa (RN-068)',
  })
  @ApiResponse({
    status: 409,
    description:
      'Cosecha tiene mermas activas vinculadas (RN-050) o viola balance (RN-032)',
  })
  async eliminarCosecha(
    @CurrentUser() user: UsuarioAutenticado,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<{ message: string }> {
    const tienePermisoAdministrar =
      user.permisos?.includes('registro:administrar') ?? false;

    return this.cosechasService.eliminarCosecha(
      user.empresaId,
      user.id,
      tienePermisoAdministrar,
      id,
    );
  }
}
