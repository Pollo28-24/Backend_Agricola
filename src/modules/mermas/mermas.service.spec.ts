import { Test, TestingModule } from '@nestjs/testing';
import {
  EtapaMerma,
  EstadoCiclo,
  Prisma,
  TipoUnidad,
  AccionAuditoria,
} from '@prisma/client';
import { MermasService } from './mermas.service';
import { CicloCapturaPolicy } from '../../common/domain/policies/ciclo-captura.policy';
import { RecordWindowValidator } from '../../common/domain/validators/record-window.validator';
import { UnidadPesoPolicy } from '../../common/domain/policies/unidad-peso.policy';
import { CicloBalanceMasaPolicy } from '../../common/domain/policies/ciclo-balance-masa.policy';
import { MermaCosechaPolicy } from './domain/policies/merma-cosecha.policy';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../prisma/audit.service';
import { CodigoError } from '../../common/errors/codigos-error.enum';
import { CreateMermaDto } from './dto/create-merma.dto';

describe('MermasService', () => {
  let service: MermasService;
  let prisma: {
    merma: {
      findFirst: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    cosecha: {
      findFirst: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
    };
    motivoMerma: {
      findFirst: jest.Mock;
    };
    unidadMedida: {
      findUnique: jest.Mock;
    };
    $queryRaw: jest.Mock;
    $transaction: jest.Mock;
  };
  let auditService: {
    registrar: jest.Mock;
  };

  const empresaId = 10;
  const usuarioId = 1;

  beforeEach(async () => {
    prisma = {
      merma: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      cosecha: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
      },
      motivoMerma: {
        findFirst: jest.fn(),
      },
      unidadMedida: {
        findUnique: jest.fn(),
      },
      $queryRaw: jest.fn(),
      $transaction: jest.fn(),
    };

    prisma.$transaction.mockImplementation(
      (callback: (tx: unknown) => Promise<unknown>) => {
        return callback(prisma);
      },
    );

    auditService = {
      registrar: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MermasService,
        CicloCapturaPolicy,
        RecordWindowValidator,
        UnidadPesoPolicy,
        CicloBalanceMasaPolicy,
        MermaCosechaPolicy,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: auditService },
      ],
    }).compile();

    service = module.get<MermasService>(MermasService);
  });

  it('debe estar definido', () => {
    expect(service).toBeDefined();
  });

  describe('crearMerma', () => {
    const validDto: CreateMermaDto = {
      cicloId: 1,
      motivoId: 2,
      unidadId: 1,
      fecha: '2027-02-15',
      etapa: EtapaMerma.POSCOSECHA,
      cantidad: '50.000',
      observaciones: 'Pérdida por transporte',
    };

    it('debe registrar una merma POSCOSECHA con balance válido y auditoría', async () => {
      prisma.motivoMerma.findFirst.mockResolvedValue({ id: 2, activo: true });
      prisma.unidadMedida.findUnique.mockResolvedValue({
        id: 1,
        tipo: TipoUnidad.PESO,
        activo: true,
        factorABase: new Prisma.Decimal('1.000000'),
      });

      prisma.$queryRaw.mockResolvedValue([
        {
          id: 1,
          estado: EstadoCiclo.ACTIVO,
          fecha_inicio: new Date('2027-01-01'),
          fecha_fin: null,
          empresa_id: empresaId,
          deleted_at: null,
        },
      ]);

      const createdRecord = {
        id: 100,
        empresaId,
        cicloId: 1,
        cosechaId: null,
        motivoId: 2,
        etapa: EtapaMerma.POSCOSECHA,
        fecha: new Date('2027-02-15'),
        cantidad: new Prisma.Decimal('50.000'),
        unidadId: 1,
        observaciones: 'Pérdida por transporte',
        creadoPorId: usuarioId,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      };
      prisma.merma.create.mockResolvedValue(createdRecord);

      prisma.cosecha.findMany.mockResolvedValue([
        {
          cantidad: new Prisma.Decimal('1000.000'),
          unidad: { factorABase: new Prisma.Decimal('1.000000') },
        },
      ]);
      prisma.merma.findMany.mockResolvedValue([
        {
          cantidad: new Prisma.Decimal('50.000'),
          unidad: { factorABase: new Prisma.Decimal('1.000000') },
        },
      ]);

      prisma.merma.findFirst.mockResolvedValue({
        ...createdRecord,
        motivo: { id: 2, nombre: 'Transporte' },
        unidad: { id: 1, nombre: 'Kilogramo', abreviatura: 'kg' },
        ciclo: { id: 1, nombre: 'Ciclo Tomate 2027' },
        cosecha: null,
        creadoPor: {
          id: usuarioId,
          nombre: 'Capturista',
          email: 'cap@emp.com',
        },
      });

      const res = await service.crearMerma(empresaId, usuarioId, validDto);

      expect(res.id).toBe(100);
      expect(res.cantidad).toBe('50');
      expect(auditService.registrar).toHaveBeenCalledWith(
        expect.objectContaining({
          accion: AccionAuditoria.CREAR,
          entidad: 'Merma',
          entidadId: 100,
        }),
        prisma,
      );
    });

    it('debe rechazar la merma si el ciclo está en PLANIFICADO con CICLO_NO_ACTIVO (409)', async () => {
      prisma.motivoMerma.findFirst.mockResolvedValue({ id: 2, activo: true });
      prisma.unidadMedida.findUnique.mockResolvedValue({
        id: 1,
        tipo: TipoUnidad.PESO,
        activo: true,
        factorABase: new Prisma.Decimal('1.000000'),
      });

      prisma.$queryRaw.mockResolvedValue([
        {
          id: 1,
          estado: EstadoCiclo.PLANIFICADO,
          fecha_inicio: new Date('2027-01-01'),
          fecha_fin: null,
          empresa_id: empresaId,
          deleted_at: null,
        },
      ]);

      await expect(
        service.crearMerma(empresaId, usuarioId, validDto),
      ).rejects.toThrow(
        expect.objectContaining({
          code: CodigoError.CICLO_NO_ACTIVO,
          status: 409,
        }),
      );
    });

    it('debe permitir merma en CAMPO aun si no hay cosechas registradas (no descuenta del balance de cosecha)', async () => {
      const dtoCampo: CreateMermaDto = {
        ...validDto,
        etapa: EtapaMerma.CAMPO,
      };

      prisma.motivoMerma.findFirst.mockResolvedValue({ id: 2, activo: true });
      prisma.unidadMedida.findUnique.mockResolvedValue({
        id: 1,
        tipo: TipoUnidad.PESO,
        activo: true,
        factorABase: new Prisma.Decimal('1.000000'),
      });

      prisma.$queryRaw.mockResolvedValue([
        {
          id: 1,
          estado: EstadoCiclo.ACTIVO,
          fecha_inicio: new Date('2027-01-01'),
          fecha_fin: null,
          empresa_id: empresaId,
          deleted_at: null,
        },
      ]);

      const createdRecord = {
        id: 101,
        empresaId,
        cicloId: 1,
        cosechaId: null,
        motivoId: 2,
        etapa: EtapaMerma.CAMPO,
        fecha: new Date('2027-02-15'),
        cantidad: new Prisma.Decimal('50.000'),
        unidadId: 1,
        observaciones: 'Pérdida en campo',
        creadoPorId: usuarioId,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      };
      prisma.merma.create.mockResolvedValue(createdRecord);

      prisma.cosecha.findMany.mockResolvedValue([]);
      prisma.merma.findMany.mockResolvedValue([]);

      prisma.merma.findFirst.mockResolvedValue({
        ...createdRecord,
        motivo: { id: 2, nombre: 'Plaga' },
        unidad: { id: 1, nombre: 'Kilogramo', abreviatura: 'kg' },
        ciclo: { id: 1, nombre: 'Ciclo Tomate 2027' },
        cosecha: null,
        creadoPor: {
          id: usuarioId,
          nombre: 'Capturista',
          email: 'cap@emp.com',
        },
      });

      const res = await service.crearMerma(empresaId, usuarioId, dtoCampo);
      expect(res.id).toBe(101);
      expect(res.etapa).toBe(EtapaMerma.CAMPO);
    });

    it('debe rechazar con MERMA_EXCEDE_COSECHA (409) si la merma poscosecha supera el acumulado cosechado', async () => {
      prisma.motivoMerma.findFirst.mockResolvedValue({ id: 2, activo: true });
      prisma.unidadMedida.findUnique.mockResolvedValue({
        id: 1,
        tipo: TipoUnidad.PESO,
        activo: true,
        factorABase: new Prisma.Decimal('1.000000'),
      });

      prisma.$queryRaw.mockResolvedValue([
        {
          id: 1,
          estado: EstadoCiclo.ACTIVO,
          fecha_inicio: new Date('2027-01-01'),
          fecha_fin: null,
          empresa_id: empresaId,
          deleted_at: null,
        },
      ]);

      prisma.merma.create.mockResolvedValue({ id: 102 });

      prisma.cosecha.findMany.mockResolvedValue([
        {
          cantidad: new Prisma.Decimal('100.000'),
          unidad: { factorABase: new Prisma.Decimal('1.000000') },
        },
      ]);
      prisma.merma.findMany.mockResolvedValue([
        {
          cantidad: new Prisma.Decimal('120.000'),
          unidad: { factorABase: new Prisma.Decimal('1.000000') },
        },
      ]);

      await expect(
        service.crearMerma(empresaId, usuarioId, validDto),
      ).rejects.toThrow(
        expect.objectContaining({
          code: CodigoError.MERMA_EXCEDE_COSECHA,
          status: 409,
        }),
      );
    });

    it('debe rechazar con COSECHA_DE_OTRO_CICLO (400) si la cosecha asociada pertenece a otro ciclo (RN-049)', async () => {
      const dtoConCosechaAjena: CreateMermaDto = {
        ...validDto,
        cosechaId: 99,
      };

      prisma.motivoMerma.findFirst.mockResolvedValue({ id: 2, activo: true });
      prisma.unidadMedida.findUnique.mockResolvedValue({
        id: 1,
        tipo: TipoUnidad.PESO,
        activo: true,
        factorABase: new Prisma.Decimal('1.000000'),
      });

      prisma.cosecha.findFirst.mockResolvedValue({
        id: 99,
        cicloId: 2,
        empresaId,
      });

      await expect(
        service.crearMerma(empresaId, usuarioId, dtoConCosechaAjena),
      ).rejects.toThrow(
        expect.objectContaining({
          code: CodigoError.COSECHA_DE_OTRO_CICLO,
          status: 400,
        }),
      );
    });
  });

  describe('eliminarMerma', () => {
    it('debe rechazar la eliminación si el usuario no tiene registro:administrar', async () => {
      await expect(
        service.eliminarMerma(empresaId, usuarioId, false, 1),
      ).rejects.toThrow(
        expect.objectContaining({
          status: 403,
        }),
      );
    });

    it('debe permitir la eliminación si el usuario tiene registro:administrar y registrar auditoría', async () => {
      prisma.merma.findFirst.mockResolvedValue({
        id: 1,
        empresaId,
        cicloId: 1,
        creadoPorId: usuarioId,
        cantidad: new Prisma.Decimal('50.000'),
        createdAt: new Date(),
        deletedAt: null,
      });

      prisma.$queryRaw.mockResolvedValue([
        {
          id: 1,
          estado: EstadoCiclo.ACTIVO,
          fecha_inicio: new Date('2027-01-01'),
          fecha_fin: null,
          empresa_id: empresaId,
          deleted_at: null,
        },
      ]);

      prisma.merma.update.mockResolvedValue({ id: 1, deletedAt: new Date() });

      const res = await service.eliminarMerma(empresaId, usuarioId, true, 1);
      expect(res.message).toContain('eliminada');
      expect(auditService.registrar).toHaveBeenCalledWith(
        expect.objectContaining({
          accion: AccionAuditoria.ELIMINAR,
          entidad: 'Merma',
          entidadId: 1,
        }),
        prisma,
      );
    });
  });

  describe('listarMermas (scoped visibility)', () => {
    it('debe filtrar por creadoPorId si el usuario no tiene registro:administrar', async () => {
      prisma.merma.findMany.mockResolvedValue([]);
      prisma.merma.count.mockResolvedValue(0);

      await service.listarMermas(empresaId, usuarioId, false, { cicloId: 1 });

      expect(prisma.merma.findMany).toHaveBeenCalled();
      const mockCalls = (
        prisma.merma.findMany as {
          mock: {
            calls: Array<
              [{ where?: { cicloId?: number; creadoPorId?: number } }]
            >;
          };
        }
      ).mock.calls;
      const llamada = mockCalls[0]?.[0];
      expect(llamada?.where?.cicloId).toBe(1);
      expect(llamada?.where?.creadoPorId).toBe(usuarioId);
    });

    it('debe ver todas las mermas si el usuario tiene registro:administrar', async () => {
      prisma.merma.findMany.mockResolvedValue([]);
      prisma.merma.count.mockResolvedValue(0);

      await service.listarMermas(empresaId, usuarioId, true, { cicloId: 1 });

      expect(prisma.merma.findMany).toHaveBeenCalled();
      const mockCalls = (
        prisma.merma.findMany as {
          mock: {
            calls: Array<
              [{ where?: { cicloId?: number; creadoPorId?: number } }]
            >;
          };
        }
      ).mock.calls;
      const llamada = mockCalls[0]?.[0];
      expect(llamada?.where?.cicloId).toBe(1);
      expect(llamada?.where?.creadoPorId).toBeUndefined();
    });
  });
});
