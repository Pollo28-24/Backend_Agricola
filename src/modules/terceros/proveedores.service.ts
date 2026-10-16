import { Injectable, HttpStatus } from '@nestjs/common';
import { AccionAuditoria, Prisma, Proveedor } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../prisma/audit.service';
import { CodigoError } from '../../common/errors/codigos-error.enum';
import { DomainError } from '../../common/errors/domain.error';
import { SoftDeleteUtil } from '../../common/utils/soft-delete.util';
import { PaginationUtil } from '../../common/utils/pagination.util';
import { CreateProveedorDto } from './dto/create-proveedor.dto';
import { UpdateProveedorDto } from './dto/update-proveedor.dto';
import { ProveedorResponseDto } from './dto/proveedor-response.dto';
import { FiltroProveedorDto } from './dto/filtro-proveedor.dto';
import { PaginatedResponseDto } from '../../common/dto/paginated-response.dto';

@Injectable()
export class ProveedoresService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Crea un nuevo proveedor para la empresa.
   * Valida unicidad de nombre en la empresa entre proveedores no eliminados.
   */
  async crearProveedor(
    empresaId: number,
    dto: CreateProveedorDto,
  ): Promise<ProveedorResponseDto> {
    const nombreNormalizado = dto.nombre.trim();

    const existente = await this.prisma.proveedor.findFirst({
      where: {
        empresaId,
        nombre: nombreNormalizado,
        deletedAt: null,
      },
    });

    if (existente) {
      throw new DomainError(
        CodigoError.CONFLICTO,
        `Ya existe un proveedor activo con el nombre '${nombreNormalizado}' en su empresa`,
        HttpStatus.CONFLICT,
      );
    }

    const nuevo = await this.prisma.proveedor.create({
      data: {
        empresaId,
        nombre: nombreNormalizado,
        rfc: dto.rfc?.trim().toUpperCase() || null,
        telefono: dto.telefono?.trim() || null,
        correo: dto.correo?.trim().toLowerCase() || null,
        direccion: dto.direccion?.trim() || null,
        activo: true,
      },
    });

    await this.auditService.registrar({
      empresaId,
      entidad: 'proveedor',
      entidadId: nuevo.id,
      accion: AccionAuditoria.CREAR,
      valoresNuevos: {
        id: nuevo.id,
        nombre: nuevo.nombre,
        rfc: nuevo.rfc,
        telefono: nuevo.telefono,
        correo: nuevo.correo,
        activo: nuevo.activo,
      },
    });

    return this.formatearProveedor(nuevo, 0);
  }

  /**
   * Listar proveedores de la empresa con paginación y filtros opcionales.
   */
  async listarProveedores(
    empresaId: number,
    filtro: FiltroProveedorDto,
  ): Promise<PaginatedResponseDto<ProveedorResponseDto>> {
    const pagination = PaginationUtil.normalizar(filtro);

    const where: Prisma.ProveedorWhereInput = {
      empresaId,
      deletedAt: null,
    };

    if (filtro.activo !== undefined) {
      where.activo = filtro.activo;
    }

    if (filtro.q && filtro.q.trim()) {
      const q = filtro.q.trim();
      where.OR = [
        { nombre: { contains: q } },
        { rfc: { contains: q } },
        { correo: { contains: q } },
      ];
    }

    const [total, items] = await Promise.all([
      this.prisma.proveedor.count({ where }),
      this.prisma.proveedor.findMany({
        where,
        include: {
          _count: {
            select: { gastos: true },
          },
        },
        orderBy: { nombre: 'asc' },
        skip: pagination.skip,
        take: pagination.limit,
      }),
    ]);

    return {
      data: items.map((p) => this.formatearProveedor(p, p._count.gastos)),
      meta: PaginationUtil.crearMeta(
        pagination.page,
        pagination.limit,
        total,
      ),
    };
  }

  /**
   * Obtener detalle de un proveedor por ID con aislamiento multi-tenant (RN-068).
   */
  async obtenerProveedorPorId(
    empresaId: number,
    id: number,
  ): Promise<ProveedorResponseDto> {
    const proveedor = await this.prisma.proveedor.findFirst({
      where: {
        id,
        empresaId,
        deletedAt: null,
      },
      include: {
        _count: {
          select: { gastos: true },
        },
      },
    });

    if (!proveedor) {
      throw new DomainError(
        CodigoError.RECURSO_NO_ENCONTRADO,
        `Proveedor con ID ${id} no encontrado en su empresa`,
        HttpStatus.NOT_FOUND,
      );
    }

    return this.formatearProveedor(proveedor, proveedor._count.gastos);
  }

  /**
   * Actualizar datos de un proveedor existente.
   */
  async actualizarProveedor(
    empresaId: number,
    id: number,
    dto: UpdateProveedorDto,
  ): Promise<ProveedorResponseDto> {
    const proveedor = await this.prisma.proveedor.findFirst({
      where: {
        id,
        empresaId,
        deletedAt: null,
      },
      include: {
        _count: {
          select: { gastos: true },
        },
      },
    });

    if (!proveedor) {
      throw new DomainError(
        CodigoError.RECURSO_NO_ENCONTRADO,
        `Proveedor con ID ${id} no encontrado en su empresa`,
        HttpStatus.NOT_FOUND,
      );
    }

    const dataToUpdate: Prisma.ProveedorUpdateInput = {};

    if (dto.nombre !== undefined) {
      const nuevoNombre = dto.nombre.trim();
      if (nuevoNombre !== proveedor.nombre) {
        const existente = await this.prisma.proveedor.findFirst({
          where: {
            empresaId,
            nombre: nuevoNombre,
            deletedAt: null,
            id: { not: id },
          },
        });

        if (existente) {
          throw new DomainError(
            CodigoError.CONFLICTO,
            `Ya existe un proveedor activo con el nombre '${nuevoNombre}' en su empresa`,
            HttpStatus.CONFLICT,
          );
        }
        dataToUpdate.nombre = nuevoNombre;
      }
    }

    if (dto.rfc !== undefined) {
      dataToUpdate.rfc = dto.rfc?.trim().toUpperCase() || null;
    }
    if (dto.telefono !== undefined) {
      dataToUpdate.telefono = dto.telefono?.trim() || null;
    }
    if (dto.correo !== undefined) {
      dataToUpdate.correo = dto.correo?.trim().toLowerCase() || null;
    }
    if (dto.direccion !== undefined) {
      dataToUpdate.direccion = dto.direccion?.trim() || null;
    }

    const actualizado = await this.prisma.proveedor.update({
      where: { id },
      data: dataToUpdate,
    });

    await this.auditService.registrar({
      empresaId,
      entidad: 'proveedor',
      entidadId: id,
      accion: AccionAuditoria.ACTUALIZAR,
      valoresAnteriores: {
        nombre: proveedor.nombre,
        rfc: proveedor.rfc,
        telefono: proveedor.telefono,
        correo: proveedor.correo,
        direccion: proveedor.direccion,
      },
      valoresNuevos: {
        nombre: actualizado.nombre,
        rfc: actualizado.rfc,
        telefono: actualizado.telefono,
        correo: actualizado.correo,
        direccion: actualizado.direccion,
      },
    });

    return this.formatearProveedor(actualizado, proveedor._count.gastos);
  }

  /**
   * Baja lógica o desactivación de un proveedor (RN-041).
   * Si tiene gastos en el historial se desactiva; si no tiene gastos se marca deletedAt con #baja{id}.
   */
  async eliminarProveedor(
    empresaId: number,
    id: number,
  ): Promise<{ message: string }> {
    const proveedor = await this.prisma.proveedor.findFirst({
      where: {
        id,
        empresaId,
        deletedAt: null,
      },
      include: {
        _count: {
          select: { gastos: true },
        },
      },
    });

    if (!proveedor) {
      throw new DomainError(
        CodigoError.RECURSO_NO_ENCONTRADO,
        `Proveedor con ID ${id} no encontrado en su empresa`,
        HttpStatus.NOT_FOUND,
      );
    }

    if (proveedor._count.gastos > 0) {
      await this.prisma.proveedor.update({
        where: { id },
        data: { activo: false },
      });

      await this.auditService.registrar({
        empresaId,
        entidad: 'proveedor',
        entidadId: id,
        accion: AccionAuditoria.ACTUALIZAR,
        valoresAnteriores: { activo: proveedor.activo },
        valoresNuevos: { activo: false },
      });

      return {
        message:
          'El proveedor cuenta con gastos en el historial; ha sido desactivado en lugar de eliminarse (RN-041)',
      };
    }

    const nombreLiberado = SoftDeleteUtil.generarValorBaja(
      proveedor.nombre,
      id,
      150,
    );

    await this.prisma.proveedor.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        activo: false,
        nombre: nombreLiberado,
      },
    });

    await this.auditService.registrar({
      empresaId,
      entidad: 'proveedor',
      entidadId: id,
      accion: AccionAuditoria.ELIMINAR,
      valoresAnteriores: {
        id: proveedor.id,
        nombre: proveedor.nombre,
        activo: proveedor.activo,
      },
    });

    return { message: 'Proveedor eliminado exitosamente' };
  }

  // =====================================================================
  // FORMATEADOR PRIVADO
  // =====================================================================

  private formatearProveedor(
    p: Proveedor,
    totalGastos: number,
  ): ProveedorResponseDto {
    return {
      id: p.id,
      empresaId: p.empresaId,
      nombre: p.nombre,
      rfc: p.rfc,
      telefono: p.telefono,
      correo: p.correo,
      direccion: p.direccion,
      activo: p.activo,
      totalGastos,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    };
  }
}
