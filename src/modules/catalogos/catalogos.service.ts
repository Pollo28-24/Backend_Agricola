import { Injectable, HttpStatus } from '@nestjs/common';
import { AccionAuditoria, TipoUnidad } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../prisma/audit.service';
import { CultivoResponseDto } from './dto/cultivo-response.dto';
import { VariedadResponseDto } from './dto/variedad-response.dto';
import { TipoSueloResponseDto } from './dto/tipo-suelo-response.dto';
import { UnidadMedidaResponseDto } from './dto/unidad-medida-response.dto';
import { TipoActividadResponseDto } from './dto/tipo-actividad-response.dto';
import { MotivoMermaResponseDto } from './dto/motivo-merma-response.dto';
import {
  CreateCategoriaGastoDto,
  CategoriaGastoResponseDto,
} from './dto/categoria-gasto.dto';
import { CodigoError } from '../../common/errors/codigos-error.enum';
import { DomainError } from '../../common/errors/domain.error';
import { EntityValidationUtil } from '../../common/utils/entity-validation.util';

@Injectable()
export class CatalogosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Catálogo de Cultivos agrícolas globales del sistema.
   */
  async obtenerCultivos(activo?: boolean): Promise<CultivoResponseDto[]> {
    return this.prisma.cultivo.findMany({
      where: {
        ...(activo !== undefined ? { activo } : {}),
      },
      orderBy: { nombre: 'asc' },
    });
  }

  /**
   * Catálogo de Variedades por cultivo o generales.
   */
  async obtenerVariedades(
    cultivoId?: number,
    activo?: boolean,
  ): Promise<VariedadResponseDto[]> {
    if (cultivoId) {
      const cultivo = await this.prisma.cultivo.findUnique({
        where: { id: cultivoId },
      });
      EntityValidationUtil.assertExists(cultivo, 'Cultivo no encontrado');
    }

    return this.prisma.variedad.findMany({
      where: {
        ...(cultivoId ? { cultivoId } : {}),
        ...(activo !== undefined ? { activo } : {}),
      },
      orderBy: { nombre: 'asc' },
    });
  }

  /**
   * Catálogo de Tipos agrológicos de suelo.
   */
  async obtenerTiposSuelo(): Promise<TipoSueloResponseDto[]> {
    return this.prisma.tipoSuelo.findMany({
      orderBy: { nombre: 'asc' },
    });
  }

  /**
   * Catálogo de Unidades de medida (filtrables por magnitud física).
   */
  async obtenerUnidadesMedida(
    tipo?: TipoUnidad,
  ): Promise<UnidadMedidaResponseDto[]> {
    const unidades = await this.prisma.unidadMedida.findMany({
      where: {
        ...(tipo ? { tipo } : {}),
      },
      orderBy: { codigo: 'asc' },
    });

    return unidades.map((u) => ({
      id: u.id,
      codigo: u.codigo,
      nombre: u.nombre,
      tipo: u.tipo,
      factorABase: u.factorABase.toString(),
    }));
  }

  /**
   * Catálogo de Tipos de actividad agrícola estándar.
   */
  async obtenerTiposActividad(
    activo?: boolean,
  ): Promise<TipoActividadResponseDto[]> {
    return this.prisma.tipoActividad.findMany({
      where: {
        ...(activo !== undefined ? { activo } : {}),
      },
      orderBy: { nombre: 'asc' },
    });
  }

  /**
   * Catálogo de Motivos de merma y pérdida en cosecha/poscosecha.
   */
  async obtenerMotivosMerma(
    activo?: boolean,
  ): Promise<MotivoMermaResponseDto[]> {
    return this.prisma.motivoMerma.findMany({
      where: {
        ...(activo !== undefined ? { activo } : {}),
      },
      orderBy: { nombre: 'asc' },
    });
  }

  /**
   * Consulta fusionada de categorías de gasto:
   * Retorna las globales del sistema (empresaId: null) MÁS las personalizadas de la empresa (RN-047).
   * Organizadas en árbol jerárquico de máximo dos niveles (RN-048).
   */
  async obtenerCategoriasGasto(
    empresaId: number,
  ): Promise<CategoriaGastoResponseDto[]> {
    const todas = await this.prisma.categoriaGasto.findMany({
      where: {
        activo: true,
        OR: [{ empresaId: null }, { empresaId }],
      },
      include: {
        hijas: {
          where: {
            activo: true,
            OR: [{ empresaId: null }, { empresaId }],
          },
          orderBy: { nombre: 'asc' },
        },
      },
      orderBy: { nombre: 'asc' },
    });

    // Filtramos las categorías de nivel 1 (raíces sin padre) y mapeamos sus hijas de nivel 2
    const raices = todas.filter((c) => c.categoriaPadreId === null);

    return raices.map((c) => this.mapearCategoria(c, true));
  }

  /**
   * Creación de categoría personalizada para la empresa (RN-047).
   * Valida estrictamente la RN-048:
   * - No puede formar ciclos.
   * - Admite como máximo dos niveles: categoría (raíz) y subcategoría (hija de raíz).
   * - No se puede crear una subcategoría de una subcategoría.
   */
  async crearCategoriaGasto(
    empresaId: number,
    dto: CreateCategoriaGastoDto,
  ): Promise<CategoriaGastoResponseDto> {
    const nombreNormalizado = dto.nombre.trim();

    // 1. Si tiene categoría padre, validar existencia, visibilidad y límite de 2 niveles (RN-048)
    if (dto.categoriaPadreId) {
      const padre = await this.prisma.categoriaGasto.findUnique({
        where: { id: dto.categoriaPadreId },
      });

      if (
        !padre ||
        !padre.activo ||
        (padre.empresaId !== null && padre.empresaId !== empresaId)
      ) {
        throw new DomainError(
          CodigoError.RECURSO_NO_ENCONTRADO,
          'La categoría padre especificada no existe o no pertenece a su empresa',
          HttpStatus.NOT_FOUND,
        );
      }

      // RN-048: Si el padre ya tiene padre, sería un tercer nivel (prohibido)
      if (padre.categoriaPadreId !== null) {
        throw new DomainError(
          CodigoError.PETICION_INVALIDA,
          'La jerarquía de categorías admite como máximo dos niveles (categoría y subcategoría). No es posible crear subniveles adicionales (RN-048).',
          HttpStatus.BAD_REQUEST,
        );
      }
    }

    // 2. Validar que no exista una categoría activa con el mismo nombre en la empresa y mismo nivel
    const duplicada = await this.prisma.categoriaGasto.findFirst({
      where: {
        nombre: nombreNormalizado,
        activo: true,
        categoriaPadreId: dto.categoriaPadreId || null,
        OR: [{ empresaId: null }, { empresaId }],
      },
    });

    if (duplicada) {
      throw new DomainError(
        CodigoError.CONFLICTO,
        `Ya existe una categoría o subcategoría activa con el nombre '${nombreNormalizado}' en este nivel`,
        HttpStatus.CONFLICT,
      );
    }

    // 3. Crear categoría personalizada asociada al tenant (RN-047)
    const nuevaCategoria = await this.prisma.categoriaGasto.create({
      data: {
        empresaId,
        nombre: nombreNormalizado,
        descripcion: dto.descripcion?.trim() || null,
        categoriaPadreId: dto.categoriaPadreId || null,
        activo: true,
      },
    });

    // 4. Registrar auditoría (RN-043, RN-074)
    await this.auditService.registrar({
      empresaId,
      entidad: 'categoria_gasto',
      entidadId: nuevaCategoria.id,
      accion: AccionAuditoria.CREAR,
      valoresNuevos: {
        id: nuevaCategoria.id,
        nombre: nuevaCategoria.nombre,
        categoriaPadreId: nuevaCategoria.categoriaPadreId,
      },
    });

    return this.mapearCategoria(nuevaCategoria, false);
  }

  private mapearCategoria(
    c: any,
    incluirHijas: boolean,
  ): CategoriaGastoResponseDto {
    return {
      id: c.id,
      empresaId: c.empresaId,
      esPersonalizada: c.empresaId !== null,
      categoriaPadreId: c.categoriaPadreId,
      nombre: c.nombre,
      descripcion: c.descripcion,
      activo: c.activo,
      ...(incluirHijas && c.hijas
        ? {
            subcategorias: c.hijas.map((h: any) =>
              this.mapearCategoria(h, false),
            ),
          }
        : {}),
    };
  }
}
