import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  Ip,
  HttpStatus,
  HttpCode,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { EmpresasService } from './empresas.service';
import { RegistroEmpresaDto } from './dto/registro-empresa.dto';
import { UpdateEmpresaDto } from './dto/update-empresa.dto';
import { EmpresaResponseDto } from './dto/empresa-response.dto';
import { AuthResponseDto } from '../auth/dto/auth-response.dto';
import { Public } from '../auth/decorators/public.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermisos } from '../../common/decorators/require-permisos.decorator';

@ApiTags('Empresas')
@Controller('empresas')
export class EmpresasController {
  constructor(private readonly empresasService: EmpresasService) {}

  @Public()
  @Post('registro')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Alta de empresa y primer usuario administrador (Formulario F-01 / Flujo F0)',
    description:
      'Crea atómicamente la empresa en estado PRUEBA, el plan y su primer usuario con rol ADMIN. Emite tokens de acceso.',
  })
  @ApiResponse({ status: 201, type: AuthResponseDto })
  @ApiResponse({ status: 409, description: 'RFC o correo ya registrado' })
  async registrar(
    @Body() dto: RegistroEmpresaDto,
    @Ip() ip: string,
  ): Promise<AuthResponseDto> {
    return this.empresasService.registrar(dto, ip);
  }

  @ApiBearerAuth('JWT-auth')
  @RequirePermisos('empresa:administrar')
  @Get('mi-empresa')
  @ApiOperation({
    summary: 'Consultar datos de la propia empresa, plan y cuotas de uso (RN-003, RN-037)',
  })
  @ApiResponse({ status: 200, type: EmpresaResponseDto })
  @ApiResponse({ status: 403, description: 'No tiene el permiso empresa:administrar' })
  async obtenerMiEmpresa(
    @CurrentUser('empresaId') empresaId: number,
  ): Promise<EmpresaResponseDto> {
    return this.empresasService.obtenerMiEmpresa(empresaId);
  }

  @ApiBearerAuth('JWT-auth')
  @RequirePermisos('empresa:administrar')
  @Patch('mi-empresa')
  @ApiOperation({
    summary: 'Actualizar datos comerciales de la propia empresa',
  })
  @ApiResponse({ status: 200, type: EmpresaResponseDto })
  async actualizarMiEmpresa(
    @CurrentUser('empresaId') empresaId: number,
    @Body() dto: UpdateEmpresaDto,
  ): Promise<EmpresaResponseDto> {
    return this.empresasService.actualizarMiEmpresa(empresaId, dto);
  }
}
