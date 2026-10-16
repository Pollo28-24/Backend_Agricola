import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { AuditoriaService } from './auditoria.service';
import { FiltroAuditoriaDto } from './dto/filtro-auditoria.dto';
import { AuditoriaResponseDto } from './dto/auditoria-response.dto';
import { PaginatedResponseDto } from '../../common/dto/paginated-response.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermisos } from '../../common/decorators/require-permisos.decorator';
import { ParseBigIntPipe } from '../../common/pipes/parse-bigint.pipe';

@ApiTags('Auditoría')
@ApiBearerAuth('JWT-auth')
@RequirePermisos('empresa:administrar')
@Controller('auditoria')
export class AuditoriaController {
  constructor(private readonly auditoriaService: AuditoriaService) {}

  @Get()
  @ApiOperation({
    summary:
      'Consultar bitácora de auditoría paginada y con filtros (RN-043, RN-060, RN-074)',
    description:
      'Retorna los eventos de trazabilidad de la empresa de forma cronológica descendente. Admite paginación estándar (?page=1&limit=20) y filtros por usuario, entidad y acción. Inmutable: solo lectura.',
  })
  @ApiResponse({ status: 200, type: PaginatedResponseDto })
  async listar(
    @CurrentUser('empresaId') empresaId: number,
    @Query() filtros: FiltroAuditoriaDto,
  ): Promise<PaginatedResponseDto<AuditoriaResponseDto>> {
    return this.auditoriaService.listar(empresaId, filtros);
  }

  @Get(':id')
  @ApiOperation({
    summary:
      'Consultar el detalle de un registro puntual de auditoría por ID (RN-068)',
    description:
      'Permite auditar el detalle de cambios (valores anteriores y nuevos) garantizando el aislamiento multi-tenant.',
  })
  @ApiResponse({ status: 200, type: AuditoriaResponseDto })
  @ApiResponse({
    status: 404,
    description:
      'Registro de auditoría no encontrado o no pertenece a la empresa',
  })
  async obtenerPorId(
    @CurrentUser('empresaId') empresaId: number,
    @Param('id', ParseBigIntPipe) id: bigint,
  ): Promise<AuditoriaResponseDto> {
    return this.auditoriaService.obtenerPorId(empresaId, id);
  }
}
