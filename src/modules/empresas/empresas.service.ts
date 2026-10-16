import { Injectable, HttpStatus } from '@nestjs/common';
import { EstadoSuscripcion, AccionAuditoria } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../prisma/audit.service';
import { PasswordService } from '../../common/services/password.service';
import { AuthService } from '../auth/auth.service';
import { RegistroEmpresaDto } from './dto/registro-empresa.dto';
import { UpdateEmpresaDto } from './dto/update-empresa.dto';
import { EmpresaResponseDto } from './dto/empresa-response.dto';
import { AuthResponseDto } from '../auth/dto/auth-response.dto';
import { CodigoError } from '../../common/errors/codigos-error.enum';
import { DomainError } from '../../common/errors/domain.error';

@Injectable()
export class EmpresasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly passwordService: PasswordService,
    private readonly authService: AuthService,
  ) {}

  /**
   * Registro inicial transaccional atómico de Empresa y Administrador (F-01 / F0).
   * Si falla el usuario o el plan, se revierte toda la transacción.
   */
  async registrar(
    dto: RegistroEmpresaDto,
    ip?: string,
  ): Promise<AuthResponseDto> {
    const rfcNormalizado = dto.rfc.toUpperCase().trim();
    const correoUsuarioNormalizado = dto.usuarioCorreo.toLowerCase().trim();

    // 1. Validaciones previas de unicidad
    const empresaExistente = await this.prisma.empresa.findUnique({
      where: { rfc: rfcNormalizado },
    });
    if (empresaExistente && empresaExistente.deletedAt === null) {
      throw new DomainError(
        CodigoError.CONFLICTO,
        `Ya existe una empresa registrada con el RFC ${rfcNormalizado}`,
        HttpStatus.CONFLICT,
      );
    }

    const usuarioExistente = await this.prisma.usuario.findUnique({
      where: { correo: correoUsuarioNormalizado },
    });
    if (usuarioExistente && usuarioExistente.deletedAt === null) {
      throw new DomainError(
        CodigoError.CONFLICTO,
        `Ya existe un usuario registrado con el correo ${correoUsuarioNormalizado}`,
        HttpStatus.CONFLICT,
      );
    }

    // 2. Transacción atómica de creación
    const resultado = await this.prisma.$transaction(async (tx) => {
      // Buscar plan comercial
      const plan = await tx.planSuscripcion.findUnique({
        where: { codigo: dto.planCodigo },
      });
      if (!plan || !plan.activo) {
        throw new DomainError(
          CodigoError.RECURSO_NO_ENCONTRADO,
          `El plan comercial '${dto.planCodigo}' no está disponible`,
          HttpStatus.NOT_FOUND,
        );
      }

      // Buscar rol ADMIN
      const rolAdmin = await tx.rol.findUnique({
        where: { codigo: 'ADMIN' },
      });
      if (!rolAdmin) {
        throw new DomainError(
          CodigoError.ERROR_INTERNO,
          'El rol ADMIN del sistema no fue encontrado',
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }

      // Hash de la contraseña del usuario (RN-040)
      const contrasenaHash = await this.passwordService.hash(
        dto.usuarioContrasena,
      );

      // Crear empresa en estado PRUEBA (F0)
      const nuevaEmpresa = await tx.empresa.create({
        data: {
          planId: plan.id,
          nombre: dto.nombre.trim(),
          razonSocial: dto.razonSocial?.trim() || null,
          rfc: rfcNormalizado,
          correo: dto.correo.toLowerCase().trim(),
          telefono: dto.telefono?.trim() || null,
          direccion: dto.direccion?.trim() || null,
          moneda: 'MXN',
          estadoSuscripcion: EstadoSuscripcion.PRUEBA,
          fechaInicioPlan: new Date(),
          activo: true,
        },
      });

      // Crear primer usuario asociado con rol ADMIN
      const nuevoUsuario = await tx.usuario.create({
        data: {
          empresaId: nuevaEmpresa.id,
          rolId: rolAdmin.id,
          nombre: dto.usuarioNombre.trim(),
          apellido: dto.usuarioApellido.trim(),
          correo: correoUsuarioNormalizado,
          contrasenaHash,
          telefono: dto.usuarioTelefono?.trim() || null,
          activo: true,
        },
      });

      // Auditoría transaccional pre-autenticación con IDs reales explícitos (Blindaje 2 / RN-043 / RN-074)
      await this.auditService.registrar(
        {
          empresaId: nuevaEmpresa.id,
          usuarioId: null,
          entidad: 'empresa',
          entidadId: nuevaEmpresa.id,
          accion: AccionAuditoria.CREAR,
          valoresNuevos: {
            id: nuevaEmpresa.id,
            nombre: nuevaEmpresa.nombre,
            rfc: nuevaEmpresa.rfc,
            planId: nuevaEmpresa.planId,
          },
          ip,
        },
        tx,
      );

      await this.auditService.registrar(
        {
          empresaId: nuevaEmpresa.id,
          usuarioId: nuevoUsuario.id,
          entidad: 'usuario',
          entidadId: nuevoUsuario.id,
          accion: AccionAuditoria.CREAR,
          valoresNuevos: {
            id: nuevoUsuario.id,
            nombre: nuevoUsuario.nombre,
            apellido: nuevoUsuario.apellido,
            correo: nuevoUsuario.correo,
            rol: 'ADMIN',
          },
          ip,
        },
        tx,
      );

      return { empresa: nuevaEmpresa, usuario: nuevoUsuario };
    });

    // 3. Iniciar sesión automáticamente (emite tokens y registra INICIO_SESION en auditoría)
    return this.authService.login(
      {
        correo: correoUsuarioNormalizado,
        contrasena: dto.usuarioContrasena,
      },
      ip,
    );
  }

  /**
   * Consulta los datos de la empresa actual, su plan y las cuotas de uso (RN-037).
   */
  async obtenerMiEmpresa(empresaId: number): Promise<EmpresaResponseDto> {
    const empresa = await this.prisma.empresa.findUnique({
      where: { id: empresaId },
      include: {
        plan: true,
      },
    });

    if (!empresa || empresa.deletedAt !== null) {
      throw new DomainError(
        CodigoError.RECURSO_NO_ENCONTRADO,
        'Empresa no encontrada',
        HttpStatus.NOT_FOUND,
      );
    }

    // Cuotas de uso actuales
    const usuariosActivos = await this.prisma.usuario.count({
      where: {
        empresaId,
        activo: true,
        deletedAt: null,
      },
    });

    const parcelasActivas = await this.prisma.parcela.count({
      where: {
        predio: { empresaId },
        deletedAt: null,
      },
    });

    return {
      id: empresa.id,
      nombre: empresa.nombre,
      razonSocial: empresa.razonSocial,
      rfc: empresa.rfc,
      correo: empresa.correo,
      telefono: empresa.telefono,
      direccion: empresa.direccion,
      moneda: empresa.moneda,
      estadoSuscripcion: empresa.estadoSuscripcion,
      plan: {
        codigo: empresa.plan.codigo,
        nombre: empresa.plan.nombre,
        precioMensual: empresa.plan.precioMensual.toString(),
        maxParcelas: empresa.plan.maxParcelas,
        maxUsuarios: empresa.plan.maxUsuarios,
        incluyeReportes: empresa.plan.incluyeReportes,
      },
      cuotas: {
        usuariosActivos,
        maxUsuarios: empresa.plan.maxUsuarios,
        parcelasActivas,
        maxParcelas: empresa.plan.maxParcelas,
      },
    };
  }

  /**
   * Actualiza los datos comerciales de la empresa actual (RN-003).
   */
  async actualizarMiEmpresa(
    empresaId: number,
    dto: UpdateEmpresaDto,
  ): Promise<EmpresaResponseDto> {
    const empresaActual = await this.prisma.empresa.findUnique({
      where: { id: empresaId },
    });

    if (!empresaActual || empresaActual.deletedAt !== null) {
      throw new DomainError(
        CodigoError.RECURSO_NO_ENCONTRADO,
        'Empresa no encontrada',
        HttpStatus.NOT_FOUND,
      );
    }

    await this.prisma.empresa.update({
      where: { id: empresaId },
      data: {
        ...(dto.nombre && { nombre: dto.nombre.trim() }),
        ...(dto.razonSocial !== undefined && { razonSocial: dto.razonSocial?.trim() || null }),
        ...(dto.correo && { correo: dto.correo.toLowerCase().trim() }),
        ...(dto.telefono !== undefined && { telefono: dto.telefono?.trim() || null }),
        ...(dto.direccion !== undefined && { direccion: dto.direccion?.trim() || null }),
      },
    });

    // Auditar cambio
    await this.auditService.registrar({
      empresaId,
      entidad: 'empresa',
      entidadId: empresaId,
      accion: AccionAuditoria.ACTUALIZAR,
      valoresAnteriores: empresaActual,
      valoresNuevos: dto,
    });

    return this.obtenerMiEmpresa(empresaId);
  }
}
