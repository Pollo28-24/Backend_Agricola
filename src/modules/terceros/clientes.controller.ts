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
import { ClientesService } from './clientes.service';
import { CreateClienteDto } from './dto/create-cliente.dto';
import { UpdateClienteDto } from './dto/update-cliente.dto';
import { ClienteResponseDto } from './dto/cliente-response.dto';
import { FiltroClienteDto } from './dto/filtro-cliente.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermisos } from '../../common/decorators/require-permisos.decorator';
import { PaginatedResponseDto } from '../../common/dto/paginated-response.dto';

@ApiTags('Terceros - Clientes')
@ApiBearerAuth('JWT-auth')
@RequirePermisos('tercero:administrar')
@Controller('clientes')
export class ClientesController {
  constructor(private readonly clientesService: ClientesService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Registrar un nuevo cliente comercial (F-06)' })
  @ApiResponse({ status: 201, type: ClienteResponseDto })
  @ApiResponse({
    status: 409,
    description: 'Ya existe un cliente con ese nombre en la empresa',
  })
  async crear(
    @CurrentUser('empresaId') empresaId: number,
    @Body() dto: CreateClienteDto,
  ): Promise<ClienteResponseDto> {
    return this.clientesService.crearCliente(empresaId, dto);
  }

  @Get()
  @ApiOperation({
    summary: 'Listar clientes de la empresa con paginación y filtros',
  })
  @ApiResponse({ status: 200, type: PaginatedResponseDto })
  async listar(
    @CurrentUser('empresaId') empresaId: number,
    @Query() filtro: FiltroClienteDto,
  ): Promise<PaginatedResponseDto<ClienteResponseDto>> {
    return this.clientesService.listarClientes(empresaId, filtro);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Consultar detalle de un cliente por ID (RN-068)' })
  @ApiResponse({ status: 200, type: ClienteResponseDto })
  @ApiResponse({
    status: 404,
    description: 'Cliente no encontrado o no pertenece a la empresa',
  })
  async obtenerPorId(
    @CurrentUser('empresaId') empresaId: number,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<ClienteResponseDto> {
    return this.clientesService.obtenerClientePorId(empresaId, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar datos de un cliente comercial' })
  @ApiResponse({ status: 200, type: ClienteResponseDto })
  @ApiResponse({ status: 404, description: 'Cliente no encontrado' })
  @ApiResponse({ status: 409, description: 'Conflicto por nombre duplicado' })
  async actualizar(
    @CurrentUser('empresaId') empresaId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateClienteDto,
  ): Promise<ClienteResponseDto> {
    return this.clientesService.actualizarCliente(empresaId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Baja lógica de un cliente sin historial (RN-041)' })
  @ApiResponse({ status: 200, description: 'Cliente eliminado exitosamente' })
  @ApiResponse({ status: 404, description: 'Cliente no encontrado' })
  @ApiResponse({
    status: 409,
    description: 'El cliente posee ventas asociadas y no puede eliminarse',
  })
  async eliminar(
    @CurrentUser('empresaId') empresaId: number,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<{ message: string }> {
    return this.clientesService.eliminarCliente(empresaId, id);
  }
}
