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
import { MermasService } from './mermas.service';
import { CreateMermaDto } from './dto/create-merma.dto';
import { UpdateMermaDto } from './dto/update-merma.dto';
import { FiltroMermaDto } from './dto/filtro-merma.dto';
import { MermaResponseDto } from './dto/merma-response.dto';
import { MermaDetalleResponseDto } from './dto/merma-detalle-response.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { UsuarioAutenticado } from '../auth/interfaces/jwt-payload.interface';
import { RequirePermisos } from '../../common/decorators/require-permisos.decorator';
import { PaginatedResponseDto } from '../../common/dto/paginated-response.dto';
import { ApiPaginatedResponse } from '../../common/decorators/api-paginated-response.decorator';
import { MessageResponseDto } from '../../common/dto/mensaje-response.dto';

@ApiTags('Producción - Mermas')
@ApiBearerAuth('JWT-auth')
@Controller('mermas')
export class MermasController {
  constructor(private readonly mermasService: MermasService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermisos('merma:crear')
  @ApiOperation({
    summary:
      'Registrar una merma en campo o poscosecha (F-12 / RN-024 / RN-026 / RN-031 / RN-032 / RN-069)',
  })
  @ApiResponse({ status: 201, type: MermaResponseDto })
  @ApiResponse({
    status: 400,
    description:
      'Unidad no es de peso (RN-069) o cosecha de otro ciclo (RN-049)',
  })
  @ApiResponse({
    status: 404,
    description: 'Ciclo, motivo o cosecha no encontrada en su empresa (RN-068)',
  })
  @ApiResponse({
    status: 409,
    description:
      'Ciclo en PLANIFICADO/cerrado o merma poscosecha excede cosecha acumulada (RN-032)',
  })
  async crearMerma(
    @CurrentUser() user: UsuarioAutenticado,
    @Body() dto: CreateMermaDto,
  ): Promise<MermaResponseDto> {
    return this.mermasService.crearMerma(user.empresaId, user.id, dto);
  }

  @Get()
  @RequirePermisos('merma:crear')
  @ApiOperation({
    summary: 'Listar mermas con scoped visibility y paginación (Contrato 3.23)',
  })
  @ApiPaginatedResponse(MermaResponseDto)
  async listarMermas(
    @CurrentUser() user: UsuarioAutenticado,
    @Query() filtro: FiltroMermaDto,
  ): Promise<PaginatedResponseDto<MermaResponseDto>> {
    const tienePermisoAdministrar =
      user.permisos?.includes('registro:administrar') ?? false;

    return this.mermasService.listarMermas(
      user.empresaId,
      user.id,
      tienePermisoAdministrar,
      filtro,
    );
  }

  @Get(':id')
  @RequirePermisos('merma:crear')
  @ApiOperation({
    summary:
      'Obtener detalle de merma por ID (404 si es ajena a un CAPTURISTA)',
  })
  @ApiResponse({ status: 200, type: MermaDetalleResponseDto })
  @ApiResponse({
    status: 404,
    description: 'Merma no encontrada en la empresa o ajena al usuario',
  })
  async obtenerMermaPorId(
    @CurrentUser() user: UsuarioAutenticado,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<MermaDetalleResponseDto> {
    const tienePermisoAdministrar =
      user.permisos?.includes('registro:administrar') ?? false;

    return this.mermasService.obtenerMermaPorId(
      user.empresaId,
      user.id,
      tienePermisoAdministrar,
      id,
    );
  }

  @Patch(':id')
  @RequirePermisos('merma:crear')
  @ApiOperation({
    summary:
      'Actualizar una merma sujeta a ventana de 48h (RN-062) y balance de masa (RN-032 / RN-070)',
  })
  @ApiResponse({ status: 200, type: MermaResponseDto })
  @ApiResponse({ status: 400, description: 'Fecha o cantidad inválida' })
  @ApiResponse({
    status: 403,
    description: 'No es el creador de la merma (RN-062)',
  })
  @ApiResponse({
    status: 404,
    description: 'Merma no encontrada en su empresa (RN-068)',
  })
  @ApiResponse({
    status: 409,
    description:
      'Ventana de 48h vencida o cambio de etapa/cantidad excede cosecha (RN-032)',
  })
  async actualizarMerma(
    @CurrentUser() user: UsuarioAutenticado,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateMermaDto,
  ): Promise<MermaResponseDto> {
    const tienePermisoAdministrar =
      user.permisos?.includes('registro:administrar') ?? false;

    return this.mermasService.actualizarMerma(
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
      'Baja lógica de merma. Exclusivo para ADMIN (RN-062 / Matriz 2.12)',
  })
  @ApiResponse({
    status: 200,
    type: MessageResponseDto,
  })
  @ApiResponse({
    status: 403,
    description: 'Permiso denegado: solo ADMIN puede eliminar mermas',
  })
  @ApiResponse({
    status: 404,
    description: 'Merma no encontrada en su empresa (RN-068)',
  })
  async eliminarMerma(
    @CurrentUser() user: UsuarioAutenticado,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<MessageResponseDto> {
    const tienePermisoAdministrar =
      user.permisos?.includes('registro:administrar') ?? false;

    return this.mermasService.eliminarMerma(
      user.empresaId,
      user.id,
      tienePermisoAdministrar,
      id,
    );
  }
}
