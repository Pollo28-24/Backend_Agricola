import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { AccionAuditoria, Prisma } from '@prisma/client';
import { PrismaService } from './prisma.service';
import { AppClsStore } from '../common/context/app-cls.store';
import { sanitizarValoresAuditoria } from './extensions/audit.extension';
import { DomainError } from '../common/errors/domain.error';
import { CodigoError } from '../common/errors/codigos-error.enum';

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
   *
   * En modo transaccional (`tx` provisto):
   * - Lanza excepción si falta `empresaId`.
   * - Re-lanza cualquier error de base de datos para forzar rollback de la transacción (ADR-001 / RN-043 / RN-060).
   *
   * En modo no transaccional (`tx` omitido):
   * - Mantiene tolerancia a fallos registrando en log sin interrumpir la operación HTTP.
   */
  async registrar(
    options: RegistrarAuditoriaOptions,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const isTransactional = Boolean(tx);
    const client = tx ?? this.prisma;

    try {
      const empresaId = options.empresaId ?? this.cls.get('empresaId');
      if (!empresaId) {
        if (isTransactional) {
          throw new DomainError(
            CodigoError.PETICION_INVALIDA,
            `No se pudo auditar evento ${options.accion} en ${options.entidad}:${options.entidadId}: falta empresaId en contexto transaccional (RN-043)`,
            HttpStatus.BAD_REQUEST,
          );
        }
        this.logger.warn(
          `No se pudo auditar evento ${options.accion} en ${options.entidad}:${options.entidadId} porque no hay empresaId en contexto`,
        );
        return;
      }

      const usuarioId =
        options.usuarioId !== undefined
          ? options.usuarioId
          : this.cls.get('usuarioId') || null;

      const direccionIp = options.ip ?? this.cls.get('ip') ?? null;

      const valoresAnteriores = sanitizarValoresAuditoria(
        options.valoresAnteriores,
      );
      const valoresNuevos = sanitizarValoresAuditoria(options.valoresNuevos);

      await client.bitacoraAuditoria.create({
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
      if (isTransactional) {
        this.logger.error(
          `Fallo crítico de auditoría dentro de transacción (abortando): ${error instanceof Error ? error.message : String(error)}`,
        );
        throw error;
      }
      // En modo no transaccional se preserva la tolerancia a fallos
      this.logger.error(`Error al registrar en bitácora de auditoría:`, error);
    }
  }
}
