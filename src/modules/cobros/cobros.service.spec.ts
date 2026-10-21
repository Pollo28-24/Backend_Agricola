import { Test, TestingModule } from '@nestjs/testing';
import { EstadoCiclo, EstadoVenta, MetodoPago, Prisma } from '@prisma/client';
import { CobrosService } from './cobros.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../prisma/audit.service';
import { CicloCapturaPolicy } from '../../common/domain/policies/ciclo-captura.policy';
import { CodigoError } from '../../common/errors/codigos-error.enum';
import { CreateCobroDto } from './dto/create-cobro.dto';

describe('CobrosService (RN-054, RN-063, RN-071, RN-073)', () => {
  let service: CobrosService;

  let prisma: {
    venta: {
      findFirst: jest.Mock;
    };
    cobroVenta: {
      findFirst: jest.Mock;
      findUnique: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      aggregate: jest.Mock;
    };
    $queryRaw: jest.Mock;
    $transaction: jest.Mock;
  };

  let auditService: {
    registrar: jest.Mock;
  };

  const empresaId = 10;
  const usuarioId = 1;
  const ventaId = 5;

  const validCreateDto: CreateCobroDto = {
    fecha: '2026-03-15',
    monto: '500.00',
    metodo: MetodoPago.EFECTIVO,
    referencia: 'REF-001',
  };

  beforeEach(async () => {
    prisma = {
      venta: {
        findFirst: jest.fn(),
      },
      cobroVenta: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        aggregate: jest.fn(),
      },
      $queryRaw: jest.fn(),
      $transaction: jest.fn(),
    };

    prisma.$transaction.mockImplementation(
      (callback: (tx: unknown) => Promise<unknown>) => callback(prisma),
    );

    auditService = {
      registrar: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CobrosService,
        CicloCapturaPolicy,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: auditService },
      ],
    }).compile();

    service = module.get<CobrosService>(CobrosService);
  });

  it('debe estar definido', () => {
    expect(service).toBeDefined();
  });

  describe('registrarCobro', () => {
    const setupVentaYCicloActivoOk = (totalVenta = '1000.00') => {
      // 1. Lectura preliminar
      prisma.venta.findFirst.mockResolvedValue({ id: ventaId, cicloId: 1 });
      // 2. Lock del ciclo
      prisma.$queryRaw.mockResolvedValueOnce([
        {
          id: 1,
          empresa_id: empresaId,
          estado: EstadoCiclo.ACTIVO,
          fecha_inicio: new Date('2026-01-01'),
        },
      ]);
      // 4. Lock y relectura de venta
      prisma.$queryRaw.mockResolvedValueOnce([
        {
          id: ventaId,
          cicloId: 1,
          clienteId: 2,
          total: totalVenta,
          estado: EstadoVenta.REGISTRADA,
          fechaLimitePago: '2026-03-31',
          fecha: '2026-03-01',
        },
      ]);
    };

    it('registra cobro exitosamente con orden de locks y auditoría atómica', async () => {
      setupVentaYCicloActivoOk('1000.00');

      // 7. Cobros vigentes previos: 0
      prisma.cobroVenta.aggregate.mockResolvedValueOnce({
        _sum: { monto: null },
      });

      const mockCobroCreado = {
        id: 101,
        ventaId,
        registradoPorId: usuarioId,
        fecha: new Date('2026-03-15'),
        monto: new Prisma.Decimal('500.00'),
        metodo: MetodoPago.EFECTIVO,
        referencia: 'REF-001',
        createdAt: new Date(),
        deletedAt: null,
        registradoPor: { id: usuarioId, nombre: 'Admin User' },
      };
      prisma.cobroVenta.create.mockResolvedValue(mockCobroCreado);

      const res = await service.registrarCobro(
        empresaId,
        usuarioId,
        ventaId,
        validCreateDto,
      );

      expect(res.id).toBe(101);
      expect(res.monto).toBe('500.00');
      expect(auditService.registrar).toHaveBeenCalledTimes(1);
      expect(auditService.registrar).toHaveBeenCalledWith(
        expect.objectContaining({
          entidad: 'CobroVenta',
          entidadId: 101,
          accion: 'CREAR',
        }),
        expect.anything(),
      );
    });

    it('permite registrar cobro si la suma llega EXACTA al total de la venta', async () => {
      setupVentaYCicloActivoOk('500.00');

      prisma.cobroVenta.aggregate.mockResolvedValueOnce({
        _sum: { monto: null },
      });

      const mockCobroCreado = {
        id: 102,
        ventaId,
        registradoPorId: usuarioId,
        fecha: new Date('2026-03-15'),
        monto: new Prisma.Decimal('500.00'),
        metodo: MetodoPago.EFECTIVO,
        referencia: null,
        createdAt: new Date(),
        deletedAt: null,
        registradoPor: { id: usuarioId, nombre: 'Admin User' },
      };
      prisma.cobroVenta.create.mockResolvedValue(mockCobroCreado);

      const res = await service.registrarCobro(
        empresaId,
        usuarioId,
        ventaId,
        validCreateDto,
      );
      expect(res.monto).toBe('500.00');
    });

    it('rechaza con COBRO_EXCEDE_TOTAL (409) si sumaVigentes + monto excede por +0.01 el total', async () => {
      setupVentaYCicloActivoOk('1000.00');

      // Ya hay 600 cobrados vigentes, e intenta pagar 500 (total 1100 > 1000)
      prisma.cobroVenta.aggregate.mockResolvedValueOnce({
        _sum: { monto: new Prisma.Decimal('600.00') },
      });

      await expect(
        service.registrarCobro(empresaId, usuarioId, ventaId, validCreateDto),
      ).rejects.toMatchObject({
        code: CodigoError.COBRO_EXCEDE_TOTAL,
      });
    });

    it('rechaza con VENTA_YA_CANCELADA (409) si la venta está cancelada', async () => {
      prisma.venta.findFirst.mockResolvedValue({ id: ventaId, cicloId: 1 });
      prisma.$queryRaw.mockResolvedValueOnce([
        {
          id: 1,
          empresa_id: empresaId,
          estado: EstadoCiclo.ACTIVO,
          fecha_inicio: new Date('2026-01-01'),
        },
      ]);
      // Venta cancelada
      prisma.$queryRaw.mockResolvedValueOnce([
        {
          id: ventaId,
          cicloId: 1,
          clienteId: 2,
          total: '1000.00',
          estado: EstadoVenta.CANCELADA,
          fechaLimitePago: '2026-03-31',
          fecha: '2026-03-01',
        },
      ]);

      await expect(
        service.registrarCobro(empresaId, usuarioId, ventaId, validCreateDto),
      ).rejects.toMatchObject({
        code: CodigoError.VENTA_YA_CANCELADA,
      });
    });

    it('rechaza con FECHA_COBRO_INVALIDA (400) si la fecha es anterior a la fecha de la venta', async () => {
      prisma.venta.findFirst.mockResolvedValue({ id: ventaId, cicloId: 1 });
      prisma.$queryRaw.mockResolvedValueOnce([
        {
          id: 1,
          empresa_id: empresaId,
          estado: EstadoCiclo.ACTIVO,
          fecha_inicio: new Date('2026-01-01'),
        },
      ]);
      // Venta con fecha 2026-03-20
      prisma.$queryRaw.mockResolvedValueOnce([
        {
          id: ventaId,
          cicloId: 1,
          clienteId: 2,
          total: '1000.00',
          estado: EstadoVenta.REGISTRADA,
          fechaLimitePago: '2026-03-31',
          fecha: '2026-03-20',
        },
      ]);

      // Cobro con fecha 2026-03-15 (anterior a venta 2026-03-20)
      await expect(
        service.registrarCobro(empresaId, usuarioId, ventaId, {
          ...validCreateDto,
          fecha: '2026-03-15',
        }),
      ).rejects.toMatchObject({
        code: CodigoError.FECHA_COBRO_INVALIDA,
      });
    });

    it('permite registrar cobro en ciclo FINALIZADO (Tabla 2.6)', async () => {
      prisma.venta.findFirst.mockResolvedValue({ id: ventaId, cicloId: 1 });
      prisma.$queryRaw.mockResolvedValueOnce([
        {
          id: 1,
          empresa_id: empresaId,
          estado: EstadoCiclo.FINALIZADO,
          fecha_inicio: new Date('2026-01-01'),
        },
      ]);
      prisma.$queryRaw.mockResolvedValueOnce([
        {
          id: ventaId,
          cicloId: 1,
          clienteId: 2,
          total: '1000.00',
          estado: EstadoVenta.REGISTRADA,
          fechaLimitePago: '2026-03-31',
          fecha: '2026-03-01',
        },
      ]);
      prisma.cobroVenta.aggregate.mockResolvedValueOnce({
        _sum: { monto: null },
      });
      prisma.cobroVenta.create.mockResolvedValue({
        id: 103,
        ventaId,
        registradoPorId: usuarioId,
        fecha: new Date('2026-03-15'),
        monto: new Prisma.Decimal('100.00'),
        metodo: MetodoPago.EFECTIVO,
        referencia: null,
        createdAt: new Date(),
        deletedAt: null,
        registradoPor: { id: usuarioId, nombre: 'Admin' },
      });

      const res = await service.registrarCobro(
        empresaId,
        usuarioId,
        ventaId,
        validCreateDto,
      );
      expect(res.id).toBe(103);
    });

    it('rechaza con CICLO_NO_ACTIVO (409) en ciclo PLANIFICADO', async () => {
      prisma.venta.findFirst.mockResolvedValue({ id: ventaId, cicloId: 1 });
      prisma.$queryRaw.mockResolvedValueOnce([
        {
          id: 1,
          empresa_id: empresaId,
          estado: EstadoCiclo.PLANIFICADO,
          fecha_inicio: new Date('2026-01-01'),
        },
      ]);

      await expect(
        service.registrarCobro(empresaId, usuarioId, ventaId, validCreateDto),
      ).rejects.toMatchObject({
        code: CodigoError.CICLO_NO_ACTIVO,
      });
    });

    it('rechaza con CICLO_CERRADO (409) en ciclo CANCELADO', async () => {
      prisma.venta.findFirst.mockResolvedValue({ id: ventaId, cicloId: 1 });
      prisma.$queryRaw.mockResolvedValueOnce([
        {
          id: 1,
          empresa_id: empresaId,
          estado: EstadoCiclo.CANCELADO,
          fecha_inicio: new Date('2026-01-01'),
        },
      ]);

      await expect(
        service.registrarCobro(empresaId, usuarioId, ventaId, validCreateDto),
      ).rejects.toMatchObject({
        code: CodigoError.CICLO_CERRADO,
      });
    });

    it('rechaza con 404 si la venta es inexistente o ajena a la empresa', async () => {
      prisma.venta.findFirst.mockResolvedValue(null);

      await expect(
        service.registrarCobro(empresaId, usuarioId, 999, validCreateDto),
      ).rejects.toMatchObject({
        code: CodigoError.RECURSO_NO_ENCONTRADO,
      });
    });
  });

  describe('anularCobro', () => {
    it('anula cobro exitosamente (borrado lógico) y registra auditoría ELIMINAR', async () => {
      prisma.cobroVenta.findFirst.mockResolvedValue({
        id: 50,
        ventaId,
        venta: { cicloId: 1 },
      });

      // Lock ciclo
      prisma.$queryRaw.mockResolvedValueOnce([
        {
          id: 1,
          empresa_id: empresaId,
          estado: EstadoCiclo.ACTIVO,
          fecha_inicio: new Date('2026-01-01'),
        },
      ]);
      // Lock venta
      prisma.$queryRaw.mockResolvedValueOnce([
        {
          id: ventaId,
          cicloId: 1,
          clienteId: 2,
          total: '1000.00',
          estado: EstadoVenta.REGISTRADA,
          fechaLimitePago: '2026-03-31',
          fecha: '2026-03-01',
        },
      ]);

      // Relectura de cobro bajo lock
      prisma.cobroVenta.findUnique.mockResolvedValue({
        id: 50,
        ventaId,
        fecha: new Date('2026-03-15'),
        monto: new Prisma.Decimal('500.00'),
        metodo: MetodoPago.EFECTIVO,
        referencia: null,
        createdAt: new Date(),
        deletedAt: null,
        registradoPor: { id: usuarioId, nombre: 'Admin' },
      });

      const mockCobroAnulado = {
        id: 50,
        ventaId,
        fecha: new Date('2026-03-15'),
        monto: new Prisma.Decimal('500.00'),
        metodo: MetodoPago.EFECTIVO,
        referencia: null,
        createdAt: new Date(),
        deletedAt: new Date(),
        registradoPor: { id: usuarioId, nombre: 'Admin' },
      };
      prisma.cobroVenta.update.mockResolvedValue(mockCobroAnulado);

      const res = await service.anularCobro(empresaId, usuarioId, 50);

      expect(res.deletedAt).not.toBeNull();
      expect(auditService.registrar).toHaveBeenCalledWith(
        expect.objectContaining({
          entidad: 'CobroVenta',
          entidadId: 50,
          accion: 'ELIMINAR',
        }),
        expect.anything(),
      );
    });

    it('rechaza re-anular un cobro ya anulado con COBRO_YA_ANULADO (409)', async () => {
      prisma.cobroVenta.findFirst.mockResolvedValue({
        id: 50,
        ventaId,
        venta: { cicloId: 1 },
      });

      prisma.$queryRaw.mockResolvedValueOnce([
        {
          id: 1,
          empresa_id: empresaId,
          estado: EstadoCiclo.ACTIVO,
          fecha_inicio: new Date('2026-01-01'),
        },
      ]);
      prisma.$queryRaw.mockResolvedValueOnce([
        {
          id: ventaId,
          cicloId: 1,
          clienteId: 2,
          total: '1000.00',
          estado: EstadoVenta.REGISTRADA,
          fechaLimitePago: '2026-03-31',
          fecha: '2026-03-01',
        },
      ]);

      // Cobro ya tiene deletedAt
      prisma.cobroVenta.findUnique.mockResolvedValue({
        id: 50,
        ventaId,
        fecha: new Date('2026-03-15'),
        monto: new Prisma.Decimal('500.00'),
        metodo: MetodoPago.EFECTIVO,
        referencia: null,
        createdAt: new Date(),
        deletedAt: new Date('2026-03-16'),
        registradoPor: { id: usuarioId, nombre: 'Admin' },
      });

      await expect(
        service.anularCobro(empresaId, usuarioId, 50),
      ).rejects.toMatchObject({
        code: CodigoError.COBRO_YA_ANULADO,
      });
    });

    it('permite anular cobro sobre una venta CANCELADA (conciliación manual RN-055)', async () => {
      prisma.cobroVenta.findFirst.mockResolvedValue({
        id: 50,
        ventaId,
        venta: { cicloId: 1 },
      });

      prisma.$queryRaw.mockResolvedValueOnce([
        {
          id: 1,
          empresa_id: empresaId,
          estado: EstadoCiclo.ACTIVO,
          fecha_inicio: new Date('2026-01-01'),
        },
      ]);
      // Venta cancelada
      prisma.$queryRaw.mockResolvedValueOnce([
        {
          id: ventaId,
          cicloId: 1,
          clienteId: 2,
          total: '1000.00',
          estado: EstadoVenta.CANCELADA,
          fechaLimitePago: '2026-03-31',
          fecha: '2026-03-01',
        },
      ]);

      prisma.cobroVenta.findUnique.mockResolvedValue({
        id: 50,
        ventaId,
        fecha: new Date('2026-03-15'),
        monto: new Prisma.Decimal('500.00'),
        metodo: MetodoPago.EFECTIVO,
        referencia: null,
        createdAt: new Date(),
        deletedAt: null,
        registradoPor: { id: usuarioId, nombre: 'Admin' },
      });

      prisma.cobroVenta.update.mockResolvedValue({
        id: 50,
        ventaId,
        fecha: new Date('2026-03-15'),
        monto: new Prisma.Decimal('500.00'),
        metodo: MetodoPago.EFECTIVO,
        referencia: null,
        createdAt: new Date(),
        deletedAt: new Date(),
        registradoPor: { id: usuarioId, nombre: 'Admin' },
      });

      const res = await service.anularCobro(empresaId, usuarioId, 50);
      expect(res.deletedAt).not.toBeNull();
    });

    it('rechaza anular cobro en ciclo CANCELADO con CICLO_CERRADO (409)', async () => {
      prisma.cobroVenta.findFirst.mockResolvedValue({
        id: 50,
        ventaId,
        venta: { cicloId: 1 },
      });

      prisma.$queryRaw.mockResolvedValueOnce([
        {
          id: 1,
          empresa_id: empresaId,
          estado: EstadoCiclo.CANCELADO,
          fecha_inicio: new Date('2026-01-01'),
        },
      ]);

      await expect(
        service.anularCobro(empresaId, usuarioId, 50),
      ).rejects.toMatchObject({
        code: CodigoError.CICLO_CERRADO,
      });
    });
  });

  describe('inmutabilidad: ausencia de métodos DELETE y PATCH de edición', () => {
    it('verifica que no existen métodos eliminarCobro ni actualizarCobro en el servicio', () => {
      const anyService = service as unknown as Record<string, unknown>;
      expect(anyService.eliminarCobro).toBeUndefined();
      expect(anyService.actualizarCobro).toBeUndefined();
      expect(anyService.editarCobro).toBeUndefined();
      expect(anyService.deleteCobro).toBeUndefined();
    });
  });
});
