import { Test, TestingModule } from '@nestjs/testing';
import { AccionAuditoria, EstadoCiclo, Prisma } from '@prisma/client';
import { ActividadesService } from './actividades.service';
import { CicloCapturaPolicy } from './domain/policies/ciclo-captura.policy';
import { ActividadWindowValidator } from './domain/validators/actividad-window.validator';
import { ActividadOwnershipValidator } from './domain/validators/actividad-ownership.validator';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../prisma/audit.service';
import { DomainError } from '../../common/errors/domain.error';
import { CreateActividadDto } from './dto/create-actividad.dto';
import { UpdateActividadDto } from './dto/update-actividad.dto';

describe('ActividadesService', () => {
  let service: ActividadesService;
  let prisma: {
    actividad: {
      findFirst: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    cicloProduccion: {
      findFirst: jest.Mock;
    };
    tipoActividad: {
      findFirst: jest.Mock;
    };
    usuario: {
      findFirst: jest.Mock;
    };
    gasto: {
      count: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let auditService: {
    registrar: jest.Mock;
  };

  const empresaId = 10;
  const usuarioId = 1;

  beforeEach(async () => {
    prisma = {
      actividad: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      cicloProduccion: {
        findFirst: jest.fn(),
      },
      tipoActividad: {
        findFirst: jest.fn(),
      },
      usuario: {
        findFirst: jest.fn(),
      },
      gasto: {
        count: jest.fn(),
      },
      $transaction: jest.fn(),
    };

    prisma.$transaction.mockImplementation(async (callback) => {
      return callback(prisma);
    });

    auditService = {
      registrar: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ActividadesService,
        CicloCapturaPolicy,
        ActividadWindowValidator,
        ActividadOwnershipValidator,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: auditService },
      ],
    }).compile();

    service = module.get<ActividadesService>(ActividadesService);
  });

  it('debe estar definido', () => {
    expect(service).toBeDefined();
  });

  // =====================================================================
  // CREACIÓN
  // =====================================================================

  describe('crearActividad', () => {
    const dto: CreateActividadDto = {
      cicloId: 1,
      tipoActividadId: 2,
      responsableId: 5,
      fecha: '2027-01-15',
      descripcion: 'Labor de siembra',
      horasTrabajadas: 8.5,
    };

    it('debe registrar una actividad exitosamente dentro de $transaction y auditar', async () => {
      prisma.cicloProduccion.findFirst.mockResolvedValue({
        id: 1,
        empresaId,
        estado: EstadoCiclo.ACTIVO,
        fechaInicio: new Date('2027-01-10T00:00:00.000Z'),
      });
      prisma.tipoActividad.findFirst.mockResolvedValue({ id: 2, activo: true });
      prisma.usuario.findFirst.mockResolvedValue({ id: 5, empresaId, activo: true });

      prisma.actividad.create.mockResolvedValue({
        id: 100,
        cicloId: 1,
        tipoActividadId: 2,
        responsableId: 5,
        creadoPorId: usuarioId,
        fecha: new Date('2027-01-15T00:00:00.000Z'),
        descripcion: 'Labor de siembra',
        horasTrabajadas: new Prisma.Decimal(8.5),
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      });

      const res = await service.crearActividad(empresaId, usuarioId, dto);

      expect(res.id).toBe(100);
      expect(res.fecha).toBe('2027-01-15');
      expect(res.horasTrabajadas).toBe('8.50');
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(auditService.registrar).toHaveBeenCalledWith(
        expect.objectContaining({
          empresaId,
          usuarioId,
          entidad: 'actividad',
          entidadId: 100,
          accion: AccionAuditoria.CREAR,
          valoresNuevos: expect.objectContaining({
            cicloId: 1,
            tipoActividadId: 2,
            fecha: '2027-01-15',
          }),
        }),
        prisma,
      );
    });

    it('debe rechazar si el ciclo está FINALIZADO (RN-015) y no mutar', async () => {
      prisma.cicloProduccion.findFirst.mockResolvedValue({
        id: 1,
        empresaId,
        estado: EstadoCiclo.FINALIZADO,
        fechaInicio: new Date('2027-01-10T00:00:00.000Z'),
      });
      prisma.tipoActividad.findFirst.mockResolvedValue({ id: 2, activo: true });

      await expect(service.crearActividad(empresaId, usuarioId, dto)).rejects.toThrow(DomainError);
      expect(prisma.actividad.create).not.toHaveBeenCalled();
      expect(auditService.registrar).not.toHaveBeenCalled();
    });

    it('debe rechazar si la fecha es anterior al inicio del ciclo (RN-044)', async () => {
      prisma.cicloProduccion.findFirst.mockResolvedValue({
        id: 1,
        empresaId,
        estado: EstadoCiclo.ACTIVO,
        fechaInicio: new Date('2027-01-20T00:00:00.000Z'),
      });
      prisma.tipoActividad.findFirst.mockResolvedValue({ id: 2, activo: true });

      await expect(
        service.crearActividad(empresaId, usuarioId, {
          ...dto,
          fecha: '2027-01-15', // Anterior al inicio
        }),
      ).rejects.toThrow(DomainError);

      expect(prisma.actividad.create).not.toHaveBeenCalled();
    });

    it('debe responder 404 si el ciclo pertenece a otra empresa (RN-068)', async () => {
      prisma.cicloProduccion.findFirst.mockResolvedValue(null);
      prisma.tipoActividad.findFirst.mockResolvedValue({ id: 2, activo: true });

      await expect(service.crearActividad(empresaId, usuarioId, dto)).rejects.toThrow(DomainError);
      expect(prisma.actividad.create).not.toHaveBeenCalled();
    });
  });

  // =====================================================================
  // CONSULTAS
  // =====================================================================

  describe('listarActividades', () => {
    it('debe listar actividades con paginación y filtros', async () => {
      prisma.actividad.count.mockResolvedValue(1);
      prisma.actividad.findMany.mockResolvedValue([
        {
          id: 100,
          cicloId: 1,
          tipoActividadId: 2,
          responsableId: 5,
          creadoPorId: usuarioId,
          fecha: new Date('2027-01-15T00:00:00.000Z'),
          descripcion: 'Siembra',
          horasTrabajadas: new Prisma.Decimal(8.5),
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null,
        },
      ]);

      const res = await service.listarActividades(empresaId, {
        page: 1,
        limit: 10,
        cicloId: 1,
        tipoActividadId: 2,
        responsableId: 5,
        fechaDesde: '2027-01-01',
        fechaHasta: '2027-01-31',
        q: 'Siembra',
      });

      expect(res.data).toHaveLength(1);
      expect(res.meta.total).toBe(1);
      expect(res.meta.page).toBe(1);
      expect(res.meta.limit).toBe(10);
      expect(res.data[0].horasTrabajadas).toBe('8.50');
    });
  });

  describe('obtenerActividadPorId', () => {
    it('debe retornar el detalle enriquecido con conteo de gastos vinculados', async () => {
      prisma.actividad.findFirst.mockResolvedValue({
        id: 100,
        cicloId: 1,
        tipoActividadId: 2,
        responsableId: 5,
        creadoPorId: usuarioId,
        fecha: new Date('2027-01-15T00:00:00.000Z'),
        descripcion: 'Siembra',
        horasTrabajadas: new Prisma.Decimal(8.5),
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        ciclo: {
          id: 1,
          nombre: 'Primavera 2027',
          estado: 'ACTIVO',
          parcelaId: 2,
          parcela: { nombre: 'Parcela 1' },
        },
        tipoActividad: { id: 2, nombre: 'Siembra' },
        responsable: { id: 5, nombre: 'Juan', apellido: 'Pérez' },
        creadoPor: { id: usuarioId, nombre: 'Admin', apellido: 'Sistema' },
      });
      prisma.gasto.count.mockResolvedValue(2);

      const res = await service.obtenerActividadPorId(empresaId, 100);

      expect(res.id).toBe(100);
      expect(res.gastosVinculadosCount).toBe(2);
      expect(res.ciclo.parcelaNombre).toBe('Parcela 1');
    });

    it('debe lanzar 404 si la actividad no existe en la empresa', async () => {
      prisma.actividad.findFirst.mockResolvedValue(null);

      await expect(service.obtenerActividadPorId(empresaId, 999)).rejects.toThrow(DomainError);
    });
  });

  // =====================================================================
  // ACTUALIZACIÓN
  // =====================================================================

  describe('actualizarActividad', () => {
    const actividadExistente = {
      id: 100,
      cicloId: 1,
      tipoActividadId: 2,
      responsableId: null,
      creadoPorId: usuarioId, // Creado por el usuario actual
      fecha: new Date('2027-01-15T00:00:00.000Z'),
      descripcion: 'Original',
      horasTrabajadas: new Prisma.Decimal(5.0),
      createdAt: new Date(), // Creado recién (dentro de 48h)
      ciclo: {
        id: 1,
        empresaId,
        estado: EstadoCiclo.ACTIVO,
        fechaInicio: new Date('2027-01-10T00:00:00.000Z'),
      },
    };

    it('debe actualizar si es el creador y está dentro de 48h (RN-062)', async () => {
      prisma.actividad.findFirst.mockResolvedValue(actividadExistente);
      prisma.actividad.update.mockResolvedValue({
        ...actividadExistente,
        descripcion: 'Actualizado',
        horasTrabajadas: new Prisma.Decimal(7.0),
        updatedAt: new Date(),
      });

      const res = await service.actualizarActividad(empresaId, usuarioId, false, 100, {
        descripcion: 'Actualizado',
        horasTrabajadas: 7.0,
      });

      expect(res.descripcion).toBe('Actualizado');
      expect(res.horasTrabajadas).toBe('7.00');
      expect(auditService.registrar).toHaveBeenCalledWith(
        expect.objectContaining({
          accion: AccionAuditoria.ACTUALIZAR,
          entidad: 'actividad',
          entidadId: 100,
        }),
        prisma,
      );
    });

    it('debe rechazar con 409 si transcurrieron más de 48h para un usuario común (RN-062)', async () => {
      const hace50Horas = new Date(Date.now() - 50 * 3600 * 1000);
      prisma.actividad.findFirst.mockResolvedValue({
        ...actividadExistente,
        createdAt: hace50Horas,
      });

      await expect(
        service.actualizarActividad(empresaId, usuarioId, false, 100, {
          descripcion: 'Tarde',
        }),
      ).rejects.toThrow(DomainError);

      expect(prisma.actividad.update).not.toHaveBeenCalled();
    });

    it('debe permitir la actualización si pasaron más de 48h pero tienePermisoAdministrar es true (ADMIN)', async () => {
      const hace50Horas = new Date(Date.now() - 50 * 3600 * 1000);
      prisma.actividad.findFirst.mockResolvedValue({
        ...actividadExistente,
        creadoPorId: 999, // Creado por otro usuario
        createdAt: hace50Horas,
      });
      prisma.actividad.update.mockResolvedValue({
        ...actividadExistente,
        descripcion: 'Admin Override',
        updatedAt: new Date(),
      });

      const res = await service.actualizarActividad(empresaId, usuarioId, true, 100, {
        descripcion: 'Admin Override',
      });

      expect(res.descripcion).toBe('Admin Override');
      expect(prisma.actividad.update).toHaveBeenCalled();
    });

    it('debe rechazar con 403 si un usuario común intenta editar actividad ajena (RN-062)', async () => {
      prisma.actividad.findFirst.mockResolvedValue({
        ...actividadExistente,
        creadoPorId: 999, // Otro usuario
      });

      await expect(
        service.actualizarActividad(empresaId, usuarioId, false, 100, {
          descripcion: 'Intento ajeno',
        }),
      ).rejects.toThrow(DomainError);

      expect(prisma.actividad.update).not.toHaveBeenCalled();
    });

    it('debe actualizar tipoActividad, responsable y fecha exitosamente', async () => {
      prisma.actividad.findFirst.mockResolvedValue(actividadExistente);
      prisma.tipoActividad.findFirst.mockResolvedValue({ id: 3, activo: true });
      prisma.usuario.findFirst.mockResolvedValue({ id: 6, empresaId, activo: true });
      prisma.actividad.update.mockResolvedValue({
        ...actividadExistente,
        tipoActividadId: 3,
        responsableId: 6,
        fecha: new Date('2027-01-18T00:00:00.000Z'),
      });

      const res = await service.actualizarActividad(empresaId, usuarioId, false, 100, {
        tipoActividadId: 3,
        responsableId: 6,
        fecha: '2027-01-18',
      });

      expect(res.tipoActividadId).toBe(3);
      expect(res.responsableId).toBe(6);
      expect(res.fecha).toBe('2027-01-18');
    });

    it('debe rechazar si tipoActividad no existe al actualizar', async () => {
      prisma.actividad.findFirst.mockResolvedValue(actividadExistente);
      prisma.tipoActividad.findFirst.mockResolvedValue(null);

      await expect(
        service.actualizarActividad(empresaId, usuarioId, false, 100, {
          tipoActividadId: 999,
        }),
      ).rejects.toThrow(DomainError);
    });

    it('debe rechazar si responsable no pertenece a la empresa al actualizar', async () => {
      prisma.actividad.findFirst.mockResolvedValue(actividadExistente);
      prisma.usuario.findFirst.mockResolvedValue(null);

      await expect(
        service.actualizarActividad(empresaId, usuarioId, false, 100, {
          responsableId: 999,
        }),
      ).rejects.toThrow(DomainError);
    });
  });

  // =====================================================================
  // ELIMINACIÓN
  // =====================================================================

  describe('eliminarActividad', () => {
    const actividadAEliminar = {
      id: 100,
      cicloId: 1,
      tipoActividadId: 2,
      creadoPorId: usuarioId,
      fecha: new Date('2027-01-15T00:00:00.000Z'),
      createdAt: new Date(),
      ciclo: {
        id: 1,
        estado: EstadoCiclo.ACTIVO,
      },
    };

    it('debe realizar soft delete si no tiene gastos activos vinculados y cumple RN-062', async () => {
      prisma.actividad.findFirst.mockResolvedValue(actividadAEliminar);
      prisma.gasto.count.mockResolvedValue(0); // Cero gastos vigentes
      prisma.actividad.update.mockResolvedValue({});

      const res = await service.eliminarActividad(empresaId, usuarioId, false, 100);

      expect(res.message).toContain('exitosamente');
      expect(prisma.actividad.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 100 },
          data: expect.objectContaining({ deletedAt: expect.any(Date) }),
        }),
      );
      expect(auditService.registrar).toHaveBeenCalledWith(
        expect.objectContaining({
          accion: AccionAuditoria.ELIMINAR,
          entidad: 'actividad',
          entidadId: 100,
        }),
        prisma,
      );
    });

    it('debe rechazar la eliminación con 409 si tiene gastos activos vinculados (RN-046)', async () => {
      prisma.actividad.findFirst.mockResolvedValue(actividadAEliminar);
      prisma.gasto.count.mockResolvedValue(2); // Tiene 2 gastos activos

      await expect(
        service.eliminarActividad(empresaId, usuarioId, false, 100),
      ).rejects.toThrow(DomainError);

      expect(prisma.actividad.update).not.toHaveBeenCalled();
    });
  });
});
