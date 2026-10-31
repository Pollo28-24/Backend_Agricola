import { Injectable, HttpStatus } from '@nestjs/common';
import { AccionAuditoria, Cliente, Prisma, TipoCliente } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../prisma/audit.service';
import { CodigoError } from '../../common/errors/codigos-error.enum';
import { DomainError } from '../../common/errors/domain.error';
import { SoftDeleteUtil } from '../../common/utils/soft-delete.util';
import { PaginationUtil } from '../../common/utils/pagination.util';
import { EntityValidationUtil } from '../../common/utils/entity-validation.util';
import { CreateClienteDto } from './dto/create-cliente.dto';
import { UpdateClienteDto } from './dto/update-cliente.dto';
import { ClienteResponseDto } from './dto/cliente-response.dto';
import { FiltroClienteDto } from './dto/filtro-cliente.dto';
import { PaginatedResponseDto } from '../../common/dto/paginated-response.dto';

@Injectable()
export class ClientesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Crea un nuevo cliente para la empresa.
   * Valida unicidad de nombre en la empresa entre clientes activos.
   */
  async crearCliente(
    empresaId: number,
    dto: CreateClienteDto,
  ): Promise<ClienteResponseDto> {
    const nombreNormalizado = dto.nombre.trim();

    const existente = await this.prisma.cliente.findFirst({
      where: {
        empresaId,
        nombre: nombreNormalizado,
        deletedAt: null,
      },
    });

    if (existente) {
      throw new DomainError(
        CodigoError.CONFLICTO,
        `Ya existe un cliente activo con el nombre '${nombreNormalizado}' en su empresa`,
        HttpStatus.CONFLICT,
      );
    }

    const nuevo = await this.prisma.$transaction(async (tx) => {
      const creado = await tx.cliente.create({
        data: {
          empresaId,
          nombre: nombreNormalizado,
          rfc: dto.rfc?.trim().toUpperCase() || null,
          telefono: dto.telefono?.trim() || null,
          correo: dto.correo?.trim().toLowerCase() || null,
          tipo: dto.tipo ?? TipoCliente.OTRO,
          activo: true,
        },
      });

      await this.auditService.registrar(
        {
          empresaId,
          entidad: 'cliente',
          entidadId: creado.id,
          accion: AccionAuditoria.CREAR,
          valoresNuevos: {
            id: creado.id,
            nombre: creado.nombre,
            rfc: creado.rfc,
            tipo: creado.tipo,
            activo: creado.activo,
          },
        },
        tx,
      );

      return creado;
    });

    return this.formatearCliente(nuevo, 0);
  }

  /**
   * Listar clientes de la empresa con paginación y filtros opcionales.
   */
  async listarClientes(
    empresaId: number,
    filtro: FiltroClienteDto,
  ): Promise<PaginatedResponseDto<ClienteResponseDto>> {
    const pagination = PaginationUtil.normalizar(filtro);

    const where: Prisma.ClienteWhereInput = {
      empresaId,
      deletedAt: null,
    };

    if (filtro.activo !== undefined) {
      where.activo = filtro.activo;
    }

    if (filtro.tipo) {
      where.tipo = filtro.tipo;
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
      this.prisma.cliente.count({ where }),
      this.prisma.cliente.findMany({
        where,
        include: {
          _count: {
            select: { ventas: { where: { deletedAt: null } } },
          },
        },
        orderBy: { nombre: 'asc' },
        skip: pagination.skip,
        take: pagination.limit,
      }),
    ]);

    return {
      data: items.map((c) => this.formatearCliente(c, c._count.ventas)),
      meta: PaginationUtil.crearMeta(pagination.page, pagination.limit, total),
    };
  }

  /**
   * Obtener detalle de un cliente por ID con aislamiento multi-tenant (RN-068).
   */
  async obtenerClientePorId(
    empresaId: number,
    id: number,
  ): Promise<ClienteResponseDto> {
    const cliente = await this.prisma.cliente.findFirst({
      where: {
        id,
        empresaId,
        deletedAt: null,
      },
      include: {
        _count: {
          select: { ventas: { where: { deletedAt: null } } },
        },
      },
    });

    EntityValidationUtil.assertExists(
      cliente,
      `Cliente con ID ${id} no encontrado en su empresa`,
    );

    return this.formatearCliente(cliente, cliente._count.ventas);
  }

  /**
   * Actualizar datos de un cliente existente.
   */
  async actualizarCliente(
    empresaId: number,
    id: number,
    dto: UpdateClienteDto,
  ): Promise<ClienteResponseDto> {
    const cliente = await this.prisma.cliente.findFirst({
      where: {
        id,
        empresaId,
        deletedAt: null,
      },
      include: {
        _count: {
          select: { ventas: { where: { deletedAt: null } } },
        },
      },
    });

    EntityValidationUtil.assertExists(
      cliente,
      `Cliente con ID ${id} no encontrado en su empresa`,
    );

    const dataToUpdate: Prisma.ClienteUpdateInput = {};

    if (dto.nombre !== undefined) {
      const nuevoNombre = dto.nombre.trim();
      if (nuevoNombre !== cliente.nombre) {
        const existente = await this.prisma.cliente.findFirst({
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
            `Ya existe un cliente activo con el nombre '${nuevoNombre}' en su empresa`,
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
    if (dto.tipo !== undefined) {
      dataToUpdate.tipo = dto.tipo;
    }

    const actualizado = await this.prisma.$transaction(async (tx) => {
      const mod = await tx.cliente.update({
        where: { id },
        data: dataToUpdate,
      });

      await this.auditService.registrar(
        {
          empresaId,
          entidad: 'cliente',
          entidadId: id,
          accion: AccionAuditoria.ACTUALIZAR,
          valoresAnteriores: {
            nombre: cliente.nombre,
            rfc: cliente.rfc,
            telefono: cliente.telefono,
            correo: cliente.correo,
            tipo: cliente.tipo,
          },
          valoresNuevos: {
            nombre: mod.nombre,
            rfc: mod.rfc,
            telefono: mod.telefono,
            correo: mod.correo,
            tipo: mod.tipo,
          },
        },
        tx,
      );

      return mod;
    });

    return this.formatearCliente(actualizado, cliente._count.ventas);
  }

  /**
   * Baja lógica o desactivación de un cliente (RN-041).
   * Si tiene ventas en el historial se desactiva; si no tiene ventas se marca deletedAt con #baja{id}.
   */
  async eliminarCliente(
    empresaId: number,
    id: number,
  ): Promise<{ message: string }> {
    const cliente = await this.prisma.cliente.findFirst({
      where: {
        id,
        empresaId,
        deletedAt: null,
      },
      include: {
        _count: {
          select: { ventas: { where: { deletedAt: null } } },
        },
      },
    });

    EntityValidationUtil.assertExists(
      cliente,
      `Cliente con ID ${id} no encontrado en su empresa`,
    );

    if (cliente._count.ventas > 0) {
      await this.prisma.$transaction(async (tx) => {
        await tx.cliente.update({
          where: { id },
          data: { activo: false },
        });

        await this.auditService.registrar(
          {
            empresaId,
            entidad: 'cliente',
            entidadId: id,
            accion: AccionAuditoria.ACTUALIZAR,
            valoresAnteriores: { activo: cliente.activo },
            valoresNuevos: { activo: false },
          },
          tx,
        );
      });

      return {
        message:
          'El cliente cuenta con ventas en el historial; ha sido desactivado en lugar de eliminarse (RN-041)',
      };
    }

    const nombreLiberado = SoftDeleteUtil.generarValorBaja(
      cliente.nombre,
      id,
      150,
    );

    await this.prisma.$transaction(async (tx) => {
      await tx.cliente.update({
        where: { id },
        data: {
          deletedAt: new Date(),
          activo: false,
          nombre: nombreLiberado,
        },
      });

      await this.auditService.registrar(
        {
          empresaId,
          entidad: 'cliente',
          entidadId: id,
          accion: AccionAuditoria.ELIMINAR,
          valoresAnteriores: {
            id: cliente.id,
            nombre: cliente.nombre,
            activo: cliente.activo,
          },
        },
        tx,
      );
    });

    return { message: 'Cliente eliminado exitosamente' };
  }

  // =====================================================================
  // FORMATEADOR PRIVADO
  // =====================================================================

  private formatearCliente(
    c: Cliente,
    totalVentas: number,
  ): ClienteResponseDto {
    return {
      id: c.id,
      empresaId: c.empresaId,
      nombre: c.nombre,
      rfc: c.rfc,
      telefono: c.telefono,
      correo: c.correo,
      tipo: c.tipo,
      activo: c.activo,
      totalVentas,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    };
  }
}
