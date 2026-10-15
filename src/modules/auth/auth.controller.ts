import {
  Controller,
  Post,
  Get,
  Body,
  Ip,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { AuthResponseDto, UsuarioPerfilDto } from './dto/auth-response.dto';
import { Public } from './decorators/public.decorator';
import { CurrentUser } from './decorators/current-user.decorator';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { UsuarioAutenticado } from './interfaces/jwt-payload.interface';

@ApiTags('Autenticación')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Iniciar sesión con correo y contraseña (RN-040, RN-072)',
    description:
      'Emite un Access Token de 15 minutos y un Refresh Token rotatorio. Devuelve el perfil con la lista de permisos del rol.',
  })
  @ApiResponse({ status: 200, type: AuthResponseDto })
  @ApiResponse({ status: 401, description: 'Credenciales inválidas o cuenta inactiva' })
  async login(
    @Body() dto: LoginDto,
    @Ip() ip: string,
  ): Promise<AuthResponseDto> {
    return this.authService.login(dto, ip);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Renovar Access Token mediante Refresh Token rotatorio (Sección 3.23)',
    description:
      'Revoca el refresh token actual y genera un nuevo par de tokens (rotación estricta).',
  })
  @ApiResponse({ status: 200, type: AuthResponseDto })
  @ApiResponse({ status: 401, description: 'Token inválido, revocado o expirado' })
  async refresh(@Body() dto: RefreshTokenDto): Promise<AuthResponseDto> {
    return this.authService.refresh(dto);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cerrar sesión y revocar refresh token' })
  @ApiResponse({ status: 200, description: 'Sesión revocada exitosamente' })
  async logout(
    @CurrentUser('id') usuarioId: number,
    @Body() dto?: RefreshTokenDto,
  ): Promise<{ mensaje: string }> {
    return this.authService.logout(dto?.refreshToken);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @Get('me')
  @ApiOperation({
    summary: 'Consultar perfil del usuario autenticado y sus permisos vigentes (RN-039)',
  })
  @ApiResponse({ status: 200, type: UsuarioPerfilDto })
  @ApiResponse({ status: 401, description: 'No autenticado o token inválido' })
  async me(@CurrentUser('id') usuarioId: number): Promise<UsuarioPerfilDto> {
    return this.authService.me(usuarioId);
  }
}
