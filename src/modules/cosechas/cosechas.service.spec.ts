import { Test, TestingModule } from '@nestjs/testing';
import {
  AccionAuditoria,
  CalidadCosecha,
  EstadoCiclo,
  Prisma,
  TipoUnidad,
} from '@prisma/client';
import { CosechasService } from './cosechas.service';
import { CicloCapturaPolicy } from '../../common/domain/policies/ciclo-captura.policy';
import { RecordWindowValidator } from '../../common/domain/validators/record-window.validator';
import { UnidadPesoPolicy } from '../../common/domain/policies/unidad-peso.policy';
import { CicloBalanceMasaPolicy } from '../../common/domain/policies/ciclo-balance-masa.policy';
import { CosechaIntegridadPolicy } from './domain/policies/cosecha-integridad.policy';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../prisma/audit.service';
import { CodigoError } from '../../common/errors/codigos-error.enum';
import { CreateCosechaDto } from './dto/create-cosecha.dto';
import { UpdateCosechaDto } from './dto/update-cosecha.dto';

describe('CosechasService', () => {
  let service: CosechasService;
  let prisma: {
    cosecha: {
      findFirst: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    merma: {
      findMany: jest.Mock;
      count: jest.Mock;
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
      cosecha: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      merma: {
        findMany: jest.fn(),
        count: jest.fn(),
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
        CosechasService,
        CicloCapturaPolicy,
        RecordWindowValidator,
        UnidadPesoPolicy,
        CicloBalanceMasaPolicy,
        CosechaIntegridadPolicy,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: auditService },
      ],
    }).compile();

    service = module.get<CosechasService>(CosechasService);
  });

  it('debe estar definido', () => {
    expect(service).toBeDefined();
  });

  describe('crearCosecha', () => {
    const validDto: CreateCosechaDto = {
      cicloId: 1,
      unidadId: 1,
      fecha: '2027-02-10',
      cantidad: '1500.000',
      calidad: CalidadCosecha.PRIMERA,
      observaciones: 'Primer corte',
    };

    const mockUnidad = {
      id: 1,
      codigo: 'KG',
      nombre: 'Kilogramo',
      tipo: TipoUnidad.PESO,
      factorABase: new Prisma.Decimal('1'),
    };

    it('debe crear una cosecha con bloqueo pesimista y auditoría en la misma tx', async () => {
      prisma.unidadMedida.findUnique.mockResolvedValue(mockUnidad);
      prisma.$queryRaw.mockResolvedValue([
        {
          id: 1,
          empresa_id: empresaId,
          estado: EstadoCiclo.ACTIVO,
          fecha_inicio: new Date('2027-01-01T00:00:00.000Z'),
        },
      ]);

      const mockCosechaCreada = {
        id: 10,
        cicloId: 1,
        unidadId: 1,
        creadoPorId: usuarioId,
        fecha: new Date('2027-02-10T00:00:00.000Z'),
        cantidad: new Prisma.Decimal('1500.000'),
        calidad: CalidadCosecha.PRIMERA,
        observaciones: 'Primer corte',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      prisma.cosecha.create.mockResolvedValue(mockCosechaCreada);

      const res = await service.crearCosecha(empresaId, usuarioId, validDto);

      expect(res.id).toBe(10);
      expect(res.cantidad).toBe('1500');
      expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(auditService.registrar).toHaveBeenCalledWith(
        expect.objectContaining({
          entidad: 'Cosecha',
          entidadId: 10,
          accion: AccionAuditoria.CREAR,
          empresaId,
          usuarioId,
        }),
        prisma,
      );
    });

    it('debe rechazar con CICLO_NO_ACTIVO (409) si el ciclo está PLANIFICADO (Tabla 2.6)', async () => {
      prisma.unidadMedida.findUnique.mockResolvedValue(mockUnidad);
      prisma.$queryRaw.mockResolvedValue([
        {
          id: 1,
          empresa_id: empresaId,
          estado: EstadoCiclo.PLANIFICADO,
          fecha_inicio: new Date('2027-01-01T00:00:00.000Z'),
        },
      ]);

      await expect(
        service.crearCosecha(empresaId, usuarioId, validDto),
      ).rejects.toThrow(
        expect.objectContaining({
          code: CodigoError.CICLO_NO_ACTIVO,
          status: 409,
        }),
      );
    });

    it('debe rechazar con UNIDAD_NO_PESO (400) si la unidad no es de tipo PESO (RN-069)', async () => {
      prisma.unidadMedida.findUnique.mockResolvedValue({
        ...mockUnidad,
        tipo: TipoUnidad.VOLUMEN,
      });

      await expect(
        service.crearCosecha(empresaId, usuarioId, validDto),
      ).rejects.toThrow(
        expect.objectContaining({
          code: CodigoError.UNIDAD_NO_PESO,
          status: 400,
        }),
      );
    });

    it('debe rechazar con FECHA_ANTERIOR_AL_INICIO (400) si la fecha es menor a fechaInicio del ciclo (RN-044)', async () => {
      prisma.unidadMedida.findUnique.mockResolvedValue(mockUnidad);
      prisma.$queryRaw.mockResolvedValue([
        {
          id: 1,
          empresa_id: empresaId,
          estado: EstadoCiclo.ACTIVO,
          fecha_inicio: new Date('2027-03-01T00:00:00.000Z'), // Ciclo inicia en marzo
        },
      ]);

      await expect(
        service.crearCosecha(empresaId, usuarioId, validDto),
      ).rejects.toThrow(
        expect.objectContaining({
          code: CodigoError.FECHA_ANTERIOR_AL_INICIO,
          status: 400,
        }),
      );
    });

    it('debe hacer rollback si falla la auditoría transaccional', async () => {
      prisma.unidadMedida.findUnique.mockResolvedValue(mockUnidad);
      prisma.$queryRaw.mockResolvedValue([
        {
          id: 1,
          empresa_id: empresaId,
          estado: EstadoCiclo.ACTIVO,
          fecha_inicio: new Date('2027-01-01T00:00:00.000Z'),
        },
      ]);
      prisma.cosecha.create.mockResolvedValue({
        id: 10,
        cantidad: new Prisma.Decimal('100'),
      });
      auditService.registrar.mockRejectedValue(
        new Error('Fallo crítico en audit log'),
      );

      await expect(
        service.crearCosecha(empresaId, usuarioId, validDto),
      ).rejects.toThrow('Fallo crítico en audit log');
    });
  });

  describe('actualizarCosecha', () => {
    const baseCosecha = {
      id: 20,
      cicloId: 1,
      unidadId: 1,
      creadoPorId: usuarioId,
      fecha: new Date('2027-02-10T00:00:00.000Z'),
      cantidad: new Prisma.Decimal('1000.000'),
      calidad: CalidadCosecha.PRIMERA,
      createdAt: new Date(),
    };

    it('debe rechazar si la reducción de cosecha viola el balance con las mermas poscosecha (RN-032 / RN-070)', async () => {
      prisma.cosecha.findFirst.mockResolvedValue(baseCosecha);
      prisma.$queryRaw.mockResolvedValue([
        {
          id: 1,
          empresa_id: empresaId,
          estado: EstadoCiclo.ACTIVO,
          fecha_inicio: new Date('2027-01-01T00:00:00.000Z'),
        },
      ]);

      // Al actualizar la cosecha a 400 kg...
      prisma.cosecha.update.mockResolvedValue({
        ...baseCosecha,
        cantidad: new Prisma.Decimal('400.000'),
      });

      // El balance acumulado relee la cosecha reducida (400 kg) y mermas poscosecha vigentes (500 kg)
      prisma.cosecha.findMany.mockResolvedValue([
        {
          cantidad: new Prisma.Decimal('400.000'),
          unidad: { factorABase: new Prisma.Decimal(1) },
        },
      ]);
      prisma.merma.findMany.mockResolvedValue([
        {
          cantidad: new Prisma.Decimal('500.000'),
          unidad: { factorABase: new Prisma.Decimal(1) },
        },
      ]);

      const dto: UpdateCosechaDto = { cantidad: '400.000' };

      await expect(
        service.actualizarCosecha(empresaId, usuarioId, false, 20, dto),
      ).rejects.toThrow(
        expect.objectContaining({
          code: CodigoError.MERMA_EXCEDE_COSECHA,
          status: 409,
        }),
      );
    });
  });

  describe('eliminarCosecha', () => {
    it('debe rechazar con COSECHA_CON_MERMAS_VIGENTES (409) si tiene mermas activas vinculadas (RN-050)', async () => {
      prisma.cosecha.findFirst.mockResolvedValue({
        id: 30,
        cicloId: 1,
        creadoPorId: usuarioId,
        createdAt: new Date(),
      });
      prisma.$queryRaw.mockResolvedValue([
        {
          id: 1,
          empresa_id: empresaId,
          estado: EstadoCiclo.ACTIVO,
          fecha_inicio: new Date('2027-01-01T00:00:00.000Z'),
        },
      ]);
      prisma.merma.count.mockResolvedValue(3); // 3 mermas asociadas

      await expect(
        service.eliminarCosecha(empresaId, usuarioId, true, 30),
      ).rejects.toThrow(
        expect.objectContaining({
          code: CodigoError.COSECHA_CON_MERMAS_VIGENTES,
          status: 409,
        }),
      );
    });
  });
});
