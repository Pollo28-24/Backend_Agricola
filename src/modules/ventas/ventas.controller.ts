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
import { VentasService } from './ventas.service';
import { CreateVentaDto } from './dto/create-venta.dto';
import { UpdateVentaDto } from './dto/update-venta.dto';
import { FiltroVentaDto } from './dto/filtro-venta.dto';
import { VentaResponseDto } from './dto/venta-response.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { UsuarioAutenticado } from '../auth/interfaces/jwt-payload.interface';
import { RequirePermisos } from '../../common/decorators/require-permisos.decorator';
import { PaginatedResponseDto } from '../../common/dto/paginated-response.dto';
import { ApiPaginatedResponse } from '../../common/decorators/api-paginated-response.decorator';

@ApiTags('Comercialización - Ventas')
@ApiBearerAuth('JWT-auth')
@Controller('ventas')
export class VentasController {
  constructor(private readonly ventasService: VentasService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermisos('venta:crear')
  @ApiOperation({
    summary:
      'Registrar una nueva venta con sus renglones físicos y control de masa (F-13 / RN-027 / RN-052)',
  })
  @ApiResponse({ status: 201, type: VentaResponseDto })
  @ApiResponse({
    status: 400,
    description:
      'Cuadratura de total incorrecta (RN-052), cliente inactivo, fecha anterior al ciclo (RN-044) o unidad no PESO (RN-069)',
  })
  @ApiResponse({
    status: 404,
    description: 'Ciclo, cliente, unidad o cosecha no encontrada en la empresa',
  })
  @ApiResponse({
    status: 409,
    description:
      'Sobreventa de producto (RN-027) o ciclo en estado no activo / cerrado',
  })
  async crearVenta(
    @CurrentUser() user: UsuarioAutenticado,
    @Body() dto: CreateVentaDto,
  ): Promise<VentaResponseDto> {
    return this.ventasService.crearVenta(user.empresaId, user.id, dto);
  }

  @Get()
  @RequirePermisos('venta:crear')
  @ApiOperation({
    summary: 'Listar ventas paginadas con filtros opcionales (RN-068)',
  })
  @ApiPaginatedResponse(VentaResponseDto)
  async listarVentas(
    @CurrentUser() user: UsuarioAutenticado,
    @Query() filtro: FiltroVentaDto,
  ): Promise<PaginatedResponseDto<VentaResponseDto>> {
    return this.ventasService.listarVentas(user.empresaId, filtro);
  }

  @Get(':id')
  @RequirePermisos('venta:crear')
  @ApiOperation({
    summary: 'Obtener detalle de una venta por ID con sus renglones (RN-068)',
  })
  @ApiResponse({ status: 200, type: VentaResponseDto })
  @ApiResponse({ status: 404, description: 'Venta no encontrada' })
  async obtenerVenta(
    @CurrentUser() user: UsuarioAutenticado,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<VentaResponseDto> {
    return this.ventasService.obtenerVentaPorId(id, user.empresaId);
  }

  @Patch(':id')
  @RequirePermisos('venta:crear')
  @ApiOperation({
    summary:
      'Actualizar una venta con reemplazo atómico total de renglones y control de masa (RN-027 / RN-052)',
  })
  @ApiResponse({ status: 200, type: VentaResponseDto })
  @ApiResponse({
    status: 400,
    description:
      'Cuadratura incorrecta, fecha anterior al inicio o cliente inactivo',
  })
  @ApiResponse({ status: 404, description: 'Venta o recurso no encontrado' })
  @ApiResponse({
    status: 409,
    description:
      'Venta ya cancelada, sobreventa o ciclo no admite modificaciones',
  })
  async actualizarVenta(
    @CurrentUser() user: UsuarioAutenticado,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateVentaDto,
  ): Promise<VentaResponseDto> {
    return this.ventasService.actualizarVenta(id, user.empresaId, user.id, dto);
  }

  @Patch(':id/cancelar')
  @RequirePermisos('venta:cancelar')
  @ApiOperation({
    summary:
      'Cancelar una venta liberando la masa comprometida de forma no destructiva (RN-055)',
  })
  @ApiResponse({ status: 200, type: VentaResponseDto })
  @ApiResponse({ status: 404, description: 'Venta no encontrada' })
  @ApiResponse({
    status: 409,
    description: 'Venta ya se encuentra cancelada o ciclo cerrado',
  })
  async cancelarVenta(
    @CurrentUser() user: UsuarioAutenticado,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<VentaResponseDto> {
    return this.ventasService.cancelarVenta(id, user.empresaId, user.id);
  }
}
