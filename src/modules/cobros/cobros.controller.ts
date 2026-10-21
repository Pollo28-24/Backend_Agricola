import {
  Controller,
  Get,
  Post,
  Patch,
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
import { CobrosService } from './cobros.service';
import { CreateCobroDto } from './dto/create-cobro.dto';
import { FiltroCobroDto } from './dto/filtro-cobro.dto';
import { CobroResponseDto } from './dto/cobro-response.dto';
import { CobroDetalleResponseDto } from './dto/cobro-detalle-response.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { UsuarioAutenticado } from '../auth/interfaces/jwt-payload.interface';
import { RequirePermisos } from '../../common/decorators/require-permisos.decorator';
import { PaginatedResponseDto } from '../../common/dto/paginated-response.dto';

@ApiTags('Comercialización - Cobros')
@ApiBearerAuth('JWT-auth')
@Controller()
export class CobrosController {
  constructor(private readonly cobrosService: CobrosService) {}

  @Post('ventas/:ventaId/cobros')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermisos('cobro:crear')
  @ApiOperation({
    summary:
      'Registrar un cobro sobre una venta activa (F-14 / RN-054 / RN-071)',
  })
  @ApiResponse({
    status: 201,
    description: 'Cobro registrado exitosamente',
    type: CobroResponseDto,
  })
  async registrarCobro(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('ventaId', ParseIntPipe) ventaId: number,
    @Body() dto: CreateCobroDto,
  ): Promise<CobroResponseDto> {
    return this.cobrosService.registrarCobro(
      usuario.empresaId,
      usuario.id,
      ventaId,
      dto,
    );
  }

  @Get('ventas/:ventaId/cobros')
  @RequirePermisos('cobro:crear')
  @ApiOperation({
    summary:
      'Listar cobros de una venta paginados (por defecto solo vigentes, opcional incluir anulados)',
  })
  @ApiResponse({
    status: 200,
    description: 'Listado paginado de cobros de la venta',
  })
  async listarCobrosDeVenta(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('ventaId', ParseIntPipe) ventaId: number,
    @Query() filtro: FiltroCobroDto,
  ): Promise<PaginatedResponseDto<CobroResponseDto>> {
    return this.cobrosService.listarCobrosDeVenta(
      usuario.empresaId,
      ventaId,
      filtro,
    );
  }

  @Get('cobros/:id')
  @RequirePermisos('cobro:crear')
  @ApiOperation({
    summary: 'Consultar detalle de un cobro con balance de la venta asociada',
  })
  @ApiResponse({
    status: 200,
    description: 'Detalle del cobro obtenido exitosamente',
    type: CobroDetalleResponseDto,
  })
  async obtenerCobroPorId(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<CobroDetalleResponseDto> {
    return this.cobrosService.obtenerCobroPorId(usuario.empresaId, id);
  }

  @Patch('cobros/:id/anular')
  @RequirePermisos('cobro:crear')
  @ApiOperation({
    summary:
      'Anulación lógica de un cobro con auditoría y lock pesimista (RN-063)',
  })
  @ApiResponse({
    status: 200,
    description: 'Cobro anulado exitosamente',
    type: CobroResponseDto,
  })
  async anularCobro(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<CobroResponseDto> {
    return this.cobrosService.anularCobro(usuario.empresaId, usuario.id, id);
  }
}
