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
import { ProveedoresService } from './proveedores.service';
import { CreateProveedorDto } from './dto/create-proveedor.dto';
import { UpdateProveedorDto } from './dto/update-proveedor.dto';
import { ProveedorResponseDto } from './dto/proveedor-response.dto';
import { FiltroProveedorDto } from './dto/filtro-proveedor.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermisos } from '../../common/decorators/require-permisos.decorator';
import { PaginatedResponseDto } from '../../common/dto/paginated-response.dto';
import { ApiPaginatedResponse } from '../../common/decorators/api-paginated-response.decorator';
import { MessageResponseDto } from '../../common/dto/mensaje-response.dto';

@ApiTags('Terceros - Proveedores')
@ApiBearerAuth('JWT-auth')
@Controller('proveedores')
export class ProveedoresController {
  constructor(private readonly proveedoresService: ProveedoresService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermisos('tercero:administrar')
  @ApiOperation({ summary: 'Registrar un nuevo proveedor comercial (F-05)' })
  @ApiResponse({ status: 201, type: ProveedorResponseDto })
  @ApiResponse({
    status: 409,
    description: 'Ya existe un proveedor con ese nombre en la empresa',
  })
  async crear(
    @CurrentUser('empresaId') empresaId: number,
    @Body() dto: CreateProveedorDto,
  ): Promise<ProveedorResponseDto> {
    return this.proveedoresService.crearProveedor(empresaId, dto);
  }

  @Get()
  @ApiOperation({
    summary: 'Listar proveedores de la empresa con paginación y búsqueda',
  })
  @ApiPaginatedResponse(ProveedorResponseDto)
  async listar(
    @CurrentUser('empresaId') empresaId: number,
    @Query() filtro: FiltroProveedorDto,
  ): Promise<PaginatedResponseDto<ProveedorResponseDto>> {
    return this.proveedoresService.listarProveedores(empresaId, filtro);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Consultar detalle de un proveedor por ID (RN-068)',
  })
  @ApiResponse({ status: 200, type: ProveedorResponseDto })
  @ApiResponse({
    status: 404,
    description: 'Proveedor no encontrado o no pertenece a la empresa',
  })
  async obtenerPorId(
    @CurrentUser('empresaId') empresaId: number,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<ProveedorResponseDto> {
    return this.proveedoresService.obtenerProveedorPorId(empresaId, id);
  }

  @Patch(':id')
  @RequirePermisos('tercero:administrar')
  @ApiOperation({ summary: 'Actualizar datos de un proveedor' })
  @ApiResponse({ status: 200, type: ProveedorResponseDto })
  @ApiResponse({ status: 404, description: 'Proveedor no encontrado' })
  @ApiResponse({ status: 409, description: 'Conflicto por nombre duplicado' })
  async actualizar(
    @CurrentUser('empresaId') empresaId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateProveedorDto,
  ): Promise<ProveedorResponseDto> {
    return this.proveedoresService.actualizarProveedor(empresaId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @RequirePermisos('tercero:administrar')
  @ApiOperation({
    summary: 'Baja lógica de un proveedor sin historial (RN-041)',
  })
  @ApiResponse({
    status: 200,
    description: 'Proveedor eliminado exitosamente',
    type: MessageResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Proveedor no encontrado' })
  @ApiResponse({
    status: 409,
    description: 'El proveedor posee gastos asociados y no puede eliminarse',
  })
  async eliminar(
    @CurrentUser('empresaId') empresaId: number,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<MessageResponseDto> {
    return this.proveedoresService.eliminarProveedor(empresaId, id);
  }
}
