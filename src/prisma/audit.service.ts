import { Injectable, Logger } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { AccionAuditoria } from '@prisma/client';
import { PrismaService } from './prisma.service';
import { AppClsStore } from '../common/context/app-cls.store';
import { sanitizarValoresAuditoria } from './extensions/audit.extension';

export interface RegistrarAuditoriaOptions {
  entidad: string;
  entidadId: number;
  accion: AccionAuditoria;
  valoresAnteriores?: unknown;
  valoresNuevos?: unknown;
  empresaId?: number;
  usuarioId?: number | null;
  ip?: string;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService<AppClsStore>,
  ) {}

  /**
   * Registra un evento en bitacora_auditoria asegurando la exclusión de secretos (RN-074)
   * y tomando el contexto de request (empresaId, usuarioId, ip) automáticamente si no se provee.
   */
  async registrar(options: RegistrarAuditoriaOptions): Promise<void> {
    try {
      const empresaId = options.empresaId ?? this.cls.get('empresaId');
      if (!empresaId) {
        this.logger.warn(
          `No se pudo auditar evento ${options.accion} en ${options.entidad}:${options.entidadId} porque no hay empresaId en contexto`,
        );
        return;
      }

      const usuarioId =
        options.usuarioId !== undefined ? options.usuarioId : this.cls.get('usuarioId') || null;

      const direccionIp = options.ip ?? this.cls.get('ip') ?? null;

      const valoresAnteriores = sanitizarValoresAuditoria(options.valoresAnteriores);
      const valoresNuevos = sanitizarValoresAuditoria(options.valoresNuevos);

      await this.prisma.bitacoraAuditoria.create({
        data: {
          empresaId,
          usuarioId,
          entidad: options.entidad,
          entidadId: options.entidadId,
          accion: options.accion,
          valoresAnteriores: valoresAnteriores as object,
          valoresNuevos: valoresNuevos as object,
          direccionIp,
        },
      });
    } catch (error) {
      // La auditoría no debe romper la transacción si ocurre un fallo interno, pero se loguea
      this.logger.error(`Error al registrar en bitácora de auditoría:`, error);
    }
  }
}
