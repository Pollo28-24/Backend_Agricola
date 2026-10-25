import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags, ApiResponse } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { PrismaService } from '../../prisma/prisma.service';
import { Public } from '../auth/decorators/public.decorator';
import { HealthResponseDto } from './dto/health-response.dto';

@ApiTags('Health')
@SkipThrottle({ default: true, 'login-ip': true, 'login-correo': true })
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get()
  @ApiOperation({
    summary: 'Verificar salud del backend y conexión con la base de datos',
  })
  @ApiResponse({
    status: 200,
    description: 'Servicio operativo',
    type: HealthResponseDto,
  })
  async check(): Promise<HealthResponseDto> {
    let dbStatus = 'ok';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      dbStatus = 'disconnected';
    }

    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      database: dbStatus,
      version: '1.0.0',
    };
  }
}
