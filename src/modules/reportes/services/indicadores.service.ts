import { Injectable, HttpStatus } from '@nestjs/common';
import { Prisma, EstadoCiclo } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { DomainError } from '../../../common/errors/domain.error';
import { CodigoError } from '../../../common/errors/codigos-error.enum';
import { FiltroRentabilidadDto } from '../dto/filtro-rentabilidad.dto';
import { FiltroComparativoDto } from '../dto/filtro-comparativo.dto';
import { RentabilidadCicloItemDto } from '../dto/rentabilidad-ciclo-response.dto';
import { CostoPorCategoriaDto } from '../dto/costo-categoria-response.dto';
import { CostoPorActividadDto } from '../dto/costo-actividad-response.dto';
import { MermaDesgloseDto } from '../dto/merma-desglose-response.dto';
import { ComparativoParcelaItemDto } from '../dto/comparativo-parcela-response.dto';
import { PaginatedResponseDto } from '../../../common/dto/paginated-response.dto';
import { PaginationUtil } from '../../../common/utils/pagination.util';
import {
  IndicadoresMapper,
  FilaRentabilidadCiclo,
  FilaCostoCategoria,
  FilaCostoActividad,
  FilaMermaDesglose,
  FilaComparativoParcela,
} from '../mappers/indicadores.mapper';

@Injectable()
export class IndicadoresService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Listado paginado de rentabilidad de ciclos en 2 pasos (R4 / RN-066 / ADR-010):
   * 1. Paginación con Prisma sobre cicloProduccion para acotar el universo y aprovechar índices B-tree.
   * 2. Consulta SQL sobre v_rentabilidad_ciclo únicamente para los IDs seleccionados en la página.
   */
  async obtenerRentabilidad(
    empresaId: number,
    filtro: FiltroRentabilidadDto,
  ): Promise<PaginatedResponseDto<RentabilidadCicloItemDto>> {
    const page = filtro.page ?? 1;
    const limit = Math.min(filtro.limit ?? 10, 100);
    const skip = (page - 1) * limit;

    const whereCiclo: Prisma.CicloProduccionWhereInput = {
      empresaId,
      deletedAt: null,
      estado: filtro.estado
        ? filtro.estado
        : {
            in: [
              EstadoCiclo.ACTIVO,
              EstadoCiclo.SUSPENDIDO,
              EstadoCiclo.FINALIZADO,
            ],
          },
      ...(filtro.parcelaId ? { parcelaId: filtro.parcelaId } : {}),
      ...(filtro.fechaInicioDesde || filtro.fechaInicioHasta
        ? {
            fechaInicio: {
              ...(filtro.fechaInicioDesde
                ? { gte: new Date(filtro.fechaInicioDesde) }
                : {}),
              ...(filtro.fechaInicioHasta
                ? { lte: new Date(filtro.fechaInicioHasta) }
                : {}),
            },
          }
        : {}),
    };

    const total = await this.prisma.cicloProduccion.count({
      where: whereCiclo,
    });

    if (total === 0) {
      return {
        data: [],
        meta: PaginationUtil.crearMeta(page, limit, 0),
      };
    }

    const ciclos = await this.prisma.cicloProduccion.findMany({
      where: whereCiclo,
      skip,
      take: limit,
      orderBy: [{ fechaInicio: 'desc' }, { id: 'desc' }],
      include: {
        parcela: {
          select: {
            nombre: true,
            predio: { select: { nombre: true } },
          },
        },
        variedad: {
          select: {
            nombre: true,
            cultivo: { select: { nombre: true } },
          },
        },
      },
    });

    if (ciclos.length === 0) {
      return {
        data: [],
        meta: PaginationUtil.crearMeta(page, limit, total),
      };
    }

    const cicloIds = ciclos.map((c) => c.id);

    const filas: FilaRentabilidadCiclo[] = await this.prisma
      .$queryRaw(Prisma.sql`
      SELECT
        cicloId, empresaId, parcelaId, variedadId, estado, fechaInicio, superficieSembrada,
        costoTotal, kgCosechados, kgMerma, kgMermaCampo, kgNetos, kgVendidos, kgDisponibles,
        ingresos, totalFacturado, cobrado, ganancia, margenPct, roiPct, costoPorKg,
        precioPromedioKg, mermaPct, costoPorHectarea, rendimientoKgHa, porCobrar
      FROM v_rentabilidad_ciclo
      WHERE empresaId = ${empresaId}
        AND cicloId IN (${Prisma.join(cicloIds)})
    `);

    const mapFilas = new Map<number, FilaRentabilidadCiclo>();
    for (const fila of filas) {
      mapFilas.set(Number(fila.cicloId), fila);
    }

    const data: RentabilidadCicloItemDto[] = ciclos.map((c) => {
      const fila = mapFilas.get(c.id);
      return IndicadoresMapper.toRentabilidadItem(c, fila);
    });

    return {
      data,
      meta: PaginationUtil.crearMeta(page, limit, total),
    };
  }

  /**
   * Obtiene la rentabilidad detallada de un ciclo específico (cualquier estado excepto borrado).
   */
  async obtenerRentabilidadCiclo(
    empresaId: number,
    cicloId: number,
  ): Promise<RentabilidadCicloItemDto> {
    const ciclo = await this.prisma.cicloProduccion.findFirst({
      where: { id: cicloId, empresaId, deletedAt: null },
      include: {
        parcela: {
          select: {
            nombre: true,
            predio: { select: { nombre: true } },
          },
        },
        variedad: {
          select: {
            nombre: true,
            cultivo: { select: { nombre: true } },
          },
        },
      },
    });

    if (!ciclo) {
      throw new DomainError(
        CodigoError.RECURSO_NO_ENCONTRADO,
        'Ciclo de producción no encontrado o ajeno a la empresa',
        HttpStatus.NOT_FOUND,
      );
    }

    const filas: FilaRentabilidadCiclo[] = await this.prisma
      .$queryRaw(Prisma.sql`
      SELECT
        cicloId, empresaId, parcelaId, variedadId, estado, fechaInicio, superficieSembrada,
        costoTotal, kgCosechados, kgMerma, kgMermaCampo, kgNetos, kgVendidos, kgDisponibles,
        ingresos, totalFacturado, cobrado, ganancia, margenPct, roiPct, costoPorKg,
        precioPromedioKg, mermaPct, costoPorHectarea, rendimientoKgHa, porCobrar
      FROM v_rentabilidad_ciclo
      WHERE empresaId = ${empresaId}
        AND cicloId = ${cicloId}
    `);

    const fila = filas.length > 0 ? filas[0] : null;
    return IndicadoresMapper.toRentabilidadItem(ciclo, fila);
  }

  /**
   * Desglose de costos por categoría raíz de gasto para un ciclo.
   */
  async obtenerCostosPorCategoria(
    empresaId: number,
    cicloId: number,
  ): Promise<CostoPorCategoriaDto[]> {
    await this.verificarExistenciaCiclo(empresaId, cicloId);

    const filas: FilaCostoCategoria[] = await this.prisma.$queryRaw(Prisma.sql`
      SELECT
        cicloId, empresaId, categoriaRaizId, categoriaRaiz, monto, porcentaje
      FROM v_costo_por_categoria
      WHERE empresaId = ${empresaId}
        AND cicloId = ${cicloId}
      ORDER BY monto DESC
    `);

    return IndicadoresMapper.toCostoCategoriaList(filas);
  }

  /**
   * Desglose de costos por tipo de actividad operativa para un ciclo.
   */
  async obtenerCostosPorActividad(
    empresaId: number,
    cicloId: number,
  ): Promise<CostoPorActividadDto[]> {
    await this.verificarExistenciaCiclo(empresaId, cicloId);

    const filas: FilaCostoActividad[] = await this.prisma.$queryRaw(Prisma.sql`
      SELECT
        cicloId, empresaId, tipoActividadId, tipoActividad, numeroActividades, horasTotales, costoTotal
      FROM v_costo_por_actividad
      WHERE empresaId = ${empresaId}
        AND cicloId = ${cicloId}
      ORDER BY costoTotal DESC
    `);

    return IndicadoresMapper.toCostoActividadList(filas);
  }

  /**
   * Desglose de mermas registradas por motivo y etapa para un ciclo.
   */
  async obtenerMermasDesglose(
    empresaId: number,
    cicloId: number,
  ): Promise<MermaDesgloseDto[]> {
    await this.verificarExistenciaCiclo(empresaId, cicloId);

    const filas: FilaMermaDesglose[] = await this.prisma.$queryRaw(Prisma.sql`
      SELECT
        cicloId, empresaId, motivo, etapa, kgMerma
      FROM v_merma_desglose
      WHERE empresaId = ${empresaId}
        AND cicloId = ${cicloId}
      ORDER BY kgMerma DESC
    `);

    return IndicadoresMapper.toMermaDesgloseList(filas);
  }

  /**
   * Comparativo cronológico de ciclos en una parcela (LAG analítico).
   * Por defecto solo FINALIZADO. Con incluirActivos=true añade ACTIVO y SUSPENDIDO.
   */
  async obtenerComparativoParcela(
    empresaId: number,
    parcelaId: number,
    filtro: FiltroComparativoDto,
  ): Promise<PaginatedResponseDto<ComparativoParcelaItemDto>> {
    const parcela = await this.prisma.parcela.findFirst({
      where: { id: parcelaId, predio: { empresaId }, deletedAt: null },
    });

    if (!parcela) {
      throw new DomainError(
        CodigoError.RECURSO_NO_ENCONTRADO,
        'Parcela no encontrada o ajena a la empresa',
        HttpStatus.NOT_FOUND,
      );
    }

    const estados = filtro.incluirActivos
      ? [EstadoCiclo.ACTIVO, EstadoCiclo.SUSPENDIDO, EstadoCiclo.FINALIZADO]
      : [EstadoCiclo.FINALIZADO];

    const countRes: Array<{ total: bigint | number }> = await this.prisma
      .$queryRaw(Prisma.sql`
      SELECT COUNT(*) AS total
      FROM v_comparativo_parcela
      WHERE empresaId = ${empresaId}
        AND parcelaId = ${parcelaId}
        AND estado IN (${Prisma.join(estados)})
    `);

    const total = Number(countRes[0]?.total ?? 0);
    const page = filtro.page ?? 1;
    const limit = Math.min(filtro.limit ?? 10, 100);
    const offset = (page - 1) * limit;

    if (total === 0) {
      return {
        data: [],
        meta: PaginationUtil.crearMeta(page, limit, 0),
      };
    }

    const filas: FilaComparativoParcela[] = await this.prisma
      .$queryRaw(Prisma.sql`
      SELECT
        cicloId, empresaId, parcelaId, variedadId, estado, fechaInicio, superficieSembrada,
        costoTotal, kgCosechados, kgMerma, kgMermaCampo, kgNetos, kgVendidos, kgDisponibles,
        ingresos, totalFacturado, cobrado, ganancia, margenPct, roiPct, costoPorKg,
        precioPromedioKg, mermaPct, costoPorHectarea, rendimientoKgHa, porCobrar,
        margenPctCicloAnterior, costoPorKgCicloAnterior, gananciaCicloAnterior
      FROM v_comparativo_parcela
      WHERE empresaId = ${empresaId}
        AND parcelaId = ${parcelaId}
        AND estado IN (${Prisma.join(estados)})
      ORDER BY fechaInicio DESC, cicloId DESC
      LIMIT ${limit} OFFSET ${offset}
    `);

    const cicloIds = filas.map((f) => Number(f.cicloId));
    const ciclosInfo = await this.prisma.cicloProduccion.findMany({
      where: { id: { in: cicloIds } },
      include: {
        parcela: {
          select: {
            nombre: true,
            predio: { select: { nombre: true } },
          },
        },
        variedad: {
          select: {
            nombre: true,
            cultivo: { select: { nombre: true } },
          },
        },
      },
    });

    const cicloMap = new Map(ciclosInfo.map((c) => [c.id, c]));

    const data: ComparativoParcelaItemDto[] = filas.map((fila) => {
      const c = cicloMap.get(Number(fila.cicloId));
      if (!c) {
        throw new DomainError(
          CodigoError.ERROR_INTERNO,
          `Inconsistencia al resolver metadatos del ciclo ${fila.cicloId}`,
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }
      return IndicadoresMapper.toComparativoItem(c, fila);
    });

    return {
      data,
      meta: PaginationUtil.crearMeta(page, limit, total),
    };
  }

  /**
   * Validación estricta de pertenencia y no borrado lógico para ciclos.
   */
  private async verificarExistenciaCiclo(
    empresaId: number,
    cicloId: number,
  ): Promise<void> {
    const ciclo = await this.prisma.cicloProduccion.findFirst({
      where: { id: cicloId, empresaId, deletedAt: null },
      select: { id: true },
    });

    if (!ciclo) {
      throw new DomainError(
        CodigoError.RECURSO_NO_ENCONTRADO,
        'Ciclo de producción no encontrado o ajeno a la empresa',
        HttpStatus.NOT_FOUND,
      );
    }
  }
}
