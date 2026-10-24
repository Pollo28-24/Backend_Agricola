import { Injectable, Inject, Logger, HttpStatus } from '@nestjs/common';
import * as crypto from 'crypto';
import { Prisma, AccionAuditoria } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuditService } from '../../../prisma/audit.service';
import { DomainError } from '../../../common/errors/domain.error';
import { CodigoError } from '../../../common/errors/codigos-error.enum';
import { bloquearCicloParaCaptura } from '../../../common/utils/ciclo-balance.util';
import { CicloCapturaPolicy } from '../../../common/domain/policies/ciclo-captura.policy';
import { RecordWindowValidator } from '../../../common/domain/validators/record-window.validator';
import { STORAGE_SERVICE } from '../interfaces/storage-service.interface';
import type { IStorageService } from '../interfaces/storage-service.interface';
import { TokenDescargaService } from './token-descarga.service';
import {
  EntidadAdjunto,
  ENTIDADES_ADJUNTOS_PERMITIDAS,
  LIMITE_MAXIMO_ADJUNTOS_POR_ENTIDAD,
  TAMANO_MAXIMO_ARCHIVO_BYTES,
  MAPA_ENTIDAD_PERMISO_CREAR,
} from '../constants/adjuntos.constants';
import {
  detectarTipoPorFirma,
  sanearNombreArchivo,
} from '../utils/magic-bytes.util';
import {
  AdjuntoResponseDto,
  EnlaceDescargaDto,
} from '../dto/adjunto-response.dto';

interface EntidadContexto {
  cicloId: number;
  creadoPorId: number;
  createdAt: Date;
}

@Injectable()
export class AdjuntosService {
  private readonly logger = new Logger(AdjuntosService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_SERVICE)
    private readonly storageService: IStorageService,
    private readonly tokenDescargaService: TokenDescargaService,
    private readonly auditService: AuditService,
    private readonly cicloCapturaPolicy: CicloCapturaPolicy,
    private readonly recordWindowValidator: RecordWindowValidator,
  ) {}

  /**
   * Valida que la entidad sea soportada.
   */
  private validarEntidadSoportada(entidad: string): EntidadAdjunto {
    if (!ENTIDADES_ADJUNTOS_PERMITIDAS.includes(entidad)) {
      throw new DomainError(
        CodigoError.ADJUNTO_ENTIDAD_NO_SOPORTADA,
        `La entidad '${entidad}' no soporta archivos adjuntos. Entidades admitidas: ${ENTIDADES_ADJUNTOS_PERMITIDAS.join(', ')}`,
        HttpStatus.BAD_REQUEST,
      );
    }
    return entidad as EntidadAdjunto;
  }

  /**
   * Obtiene contexto de la entidad y valida pertenencia y visibilidad acotada (fuera de transacción).
   */
  private async obtenerYValidarEntidad(
    empresaId: number,
    usuarioId: number,
    entidad: EntidadAdjunto,
    entidadId: number,
    userPermisos: string[],
  ): Promise<EntidadContexto> {
    const tieneAdmin = userPermisos.includes('registro:administrar');
    const tieneEditarTodosGastos = userPermisos.includes('gasto:editar_todos');

    switch (entidad) {
      case EntidadAdjunto.GASTO: {
        const gasto = await this.prisma.gasto.findFirst({
          where: { id: entidadId, deletedAt: null, ciclo: { empresaId } },
          select: {
            id: true,
            cicloId: true,
            creadoPorId: true,
            createdAt: true,
          },
        });
        if (!gasto) {
          throw new DomainError(
            CodigoError.RECURSO_NO_ENCONTRADO,
            `Gasto ${entidadId} no encontrado en la empresa`,
            HttpStatus.NOT_FOUND,
          );
        }
        // Visibilidad: sin editar_todos ni administrar, solo gastos propios
        if (
          !tieneAdmin &&
          !tieneEditarTodosGastos &&
          gasto.creadoPorId !== usuarioId
        ) {
          throw new DomainError(
            CodigoError.RECURSO_NO_ENCONTRADO,
            `Gasto ${entidadId} no encontrado o no accesible`,
            HttpStatus.NOT_FOUND,
          );
        }
        return {
          cicloId: gasto.cicloId,
          creadoPorId: gasto.creadoPorId,
          createdAt: gasto.createdAt,
        };
      }

      case EntidadAdjunto.ACTIVIDAD: {
        const actividad = await this.prisma.actividad.findFirst({
          where: { id: entidadId, deletedAt: null, ciclo: { empresaId } },
          select: {
            id: true,
            cicloId: true,
            creadoPorId: true,
            createdAt: true,
          },
        });
        if (!actividad) {
          throw new DomainError(
            CodigoError.RECURSO_NO_ENCONTRADO,
            `Actividad ${entidadId} no encontrada en la empresa`,
            HttpStatus.NOT_FOUND,
          );
        }
        // Visibilidad: sin administrar, solo actividades propias
        if (!tieneAdmin && actividad.creadoPorId !== usuarioId) {
          throw new DomainError(
            CodigoError.RECURSO_NO_ENCONTRADO,
            `Actividad ${entidadId} no encontrada o no accesible`,
            HttpStatus.NOT_FOUND,
          );
        }
        return {
          cicloId: actividad.cicloId,
          creadoPorId: actividad.creadoPorId,
          createdAt: actividad.createdAt,
        };
      }

      case EntidadAdjunto.VENTA: {
        const venta = await this.prisma.venta.findFirst({
          where: { id: entidadId, deletedAt: null, ciclo: { empresaId } },
          select: {
            id: true,
            cicloId: true,
            creadoPorId: true,
            createdAt: true,
          },
        });
        if (!venta) {
          throw new DomainError(
            CodigoError.RECURSO_NO_ENCONTRADO,
            `Venta ${entidadId} no encontrada en la empresa`,
            HttpStatus.NOT_FOUND,
          );
        }
        return {
          cicloId: venta.cicloId,
          creadoPorId: venta.creadoPorId,
          createdAt: venta.createdAt,
        };
      }

      case EntidadAdjunto.COBRO: {
        const cobro = await this.prisma.cobroVenta.findFirst({
          where: {
            id: entidadId,
            deletedAt: null,
            venta: { deletedAt: null, ciclo: { empresaId } },
          },
          select: {
            id: true,
            registradoPorId: true,
            createdAt: true,
            venta: { select: { cicloId: true } },
          },
        });
        if (!cobro) {
          throw new DomainError(
            CodigoError.RECURSO_NO_ENCONTRADO,
            `Cobro ${entidadId} no encontrado en la empresa`,
            HttpStatus.NOT_FOUND,
          );
        }
        return {
          cicloId: cobro.venta.cicloId,
          creadoPorId: cobro.registradoPorId,
          createdAt: cobro.createdAt,
        };
      }
    }
  }

  /**
   * Relee la entidad destino bajo el bloqueo transaccional.
   */
  private async releerEntidadBajoLock(
    tx: Prisma.TransactionClient,
    entidad: EntidadAdjunto,
    entidadId: number,
  ): Promise<void> {
    switch (entidad) {
      case EntidadAdjunto.GASTO: {
        const g = await tx.gasto.findFirst({
          where: { id: entidadId, deletedAt: null },
        });
        if (!g) {
          throw new DomainError(
            CodigoError.RECURSO_NO_ENCONTRADO,
            `Gasto ${entidadId} no disponible`,
            HttpStatus.NOT_FOUND,
          );
        }
        break;
      }
      case EntidadAdjunto.ACTIVIDAD: {
        const a = await tx.actividad.findFirst({
          where: { id: entidadId, deletedAt: null },
        });
        if (!a) {
          throw new DomainError(
            CodigoError.RECURSO_NO_ENCONTRADO,
            `Actividad ${entidadId} no disponible`,
            HttpStatus.NOT_FOUND,
          );
        }
        break;
      }
      case EntidadAdjunto.VENTA: {
        const v = await tx.venta.findFirst({
          where: { id: entidadId, deletedAt: null },
        });
        if (!v) {
          throw new DomainError(
            CodigoError.RECURSO_NO_ENCONTRADO,
            `Venta ${entidadId} no disponible`,
            HttpStatus.NOT_FOUND,
          );
        }
        break;
      }
      case EntidadAdjunto.COBRO: {
        const c = await tx.cobroVenta.findFirst({
          where: { id: entidadId, deletedAt: null },
        });
        if (!c) {
          throw new DomainError(
            CodigoError.RECURSO_NO_ENCONTRADO,
            `Cobro ${entidadId} no disponible`,
            HttpStatus.NOT_FOUND,
          );
        }
        break;
      }
    }
  }

  /**
   * Subida de archivo adjunto con orden estricto de consistencia y compensación.
   */
  public async subirAdjunto(
    empresaId: number,
    usuarioId: number,
    entidadRaw: string,
    entidadId: number,
    file: Express.Multer.File,
    userPermisos: string[],
  ): Promise<AdjuntoResponseDto> {
    const entidad = this.validarEntidadSoportada(entidadRaw);

    // 1. Validaciones previas de archivo
    if (!file || !file.buffer || file.buffer.length === 0) {
      throw new DomainError(
        CodigoError.PETICION_INVALIDA,
        'No se ha proporcionado un archivo válido o el archivo está vacío',
        HttpStatus.BAD_REQUEST,
      );
    }

    if (
      file.size > TAMANO_MAXIMO_ARCHIVO_BYTES ||
      file.buffer.length > TAMANO_MAXIMO_ARCHIVO_BYTES
    ) {
      throw new DomainError(
        CodigoError.ARCHIVO_DEMASIADO_GRANDE,
        'El archivo excede el tamaño máximo permitido de 10 MB',
        HttpStatus.PAYLOAD_TOO_LARGE,
      );
    }

    const detected = detectarTipoPorFirma(file.buffer);
    if (!detected) {
      throw new DomainError(
        CodigoError.TIPO_ARCHIVO_NO_PERMITIDO,
        'El archivo no cuenta con una firma binaria permitida (formatos admitidos: JPEG, PNG, WEBP, PDF)',
        HttpStatus.UNSUPPORTED_MEDIA_TYPE,
      );
    }

    // Coincidencia estricta entre tipo MIME declarado y detectado
    const mimeDeclarado = (file.mimetype || '').toLowerCase().trim();
    if (mimeDeclarado !== detected.mime) {
      throw new DomainError(
        CodigoError.TIPO_ARCHIVO_NO_PERMITIDO,
        `El tipo MIME declarado (${file.mimetype}) no coincide con la firma real del archivo (${detected.mime})`,
        HttpStatus.UNSUPPORTED_MEDIA_TYPE,
      );
    }

    // 2. Validación de entidad y visibilidad previa fuera de la transacción
    const ctx = await this.obtenerYValidarEntidad(
      empresaId,
      usuarioId,
      entidad,
      entidadId,
      userPermisos,
    );

    // 3. Generar clave segura en servidor: {empresaId}/{uuid}.{ext}
    const clave = `${empresaId}/${crypto.randomUUID()}.${detected.ext}`;

    // 4. Guardar archivo en almacenamiento desacoplado ANTES de la transacción
    await this.storageService.guardar(clave, file.buffer);

    // 5. Transacción de base de datos con orden estricto y compensación ante errores
    try {
      const adjuntoCreado = await this.prisma.$transaction(async (tx) => {
        // (1) Primera sentencia obligatoria: bloquear ciclo para captura
        const ciclo = await bloquearCicloParaCaptura(
          tx,
          ctx.cicloId,
          empresaId,
        );

        // (2) Releer entidad destino bajo el lock
        await this.releerEntidadBajoLock(tx, entidad, entidadId);

        // (3) Validar estado del ciclo mediante CicloCapturaPolicy
        this.cicloCapturaPolicy.assertCaptureAllowed(ciclo, entidad);

        // (4) Validar ventana temporal de 48 horas (RN-062)
        const tieneAdmin = userPermisos.includes('registro:administrar');
        const tieneBypassGasto =
          entidad === EntidadAdjunto.GASTO &&
          userPermisos.includes('gasto:editar_todos');

        this.recordWindowValidator.assertEdicionPermitida({
          createdAt: ctx.createdAt,
          creadoPorId: ctx.creadoPorId,
          usuarioId,
          tienePermisoAdministrar: tieneAdmin,
          tieneBypassRol: tieneBypassGasto,
          nombreEntidad: entidad,
        });

        // (5) Contar adjuntos existentes de la entidad bajo el lock (máx 10)
        const totalAdjuntos = await tx.adjunto.count({
          where: { empresaId, entidad, entidadId },
        });

        if (totalAdjuntos >= LIMITE_MAXIMO_ADJUNTOS_POR_ENTIDAD) {
          throw new DomainError(
            CodigoError.LIMITE_ADJUNTOS_ALCANZADO,
            `Se ha alcanzado el límite máximo de ${LIMITE_MAXIMO_ADJUNTOS_POR_ENTIDAD} archivos adjuntos para este registro`,
            HttpStatus.BAD_REQUEST,
          );
        }

        // (6) Crear registro en tabla adjunto
        const nombreSaneado = sanearNombreArchivo(file.originalname);
        const nuevoAdjunto = await tx.adjunto.create({
          data: {
            empresaId,
            subidoPorId: usuarioId,
            entidad,
            entidadId,
            nombreArchivo: nombreSaneado,
            tipoMime: detected.mime,
            tamanoBytes: file.buffer.length,
            claveAlmacenamiento: clave,
          },
        });

        // (7) Auditar creación en la misma transacción (snapshot sin claveAlmacenamiento)
        await this.auditService.registrar(
          {
            empresaId,
            usuarioId,
            entidad: 'adjunto',
            entidadId: nuevoAdjunto.id,
            accion: AccionAuditoria.CREAR,
            valoresNuevos: {
              id: nuevoAdjunto.id,
              entidad: nuevoAdjunto.entidad,
              entidadId: nuevoAdjunto.entidadId,
              nombreArchivo: nuevoAdjunto.nombreArchivo,
              tipoMime: nuevoAdjunto.tipoMime,
              tamanoBytes: nuevoAdjunto.tamanoBytes,
            },
          },
          tx,
        );

        return nuevoAdjunto;
      });

      return {
        id: adjuntoCreado.id,
        empresaId: adjuntoCreado.empresaId,
        entidad: adjuntoCreado.entidad,
        entidadId: adjuntoCreado.entidadId,
        nombreArchivo: adjuntoCreado.nombreArchivo,
        tipoMime: adjuntoCreado.tipoMime,
        tamanoBytes: adjuntoCreado.tamanoBytes,
        subidoPorId: adjuntoCreado.subidoPorId,
        createdAt: adjuntoCreado.createdAt.toISOString(),
      };
    } catch (err) {
      // Compensación inmediata: borrar archivo guardado en disco
      try {
        await this.storageService.borrar(clave);
      } catch (compensateErr) {
        this.logger.error(
          `Fallo crítico de compensación al borrar archivo huérfano ${clave}: ${(compensateErr as Error).message}`,
        );
      }
      throw err;
    }
  }

  /**
   * Lista los adjuntos de una entidad verificando pertenencia y visibilidad.
   */
  public async listarAdjuntos(
    empresaId: number,
    usuarioId: number,
    entidadRaw: string,
    entidadId: number,
    userPermisos: string[],
  ): Promise<AdjuntoResponseDto[]> {
    const entidad = this.validarEntidadSoportada(entidadRaw);

    // Valida existencia y permisos de visibilidad
    await this.obtenerYValidarEntidad(
      empresaId,
      usuarioId,
      entidad,
      entidadId,
      userPermisos,
    );

    const adjuntos = await this.prisma.adjunto.findMany({
      where: { empresaId, entidad, entidadId },
      orderBy: { id: 'desc' },
    });

    return adjuntos.map((a) => ({
      id: a.id,
      empresaId: a.empresaId,
      entidad: a.entidad,
      entidadId: a.entidadId,
      nombreArchivo: a.nombreArchivo,
      tipoMime: a.tipoMime,
      tamanoBytes: a.tamanoBytes,
      subidoPorId: a.subidoPorId,
      createdAt: a.createdAt.toISOString(),
    }));
  }

  /**
   * Genera un enlace de descarga temporal firmado con HMAC-SHA256.
   * Valida que el usuario tenga permiso de ver/crear la entidad del adjunto.
   */
  public async generarEnlaceDescarga(
    empresaId: number,
    usuarioId: number,
    adjuntoId: number,
    userPermisos: string[],
  ): Promise<EnlaceDescargaDto> {
    const adjunto = await this.prisma.adjunto.findFirst({
      where: { id: adjuntoId, empresaId },
    });

    if (!adjunto) {
      throw new DomainError(
        CodigoError.RECURSO_NO_ENCONTRADO,
        `Adjunto ${adjuntoId} no encontrado en la empresa`,
        HttpStatus.NOT_FOUND,
      );
    }

    const entidad = adjunto.entidad as EntidadAdjunto;
    const permisoRequerido = MAPA_ENTIDAD_PERMISO_CREAR[entidad];

    if (
      !userPermisos.includes(permisoRequerido) &&
      !userPermisos.includes('registro:administrar')
    ) {
      throw new DomainError(
        CodigoError.PERMISO_DENEGADO,
        `No tiene permiso para descargar adjuntos de tipo ${entidad}`,
        HttpStatus.FORBIDDEN,
      );
    }

    // Validar visibilidad acotada para gastos y actividades
    await this.obtenerYValidarEntidad(
      empresaId,
      usuarioId,
      entidad,
      adjunto.entidadId,
      userPermisos,
    );

    const { token, expiraEn } = this.tokenDescargaService.generarToken(
      adjunto.id,
      empresaId,
      usuarioId,
    );

    return {
      urlDescarga: `/api/v1/adjuntos/descarga?token=${token}`,
      token,
      expiraEn: expiraEn.toISOString(),
    };
  }

  /**
   * Descarga física del archivo validando token HMAC y vigencia del usuario en BD.
   */
  public async descargarArchivo(
    token: string,
    usuarioSolicitanteId?: number,
  ): Promise<{
    stream: NodeJS.ReadableStream;
    adjunto: {
      nombreArchivo: string;
      tipoMime: string;
      tamanoBytes: number;
    };
  }> {
    // 1. Validar token y firma
    const payload = this.tokenDescargaService.verificarToken(token);

    // Si la petición incluyó credenciales de un usuario autenticado, debe ser el mismo para quien se emitió el token
    if (
      usuarioSolicitanteId !== undefined &&
      usuarioSolicitanteId !== payload.usuarioId
    ) {
      throw new DomainError(
        CodigoError.ENLACE_DESCARGA_INVALIDO,
        'El enlace de descarga no corresponde al usuario que realiza la solicitud',
        HttpStatus.FORBIDDEN,
      );
    }

    // 2. Revalidar usuario activo y empresa no eliminada (RN-072)
    const usuario = await this.prisma.usuario.findFirst({
      where: {
        id: payload.usuarioId,
        empresaId: payload.empresaId,
        activo: true,
        deletedAt: null,
        empresa: {
          activo: true,
          deletedAt: null,
        },
      },
    });

    if (!usuario) {
      throw new DomainError(
        CodigoError.ENLACE_DESCARGA_INVALIDO,
        'El usuario o la empresa asociada al enlace no se encuentra activo',
        HttpStatus.FORBIDDEN,
      );
    }

    // 3. Cargar adjunto
    const adjunto = await this.prisma.adjunto.findFirst({
      where: {
        id: payload.adjuntoId,
        empresaId: payload.empresaId,
      },
    });

    if (!adjunto) {
      throw new DomainError(
        CodigoError.RECURSO_NO_ENCONTRADO,
        'El archivo adjunto solicitado no existe o fue eliminado',
        HttpStatus.NOT_FOUND,
      );
    }

    // 4. Verificar existencia física
    const existe = await this.storageService.existe(
      adjunto.claveAlmacenamiento,
    );
    if (!existe) {
      this.logger.error(
        `Archivo faltante en disco para adjunto ${adjunto.id}: ${adjunto.claveAlmacenamiento}`,
      );
      throw new DomainError(
        CodigoError.RECURSO_NO_ENCONTRADO,
        'El archivo no se encuentra disponible en el almacenamiento del servidor',
        HttpStatus.NOT_FOUND,
      );
    }

    const stream = await this.storageService.leerStream(
      adjunto.claveAlmacenamiento,
    );

    return {
      stream,
      adjunto: {
        nombreArchivo: adjunto.nombreArchivo,
        tipoMime: adjunto.tipoMime,
        tamanoBytes: adjunto.tamanoBytes,
      },
    };
  }

  /**
   * Eliminación física del registro de adjunto con auditoría y borrado de archivo posterior.
   * Requiere permiso 'registro:administrar'.
   */
  public async eliminarAdjunto(
    empresaId: number,
    usuarioId: number,
    adjuntoId: number,
  ): Promise<void> {
    const adjunto = await this.prisma.adjunto.findFirst({
      where: { id: adjuntoId, empresaId },
    });

    if (!adjunto) {
      throw new DomainError(
        CodigoError.RECURSO_NO_ENCONTRADO,
        `Adjunto ${adjuntoId} no encontrado en la empresa`,
        HttpStatus.NOT_FOUND,
      );
    }

    const entidad = adjunto.entidad as EntidadAdjunto;
    // Obtener cicloId asociado para el lock
    const ctx = await this.obtenerYValidarEntidad(
      empresaId,
      usuarioId,
      entidad,
      adjunto.entidadId,
      ['registro:administrar'],
    );

    // Transacción de eliminación
    await this.prisma.$transaction(async (tx) => {
      // (1) Lock de ciclo como primera sentencia
      const ciclo = await bloquearCicloParaCaptura(tx, ctx.cicloId, empresaId);

      // (2) Releer adjunto
      const adj = await tx.adjunto.findFirst({
        where: { id: adjuntoId, empresaId },
      });
      if (!adj) {
        throw new DomainError(
          CodigoError.RECURSO_NO_ENCONTRADO,
          `Adjunto ${adjuntoId} no encontrado`,
          HttpStatus.NOT_FOUND,
        );
      }

      // (3) Validar estado del ciclo: cerrado bloquea excepto cobros en FINALIZADO
      if (entidad === EntidadAdjunto.COBRO) {
        if (ciclo.estado === 'CANCELADO') {
          throw new DomainError(
            CodigoError.CICLO_CERRADO,
            'No se puede eliminar adjuntos de cobros en un ciclo CANCELADO',
            HttpStatus.CONFLICT,
          );
        }
      } else {
        if (ciclo.estado === 'FINALIZADO' || ciclo.estado === 'CANCELADO') {
          throw new DomainError(
            CodigoError.CICLO_CERRADO,
            `No se puede eliminar adjuntos en un ciclo en estado ${ciclo.estado}`,
            HttpStatus.CONFLICT,
          );
        }
      }

      // (4) Eliminar fila física
      await tx.adjunto.delete({
        where: { id: adjuntoId },
      });

      // (5) Auditar eliminación en misma transacción
      await this.auditService.registrar(
        {
          empresaId,
          usuarioId,
          entidad: 'adjunto',
          entidadId: adj.id,
          accion: AccionAuditoria.ELIMINAR,
          valoresAnteriores: {
            id: adj.id,
            entidad: adj.entidad,
            entidadId: adj.entidadId,
            nombreArchivo: adj.nombreArchivo,
            tipoMime: adj.tipoMime,
            tamanoBytes: adj.tamanoBytes,
          },
        },
        tx,
      );
    });

    // (6) Borrado del archivo en almacenamiento DESPUÉS del commit exitoso
    try {
      await this.storageService.borrar(adjunto.claveAlmacenamiento);
    } catch (err) {
      this.logger.error(
        `Fallo al borrar archivo en almacenamiento tras commit para adjunto ${adjunto.id}: ${(err as Error).message}`,
      );
    }
  }
}
