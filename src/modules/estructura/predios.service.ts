import { Injectable, HttpStatus } from '@nestjs/common';
import { AccionAuditoria } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../prisma/audit.service';
import { CreatePredioDto } from './dto/create-predio.dto';
import { UpdatePredioDto } from './dto/update-predio.dto';
import { PredioResponseDto } from './dto/predio-response.dto';
import { CodigoError } from '../../common/errors/codigos-error.enum';
import { DomainError } from '../../common/errors/domain.error';
import { SoftDeleteUtil } from '../../common/utils/soft-delete.util';
import { EntityValidationUtil } from '../../common/utils/entity-validation.util';

@Injectable()
export class PrediosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

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

    EntityValidationUtil.assertExists(predio, 'Predio no encontrado');

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

    EntityValidationUtil.assertExists(predioActual, 'Predio no encontrado');

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
        ...(dto.ubicacion !== undefined && {
          ubicacion: dto.ubicacion?.trim() || null,
        }),
        ...(dto.municipio !== undefined && {
          municipio: dto.municipio?.trim() || null,
        }),
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
        superficieTotal: predioActual.superficieTotal?.toString() ?? '',
      },
      valoresNuevos: {
        nombre: predioActualizado.nombre,
        superficieTotal: predioActualizado.superficieTotal?.toString() ?? '',
      },
    });

    return this.formatearPredio(
      predioActualizado,
      predioActualizado._count.parcelas,
    );
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

    EntityValidationUtil.assertExists(predio, 'Predio no encontrado');

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

    const nombreLiberado = SoftDeleteUtil.generarValorBaja(
      predio.nombre,
      predio.id,
      150,
    );

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
  // FORMATEADOR PRIVADO
  // =====================================================================

  private formatearPredio(
    predio: any,
    parcelasCount: number,
  ): PredioResponseDto {
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
}
