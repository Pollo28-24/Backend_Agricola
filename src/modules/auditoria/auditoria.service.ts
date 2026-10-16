import { Injectable, HttpStatus } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { FiltroAuditoriaDto } from './dto/filtro-auditoria.dto';
import {
  AuditoriaResponseDto,
  AuditoriaUsuarioDto,
} from './dto/auditoria-response.dto';
import { PaginatedResponseDto } from '../../common/dto/paginated-response.dto';
import { CodigoError } from '../../common/errors/codigos-error.enum';
import { DomainError } from '../../common/errors/domain.error';
import { PaginationUtil } from '../../common/utils/pagination.util';

@Injectable()
export class AuditoriaService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Consulta paginada y filtrada de la bitácora de auditoría (Sección 3.23, RN-043, RN-074).
   * Filtra estrictamente por empresaId (RN-003, RN-068).
   * Solo lectura inmutable (RN-060).
   */
  async listar(
    empresaId: number,
    filtros: FiltroAuditoriaDto,
  ): Promise<PaginatedResponseDto<AuditoriaResponseDto>> {
    const pagination = PaginationUtil.normalizar(filtros);

    const where: Prisma.BitacoraAuditoriaWhereInput = {
      empresaId,
      ...(filtros.usuarioId && { usuarioId: filtros.usuarioId }),
      ...(filtros.entidad && { entidad: filtros.entidad.trim() }),
      ...(filtros.accion && { accion: filtros.accion }),
    };

    const [registros, total] = await Promise.all([
      this.prisma.bitacoraAuditoria.findMany({
        where,
        include: {
          usuario: {
            include: {
              rol: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: pagination.skip,
        take: pagination.limit,
      }),
      this.prisma.bitacoraAuditoria.count({ where }),
    ]);

    const data = registros.map((r) => this.formatearRespuesta(r));

    return {
      data,
      meta: PaginationUtil.crearMeta(
        pagination.page,
        pagination.limit,
        total,
      ),
    };
  }

  /**
   * Obtiene un registro puntual de auditoría por ID con aislamiento multi-tenant (RN-068).
   * Si el registro pertenece a otra empresa o no existe, retorna 404 NOT_FOUND.
   */
  async obtenerPorId(
    empresaId: number,
    id: bigint,
  ): Promise<AuditoriaResponseDto> {
    const registro = await this.prisma.bitacoraAuditoria.findFirst({
      where: {
        id,
        empresaId,
      },
      include: {
        usuario: {
          include: {
            rol: true,
          },
        },
      },
    });

    if (!registro) {
      throw new DomainError(
        CodigoError.RECURSO_NO_ENCONTRADO,
        'Registro de auditoría no encontrado',
        HttpStatus.NOT_FOUND,
      );
    }

    return this.formatearRespuesta(registro);
  }

  private formatearRespuesta(registro: any): AuditoriaResponseDto {
    let usuario: AuditoriaUsuarioDto | null = null;
    if (registro.usuario) {
      usuario = {
        id: registro.usuario.id,
        nombre: registro.usuario.nombre,
        apellido: registro.usuario.apellido,
        correo: registro.usuario.correo,
        rol: registro.usuario.rol?.codigo || 'DESCONOCIDO',
      };
    }

    return {
      id: registro.id.toString(),
      empresaId: registro.empresaId,
      usuarioId: registro.usuarioId,
      usuario,
      entidad: registro.entidad,
      entidadId: registro.entidadId,
      accion: registro.accion,
      valoresAnteriores: registro.valoresAnteriores,
      valoresNuevos: registro.valoresNuevos,
      direccionIp: registro.direccionIp,
      createdAt: registro.createdAt.toISOString(),
    };
  }
}
