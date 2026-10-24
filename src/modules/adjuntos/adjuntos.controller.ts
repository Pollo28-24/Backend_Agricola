import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Query,
  Res,
  ParseIntPipe,
  UseInterceptors,
  UploadedFile,
  HttpStatus,
  HttpCode,
} from '@nestjs/common';
import type { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { AdjuntosService } from './services/adjuntos.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { UsuarioAutenticado } from '../auth/interfaces/jwt-payload.interface';
import { RequirePermisos } from '../../common/decorators/require-permisos.decorator';
import { Public } from '../auth/decorators/public.decorator';
import {
  AdjuntoResponseDto,
  EnlaceDescargaDto,
} from './dto/adjunto-response.dto';
import { sanearNombreArchivo } from './utils/magic-bytes.util';

@ApiTags('Archivos Adjuntos')
@ApiBearerAuth('JWT-auth')
@Controller()
export class AdjuntosController {
  constructor(private readonly adjuntosService: AdjuntosService) {}

  // =========================================================================
  // 1. GASTOS
  // =========================================================================

  @Post('gastos/:id/adjuntos')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermisos('gasto:crear')
  @UseInterceptors(
    FileInterceptor('archivo', {
      limits: { fileSize: 10 * 1024 * 1024, files: 1 },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Subir archivo adjunto a un gasto (F-14 / RN-062)' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        archivo: { type: 'string', format: 'binary' },
      },
    },
  })
  @ApiResponse({ status: 201, type: AdjuntoResponseDto })
  async subirAdjuntoGasto(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<AdjuntoResponseDto> {
    return this.adjuntosService.subirAdjunto(
      usuario.empresaId,
      usuario.id,
      'gasto',
      id,
      file,
      usuario.permisos,
    );
  }

  @Get('gastos/:id/adjuntos')
  @RequirePermisos('gasto:crear')
  @ApiOperation({ summary: 'Listar archivos adjuntos de un gasto' })
  @ApiResponse({ status: 200, type: [AdjuntoResponseDto] })
  async listarAdjuntosGasto(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<AdjuntoResponseDto[]> {
    return this.adjuntosService.listarAdjuntos(
      usuario.empresaId,
      usuario.id,
      'gasto',
      id,
      usuario.permisos,
    );
  }

  // =========================================================================
  // 2. ACTIVIDADES
  // =========================================================================

  @Post('actividades/:id/adjuntos')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermisos('actividad:crear')
  @UseInterceptors(
    FileInterceptor('archivo', {
      limits: { fileSize: 10 * 1024 * 1024, files: 1 },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Subir archivo adjunto a una actividad (RN-062)' })
  @ApiResponse({ status: 201, type: AdjuntoResponseDto })
  async subirAdjuntoActividad(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<AdjuntoResponseDto> {
    return this.adjuntosService.subirAdjunto(
      usuario.empresaId,
      usuario.id,
      'actividad',
      id,
      file,
      usuario.permisos,
    );
  }

  @Get('actividades/:id/adjuntos')
  @RequirePermisos('actividad:crear')
  @ApiOperation({ summary: 'Listar archivos adjuntos de una actividad' })
  @ApiResponse({ status: 200, type: [AdjuntoResponseDto] })
  async listarAdjuntosActividad(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<AdjuntoResponseDto[]> {
    return this.adjuntosService.listarAdjuntos(
      usuario.empresaId,
      usuario.id,
      'actividad',
      id,
      usuario.permisos,
    );
  }

  // =========================================================================
  // 3. VENTAS
  // =========================================================================

  @Post('ventas/:id/adjuntos')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermisos('venta:crear')
  @UseInterceptors(
    FileInterceptor('archivo', {
      limits: { fileSize: 10 * 1024 * 1024, files: 1 },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Subir comprobante o contrato a una venta' })
  @ApiResponse({ status: 201, type: AdjuntoResponseDto })
  async subirAdjuntoVenta(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<AdjuntoResponseDto> {
    return this.adjuntosService.subirAdjunto(
      usuario.empresaId,
      usuario.id,
      'venta',
      id,
      file,
      usuario.permisos,
    );
  }

  @Get('ventas/:id/adjuntos')
  @RequirePermisos('venta:crear')
  @ApiOperation({ summary: 'Listar archivos adjuntos de una venta' })
  @ApiResponse({ status: 200, type: [AdjuntoResponseDto] })
  async listarAdjuntosVenta(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<AdjuntoResponseDto[]> {
    return this.adjuntosService.listarAdjuntos(
      usuario.empresaId,
      usuario.id,
      'venta',
      id,
      usuario.permisos,
    );
  }

  // =========================================================================
  // 4. COBROS
  // =========================================================================

  @Post('cobros/:id/adjuntos')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermisos('cobro:crear')
  @UseInterceptors(
    FileInterceptor('archivo', {
      limits: { fileSize: 10 * 1024 * 1024, files: 1 },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Subir comprobante de pago a un cobro' })
  @ApiResponse({ status: 201, type: AdjuntoResponseDto })
  async subirAdjuntoCobro(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<AdjuntoResponseDto> {
    return this.adjuntosService.subirAdjunto(
      usuario.empresaId,
      usuario.id,
      'cobro',
      id,
      file,
      usuario.permisos,
    );
  }

  @Get('cobros/:id/adjuntos')
  @RequirePermisos('cobro:crear')
  @ApiOperation({ summary: 'Listar archivos adjuntos de un cobro' })
  @ApiResponse({ status: 200, type: [AdjuntoResponseDto] })
  async listarAdjuntosCobro(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<AdjuntoResponseDto[]> {
    return this.adjuntosService.listarAdjuntos(
      usuario.empresaId,
      usuario.id,
      'cobro',
      id,
      usuario.permisos,
    );
  }

  // =========================================================================
  // 5. ENLACE DE DESCARGA TEMPORAL (Solo JWT, sin @RequirePermisos estático)
  // =========================================================================

  @Get('adjuntos/:id/enlace-descarga')
  @ApiOperation({
    summary: 'Generar enlace firmado temporal (300 s) para descarga de archivo',
  })
  @ApiResponse({ status: 200, type: EnlaceDescargaDto })
  async obtenerEnlaceDescarga(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<EnlaceDescargaDto> {
    return this.adjuntosService.generarEnlaceDescarga(
      usuario.empresaId,
      usuario.id,
      id,
      usuario.permisos,
    );
  }

  // =========================================================================
  // 6. DESCARGA FÍSICA (Pública, autenticada por token HMAC firmado)
  // =========================================================================

  @Public()
  @Get('adjuntos/descarga')
  @ApiOperation({
    summary: 'Descargar archivo binario mediante token HMAC firmado',
  })
  async descargarArchivo(
    @Query('token') token: string,
    @Res() res: Response,
  ): Promise<void> {
    const { stream, adjunto } =
      await this.adjuntosService.descargarArchivo(token);

    const nombreSaneado = sanearNombreArchivo(adjunto.nombreArchivo);
    const nombreEncoded = encodeURIComponent(nombreSaneado);

    res.setHeader('Content-Type', adjunto.tipoMime);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${nombreSaneado}"; filename*=UTF-8''${nombreEncoded}`,
    );
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Length', adjunto.tamanoBytes);

    stream.pipe(res);
  }

  // =========================================================================
  // 7. ELIMINACIÓN FÍSICA (Solo ADMIN con 'registro:administrar')
  // =========================================================================

  @Delete('adjuntos/:id')
  @HttpCode(HttpStatus.OK)
  @RequirePermisos('registro:administrar')
  @ApiOperation({
    summary:
      'Eliminar físicamente un adjunto con bloqueo de ciclo y auditoría (RN-062)',
  })
  @ApiResponse({ status: 200, description: 'Adjunto eliminado correctamente' })
  async eliminarAdjunto(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<{ message: string }> {
    await this.adjuntosService.eliminarAdjunto(
      usuario.empresaId,
      usuario.id,
      id,
    );
    return { message: 'Archivo adjunto eliminado correctamente' };
  }
}
