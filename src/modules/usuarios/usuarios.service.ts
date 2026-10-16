import { Injectable, HttpStatus } from '@nestjs/common';
import { AccionAuditoria } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../prisma/audit.service';
import { PasswordService } from '../../common/services/password.service';
import { CreateUsuarioDto } from './dto/create-usuario.dto';
import { UpdateUsuarioDto } from './dto/update-usuario.dto';
import { UsuarioResponseDto } from './dto/usuario-response.dto';
import { CodigoError } from '../../common/errors/codigos-error.enum';
import { DomainError } from '../../common/errors/domain.error';

@Injectable()
export class UsuariosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly passwordService: PasswordService,
  ) {}

  /**
   * Alta de nuevo usuario respetando el límite de usuarios del plan comercial (RN-037).
   * Valida correo único (RN-002), rol del MVP (RN-061) y cifra con Argon2id (RN-040).
   */
  async crear(
    empresaId: number,
    dto: CreateUsuarioDto,
  ): Promise<UsuarioResponseDto> {
    const correoNormalizado = dto.correo.toLowerCase().trim();

    // 1. Validar límite de usuarios del plan (RN-037)
    const empresa = await this.prisma.empresa.findUnique({
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

    const usuariosActivos = await this.prisma.usuario.count({
      where: {
        empresaId,
        activo: true,
        deletedAt: null,
      },
    });

    if (usuariosActivos >= empresa.plan.maxUsuarios) {
      throw new DomainError(
        CodigoError.LIMITE_PLAN_EXCEDIDO,
        `Su plan comercial '${empresa.plan.nombre}' permite un máximo de ${empresa.plan.maxUsuarios} usuarios activos. Actualice su plan para invitar a más colaboradores.`,
        HttpStatus.CONFLICT,
        {
          maxUsuarios: empresa.plan.maxUsuarios,
          usuariosActuales: usuariosActivos,
        },
      );
    }

    // 2. Validar que el correo no esté ocupado por un usuario activo en el sistema (RN-002)
    const usuarioExistente = await this.prisma.usuario.findUnique({
      where: { correo: correoNormalizado },
    });

    if (usuarioExistente && usuarioExistente.deletedAt === null) {
      throw new DomainError(
        CodigoError.CONFLICTO,
        `Ya existe un usuario registrado con el correo ${correoNormalizado}`,
        HttpStatus.CONFLICT,
      );
    }

    // 3. Validar existencia del rol (RN-061)
    const rol = await this.prisma.rol.findUnique({
      where: { codigo: dto.rolCodigo },
    });

    if (!rol) {
      throw new DomainError(
        CodigoError.RECURSO_NO_ENCONTRADO,
        `El rol '${dto.rolCodigo}' no existe en el sistema`,
        HttpStatus.NOT_FOUND,
      );
    }

    // 4. Cifrado de contraseña (RN-040)
    const contrasenaHash = await this.passwordService.hash(dto.contrasena);

    // 5. Creación del usuario asociado a la empresa (RN-003)
    const nuevoUsuario = await this.prisma.usuario.create({
      data: {
        empresaId,
        rolId: rol.id,
        nombre: dto.nombre.trim(),
        apellido: dto.apellido.trim(),
        correo: correoNormalizado,
        contrasenaHash,
        telefono: dto.telefono?.trim() || null,
        activo: true,
      },
      include: {
        rol: {
          include: {
            permisos: {
              include: {
                permiso: true,
              },
            },
          },
        },
      },
    });

    // 6. Auditoría (RN-043, RN-074)
    await this.auditService.registrar({
      empresaId,
      entidad: 'usuario',
      entidadId: nuevoUsuario.id,
      accion: AccionAuditoria.CREAR,
      valoresNuevos: {
        id: nuevoUsuario.id,
        nombre: nuevoUsuario.nombre,
        apellido: nuevoUsuario.apellido,
        correo: nuevoUsuario.correo,
        rol: nuevoUsuario.rol.codigo,
      },
    });

    return this.formatearRespuesta(nuevoUsuario);
  }

  /**
   * Lista usuarios de la empresa actual (RN-003).
   */
  async listar(
    empresaId: number,
    activo?: boolean,
  ): Promise<UsuarioResponseDto[]> {
    const usuarios = await this.prisma.usuario.findMany({
      where: {
        empresaId,
        deletedAt: null,
        ...(activo !== undefined ? { activo } : {}),
      },
      include: {
        rol: {
          include: {
            permisos: {
              include: {
                permiso: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return usuarios.map((u) => this.formatearRespuesta(u));
  }

  /**
   * Consulta un usuario por ID garantizando aislamiento multi-tenant (RN-068).
   * Si es de otra empresa, devuelve 404 para no revelar su existencia.
   */
  async obtenerPorId(
    empresaId: number,
    usuarioId: number,
  ): Promise<UsuarioResponseDto> {
    const usuario = await this.prisma.usuario.findFirst({
      where: {
        id: usuarioId,
        empresaId,
        deletedAt: null,
      },
      include: {
        rol: {
          include: {
            permisos: {
              include: {
                permiso: true,
              },
            },
          },
        },
      },
    });

    if (!usuario) {
      throw new DomainError(
        CodigoError.RECURSO_NO_ENCONTRADO,
        'Usuario no encontrado',
        HttpStatus.NOT_FOUND,
      );
    }

    return this.formatearRespuesta(usuario);
  }

  /**
   * Actualiza datos de un usuario de la empresa.
   * Si se reactiva, revalida cupo del plan (RN-037).
   */
  async actualizar(
    empresaId: number,
    usuarioId: number,
    dto: UpdateUsuarioDto,
  ): Promise<UsuarioResponseDto> {
    const usuarioActual = await this.prisma.usuario.findFirst({
      where: {
        id: usuarioId,
        empresaId,
        deletedAt: null,
      },
      include: { rol: true },
    });

    if (!usuarioActual) {
      throw new DomainError(
        CodigoError.RECURSO_NO_ENCONTRADO,
        'Usuario no encontrado',
        HttpStatus.NOT_FOUND,
      );
    }

    // Si se reactiva un usuario desactivado, validar cupo del plan (RN-037)
    if (dto.activo === true && usuarioActual.activo === false) {
      const empresa = await this.prisma.empresa.findUnique({
        where: { id: empresaId },
        include: { plan: true },
      });
      const usuariosActivos = await this.prisma.usuario.count({
        where: { empresaId, activo: true, deletedAt: null },
      });

      if (empresa && usuariosActivos >= empresa.plan.maxUsuarios) {
        throw new DomainError(
          CodigoError.LIMITE_PLAN_EXCEDIDO,
          `No se puede reactivar el usuario. Su plan permite un máximo de ${empresa.plan.maxUsuarios} usuarios activos.`,
          HttpStatus.CONFLICT,
        );
      }
    }

    let rolId = usuarioActual.rolId;
    if (dto.rolCodigo && dto.rolCodigo !== usuarioActual.rol.codigo) {
      const nuevoRol = await this.prisma.rol.findUnique({
        where: { codigo: dto.rolCodigo },
      });
      if (!nuevoRol) {
        throw new DomainError(
          CodigoError.RECURSO_NO_ENCONTRADO,
          `El rol '${dto.rolCodigo}' no existe`,
          HttpStatus.NOT_FOUND,
        );
      }
      rolId = nuevoRol.id;
    }

    const usuarioActualizado = await this.prisma.usuario.update({
      where: { id: usuarioId },
      data: {
        ...(dto.nombre && { nombre: dto.nombre.trim() }),
        ...(dto.apellido && { apellido: dto.apellido.trim() }),
        ...(dto.telefono !== undefined && { telefono: dto.telefono?.trim() || null }),
        ...(dto.activo !== undefined && { activo: dto.activo }),
        rolId,
      },
      include: {
        rol: {
          include: {
            permisos: {
              include: {
                permiso: true,
              },
            },
          },
        },
      },
    });

    // Auditar cambio
    await this.auditService.registrar({
      empresaId,
      entidad: 'usuario',
      entidadId: usuarioId,
      accion: AccionAuditoria.ACTUALIZAR,
      valoresAnteriores: {
        nombre: usuarioActual.nombre,
        apellido: usuarioActual.apellido,
        activo: usuarioActual.activo,
        rol: usuarioActual.rol.codigo,
      },
      valoresNuevos: {
        nombre: usuarioActualizado.nombre,
        apellido: usuarioActualizado.apellido,
        activo: usuarioActualizado.activo,
        rol: usuarioActualizado.rol.codigo,
      },
    });

    return this.formatearRespuesta(usuarioActualizado);
  }

  /**
   * Baja lógica con anonimización de correo y revocación de sesiones (Sección 3.11, RN-041).
   * Nunca borra físicamente para preservar historial y trazabilidad.
   */
  async eliminar(empresaId: number, usuarioId: number): Promise<{ mensaje: string }> {
    const usuario = await this.prisma.usuario.findFirst({
      where: {
        id: usuarioId,
        empresaId,
        deletedAt: null,
      },
    });

    if (!usuario) {
      throw new DomainError(
        CodigoError.RECURSO_NO_ENCONTRADO,
        'Usuario no encontrado',
        HttpStatus.NOT_FOUND,
      );
    }

    // Anonimizar correo para liberar índice único (Sección 3.11)
    const sufijo = `#baja${usuario.id}`;
    const correoBase = usuario.correo.slice(0, 120 - sufijo.length);
    const correoLiberado = `${correoBase}${sufijo}`;

    await this.prisma.$transaction(async (tx) => {
      // 1. Baja lógica y anonimización
      await tx.usuario.update({
        where: { id: usuarioId },
        data: {
          deletedAt: new Date(),
          activo: false,
          correo: correoLiberado,
        },
      });

      // 2. Revocar inmediatamente todas sus sesiones y refresh tokens
      await tx.refreshToken.updateMany({
        where: { usuarioId, revocado: false },
        data: {
          revocado: true,
          revocadoEn: new Date(),
        },
      });
    });

    // 3. Auditar baja lógica
    await this.auditService.registrar({
      empresaId,
      entidad: 'usuario',
      entidadId: usuarioId,
      accion: AccionAuditoria.ELIMINAR,
      valoresAnteriores: {
        id: usuario.id,
        correoOriginal: usuario.correo,
      },
    });

    return { mensaje: 'Usuario dado de baja exitosamente' };
  }

  private formatearRespuesta(usuario: any): UsuarioResponseDto {
    const permisos =
      usuario.rol?.permisos?.map((rp: any) => rp.permiso.codigo) || [];

    return {
      id: usuario.id,
      empresaId: usuario.empresaId,
      nombre: usuario.nombre,
      apellido: usuario.apellido,
      correo: usuario.correo,
      telefono: usuario.telefono,
      activo: usuario.activo,
      rol: usuario.rol.codigo,
      permisos,
      ultimoAcceso: usuario.ultimoAcceso
        ? usuario.ultimoAcceso.toISOString()
        : null,
      createdAt: usuario.createdAt.toISOString(),
    };
  }
}
