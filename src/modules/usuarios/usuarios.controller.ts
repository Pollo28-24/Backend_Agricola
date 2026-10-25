import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  ParseIntPipe,
  ParseBoolPipe,
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
import { UsuariosService } from './usuarios.service';
import { CreateUsuarioDto } from './dto/create-usuario.dto';
import { UpdateUsuarioDto } from './dto/update-usuario.dto';
import { UsuarioResponseDto } from './dto/usuario-response.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermisos } from '../../common/decorators/require-permisos.decorator';
import { MensajeResponseDto } from '../../common/dto/mensaje-response.dto';

@ApiTags('Usuarios')
@ApiBearerAuth('JWT-auth')
@Controller('usuarios')
export class UsuariosController {
  constructor(private readonly usuariosService: UsuariosService) {}

  @RequirePermisos('usuario:administrar')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary:
      'Invitar/crear un nuevo usuario en la empresa (F-02, RN-037, RN-061)',
  })
  @ApiResponse({ status: 201, type: UsuarioResponseDto })
  @ApiResponse({
    status: 403,
    description: 'Límite de usuarios del plan alcanzado (RN-037)',
  })
  @ApiResponse({
    status: 409,
    description: 'Correo ya registrado en el sistema',
  })
  async crear(
    @CurrentUser('empresaId') empresaId: number,
    @Body() dto: CreateUsuarioDto,
  ): Promise<UsuarioResponseDto> {
    return this.usuariosService.crear(empresaId, dto);
  }

  @RequirePermisos('usuario:administrar')
  @Get()
  @ApiOperation({
    summary: 'Listar usuarios pertenecientes a la empresa (RN-003)',
  })
  @ApiQuery({ name: 'activo', required: false, type: Boolean })
  @ApiResponse({ status: 200, type: [UsuarioResponseDto] })
  async listar(
    @CurrentUser('empresaId') empresaId: number,
    @Query('activo', new ParseBoolPipe({ optional: true })) activo?: boolean,
  ): Promise<UsuarioResponseDto[]> {
    return this.usuariosService.listar(empresaId, activo);
  }

  @RequirePermisos('usuario:administrar')
  @Get(':id')
  @ApiOperation({
    summary:
      'Consultar un usuario por ID con aislamiento multi-tenant (RN-068)',
  })
  @ApiResponse({ status: 200, type: UsuarioResponseDto })
  @ApiResponse({
    status: 404,
    description: 'Usuario no encontrado o no pertenece a la empresa',
  })
  async obtenerPorId(
    @CurrentUser('empresaId') empresaId: number,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<UsuarioResponseDto> {
    return this.usuariosService.obtenerPorId(empresaId, id);
  }

  @RequirePermisos('usuario:administrar')
  @Patch(':id')
  @ApiOperation({
    summary: 'Actualizar datos de un usuario (nombre, apellido, rol, activo)',
  })
  @ApiResponse({ status: 200, type: UsuarioResponseDto })
  @ApiResponse({
    status: 404,
    description: 'Usuario no encontrado o no pertenece a la empresa',
  })
  async actualizar(
    @CurrentUser('empresaId') empresaId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateUsuarioDto,
  ): Promise<UsuarioResponseDto> {
    return this.usuariosService.actualizar(empresaId, id, dto);
  }

  @RequirePermisos('usuario:administrar')
  @Delete(':id')
  @ApiOperation({
    summary:
      'Baja lógica de usuario, anonimización y revocación de sesiones (Sección 3.11, RN-041)',
  })
  @ApiResponse({
    status: 200,
    description: 'Usuario dado de baja exitosamente',
    type: MensajeResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Usuario no encontrado o no pertenece a la empresa',
  })
  async eliminar(
    @CurrentUser('empresaId') empresaId: number,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<MensajeResponseDto> {
    return this.usuariosService.eliminar(empresaId, id);
  }
}
