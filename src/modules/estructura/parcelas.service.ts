import { Injectable, HttpStatus } from '@nestjs/common';
import { AccionAuditoria, EstadoCiclo, EstadoParcela } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../prisma/audit.service';
import { CreateParcelaDto } from './dto/create-parcela.dto';
import { UpdateParcelaDto } from './dto/update-parcela.dto';
import { ParcelaResponseDto } from './dto/parcela-response.dto';
import { CodigoError } from '../../common/errors/codigos-error.enum';
import { DomainError } from '../../common/errors/domain.error';
import { SoftDeleteUtil } from '../../common/utils/soft-delete.util';
import { EntityValidationUtil } from '../../common/utils/entity-validation.util';

@Injectable()
export class ParcelasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Alta de nueva parcela con validación de límite de plan (RN-037),
   * pertenencia del predio al tenant (RN-068), unicidad de nombre y GeoJSON.
   * Protegido contra concurrencia mediante lock pesimista FOR UPDATE (ADR-002).
   */
  async crearParcela(
    empresaId: number,
    dto: CreateParcelaDto,
  ): Promise<ParcelaResponseDto> {
    const nombreNormalizado = dto.nombre.trim();

    return await this.prisma.$transaction(async (tx) => {
      // 0. Bloqueo pesimista de fila para prevenir race conditions en cuota comercial (ADR-002 / RN-037)
      await tx.$queryRaw`SELECT id FROM empresa WHERE id = ${empresaId} FOR UPDATE`;

      // 1. Validar límite de parcelas del plan comercial (RN-037)
      const empresa = await tx.empresa.findUnique({
        where: { id: empresaId },
        include: { plan: true },
      });

      if (!empresa || empresa.deletedAt !== null) {
        throw new DomainError(
          CodigoError.RECURSO_NO_ENCONTRADO,
          'Empresa no encontrada',
          HttpStatus.NOT_FOUND,
        );
      }

      const parcelasActivas = await tx.parcela.count({
        where: {
          predio: { empresaId },
          estado: { not: EstadoParcela.INACTIVA },
          deletedAt: null,
        },
      });

      if (
        dto.estado !== EstadoParcela.INACTIVA &&
        parcelasActivas >= empresa.plan.maxParcelas
      ) {
        throw new DomainError(
          CodigoError.LIMITE_PLAN_EXCEDIDO,
          `Su plan comercial '${empresa.plan.nombre}' permite un máximo de ${empresa.plan.maxParcelas} parcelas activas. Actualice su plan para registrar más parcelas (RN-037).`,
          HttpStatus.CONFLICT,
          {
            maxParcelas: empresa.plan.maxParcelas,
            parcelasActuales: parcelasActivas,
          },
        );
      }

      // 2. Validar que el predio exista y pertenezca a la empresa (RN-068)
      const predio = await tx.predio.findFirst({
        where: {
          id: dto.predioId,
          empresaId,
          deletedAt: null,
        },
      });

      EntityValidationUtil.assertExists(
        predio,
        'El predio especificado no existe o no pertenece a su empresa',
      );

      // 3. Validar tipo de suelo si se especifica
      if (dto.tipoSueloId) {
        const tipoSuelo = await tx.tipoSuelo.findUnique({
          where: { id: dto.tipoSueloId },
        });
        EntityValidationUtil.assertExists(
          tipoSuelo,
          'El tipo de suelo especificado no existe',
        );
      }

      // 4. Validar unicidad de nombre en el predio entre las parcelas activas
      const parcelaExistente = await tx.parcela.findFirst({
        where: {
          predioId: dto.predioId,
          nombre: nombreNormalizado,
          deletedAt: null,
        },
      });

      if (parcelaExistente) {
        throw new DomainError(
          CodigoError.CONFLICTO,
          `Ya existe una parcela activa con el nombre '${nombreNormalizado}' en este predio`,
          HttpStatus.CONFLICT,
        );
      }

      // 5. Crear parcela
      const nuevaParcela = await tx.parcela.create({
        data: {
          predioId: dto.predioId,
          tipoSueloId: dto.tipoSueloId ?? null,
          nombre: nombreNormalizado,
          superficie: dto.superficie,
          latitud: dto.latitud ?? null,
          longitud: dto.longitud ?? null,
          poligono: dto.poligono ?? undefined,
          estado: dto.estado ?? EstadoParcela.DISPONIBLE,
        },
        include: {
          predio: true,
          tipoSuelo: true,
        },
      });

      // 6. Auditoría transaccional
      await this.auditService.registrar(
        {
          empresaId,
          entidad: 'parcela',
          entidadId: nuevaParcela.id,
          accion: AccionAuditoria.CREAR,
          valoresNuevos: {
            id: nuevaParcela.id,
            predioId: nuevaParcela.predioId,
            nombre: nuevaParcela.nombre,
            superficie: nuevaParcela.superficie.toString(),
            estado: nuevaParcela.estado,
          },
        },
        tx,
      );

      return this.formatearParcela(nuevaParcela);
    });
  }

  /**
   * Listar parcelas de la empresa (con filtros opcionales de predio y estado).
   */
  async listarParcelas(
    empresaId: number,
    predioId?: number,
    estado?: EstadoParcela,
  ): Promise<ParcelaResponseDto[]> {
    const parcelas = await this.prisma.parcela.findMany({
      where: {
        predio: { empresaId },
        deletedAt: null,
        ...(predioId ? { predioId } : {}),
        ...(estado ? { estado } : {}),
      },
      include: {
        predio: true,
        tipoSuelo: true,
      },
      orderBy: { nombre: 'asc' },
    });

    return parcelas.map((p) => this.formatearParcela(p));
  }

  /**
   * Consultar parcela por ID garantizando aislamiento multi-tenant (RN-068).
   */
  async obtenerParcelaPorId(
    empresaId: number,
    parcelaId: number,
  ): Promise<ParcelaResponseDto> {
    const parcela = await this.prisma.parcela.findFirst({
      where: {
        id: parcelaId,
        predio: { empresaId },
        deletedAt: null,
      },
      include: {
        predio: true,
        tipoSuelo: true,
      },
    });

    EntityValidationUtil.assertExists(parcela, 'Parcela no encontrada');

    return this.formatearParcela(parcela);
  }

  /**
   * Actualizar parcela de la empresa.
   */
  async actualizarParcela(
    empresaId: number,
    parcelaId: number,
    dto: UpdateParcelaDto,
  ): Promise<ParcelaResponseDto> {
    const parcelaActual = await this.prisma.parcela.findFirst({
      where: {
        id: parcelaId,
        predio: { empresaId },
        deletedAt: null,
      },
      include: { predio: true },
    });

    EntityValidationUtil.assertExists(parcelaActual, 'Parcela no encontrada');

    const esReactivacion =
      parcelaActual.estado === EstadoParcela.INACTIVA &&
      dto.estado &&
      dto.estado !== EstadoParcela.INACTIVA;

    const targetPredioId = dto.predioId ?? parcelaActual.predioId;

    if (dto.predioId && dto.predioId !== parcelaActual.predioId) {
      const nuevoPredio = await this.prisma.predio.findFirst({
        where: { id: dto.predioId, empresaId, deletedAt: null },
      });
      EntityValidationUtil.assertExists(
        nuevoPredio,
        'El nuevo predio especificado no existe o no pertenece a su empresa',
      );
    }

    if (dto.nombre) {
      const duplicada = await this.prisma.parcela.findFirst({
        where: {
          predioId: targetPredioId,
          nombre: dto.nombre.trim(),
          deletedAt: null,
          id: { not: parcelaId },
        },
      });

      if (duplicada) {
        throw new DomainError(
          CodigoError.CONFLICTO,
          `Ya existe otra parcela con el nombre '${dto.nombre.trim()}' en el predio`,
          HttpStatus.CONFLICT,
        );
      }
    }

    if (dto.tipoSueloId) {
      const tipoSuelo = await this.prisma.tipoSuelo.findUnique({
        where: { id: dto.tipoSueloId },
      });
      EntityValidationUtil.assertExists(
        tipoSuelo,
        'El tipo de suelo especificado no existe',
      );
    }

    // Reactivación con cupo: update + auditoría DENTRO del mismo $transaction que el FOR UPDATE
    if (esReactivacion) {
      return await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM empresa WHERE id = ${empresaId} FOR UPDATE`;

        const empresa = await tx.empresa.findUnique({
          where: { id: empresaId },
          include: { plan: true },
        });
        const parcelasActivas = await tx.parcela.count({
          where: {
            predio: { empresaId },
            estado: { not: EstadoParcela.INACTIVA },
            deletedAt: null,
          },
        });
        if (empresa && parcelasActivas >= empresa.plan.maxParcelas) {
          throw new DomainError(
            CodigoError.LIMITE_PLAN_EXCEDIDO,
            `No se puede reactivar la parcela. Su plan permite un máximo de ${empresa.plan.maxParcelas} parcelas activas (RN-037).`,
            HttpStatus.CONFLICT,
          );
        }

        const parcelaActualizada = await tx.parcela.update({
          where: { id: parcelaId },
          data: {
            ...(dto.predioId && { predioId: dto.predioId }),
            ...(dto.tipoSueloId !== undefined && {
              tipoSueloId: dto.tipoSueloId,
            }),
            ...(dto.nombre && { nombre: dto.nombre.trim() }),
            ...(dto.superficie !== undefined && { superficie: dto.superficie }),
            ...(dto.latitud !== undefined && { latitud: dto.latitud }),
            ...(dto.longitud !== undefined && { longitud: dto.longitud }),
            ...(dto.poligono !== undefined && {
              poligono: dto.poligono ?? undefined,
            }),
            ...(dto.estado && { estado: dto.estado }),
          },
          include: {
            predio: true,
            tipoSuelo: true,
          },
        });

        await this.auditService.registrar(
          {
            empresaId,
            entidad: 'parcela',
            entidadId: parcelaId,
            accion: AccionAuditoria.ACTUALIZAR,
            valoresAnteriores: {
              nombre: parcelaActual.nombre,
              superficie: parcelaActual.superficie.toString(),
              estado: parcelaActual.estado,
            },
            valoresNuevos: {
              nombre: parcelaActualizada.nombre,
              superficie: parcelaActualizada.superficie.toString(),
              estado: parcelaActualizada.estado,
            },
          },
          tx,
        );

        return this.formatearParcela(parcelaActualizada);
      });
    }

    // Sin reactivación: update + auditoría en la misma transacción (ADR-001)
    const parcelaActualizada = await this.prisma.$transaction(async (tx) => {
      const actualizada = await tx.parcela.update({
        where: { id: parcelaId },
        data: {
          ...(dto.predioId && { predioId: dto.predioId }),
          ...(dto.tipoSueloId !== undefined && {
            tipoSueloId: dto.tipoSueloId,
          }),
          ...(dto.nombre && { nombre: dto.nombre.trim() }),
          ...(dto.superficie !== undefined && { superficie: dto.superficie }),
          ...(dto.latitud !== undefined && { latitud: dto.latitud }),
          ...(dto.longitud !== undefined && { longitud: dto.longitud }),
          ...(dto.poligono !== undefined && {
            poligono: dto.poligono ?? undefined,
          }),
          ...(dto.estado && { estado: dto.estado }),
        },
        include: {
          predio: true,
          tipoSuelo: true,
        },
      });

      await this.auditService.registrar(
        {
          empresaId,
          entidad: 'parcela',
          entidadId: parcelaId,
          accion: AccionAuditoria.ACTUALIZAR,
          valoresAnteriores: {
            nombre: parcelaActual.nombre,
            superficie: parcelaActual.superficie.toString(),
            estado: parcelaActual.estado,
          },
          valoresNuevos: {
            nombre: actualizada.nombre,
            superficie: actualizada.superficie.toString(),
            estado: actualizada.estado,
          },
        },
        tx,
      );

      return actualizada;
    });

    return this.formatearParcela(parcelaActualizada);
  }

  /**
   * Baja lógica de parcela y liberación de unicidad de nombre (RN-041, Sección 3.11).
   * Valida que no tenga ciclos de producción activos o planificados.
   */
  async eliminarParcela(
    empresaId: number,
    parcelaId: number,
  ): Promise<{ mensaje: string }> {
    const parcela = await this.prisma.parcela.findFirst({
      where: {
        id: parcelaId,
        predio: { empresaId },
        deletedAt: null,
      },
    });

    EntityValidationUtil.assertExists(parcela, 'Parcela no encontrada');

    const ciclosEnCurso = await this.prisma.cicloProduccion.count({
      where: {
        parcelaId,
        deletedAt: null,
        estado: {
          in: [
            EstadoCiclo.PLANIFICADO,
            EstadoCiclo.ACTIVO,
            EstadoCiclo.SUSPENDIDO,
          ],
        },
      },
    });

    if (ciclosEnCurso > 0) {
      throw new DomainError(
        CodigoError.CONFLICTO,
        `No se puede eliminar la parcela '${parcela.nombre}' porque tiene ${ciclosEnCurso} ciclo(s) de producción activo(s) o planificado(s). Finalice o cancele los ciclos primero.`,
        HttpStatus.CONFLICT,
      );
    }

    const nombreLiberado = SoftDeleteUtil.generarValorBaja(
      parcela.nombre,
      parcela.id,
      120,
    );

    await this.prisma.$transaction(async (tx) => {
      await tx.parcela.update({
        where: { id: parcelaId },
        data: {
          deletedAt: new Date(),
          estado: EstadoParcela.INACTIVA,
          nombre: nombreLiberado,
        },
      });

      await this.auditService.registrar(
        {
          empresaId,
          entidad: 'parcela',
          entidadId: parcelaId,
          accion: AccionAuditoria.ELIMINAR,
          valoresAnteriores: {
            id: parcela.id,
            nombreOriginal: parcela.nombre,
          },
        },
        tx,
      );
    });

    return { mensaje: 'Parcela dada de baja exitosamente' };
  }

  // =====================================================================
  // FORMATEADOR PRIVADO
  // =====================================================================

  private formatearParcela(parcela: {
    id: number;
    predioId: number;
    predio?: { nombre: string } | null;
    tipoSueloId: number | null;
    tipoSuelo?: { nombre: string } | null;
    nombre: string;
    superficie: { toString(): string };
    latitud: { toString(): string } | null;
    longitud: { toString(): string } | null;
    poligono: unknown;
    estado: EstadoParcela;
    createdAt: Date;
    updatedAt: Date;
  }): ParcelaResponseDto {
    return {
      id: parcela.id,
      predioId: parcela.predioId,
      predioNombre: parcela.predio?.nombre || '',
      tipoSueloId: parcela.tipoSueloId,
      tipoSueloNombre: parcela.tipoSuelo?.nombre || null,
      nombre: parcela.nombre,
      superficie: parcela.superficie.toString(),
      latitud: parcela.latitud ? parcela.latitud.toString() : null,
      longitud: parcela.longitud ? parcela.longitud.toString() : null,
      poligono: parcela.poligono || null,
      estado: parcela.estado,
      createdAt: parcela.createdAt.toISOString(),
      updatedAt: parcela.updatedAt.toISOString(),
    };
  }
}
