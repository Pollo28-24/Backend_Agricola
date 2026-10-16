import { Injectable, HttpStatus } from '@nestjs/common';
import { AccionAuditoria, EstadoCiclo, EstadoParcela } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../prisma/audit.service';
import { CreatePredioDto } from './dto/create-predio.dto';
import { UpdatePredioDto } from './dto/update-predio.dto';
import { PredioResponseDto } from './dto/predio-response.dto';
import { CreateParcelaDto } from './dto/create-parcela.dto';
import { UpdateParcelaDto } from './dto/update-parcela.dto';
import { ParcelaResponseDto } from './dto/parcela-response.dto';
import { CodigoError } from '../../common/errors/codigos-error.enum';
import { DomainError } from '../../common/errors/domain.error';

@Injectable()
export class EstructuraService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  // =====================================================================
  // PREDIOS
  // =====================================================================

  /**
   * Alta de nuevo predio agrícola para la empresa (RN-003).
   * Valida unicidad de nombre en la empresa entre los predios activos.
   */
  async crearPredio(
    empresaId: number,
    dto: CreatePredioDto,
  ): Promise<PredioResponseDto> {
    const nombreNormalizado = dto.nombre.trim();

    const predioExistente = await this.prisma.predio.findFirst({
      where: {
        empresaId,
        nombre: nombreNormalizado,
        deletedAt: null,
      },
    });

    if (predioExistente) {
      throw new DomainError(
        CodigoError.CONFLICTO,
        `Ya existe un predio activo con el nombre '${nombreNormalizado}' en su empresa`,
        HttpStatus.CONFLICT,
      );
    }

    const nuevoPredio = await this.prisma.predio.create({
      data: {
        empresaId,
        nombre: nombreNormalizado,
        ubicacion: dto.ubicacion?.trim() || null,
        municipio: dto.municipio?.trim() || null,
        entidadFederativa: dto.entidadFederativa?.trim() || null,
        superficieTotal: dto.superficieTotal,
        latitud: dto.latitud ?? null,
        longitud: dto.longitud ?? null,
      },
    });

    await this.auditService.registrar({
      empresaId,
      entidad: 'predio',
      entidadId: nuevoPredio.id,
      accion: AccionAuditoria.CREAR,
      valoresNuevos: {
        id: nuevoPredio.id,
        nombre: nuevoPredio.nombre,
        superficieTotal: nuevoPredio.superficieTotal.toString(),
      },
    });

    return this.formatearPredio(nuevoPredio, 0);
  }

  /**
   * Listar predios activos de la empresa con conteo de parcelas activas.
   */
  async listarPredios(empresaId: number): Promise<PredioResponseDto[]> {
    const predios = await this.prisma.predio.findMany({
      where: {
        empresaId,
        deletedAt: null,
      },
      include: {
        _count: {
          select: {
            parcelas: {
              where: { deletedAt: null },
            },
          },
        },
      },
      orderBy: { nombre: 'asc' },
    });

    return predios.map((p) => this.formatearPredio(p, p._count.parcelas));
  }

  /**
   * Consultar predio por ID con aislamiento multi-tenant (RN-068).
   */
  async obtenerPredioPorId(
    empresaId: number,
    predioId: number,
  ): Promise<PredioResponseDto> {
    const predio = await this.prisma.predio.findFirst({
      where: {
        id: predioId,
        empresaId,
        deletedAt: null,
      },
      include: {
        _count: {
          select: {
            parcelas: {
              where: { deletedAt: null },
            },
          },
        },
      },
    });

    if (!predio) {
      throw new DomainError(
        CodigoError.RECURSO_NO_ENCONTRADO,
        'Predio no encontrado',
        HttpStatus.NOT_FOUND,
      );
    }

    return this.formatearPredio(predio, predio._count.parcelas);
  }

  /**
   * Actualizar predio de la empresa.
   */
  async actualizarPredio(
    empresaId: number,
    predioId: number,
    dto: UpdatePredioDto,
  ): Promise<PredioResponseDto> {
    const predioActual = await this.prisma.predio.findFirst({
      where: {
        id: predioId,
        empresaId,
        deletedAt: null,
      },
    });

    if (!predioActual) {
      throw new DomainError(
        CodigoError.RECURSO_NO_ENCONTRADO,
        'Predio no encontrado',
        HttpStatus.NOT_FOUND,
      );
    }

    if (dto.nombre && dto.nombre.trim() !== predioActual.nombre) {
      const duplicado = await this.prisma.predio.findFirst({
        where: {
          empresaId,
          nombre: dto.nombre.trim(),
          deletedAt: null,
          id: { not: predioId },
        },
      });

      if (duplicado) {
        throw new DomainError(
          CodigoError.CONFLICTO,
          `Ya existe otro predio con el nombre '${dto.nombre.trim()}'`,
          HttpStatus.CONFLICT,
        );
      }
    }

    const predioActualizado = await this.prisma.predio.update({
      where: { id: predioId },
      data: {
        ...(dto.nombre && { nombre: dto.nombre.trim() }),
        ...(dto.ubicacion !== undefined && { ubicacion: dto.ubicacion?.trim() || null }),
        ...(dto.municipio !== undefined && { municipio: dto.municipio?.trim() || null }),
        ...(dto.entidadFederativa !== undefined && {
          entidadFederativa: dto.entidadFederativa?.trim() || null,
        }),
        ...(dto.superficieTotal !== undefined && {
          superficieTotal: dto.superficieTotal,
        }),
        ...(dto.latitud !== undefined && { latitud: dto.latitud }),
        ...(dto.longitud !== undefined && { longitud: dto.longitud }),
      },
      include: {
        _count: {
          select: {
            parcelas: {
              where: { deletedAt: null },
            },
          },
        },
      },
    });

    await this.auditService.registrar({
      empresaId,
      entidad: 'predio',
      entidadId: predioId,
      accion: AccionAuditoria.ACTUALIZAR,
      valoresAnteriores: {
        nombre: predioActual.nombre,
        superficieTotal: predioActual.superficieTotal.toString(),
      },
      valoresNuevos: {
        nombre: predioActualizado.nombre,
        superficieTotal: predioActualizado.superficieTotal.toString(),
      },
    });

    return this.formatearPredio(predioActualizado, predioActualizado._count.parcelas);
  }

  /**
   * Baja lógica de predio y liberación de índice único de nombre (RN-041, Sección 3.11).
   * Valida que no tenga parcelas activas asociadas.
   */
  async eliminarPredio(
    empresaId: number,
    predioId: number,
  ): Promise<{ mensaje: string }> {
    const predio = await this.prisma.predio.findFirst({
      where: {
        id: predioId,
        empresaId,
        deletedAt: null,
      },
    });

    if (!predio) {
      throw new DomainError(
        CodigoError.RECURSO_NO_ENCONTRADO,
        'Predio no encontrado',
        HttpStatus.NOT_FOUND,
      );
    }

    const parcelasCount = await this.prisma.parcela.count({
      where: {
        predioId,
        deletedAt: null,
      },
    });

    if (parcelasCount > 0) {
      throw new DomainError(
        CodigoError.CONFLICTO,
        `No se puede eliminar el predio '${predio.nombre}' porque contiene ${parcelasCount} parcela(s) activa(s). Debe eliminar primero sus parcelas.`,
        HttpStatus.CONFLICT,
      );
    }

    const sufijo = `#baja${predio.id}`;
    const nombreBase = predio.nombre.slice(0, 120 - sufijo.length);
    const nombreLiberado = `${nombreBase}${sufijo}`;

    await this.prisma.predio.update({
      where: { id: predioId },
      data: {
        deletedAt: new Date(),
        nombre: nombreLiberado,
      },
    });

    await this.auditService.registrar({
      empresaId,
      entidad: 'predio',
      entidadId: predioId,
      accion: AccionAuditoria.ELIMINAR,
      valoresAnteriores: {
        id: predio.id,
        nombreOriginal: predio.nombre,
      },
    });

    return { mensaje: 'Predio eliminado exitosamente' };
  }

  // =====================================================================
  // PARCELAS
  // =====================================================================

  /**
   * Alta de nueva parcela con validación de límite de plan (RN-037),
   * pertenencia del predio al tenant (RN-068), unicidad de nombre y GeoJSON.
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
          deletedAt: null,
        },
      });

      if (parcelasActivas >= empresa.plan.maxParcelas) {
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

      if (!predio) {
        throw new DomainError(
          CodigoError.RECURSO_NO_ENCONTRADO,
          'El predio especificado no existe o no pertenece a su empresa',
          HttpStatus.NOT_FOUND,
        );
      }

      // 3. Validar tipo de suelo si se especifica
      if (dto.tipoSueloId) {
        const tipoSuelo = await tx.tipoSuelo.findUnique({
          where: { id: dto.tipoSueloId },
        });
        if (!tipoSuelo) {
          throw new DomainError(
            CodigoError.RECURSO_NO_ENCONTRADO,
            'El tipo de suelo especificado no existe',
            HttpStatus.NOT_FOUND,
          );
        }
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

    if (!parcela) {
      throw new DomainError(
        CodigoError.RECURSO_NO_ENCONTRADO,
        'Parcela no encontrada',
        HttpStatus.NOT_FOUND,
      );
    }

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

    if (!parcelaActual) {
      throw new DomainError(
        CodigoError.RECURSO_NO_ENCONTRADO,
        'Parcela no encontrada',
        HttpStatus.NOT_FOUND,
      );
    }

    const targetPredioId = dto.predioId ?? parcelaActual.predioId;

    if (dto.predioId && dto.predioId !== parcelaActual.predioId) {
      const nuevoPredio = await this.prisma.predio.findFirst({
        where: { id: dto.predioId, empresaId, deletedAt: null },
      });
      if (!nuevoPredio) {
        throw new DomainError(
          CodigoError.RECURSO_NO_ENCONTRADO,
          'El nuevo predio especificado no existe o no pertenece a su empresa',
          HttpStatus.NOT_FOUND,
        );
      }
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
      if (!tipoSuelo) {
        throw new DomainError(
          CodigoError.RECURSO_NO_ENCONTRADO,
          'El tipo de suelo especificado no existe',
          HttpStatus.NOT_FOUND,
        );
      }
    }

    const parcelaActualizada = await this.prisma.parcela.update({
      where: { id: parcelaId },
      data: {
        ...(dto.predioId && { predioId: dto.predioId }),
        ...(dto.tipoSueloId !== undefined && { tipoSueloId: dto.tipoSueloId }),
        ...(dto.nombre && { nombre: dto.nombre.trim() }),
        ...(dto.superficie !== undefined && { superficie: dto.superficie }),
        ...(dto.latitud !== undefined && { latitud: dto.latitud }),
        ...(dto.longitud !== undefined && { longitud: dto.longitud }),
        ...(dto.poligono !== undefined && { poligono: dto.poligono ?? undefined }),
        ...(dto.estado && { estado: dto.estado }),
      },
      include: {
        predio: true,
        tipoSuelo: true,
      },
    });

    await this.auditService.registrar({
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

    if (!parcela) {
      throw new DomainError(
        CodigoError.RECURSO_NO_ENCONTRADO,
        'Parcela no encontrada',
        HttpStatus.NOT_FOUND,
      );
    }

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

    const sufijo = `#baja${parcela.id}`;
    const nombreBase = parcela.nombre.slice(0, 120 - sufijo.length);
    const nombreLiberado = `${nombreBase}${sufijo}`;

    await this.prisma.parcela.update({
      where: { id: parcelaId },
      data: {
        deletedAt: new Date(),
        estado: EstadoParcela.INACTIVA,
        nombre: nombreLiberado,
      },
    });

    await this.auditService.registrar({
      empresaId,
      entidad: 'parcela',
      entidadId: parcelaId,
      accion: AccionAuditoria.ELIMINAR,
      valoresAnteriores: {
        id: parcela.id,
        nombreOriginal: parcela.nombre,
      },
    });

    return { mensaje: 'Parcela dada de baja exitosamente' };
  }

  // =====================================================================
  // FORMATEADORES PRIVADOS
  // =====================================================================

  private formatearPredio(predio: any, parcelasCount: number): PredioResponseDto {
    return {
      id: predio.id,
      empresaId: predio.empresaId,
      nombre: predio.nombre,
      ubicacion: predio.ubicacion,
      municipio: predio.municipio,
      entidadFederativa: predio.entidadFederativa,
      superficieTotal: predio.superficieTotal.toString(),
      latitud: predio.latitud ? predio.latitud.toString() : null,
      longitud: predio.longitud ? predio.longitud.toString() : null,
      parcelasCount,
      createdAt: predio.createdAt.toISOString(),
      updatedAt: predio.updatedAt.toISOString(),
    };
  }

  private formatearParcela(parcela: any): ParcelaResponseDto {
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
