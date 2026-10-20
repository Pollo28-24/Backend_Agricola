import { Test, TestingModule } from '@nestjs/testing';
import {
  EstadoCiclo,
  EstadoParcela,
  AccionAuditoria,
  Prisma,
} from '@prisma/client';
import { CiclosService } from './ciclos.service';
import { CicloTransitionValidator } from './validators/ciclo-transition.validator';
import { AccionCiclo } from './constants/ciclo-state-machine.constant';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../prisma/audit.service';
import { DomainError } from '../../common/errors/domain.error';
import { CreateCicloDto } from './dto/create-ciclo.dto';

describe('CiclosService', () => {
  let service: CiclosService;
  let prisma: {
    cicloProduccion: {
      findFirst: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    parcela: {
      findFirst: jest.Mock;
      update: jest.Mock;
    };
    variedad: {
      findFirst: jest.Mock;
    };
    bitacoraAuditoria: {
      create: jest.Mock;
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
      cicloProduccion: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      parcela: {
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      variedad: {
        findFirst: jest.fn(),
      },
      bitacoraAuditoria: {
        create: jest.fn(),
      },
      $transaction: jest.fn(),
      $queryRaw: jest.fn().mockResolvedValue([
        {
          id: 1,
          empresaId: 1,
          estado: 'ACTIVO',
          fechaInicio: new Date('2026-01-01'),
        },
      ]),
    };

    // Por defecto $transaction ejecuta el callback pasándole el prisma mock como tx
    prisma.$transaction.mockImplementation((callback) => {
      return callback(prisma);
    });

    auditService = {
      registrar: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CiclosService,
        CicloTransitionValidator,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: auditService },
      ],
    }).compile();

    service = module.get<CiclosService>(CiclosService);
  });

  it('debe estar definido', () => {
    expect(service).toBeDefined();
  });

  // =====================================================================
  // CREACIÓN DE CICLO
  // =====================================================================

  describe('crearCiclo', () => {
    it('debe registrar un ciclo en estado PLANIFICADO exitosamente', async () => {
      const dto: CreateCicloDto = {
        parcelaId: 2,
        variedadId: 5,
        nombre: 'Primavera 2027',
        fechaInicio: '2027-01-10',
        superficieSembrada: 2.5,
      };

      prisma.parcela.findFirst.mockResolvedValue({
        id: 2,
        superficie: 5.0,
        estado: EstadoParcela.DISPONIBLE,
      });

      prisma.variedad.findFirst.mockResolvedValue({
        id: 5,
        activo: true,
      });

      prisma.cicloProduccion.create.mockResolvedValue({
        id: 1,
        empresaId,
        parcelaId: 2,
        variedadId: 5,
        nombre: 'Primavera 2027',
        fechaInicio: new Date('2027-01-10T00:00:00.000Z'),
        fechaFin: null,
        superficieSembrada: 2.5,
        metaProduccionKg: null,
        estado: EstadoCiclo.PLANIFICADO,
        observaciones: null,
        cerradoEn: null,
        cerradoPorId: null,
        creadoPorId: usuarioId,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await service.crearCiclo(empresaId, usuarioId, dto);

      expect(res.id).toBe(1);
      expect(res.estado).toBe(EstadoCiclo.PLANIFICADO);
      expect(res.superficieSembrada).toBe('2.50');
      expect(auditService.registrar).toHaveBeenCalledWith(
        expect.objectContaining({
          empresaId,
          entidad: 'ciclo_produccion',
          entidadId: 1,
          accion: AccionAuditoria.CREAR,
          valoresNuevos: expect.objectContaining({
            nombre: 'Primavera 2027',
            estado: EstadoCiclo.PLANIFICADO,
          }),
        }),
      );
    });

    it('debe responder 404 si la parcela no pertenece a la empresa (RN-068)', async () => {
      prisma.parcela.findFirst.mockResolvedValue(null);

      await expect(
        service.crearCiclo(empresaId, usuarioId, {
          parcelaId: 99,
          variedadId: 5,
          fechaInicio: '2027-01-10',
          superficieSembrada: 2.0,
        }),
      ).rejects.toThrow(DomainError);
    });

    it('debe rechazar la creación si la parcela está inactiva (RN-075)', async () => {
      prisma.parcela.findFirst.mockResolvedValue({
        id: 2,
        superficie: 5.0,
        estado: EstadoParcela.INACTIVA,
      });

      await expect(
        service.crearCiclo(empresaId, usuarioId, {
          parcelaId: 2,
          variedadId: 5,
          fechaInicio: '2027-01-10',
          superficieSembrada: 2.0,
        }),
      ).rejects.toThrow(DomainError);
    });

    it('debe rechazar la creación si la superficie sembrada supera la de la parcela (RN-018)', async () => {
      prisma.parcela.findFirst.mockResolvedValue({
        id: 2,
        superficie: 3.0,
        estado: EstadoParcela.DISPONIBLE,
      });
      prisma.variedad.findFirst.mockResolvedValue({ id: 5, activo: true });

      await expect(
        service.crearCiclo(empresaId, usuarioId, {
          parcelaId: 2,
          variedadId: 5,
          fechaInicio: '2027-01-10',
          superficieSembrada: 4.5,
        }),
      ).rejects.toThrow(DomainError);
    });

    it('debe rechazar si fechaFin es menor que fechaInicio (RN-017)', async () => {
      prisma.parcela.findFirst.mockResolvedValue({
        id: 2,
        superficie: 5.0,
        estado: EstadoParcela.DISPONIBLE,
      });
      prisma.variedad.findFirst.mockResolvedValue({ id: 5, activo: true });

      await expect(
        service.crearCiclo(empresaId, usuarioId, {
          parcelaId: 2,
          variedadId: 5,
          fechaInicio: '2027-05-10',
          fechaFin: '2027-01-10',
          superficieSembrada: 2.0,
        }),
      ).rejects.toThrow(DomainError);
    });
  });

  // =====================================================================
  // ACTUALIZACIÓN DE CICLO
  // =====================================================================

  describe('actualizarCiclo', () => {
    it('debe actualizar campos permitidos y registrar auditoría', async () => {
      prisma.cicloProduccion.findFirst.mockResolvedValue({
        id: 1,
        empresaId,
        nombre: 'Original',
        estado: EstadoCiclo.PLANIFICADO,
        superficieSembrada: 2.0,
        metaProduccionKg: null,
        parcela: { superficie: 5.0 },
      });

      prisma.cicloProduccion.update.mockResolvedValue({
        id: 1,
        empresaId,
        nombre: 'Actualizado',
        estado: EstadoCiclo.PLANIFICADO,
        superficieSembrada: 3.0,
        metaProduccionKg: 1000,
        fechaInicio: new Date('2027-01-10'),
        fechaFin: null,
      });

      const res = await service.actualizarCiclo(empresaId, 1, {
        nombre: 'Actualizado',
        superficieSembrada: 3.0,
      });

      expect(res.nombre).toBe('Actualizado');
      expect(auditService.registrar).toHaveBeenCalledWith(
        expect.objectContaining({
          empresaId,
          entidad: 'ciclo_produccion',
          entidadId: 1,
          accion: AccionAuditoria.ACTUALIZAR,
          valoresAnteriores: expect.objectContaining({
            nombre: 'Original',
          }),
          valoresNuevos: expect.objectContaining({
            nombre: 'Actualizado',
          }),
        }),
      );
    });

    it('debe rechazar la modificación si el ciclo está cerrado (RN-015)', async () => {
      prisma.cicloProduccion.findFirst.mockResolvedValue({
        id: 1,
        empresaId,
        estado: EstadoCiclo.FINALIZADO,
        parcela: { superficie: 5.0 },
      });

      await expect(
        service.actualizarCiclo(empresaId, 1, { nombre: 'Cambio' }),
      ).rejects.toThrow(DomainError);
    });

    it('debe rechazar la modificación de superficie sembrada si el ciclo ya inició', async () => {
      prisma.cicloProduccion.findFirst.mockResolvedValue({
        id: 1,
        empresaId,
        estado: EstadoCiclo.ACTIVO,
        parcela: { superficie: 5.0 },
      });

      await expect(
        service.actualizarCiclo(empresaId, 1, { superficieSembrada: 3.5 }),
      ).rejects.toThrow(DomainError);
    });
  });

  // =====================================================================
  // TRANSICIONES Y REGLA RN-009
  // =====================================================================

  describe('ejecutarTransicion', () => {
    it('INICIAR: debe transicionar a ACTIVO y pasar parcela a EN_USO si no hay otro ciclo activo', async () => {
      prisma.cicloProduccion.findFirst
        .mockResolvedValueOnce({
          id: 1,
          empresaId,
          parcelaId: 2,
          estado: EstadoCiclo.PLANIFICADO,
          parcela: { id: 2, estado: EstadoParcela.DISPONIBLE },
        })
        .mockResolvedValueOnce(null); // No hay ciclo activo en la parcela

      prisma.cicloProduccion.update.mockResolvedValue({
        id: 1,
        empresaId,
        parcelaId: 2,
        variedadId: 5,
        nombre: 'Ciclo 1',
        fechaInicio: new Date('2027-01-10'),
        fechaFin: null,
        superficieSembrada: 2.5,
        metaProduccionKg: null,
        estado: EstadoCiclo.ACTIVO,
        observaciones: null,
        cerradoEn: null,
        cerradoPorId: null,
        creadoPorId: usuarioId,
      });

      const res = await service.ejecutarTransicion(
        empresaId,
        usuarioId,
        1,
        AccionCiclo.INICIAR,
      );

      expect(res.estado).toBe(EstadoCiclo.ACTIVO);
      expect(prisma.parcela.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 2 },
          data: { estado: EstadoParcela.EN_USO },
        }),
      );
      expect(auditService.registrar).toHaveBeenCalledWith(
        expect.objectContaining({
          empresaId,
          usuarioId,
          entidad: 'ciclo_produccion',
          entidadId: 1,
          accion: AccionAuditoria.ACTUALIZAR,
          valoresAnteriores: expect.objectContaining({
            estado: EstadoCiclo.PLANIFICADO,
          }),
          valoresNuevos: expect.objectContaining({
            estado: EstadoCiclo.ACTIVO,
            accion: AccionCiclo.INICIAR,
          }),
        }),
        expect.anything(),
      );
    });

    it('INICIAR: debe rechazar con 409 si ya existe otro ciclo ACTIVO en la parcela (RN-009)', async () => {
      prisma.cicloProduccion.findFirst
        .mockResolvedValueOnce({
          id: 1,
          empresaId,
          parcelaId: 2,
          estado: EstadoCiclo.PLANIFICADO,
          parcela: { id: 2, estado: EstadoParcela.EN_USO },
        })
        .mockResolvedValueOnce({ id: 99, estado: EstadoCiclo.ACTIVO }); // Ya existe activo

      await expect(
        service.ejecutarTransicion(
          empresaId,
          usuarioId,
          1,
          AccionCiclo.INICIAR,
        ),
      ).rejects.toThrow(DomainError);

      expect(prisma.cicloProduccion.update).not.toHaveBeenCalled();
      expect(prisma.parcela.update).not.toHaveBeenCalled();
      expect(auditService.registrar).not.toHaveBeenCalled();
    });

    it('INICIAR: debe atrapar error P2002 de MySQL sobre claveCicloActivo y mapear a 409 (RN-009)', async () => {
      prisma.cicloProduccion.findFirst
        .mockResolvedValueOnce({
          id: 1,
          empresaId,
          parcelaId: 2,
          estado: EstadoCiclo.PLANIFICADO,
          parcela: { id: 2, estado: EstadoParcela.DISPONIBLE },
        })
        .mockResolvedValueOnce(null);

      const errorP2002 = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed',
        {
          code: 'P2002',
          clientVersion: '5.22.0',
          meta: { target: ['claveCicloActivo'] },
        },
      );
      prisma.cicloProduccion.update.mockRejectedValue(errorP2002);

      await expect(
        service.ejecutarTransicion(
          empresaId,
          usuarioId,
          1,
          AccionCiclo.INICIAR,
        ),
      ).rejects.toThrow(DomainError);
    });

    it('FINALIZAR: debe exigir fechaFin, pasar a FINALIZADO y liberar parcela a DISPONIBLE', async () => {
      prisma.cicloProduccion.findFirst.mockResolvedValue({
        id: 1,
        empresaId,
        parcelaId: 2,
        fechaInicio: new Date('2027-01-10T00:00:00.000Z'),
        estado: EstadoCiclo.ACTIVO,
        parcela: { id: 2, estado: EstadoParcela.EN_USO },
      });

      prisma.cicloProduccion.count.mockResolvedValue(0); // Cero otros ciclos activos en la parcela
      prisma.cicloProduccion.update.mockResolvedValue({
        id: 1,
        empresaId,
        parcelaId: 2,
        variedadId: 5,
        nombre: 'Ciclo 1',
        fechaInicio: new Date('2027-01-10'),
        fechaFin: new Date('2027-06-30'),
        superficieSembrada: 2.5,
        metaProduccionKg: null,
        estado: EstadoCiclo.FINALIZADO,
        observaciones: null,
        cerradoEn: new Date(),
        cerradoPorId: usuarioId,
        creadoPorId: usuarioId,
      });

      const res = await service.ejecutarTransicion(
        empresaId,
        usuarioId,
        1,
        AccionCiclo.FINALIZAR,
        { fechaFin: '2027-06-30' },
      );

      expect(res.estado).toBe(EstadoCiclo.FINALIZADO);
      expect(prisma.parcela.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 2 },
          data: { estado: EstadoParcela.DISPONIBLE },
        }),
      );
      expect(auditService.registrar).toHaveBeenCalledWith(
        expect.objectContaining({
          empresaId,
          usuarioId,
          entidad: 'ciclo_produccion',
          entidadId: 1,
          accion: AccionAuditoria.CERRAR_CICLO,
          valoresAnteriores: expect.objectContaining({
            estado: EstadoCiclo.ACTIVO,
          }),
          valoresNuevos: expect.objectContaining({
            estado: EstadoCiclo.FINALIZADO,
            accion: AccionCiclo.FINALIZAR,
          }),
        }),
        expect.anything(),
      );
    });

    it('REABRIR: debe reabrir ciclo cerrado si no hay otro ciclo activo en la parcela (RN-067)', async () => {
      prisma.cicloProduccion.findFirst
        .mockResolvedValueOnce({
          id: 1,
          empresaId,
          parcelaId: 2,
          fechaInicio: new Date('2027-01-10'),
          estado: EstadoCiclo.FINALIZADO,
          parcela: { id: 2, estado: EstadoParcela.DISPONIBLE },
        })
        .mockResolvedValueOnce(null); // No hay otro activo

      prisma.cicloProduccion.update.mockResolvedValue({
        id: 1,
        empresaId,
        parcelaId: 2,
        variedadId: 5,
        nombre: 'Ciclo 1',
        fechaInicio: new Date('2027-01-10'),
        fechaFin: null,
        superficieSembrada: 2.5,
        metaProduccionKg: null,
        estado: EstadoCiclo.ACTIVO,
        observaciones: null,
        cerradoEn: null,
        cerradoPorId: null,
        creadoPorId: usuarioId,
      });

      const res = await service.ejecutarTransicion(
        empresaId,
        usuarioId,
        1,
        AccionCiclo.REABRIR,
      );

      expect(res.estado).toBe(EstadoCiclo.ACTIVO);
      expect(prisma.parcela.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 2 },
          data: { estado: EstadoParcela.EN_USO },
        }),
      );
      expect(auditService.registrar).toHaveBeenCalledWith(
        expect.objectContaining({
          empresaId,
          usuarioId,
          entidad: 'ciclo_produccion',
          entidadId: 1,
          accion: AccionAuditoria.REABRIR_CICLO,
          valoresAnteriores: expect.objectContaining({
            estado: EstadoCiclo.FINALIZADO,
          }),
          valoresNuevos: expect.objectContaining({
            estado: EstadoCiclo.ACTIVO,
            accion: AccionCiclo.REABRIR,
          }),
        }),
        expect.anything(),
      );
    });

    it('INICIAR: debe rechazar si la parcela está inactiva (RN-075) y no ejecutar mutaciones', async () => {
      prisma.cicloProduccion.findFirst.mockResolvedValue({
        id: 1,
        empresaId,
        parcelaId: 2,
        estado: EstadoCiclo.PLANIFICADO,
        parcela: { id: 2, estado: EstadoParcela.INACTIVA },
      });

      await expect(
        service.ejecutarTransicion(
          empresaId,
          usuarioId,
          1,
          AccionCiclo.INICIAR,
        ),
      ).rejects.toThrow(DomainError);

      expect(prisma.cicloProduccion.update).not.toHaveBeenCalled();
      expect(prisma.parcela.update).not.toHaveBeenCalled();
      expect(auditService.registrar).not.toHaveBeenCalled();
    });

    it('debe rechazar una transición inválida (ej. REANUDAR desde PLANIFICADO)', async () => {
      prisma.cicloProduccion.findFirst.mockResolvedValue({
        id: 1,
        empresaId,
        parcelaId: 2,
        estado: EstadoCiclo.PLANIFICADO,
        parcela: { id: 2, estado: EstadoParcela.DISPONIBLE },
      });

      await expect(
        service.ejecutarTransicion(
          empresaId,
          usuarioId,
          1,
          AccionCiclo.REANUDAR,
        ),
      ).rejects.toThrow(DomainError);

      expect(prisma.cicloProduccion.update).not.toHaveBeenCalled();
      expect(prisma.parcela.update).not.toHaveBeenCalled();
      expect(auditService.registrar).not.toHaveBeenCalled();
    });
  });

  // =====================================================================
  // ELIMINACIÓN DE CICLO
  // =====================================================================

  describe('eliminarCiclo', () => {
    it('debe permitir eliminar un ciclo PLANIFICADO sin movimientos', async () => {
      prisma.cicloProduccion.findFirst.mockResolvedValue({
        id: 1,
        empresaId,
        estado: EstadoCiclo.PLANIFICADO,
        _count: {
          actividades: 0,
          gastos: 0,
          cosechas: 0,
          ventas: 0,
          mermas: 0,
        },
      });
      prisma.cicloProduccion.update.mockResolvedValue({});

      const res = await service.eliminarCiclo(empresaId, usuarioId, 1);
      expect(res.message).toContain('exitosamente');
      expect(auditService.registrar).toHaveBeenCalledWith(
        expect.objectContaining({
          empresaId,
          usuarioId,
          entidad: 'ciclo_produccion',
          entidadId: 1,
          accion: AccionAuditoria.ELIMINAR,
        }),
        expect.anything(),
      );
    });

    it('debe rechazar la eliminación si el ciclo está FINALIZADO (RN-016)', async () => {
      prisma.cicloProduccion.findFirst.mockResolvedValue({
        id: 1,
        empresaId,
        estado: EstadoCiclo.FINALIZADO,
        _count: {
          actividades: 0,
          gastos: 0,
          cosechas: 0,
          ventas: 0,
          mermas: 0,
        },
      });

      await expect(
        service.eliminarCiclo(empresaId, usuarioId, 1),
      ).rejects.toThrow(DomainError);

      expect(prisma.cicloProduccion.update).not.toHaveBeenCalled();
      expect(auditService.registrar).not.toHaveBeenCalled();
    });

    it('debe rechazar la eliminación si el ciclo tiene gastos registrados', async () => {
      prisma.cicloProduccion.findFirst.mockResolvedValue({
        id: 1,
        empresaId,
        estado: EstadoCiclo.PLANIFICADO,
        _count: {
          actividades: 0,
          gastos: 2,
          cosechas: 0,
          ventas: 0,
          mermas: 0,
        },
      });

      await expect(
        service.eliminarCiclo(empresaId, usuarioId, 1),
      ).rejects.toThrow(DomainError);

      expect(prisma.cicloProduccion.update).not.toHaveBeenCalled();
      expect(auditService.registrar).not.toHaveBeenCalled();
    });
  });
});
