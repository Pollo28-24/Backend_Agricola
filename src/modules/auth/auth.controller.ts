import {
  Controller,
  Post,
  Get,
  Patch,
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
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { CambiarContrasenaDto } from './dto/cambiar-contrasena.dto';
import { SolicitarRecuperacionDto } from './dto/solicitar-recuperacion.dto';
import { RestablecerContrasenaDto } from './dto/restablecer-contrasena.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { AuthResponseDto, UsuarioPerfilDto } from './dto/auth-response.dto';
import { Public } from './decorators/public.decorator';
import { CurrentUser } from './decorators/current-user.decorator';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { MensajeResponseDto } from '../../common/dto/mensaje-response.dto';

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
  @ApiResponse({
    status: 401,
    description: 'Credenciales inválidas o cuenta inactiva',
  })
  async login(
    @Body() dto: LoginDto,
    @Ip() ip: string,
  ): Promise<AuthResponseDto> {
    return this.authService.login(dto, ip);
  }

  @Public()
  @Throttle({ 'login-ip': { limit: 30, ttl: 60_000 } })
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Renovar Access Token mediante Refresh Token rotatorio (Sección 3.23)',
    description:
      'Revoca el refresh token actual y genera un nuevo par de tokens (rotación estricta).',
  })
  @ApiResponse({ status: 200, type: AuthResponseDto })
  @ApiResponse({
    status: 401,
    description: 'Token inválido, revocado o expirado',
  })
  async refresh(@Body() dto: RefreshTokenDto): Promise<AuthResponseDto> {
    return this.authService.refresh(dto);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cerrar sesión y revocar refresh token' })
  @ApiResponse({
    status: 200,
    description: 'Sesión revocada exitosamente',
    type: MensajeResponseDto,
  })
  async logout(
    @CurrentUser('id') usuarioId: number,
    @Body() dto?: RefreshTokenDto,
  ): Promise<MensajeResponseDto> {
    return this.authService.logout(dto?.refreshToken);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @Get('me')
  @ApiOperation({
    summary:
      'Consultar perfil del usuario autenticado y sus permisos vigentes (RN-039)',
  })
  @ApiResponse({ status: 200, type: UsuarioPerfilDto })
  @ApiResponse({ status: 401, description: 'No autenticado o token inválido' })
  async me(@CurrentUser('id') usuarioId: number): Promise<UsuarioPerfilDto> {
    return this.authService.me(usuarioId);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @Patch('contrasena/cambiar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Cambiar contraseña del usuario autenticado (RN-076 y §3.23.1)',
    description:
      'Verifica la contraseña actual, actualiza al nuevo hash Argon2id, revoca todos los Refresh Tokens e invalida Access Tokens previos.',
  })
  @ApiResponse({
    status: 200,
    type: MensajeResponseDto,
    description: 'Contraseña actualizada exitosamente',
  })
  @ApiResponse({
    status: 400,
    description: 'Contraseña actual incorrecta o formato inválido',
  })
  @ApiResponse({
    status: 401,
    description: 'No autenticado o token inválido',
  })
  async cambiarContrasena(
    @CurrentUser('id') usuarioId: number,
    @Body() dto: CambiarContrasenaDto,
    @Ip() ip: string,
  ): Promise<MensajeResponseDto> {
    return this.authService.cambiarContrasena(usuarioId, dto, ip);
  }

  @Public()
  @Post('contrasena/solicitar-recuperacion')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Solicitar restablecimiento de contraseña vía correo (RN-040 y §3.23.1)',
    description:
      'Genera un token uniuso con hash SHA-256 (validez 15 min) y envía el enlace vía Brevo. Responde siempre 200 OK idéntico por anti-enumeración.',
  })
  @ApiResponse({
    status: 200,
    type: MensajeResponseDto,
    description: 'Mensaje genérico de confirmación anti-enumeración',
  })
  async solicitarRecuperacion(
    @Body() dto: SolicitarRecuperacionDto,
    @Ip() ip: string,
  ): Promise<MensajeResponseDto> {
    return this.authService.solicitarRecuperacion(dto, ip);
  }

  @Public()
  @Post('contrasena/restablecer')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Restablecer contraseña mediante token de recuperación uniuso (§3.23.1)',
    description:
      'Consume de forma atómica el token uniuso (SHA-256), actualiza la contraseña a Argon2id, revoca Refresh Tokens e invalida Access Tokens previos.',
  })
  @ApiResponse({
    status: 200,
    type: MensajeResponseDto,
    description: 'Contraseña restablecida exitosamente',
  })
  @ApiResponse({
    status: 400,
    description: 'Token inválido, expirado o ya utilizado',
  })
  async restablecerContrasena(
    @Body() dto: RestablecerContrasenaDto,
    @Ip() ip: string,
  ): Promise<MensajeResponseDto> {
    return this.authService.restablecerContrasena(dto, ip);
  }
}
