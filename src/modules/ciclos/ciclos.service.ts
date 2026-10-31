import { Injectable, HttpStatus } from '@nestjs/common';
import {
  AccionAuditoria,
  CicloProduccion,
  EstadoCiclo,
  EstadoParcela,
  Prisma,
} from '@prisma/client';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../prisma/audit.service';
import { CodigoError } from '../../common/errors/codigos-error.enum';
import { DomainError } from '../../common/errors/domain.error';
import { FechaUtil } from '../../common/utils/fechas';
import { AccionCiclo } from './constants/ciclo-state-machine.constant';
import { CicloTransitionValidator } from './validators/ciclo-transition.validator';
import { CreateCicloDto } from './dto/create-ciclo.dto';
import { UpdateCicloDto } from './dto/update-ciclo.dto';
import { FinalizarCicloDto } from './dto/finalizar-ciclo.dto';
import { FiltroCicloDto } from './dto/filtro-ciclo.dto';
import { CicloResponseDto } from './dto/ciclo-response.dto';
import { CicloDetalleResponseDto } from './dto/ciclo-detalle-response.dto';
import { PaginatedResponseDto } from '../../common/dto/paginated-response.dto';
import { PaginationUtil } from '../../common/utils/pagination.util';
import { EntityValidationUtil } from '../../common/utils/entity-validation.util';
import { bloquearCicloParaCaptura } from '../../common/utils/ciclo-balance.util';

dayjs.extend(utc);

@Injectable()
export class CiclosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly transitionValidator: CicloTransitionValidator,
  ) {}

  // =====================================================================
  // CREACIÓN Y CONSULTA
  // =====================================================================

  /**
   * Registra un nuevo ciclo de producción para la empresa (F-07).
   * Siempre nace en estado PLANIFICADO para preservar consistencia y separar la activación formal.
   */
  async crearCiclo(
    empresaId: number,
    usuarioId: number,
    dto: CreateCicloDto,
  ): Promise<CicloResponseDto> {
    // 1. Validar existencia y pertenencia de la parcela al tenant (RN-042 / RN-068)
    const parcela = await this.prisma.parcela.findFirst({
      where: {
        id: dto.parcelaId,
        predio: { empresaId },
        deletedAt: null,
      },
    });

    EntityValidationUtil.assertExists(
      parcela,
      `Parcela con ID ${dto.parcelaId} no encontrada en su empresa`,
    );

    // 2. Validar que la parcela no se encuentre inactiva (RN-075)
    if (parcela.estado === EstadoParcela.INACTIVA) {
      throw new DomainError(
        CodigoError.CONFLICTO,
        'No se puede programar un ciclo en una parcela inactiva (RN-075)',
        HttpStatus.CONFLICT,
      );
    }

    // 3. Validar existencia de la variedad en el catálogo
    const variedad = await this.prisma.variedad.findFirst({
      where: {
        id: dto.variedadId,
        activo: true,
      },
    });

    EntityValidationUtil.assertExists(
      variedad,
      `Variedad con ID ${dto.variedadId} no encontrada o inactiva en el catálogo`,
    );

    // 4. Validar coherencia de fechas (RN-017)
    const fechaInicioDate = this.parsearFecha(dto.fechaInicio);
    let fechaFinDate: Date | null = null;

    if (dto.fechaFin) {
      fechaFinDate = this.parsearFecha(dto.fechaFin);
      if (fechaFinDate < fechaInicioDate) {
        throw new DomainError(
          CodigoError.PETICION_INVALIDA,
          'La fecha de fin no puede ser anterior a la fecha de inicio del ciclo (RN-017)',
          HttpStatus.BAD_REQUEST,
        );
      }
    }

    // 5. Validar superficie sembrada respecto a la parcela (RN-018)
    const superficieParcela = Number(parcela.superficie);
    if (dto.superficieSembrada > superficieParcela) {
      throw new DomainError(
        CodigoError.PETICION_INVALIDA,
        `La superficie sembrada (${dto.superficieSembrada} ha) excede la superficie total de la parcela (${superficieParcela} ha) (RN-018)`,
        HttpStatus.BAD_REQUEST,
      );
    }

    // 6. Creación en base de datos y auditoría en la misma transacción (ADR-001)
    const nuevoCiclo = await this.prisma.$transaction(async (tx) => {
      const creado = await tx.cicloProduccion.create({
        data: {
          empresaId,
          parcelaId: dto.parcelaId,
          variedadId: dto.variedadId,
          nombre: dto.nombre?.trim() || null,
          fechaInicio: fechaInicioDate,
          fechaFin: fechaFinDate,
          superficieSembrada: dto.superficieSembrada,
          metaProduccionKg: dto.metaProduccionKg ?? null,
          estado: EstadoCiclo.PLANIFICADO,
          observaciones: dto.observaciones?.trim() || null,
          creadoPorId: usuarioId,
        },
      });

      await this.auditService.registrar(
        {
          empresaId,
          entidad: 'ciclo_produccion',
          entidadId: creado.id,
          accion: AccionAuditoria.CREAR,
          valoresNuevos: {
            id: creado.id,
            parcelaId: creado.parcelaId,
            variedadId: creado.variedadId,
            nombre: creado.nombre,
            estado: creado.estado,
            fechaInicio: dto.fechaInicio,
            superficieSembrada: creado.superficieSembrada.toString(),
          },
        },
        tx,
      );

      return creado;
    });

    return this.formatearCiclo(nuevoCiclo);
  }

  /**
   * Listar ciclos de la empresa con paginación y filtros opcionales.
   */
  async listarCiclos(
    empresaId: number,
    filtro: FiltroCicloDto,
  ): Promise<PaginatedResponseDto<CicloResponseDto>> {
    const pagination = PaginationUtil.normalizar(filtro);

    const where: Prisma.CicloProduccionWhereInput = {
      empresaId,
      deletedAt: null,
    };

    if (filtro.parcelaId) {
      where.parcelaId = filtro.parcelaId;
    }

    if (filtro.variedadId) {
      where.variedadId = filtro.variedadId;
    }

    if (filtro.estado) {
      where.estado = filtro.estado;
    }

    if (filtro.fechaInicioDesde) {
      where.fechaInicio = {
        ...(typeof where.fechaInicio === 'object' ? where.fechaInicio : {}),
        gte: this.parsearFecha(filtro.fechaInicioDesde),
      };
    }

    if (filtro.fechaInicioHasta) {
      where.fechaInicio = {
        ...(typeof where.fechaInicio === 'object' ? where.fechaInicio : {}),
        lte: this.parsearFecha(filtro.fechaInicioHasta),
      };
    }

    if (filtro.q && filtro.q.trim()) {
      const q = filtro.q.trim();
      where.OR = [
        { nombre: { contains: q } },
        { observaciones: { contains: q } },
      ];
    }

    const [total, items] = await Promise.all([
      this.prisma.cicloProduccion.count({ where }),
      this.prisma.cicloProduccion.findMany({
        where,
        orderBy: [{ fechaInicio: 'desc' }, { id: 'desc' }],
        skip: pagination.skip,
        take: pagination.limit,
      }),
    ]);

    return {
      data: items.map((c) => this.formatearCiclo(c)),
      meta: PaginationUtil.crearMeta(pagination.page, pagination.limit, total),
    };
  }

  /**
   * Consultar detalle enriquecido de un ciclo por ID (RN-068).
   */
  async obtenerCicloPorId(
    empresaId: number,
    id: number,
  ): Promise<CicloDetalleResponseDto> {
    const ciclo = await this.prisma.cicloProduccion.findFirst({
      where: {
        id,
        empresaId,
        deletedAt: null,
      },
      include: {
        parcela: {
          include: { predio: true },
        },
        variedad: {
          include: { cultivo: true },
        },
        creadoPor: true,
        cerradoPor: true,
      },
    });

    EntityValidationUtil.assertExists(
      ciclo,
      `Ciclo de producción con ID ${id} no encontrado en su empresa`,
    );

    return {
      ...this.formatearCiclo(ciclo),
      parcelaInfo: {
        id: ciclo.parcela.id,
        nombre: ciclo.parcela.nombre,
        superficie: Number(ciclo.parcela.superficie).toFixed(2),
        predioNombre: ciclo.parcela.predio.nombre,
      },
      variedadInfo: {
        id: ciclo.variedad.id,
        nombre: ciclo.variedad.nombre,
        cultivoNombre: ciclo.variedad.cultivo.nombre,
      },
      creadoPorNombre:
        `${ciclo.creadoPor.nombre} ${ciclo.creadoPor.apellido}`.trim(),
      cerradoPorNombre: ciclo.cerradoPor
        ? `${ciclo.cerradoPor.nombre} ${ciclo.cerradoPor.apellido}`.trim()
        : null,
    };
  }

  /**
   * Actualizar metadatos del ciclo.
   * Prohíbe modificaciones si el ciclo está cerrado (RN-015) y congela la superficie si ya inició.
   */
  async actualizarCiclo(
    empresaId: number,
    id: number,
    dto: UpdateCicloDto,
  ): Promise<CicloResponseDto> {
    return this.prisma.$transaction(async (tx) => {
      // ORDEN DE BLOQUEO ÚNICO (RN-067): Ciclo primero (SELECT ... FOR UPDATE) y parcela después.
      await bloquearCicloParaCaptura(tx, id, empresaId);

      const ciclo = await tx.cicloProduccion.findFirst({
        where: {
          id,
          empresaId,
          deletedAt: null,
        },
        include: {
          parcela: true,
        },
      });

      EntityValidationUtil.assertExists(
        ciclo,
        `Ciclo de producción con ID ${id} no encontrado en su empresa`,
      );

      // RN-015: En ciclos FINALIZADO o CANCELADO se bloquea la modificación
      if (
        ciclo.estado === EstadoCiclo.FINALIZADO ||
        ciclo.estado === EstadoCiclo.CANCELADO
      ) {
        throw new DomainError(
          CodigoError.CICLO_CERRADO,
          `No se permite modificar un ciclo en estado ${ciclo.estado} (RN-015)`,
          HttpStatus.CONFLICT,
        );
      }

      const dataToUpdate: Prisma.CicloProduccionUpdateInput = {};

      if (dto.nombre !== undefined) {
        dataToUpdate.nombre = dto.nombre?.trim() || null;
      }

      if (dto.observaciones !== undefined) {
        dataToUpdate.observaciones = dto.observaciones?.trim() || null;
      }

      if (dto.metaProduccionKg !== undefined) {
        dataToUpdate.metaProduccionKg = dto.metaProduccionKg;
      }

      if (dto.superficieSembrada !== undefined) {
        // Congelar superficie si ya no es PLANIFICADO
        if (ciclo.estado !== EstadoCiclo.PLANIFICADO) {
          throw new DomainError(
            CodigoError.CONFLICTO,
            `No se puede modificar la superficie sembrada de un ciclo que ya se encuentra en estado ${ciclo.estado}`,
            HttpStatus.CONFLICT,
          );
        }

        const superficieParcela = Number(ciclo.parcela.superficie);
        if (dto.superficieSembrada > superficieParcela) {
          throw new DomainError(
            CodigoError.PETICION_INVALIDA,
            `La superficie sembrada (${dto.superficieSembrada} ha) excede la superficie de la parcela (${superficieParcela} ha) (RN-018)`,
            HttpStatus.BAD_REQUEST,
          );
        }
        dataToUpdate.superficieSembrada = dto.superficieSembrada;
      }

      const actualizado = await tx.cicloProduccion.update({
        where: { id },
        data: dataToUpdate,
      });

      await this.auditService.registrar(
        {
          empresaId,
          entidad: 'ciclo_produccion',
          entidadId: id,
          accion: AccionAuditoria.ACTUALIZAR,
          valoresAnteriores: {
            nombre: ciclo.nombre,
            superficieSembrada: ciclo.superficieSembrada.toString(),
            metaProduccionKg: ciclo.metaProduccionKg?.toString() ?? null,
          },
          valoresNuevos: {
            nombre: actualizado.nombre,
            superficieSembrada: actualizado.superficieSembrada.toString(),
            metaProduccionKg: actualizado.metaProduccionKg?.toString() ?? null,
          },
        },
        tx,
      );

      return this.formatearCiclo(actualizado);
    });
  }

  // =====================================================================
  // TRANSICIONES DE ESTADO (MÁQUINA DE ESTADOS Y RN-009)
  // =====================================================================

  /**
   * Ejecuta una transición semántica atómica sobre el ciclo de producción dentro de $transaction.
   */
  async ejecutarTransicion(
    empresaId: number,
    usuarioId: number,
    id: number,
    accion: AccionCiclo,
    payload?: FinalizarCicloDto,
  ): Promise<CicloResponseDto> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        // ORDEN DE BLOQUEO ÚNICO (RN-067 / C5): Ciclo primero (SELECT ... FOR UPDATE) y parcela después.
        await bloquearCicloParaCaptura(tx, id, empresaId);

        // 1. Obtener ciclo conservando empresaId y deletedAt: null
        const ciclo = await tx.cicloProduccion.findFirst({
          where: {
            id,
            empresaId,
            deletedAt: null,
          },
          include: {
            parcela: true,
          },
        });

        EntityValidationUtil.assertExists(
          ciclo,
          `Ciclo de producción con ID ${id} no encontrado en su empresa`,
        );

        // 2. Validar legalidad de la transición con el validador desacoplado
        const nuevoEstado = this.transitionValidator.validar(
          ciclo.estado,
          accion,
        );

        const dataUpdate: Prisma.CicloProduccionUpdateInput = {
          estado: nuevoEstado,
        };

        let nuevoEstadoParcela: EstadoParcela | null = null;
        let accionAuditoria: AccionAuditoria = AccionAuditoria.ACTUALIZAR;

        // 3. Reglas de negocio específicas por acción y preparación de mutaciones
        switch (accion) {
          case AccionCiclo.INICIAR: {
            // RN-075: Parcela no esté inactiva
            if (ciclo.parcela.estado === EstadoParcela.INACTIVA) {
              throw new DomainError(
                CodigoError.CONFLICTO,
                'No se puede iniciar el ciclo en una parcela inactiva (RN-075)',
                HttpStatus.CONFLICT,
              );
            }

            // RN-009: No puede haber otro ciclo ACTIVO en la parcela
            await this.validarParcelaSinCicloActivo(
              tx,
              ciclo.parcelaId,
              ciclo.id,
            );

            // Sincronizar Parcela a EN_USO
            nuevoEstadoParcela = EstadoParcela.EN_USO;
            break;
          }

          case AccionCiclo.SUSPENDER: {
            // Al pasar a SUSPENDIDO, la columna generada STORED en MySQL se evalúa a NULL,
            // liberando la clave única física. La parcela permanece en su estado.
            break;
          }

          case AccionCiclo.REANUDAR: {
            // RN-065: Verificar que mientras estuvo suspendido no se activó otro ciclo en la parcela
            await this.validarParcelaSinCicloActivo(
              tx,
              ciclo.parcelaId,
              ciclo.id,
            );

            // Asegurar que la parcela esté en EN_USO
            nuevoEstadoParcela = EstadoParcela.EN_USO;
            break;
          }

          case AccionCiclo.FINALIZAR: {
            if (!payload?.fechaFin) {
              throw new DomainError(
                CodigoError.PETICION_INVALIDA,
                'La fecha de fin es obligatoria para finalizar el ciclo (F-14)',
                HttpStatus.BAD_REQUEST,
              );
            }

            const fechaFinDate = this.parsearFecha(payload.fechaFin);
            if (fechaFinDate < ciclo.fechaInicio) {
              throw new DomainError(
                CodigoError.PETICION_INVALIDA,
                'La fecha de fin no puede ser anterior a la fecha de inicio del ciclo (RN-017)',
                HttpStatus.BAD_REQUEST,
              );
            }

            dataUpdate.fechaFin = fechaFinDate;
            dataUpdate.cerradoEn = new Date();
            dataUpdate.cerradoPor = { connect: { id: usuarioId } };
            accionAuditoria = AccionAuditoria.CERRAR_CICLO;

            // Sincronizar Parcela: Si no quedan otros ciclos ACTIVOS en la parcela, pasa a DISPONIBLE
            const otrosActivos = await tx.cicloProduccion.count({
              where: {
                parcelaId: ciclo.parcelaId,
                estado: EstadoCiclo.ACTIVO,
                deletedAt: null,
                id: { not: ciclo.id },
              },
            });

            if (otrosActivos === 0) {
              nuevoEstadoParcela = EstadoParcela.DISPONIBLE;
            }
            break;
          }

          case AccionCiclo.CANCELAR: {
            dataUpdate.cerradoEn = new Date();
            dataUpdate.cerradoPor = { connect: { id: usuarioId } };

            // Si estaba en ACTIVO, reevaluar parcela para liberar a DISPONIBLE
            if (ciclo.estado === EstadoCiclo.ACTIVO) {
              const otrosActivos = await tx.cicloProduccion.count({
                where: {
                  parcelaId: ciclo.parcelaId,
                  estado: EstadoCiclo.ACTIVO,
                  deletedAt: null,
                  id: { not: ciclo.id },
                },
              });

              if (otrosActivos === 0) {
                nuevoEstadoParcela = EstadoParcela.DISPONIBLE;
              }
            }
            break;
          }

          case AccionCiclo.REABRIR: {
            // RN-067: Reabrir ciclo exige que la parcela no tenga otro ciclo ACTIVO
            await this.validarParcelaSinCicloActivo(
              tx,
              ciclo.parcelaId,
              ciclo.id,
            );

            dataUpdate.cerradoEn = null;
            dataUpdate.cerradoPor = { disconnect: true };
            accionAuditoria = AccionAuditoria.REABRIR_CICLO;

            // Parcela vuelve a EN_USO
            nuevoEstadoParcela = EstadoParcela.EN_USO;
            break;
          }
        }

        // 4. Actualizar ciclo
        const cicloActualizado = await tx.cicloProduccion.update({
          where: { id },
          data: dataUpdate,
        });

        // 5. Actualizar parcela si hubo cambio de estado
        if (nuevoEstadoParcela && nuevoEstadoParcela !== ciclo.parcela.estado) {
          await tx.parcela.update({
            where: { id: ciclo.parcelaId },
            data: { estado: nuevoEstadoParcela },
          });
        }

        // 6. Registrar en bitácora de auditoría dentro de la misma transacción (AuditService bimodal)
        await this.auditService.registrar(
          {
            empresaId,
            usuarioId,
            entidad: 'ciclo_produccion',
            entidadId: id,
            accion: accionAuditoria,
            valoresAnteriores: {
              estado: ciclo.estado,
              cerradoEn: ciclo.cerradoEn,
            },
            valoresNuevos: {
              estado: cicloActualizado.estado,
              cerradoEn: cicloActualizado.cerradoEn,
              accion,
            },
          },
          tx,
        );

        return this.formatearCiclo(cicloActualizado);
      });
    } catch (error: any) {
      // Blindaje de hardware / RDBMS: atrapar error P2002 de MySQL específicamente sobre claveCicloActivo
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const target = Array.isArray(error.meta?.target)
          ? error.meta.target.join(',')
          : typeof error.meta?.target === 'string'
            ? error.meta.target
            : JSON.stringify(error.meta?.target ?? '');

        if (
          target.includes('claveCicloActivo') ||
          target.includes('ciclo_produccion_claveCicloActivo_key') ||
          accion === AccionCiclo.INICIAR ||
          accion === AccionCiclo.REANUDAR
        ) {
          throw new DomainError(
            CodigoError.CICLO_YA_ACTIVO,
            'Ya existe un ciclo de producción ACTIVO en esta parcela (RN-009)',
            HttpStatus.CONFLICT,
          );
        }
      }
      throw error;
    }
  }

  // =====================================================================
  // BAJA LÓGICA DEFENSIVA
  // =====================================================================

  /**
   * Elimina lógicamente un ciclo únicamente si está en estado PLANIFICADO y no tiene movimientos.
   * Para otros estados con historial, el documento exige la cancelación (RN-058 / RN-016).
   */
  async eliminarCiclo(
    empresaId: number,
    usuarioId: number,
    id: number,
  ): Promise<{ message: string }> {
    return this.prisma.$transaction(async (tx) => {
      // 1. Bloqueo pesimista del ciclo como primera sentencia de la transacción
      await bloquearCicloParaCaptura(tx, id, empresaId);

      const ciclo = await tx.cicloProduccion.findFirst({
        where: {
          id,
          empresaId,
          deletedAt: null,
        },
        include: {
          _count: {
            select: {
              actividades: { where: { deletedAt: null } },
              gastos: { where: { deletedAt: null } },
              cosechas: { where: { deletedAt: null } },
              ventas: { where: { deletedAt: null } },
              mermas: { where: { deletedAt: null } },
            },
          },
        },
      });

      EntityValidationUtil.assertExists(
        ciclo,
        `Ciclo de producción con ID ${id} no encontrado en su empresa`,
      );

      // RN-016: Un ciclo finalizado no se elimina
      if (ciclo.estado === EstadoCiclo.FINALIZADO) {
        throw new DomainError(
          CodigoError.CONFLICTO,
          'Un ciclo finalizado no se puede eliminar (RN-016)',
          HttpStatus.CONFLICT,
        );
      }

      // Solo se permite eliminar ciclos en estado PLANIFICADO
      if (ciclo.estado !== EstadoCiclo.PLANIFICADO) {
        throw new DomainError(
          CodigoError.CONFLICTO,
          `Solo los ciclos en estado PLANIFICADO pueden eliminarse; para un ciclo en estado ${ciclo.estado} utilice la opción de cancelar (RN-058)`,
          HttpStatus.CONFLICT,
        );
      }

      const totalMovimientos =
        ciclo._count.actividades +
        ciclo._count.gastos +
        ciclo._count.cosechas +
        ciclo._count.ventas +
        ciclo._count.mermas;

      if (totalMovimientos > 0) {
        throw new DomainError(
          CodigoError.CONFLICTO,
          'No se puede eliminar el ciclo porque ya cuenta con registros operativos vinculados',
          HttpStatus.CONFLICT,
        );
      }

      await tx.cicloProduccion.update({
        where: { id },
        data: {
          deletedAt: new Date(),
        },
      });

      await this.auditService.registrar(
        {
          empresaId,
          usuarioId,
          entidad: 'ciclo_produccion',
          entidadId: id,
          accion: AccionAuditoria.ELIMINAR,
          valoresAnteriores: {
            id: ciclo.id,
            nombre: ciclo.nombre,
            estado: ciclo.estado,
          },
        },
        tx,
      );

      return {
        message: 'Ciclo de producción planificado eliminado exitosamente',
      };
    });
  }

  // =====================================================================
  // AUXILIARES Y FORMATEADORES
  // =====================================================================

  /**
   * RN-009: Valida que la parcela no posea ningún ciclo en estado ACTIVO.
   */
  private async validarParcelaSinCicloActivo(
    tx: Prisma.TransactionClient,
    parcelaId: number,
    cicloIdExcluir?: number,
  ): Promise<void> {
    const cicloActivo = await tx.cicloProduccion.findFirst({
      where: {
        parcelaId,
        estado: EstadoCiclo.ACTIVO,
        deletedAt: null,
        id: cicloIdExcluir ? { not: cicloIdExcluir } : undefined,
      },
    });

    if (cicloActivo) {
      throw new DomainError(
        CodigoError.CICLO_YA_ACTIVO,
        `Ya existe un ciclo de producción ACTIVO en esta parcela (Ciclo #${cicloActivo.id}) (RN-009)`,
        HttpStatus.CONFLICT,
      );
    }
  }

  private parsearFecha(fechaStr: string): Date {
    return dayjs.utc(fechaStr, 'YYYY-MM-DD').toDate();
  }

  private formatearCiclo(c: CicloProduccion): CicloResponseDto {
    return {
      id: c.id,
      empresaId: c.empresaId,
      parcelaId: c.parcelaId,
      variedadId: c.variedadId,
      nombre: c.nombre,
      fechaInicio: FechaUtil.toDateOnly(c.fechaInicio),
      fechaFin: c.fechaFin ? FechaUtil.toDateOnly(c.fechaFin) : null,
      superficieSembrada: Number(c.superficieSembrada).toFixed(2),
      metaProduccionKg:
        c.metaProduccionKg !== null
          ? Number(c.metaProduccionKg).toFixed(3)
          : null,
      estado: c.estado,
      observaciones: c.observaciones,
      cerradoEn: c.cerradoEn,
      cerradoPorId: c.cerradoPorId,
      creadoPorId: c.creadoPorId,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    };
  }
}
