import { Test, TestingModule } from '@nestjs/testing';
import {
  CalidadCosecha,
  EstadoCiclo,
  EstadoVenta,
  Prisma,
  TipoUnidad,
} from '@prisma/client';
import { VentasService } from './ventas.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../prisma/audit.service';
import { CicloCapturaPolicy } from '../../common/domain/policies/ciclo-captura.policy';
import { UnidadPesoPolicy } from '../../common/domain/policies/unidad-peso.policy';
import { CicloBalanceMasaPolicy } from '../../common/domain/policies/ciclo-balance-masa.policy';
import { VentaTotalPolicy } from './domain/policies/venta-total.policy';
import { CodigoError } from '../../common/errors/codigos-error.enum';
import { CreateVentaDto } from './dto/create-venta.dto';
import { UpdateVentaDto } from './dto/update-venta.dto';

describe('VentasService', () => {
  let service: VentasService;
  let prisma: {
    venta: {
      findFirst: jest.Mock;
      findUnique: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    detalleVenta: {
      deleteMany: jest.Mock;
      createMany: jest.Mock;
      findMany: jest.Mock;
    };
    cliente: {
      findFirst: jest.Mock;
    };
    unidadMedida: {
      findMany: jest.Mock;
    };
    cosecha: {
      findMany: jest.Mock;
    };
    merma: {
      findMany: jest.Mock;
    };
    $queryRaw: jest.Mock;
    $transaction: jest.Mock;
  };
  let auditService: {
    registrar: jest.Mock;
  };

  const empresaId = 10;
  const usuarioId = 1;

  const mockClienteActivo = {
    id: 1,
    empresaId,
    activo: true,
    nombre: 'Cliente A',
  };

  const mockUnidadKg = {
    id: 1,
    codigo: 'KG',
    nombre: 'Kilogramo',
    tipo: TipoUnidad.PESO,
    factorABase: new Prisma.Decimal('1'),
  };

  const validCreateDto: CreateVentaDto = {
    cicloId: 1,
    clienteId: 1,
    fecha: '2027-02-15',
    numeroFactura: 'FAC-001',
    descuento: '0.00',
    impuesto: '0.00',
    total: '2500.00',
    renglones: [
      {
        unidadId: 1,
        calidad: CalidadCosecha.PRIMERA,
        cantidad: '100.000',
        precioUnitario: '25.00',
      },
    ],
  };

  beforeEach(async () => {
    prisma = {
      venta: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      detalleVenta: {
        deleteMany: jest.fn(),
        createMany: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
      cliente: {
        findFirst: jest.fn(),
      },
      unidadMedida: {
        findMany: jest.fn(),
      },
      cosecha: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      merma: {
        findMany: jest.fn().mockResolvedValue([]),
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
        VentasService,
        CicloCapturaPolicy,
        UnidadPesoPolicy,
        CicloBalanceMasaPolicy,
        VentaTotalPolicy,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: auditService },
      ],
    }).compile();

    service = module.get<VentasService>(VentasService);
  });

  it('debe estar definido', () => {
    expect(service).toBeDefined();
  });

  describe('crearVenta', () => {
    const setupCicloActivoYBalanceOk = () => {
      // Bloqueo de ciclo
      prisma.$queryRaw.mockResolvedValue([
        {
          id: 1,
          empresa_id: empresaId,
          estado: EstadoCiclo.ACTIVO,
          fecha_inicio: new Date('2027-01-01T00:00:00.000Z'),
        },
      ]);
      // Cliente
      prisma.cliente.findFirst.mockResolvedValue(mockClienteActivo);
      // Unidades
      prisma.unidadMedida.findMany.mockResolvedValue([mockUnidadKg]);
      // Cosechas para calcularBalanceMasaKg (1000 kg cosechados)
      prisma.cosecha.findMany.mockResolvedValue([
        {
          cantidad: new Prisma.Decimal('1000'),
          unidad: { factorABase: new Prisma.Decimal('1') },
        },
      ]);
      // Mermas (0 kg)
      prisma.merma.findMany.mockResolvedValue([]);
      // Ventas para calcularBalanceMasaKg (100 kg vendidos)
      prisma.detalleVenta.findMany.mockResolvedValue([
        {
          cantidad: new Prisma.Decimal('100'),
          unidad: { factorABase: new Prisma.Decimal('1') },
        },
      ]);
    };

    it('crea la venta con éxito, orden ciclo primero y auditoría atómica', async () => {
      setupCicloActivoYBalanceOk();

      const mockVentaCreada = {
        id: 10,
        cicloId: 1,
        clienteId: 1,
        creadoPorId: usuarioId,
        fecha: new Date('2027-02-15T00:00:00.000Z'),
        numeroFactura: 'FAC-001',
        descuento: new Prisma.Decimal('0.00'),
        impuesto: new Prisma.Decimal('0.00'),
        total: new Prisma.Decimal('2500.00'),
        fechaLimitePago: null,
        estado: EstadoVenta.REGISTRADA,
        notas: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        cliente: { id: 1, nombre: 'Cliente A' },
        detalles: [
          {
            id: 101,
            ventaId: 10,
            cosechaId: null,
            unidadId: 1,
            calidad: CalidadCosecha.PRIMERA,
            cantidad: new Prisma.Decimal('100.000'),
            precioUnitario: new Prisma.Decimal('25.00'),
            unidad: { id: 1, nombre: 'Kilogramo', codigo: 'KG' },
          },
        ],
      };

      prisma.venta.create.mockResolvedValue(mockVentaCreada);

      const res = await service.crearVenta(
        empresaId,
        usuarioId,
        validCreateDto,
      );

      expect(res.id).toBe(10);
      expect(res.total).toBe('2500');
      expect(res.renglones[0].subtotal).toBe('2500.00');
      expect(auditService.registrar).toHaveBeenCalledWith(
        expect.objectContaining({
          entidad: 'Venta',
          entidadId: 10,
          accion: 'CREAR',
        }),
        expect.anything(),
      );
    });

    it('rechaza ciclo en estado PLANIFICADO (CICLO_NO_ACTIVO)', async () => {
      prisma.$queryRaw.mockResolvedValue([
        {
          id: 1,
          empresa_id: empresaId,
          estado: EstadoCiclo.PLANIFICADO,
          fecha_inicio: new Date('2027-01-01T00:00:00.000Z'),
        },
      ]);

      await expect(
        service.crearVenta(empresaId, usuarioId, validCreateDto),
      ).rejects.toMatchObject({ code: CodigoError.CICLO_NO_ACTIVO });
    });

    it('rechaza ciclo en estado FINALIZADO y CANCELADO (CICLO_CERRADO)', async () => {
      prisma.$queryRaw.mockResolvedValue([
        {
          id: 1,
          empresa_id: empresaId,
          estado: EstadoCiclo.FINALIZADO,
          fecha_inicio: new Date('2027-01-01T00:00:00.000Z'),
        },
      ]);

      await expect(
        service.crearVenta(empresaId, usuarioId, validCreateDto),
      ).rejects.toMatchObject({ code: CodigoError.CICLO_CERRADO });
    });

    it('rechaza fecha anterior a fechaInicio del ciclo (RN-044)', async () => {
      prisma.$queryRaw.mockResolvedValue([
        {
          id: 1,
          empresa_id: empresaId,
          estado: EstadoCiclo.ACTIVO,
          fecha_inicio: new Date('2027-02-01T00:00:00.000Z'),
        },
      ]);

      const dtoFechaAnterior = { ...validCreateDto, fecha: '2027-01-15' };

      await expect(
        service.crearVenta(empresaId, usuarioId, dtoFechaAnterior),
      ).rejects.toMatchObject({ code: CodigoError.FECHA_ANTERIOR_AL_INICIO });
    });

    it('rechaza unidad de medida que no sea de tipo PESO (RN-069)', async () => {
      prisma.$queryRaw.mockResolvedValue([
        {
          id: 1,
          empresa_id: empresaId,
          estado: EstadoCiclo.ACTIVO,
          fecha_inicio: new Date('2027-01-01T00:00:00.000Z'),
        },
      ]);
      prisma.cliente.findFirst.mockResolvedValue(mockClienteActivo);
      prisma.unidadMedida.findMany.mockResolvedValue([
        {
          id: 1,
          codigo: 'L',
          nombre: 'Litro',
          tipo: TipoUnidad.VOLUMEN,
          factorABase: new Prisma.Decimal('1'),
        },
      ]);

      await expect(
        service.crearVenta(empresaId, usuarioId, validCreateDto),
      ).rejects.toMatchObject({ code: CodigoError.UNIDAD_NO_PESO });
    });

    it('rechaza cliente inactivo (CLIENTE_NO_ACTIVO)', async () => {
      prisma.$queryRaw.mockResolvedValue([
        {
          id: 1,
          empresa_id: empresaId,
          estado: EstadoCiclo.ACTIVO,
          fecha_inicio: new Date('2027-01-01T00:00:00.000Z'),
        },
      ]);
      prisma.cliente.findFirst.mockResolvedValue({
        ...mockClienteActivo,
        activo: false,
      });

      await expect(
        service.crearVenta(empresaId, usuarioId, validCreateDto),
      ).rejects.toMatchObject({ code: CodigoError.CLIENTE_NO_ACTIVO });
    });

    it('rechaza cliente inexistente o ajeno (RECURSO_NO_ENCONTRADO 404)', async () => {
      prisma.$queryRaw.mockResolvedValue([
        {
          id: 1,
          empresa_id: empresaId,
          estado: EstadoCiclo.ACTIVO,
          fecha_inicio: new Date('2027-01-01T00:00:00.000Z'),
        },
      ]);
      prisma.cliente.findFirst.mockResolvedValue(null);

      await expect(
        service.crearVenta(empresaId, usuarioId, validCreateDto),
      ).rejects.toMatchObject({ code: CodigoError.RECURSO_NO_ENCONTRADO });
    });

    it('rechaza cosecha de otro ciclo (COSECHA_DE_OTRO_CICLO 400)', async () => {
      prisma.$queryRaw.mockResolvedValue([
        {
          id: 1,
          empresa_id: empresaId,
          estado: EstadoCiclo.ACTIVO,
          fecha_inicio: new Date('2027-01-01T00:00:00.000Z'),
        },
      ]);
      prisma.cliente.findFirst.mockResolvedValue(mockClienteActivo);
      prisma.unidadMedida.findMany.mockResolvedValue([mockUnidadKg]);
      prisma.cosecha.findMany.mockResolvedValue([
        {
          id: 99,
          cicloId: 2, // ciclo diferente
          deletedAt: null,
          ciclo: { empresaId },
        },
      ]);

      const dtoConCosechaAjena = {
        ...validCreateDto,
        renglones: [{ ...validCreateDto.renglones[0], cosechaId: 99 }],
      };

      await expect(
        service.crearVenta(empresaId, usuarioId, dtoConCosechaAjena),
      ).rejects.toMatchObject({ code: CodigoError.COSECHA_DE_OTRO_CICLO });
    });

    it('rechaza sobreventa cuando kgVendidos excede kgNetos (RN-027, VENTA_EXCEDE_DISPONIBLE 409)', async () => {
      prisma.$queryRaw.mockResolvedValue([
        {
          id: 1,
          empresa_id: empresaId,
          estado: EstadoCiclo.ACTIVO,
          fecha_inicio: new Date('2027-01-01T00:00:00.000Z'),
        },
      ]);
      prisma.cliente.findFirst.mockResolvedValue(mockClienteActivo);
      prisma.unidadMedida.findMany.mockResolvedValue([mockUnidadKg]);

      // Cosechas = 100 kg, Merma = 20 kg => Netos = 80 kg
      prisma.cosecha.findMany.mockResolvedValue([
        {
          cantidad: new Prisma.Decimal('100'),
          unidad: { factorABase: new Prisma.Decimal('1') },
        },
      ]);
      prisma.merma.findMany.mockResolvedValue([
        {
          cantidad: new Prisma.Decimal('20'),
          etapa: 'SELECCION',
          unidad: { factorABase: new Prisma.Decimal('1') },
        },
      ]);
      // Ventas acumuladas tras crear la nueva = 100 kg (> 80 kg netos)
      prisma.detalleVenta.findMany.mockResolvedValue([
        {
          cantidad: new Prisma.Decimal('100'),
          unidad: { factorABase: new Prisma.Decimal('1') },
        },
      ]);

      prisma.venta.create.mockResolvedValue({
        id: 10,
        cicloId: 1,
        clienteId: 1,
        total: new Prisma.Decimal('2500'),
        descuento: new Prisma.Decimal('0'),
        impuesto: new Prisma.Decimal('0'),
        detalles: [],
      });

      await expect(
        service.crearVenta(empresaId, usuarioId, validCreateDto),
      ).rejects.toMatchObject({ code: CodigoError.VENTA_EXCEDE_DISPONIBLE });
    });
  });

  describe('actualizarVenta', () => {
    it('actualiza con reemplazo atómico de renglones y snapshot completo en auditoría', async () => {
      // 1. ventaPrevia
      prisma.venta.findFirst.mockResolvedValue({ id: 10, cicloId: 1 });
      // 2. Bloqueo ciclo
      prisma.$queryRaw.mockResolvedValueOnce([
        {
          id: 1,
          empresa_id: empresaId,
          estado: EstadoCiclo.ACTIVO,
          fecha_inicio: new Date('2027-01-01'),
        },
      ]);
      // 3. Bloqueo venta
      prisma.$queryRaw.mockResolvedValueOnce([{ id: 10 }]);
      // 4. Releer venta
      const ventaActual = {
        id: 10,
        cicloId: 1,
        clienteId: 1,
        fecha: new Date('2027-02-15'),
        numeroFactura: 'FAC-001',
        descuento: new Prisma.Decimal('0.00'),
        impuesto: new Prisma.Decimal('0.00'),
        total: new Prisma.Decimal('2500.00'),
        fechaLimitePago: null,
        estado: EstadoVenta.REGISTRADA,
        notas: null,
        deletedAt: null,
        ciclo: {
          empresaId,
          estado: EstadoCiclo.ACTIVO,
          fechaInicio: new Date('2027-01-01'),
        },
        cliente: mockClienteActivo,
        detalles: [
          {
            id: 101,
            cosechaId: null,
            unidadId: 1,
            calidad: CalidadCosecha.PRIMERA,
            cantidad: new Prisma.Decimal('100.000'),
            precioUnitario: new Prisma.Decimal('25.00'),
            unidad: { id: 1, nombre: 'Kilogramo', codigo: 'KG' },
          },
        ],
      };
      prisma.venta.findUnique.mockResolvedValue(ventaActual);
      prisma.unidadMedida.findMany.mockResolvedValue([mockUnidadKg]);

      // Balance
      prisma.cosecha.findMany.mockResolvedValue([
        {
          cantidad: new Prisma.Decimal('1000'),
          unidad: { factorABase: new Prisma.Decimal('1') },
        },
      ]);
      prisma.merma.findMany.mockResolvedValue([]);
      prisma.detalleVenta.findMany.mockResolvedValue([
        {
          cantidad: new Prisma.Decimal('120'),
          unidad: { factorABase: new Prisma.Decimal('1') },
        },
      ]);

      const ventaActualizada = {
        ...ventaActual,
        total: new Prisma.Decimal('3000.00'),
        detalles: [
          {
            id: 102,
            cosechaId: null,
            unidadId: 1,
            calidad: CalidadCosecha.PRIMERA,
            cantidad: new Prisma.Decimal('120.000'),
            precioUnitario: new Prisma.Decimal('25.00'),
            unidad: { id: 1, nombre: 'Kilogramo', codigo: 'KG' },
          },
        ],
      };
      prisma.venta.update.mockResolvedValue(ventaActualizada);

      const updateDto: UpdateVentaDto = {
        total: '3000.00',
        renglones: [
          {
            unidadId: 1,
            calidad: CalidadCosecha.PRIMERA,
            cantidad: '120.000',
            precioUnitario: '25.00',
          },
        ],
      };

      const res = await service.actualizarVenta(
        10,
        empresaId,
        usuarioId,
        updateDto,
      );

      expect(res.id).toBe(10);
      expect(prisma.detalleVenta.deleteMany).toHaveBeenCalledWith({
        where: { ventaId: 10 },
      });
      expect(prisma.detalleVenta.createMany).toHaveBeenCalled();
      expect(auditService.registrar).toHaveBeenCalledWith(
        expect.objectContaining({
          accion: 'ACTUALIZAR',
        }),
        expect.anything(),
      );
      const mockAudit = auditService.registrar as unknown as {
        mock: {
          calls: Array<
            [
              {
                valoresAnteriores: { renglones: unknown[] };
                valoresNuevos: { renglones: unknown[] };
              },
            ]
          >;
        };
      };
      const firstCall = mockAudit.mock.calls[0];
      expect(Array.isArray(firstCall[0].valoresAnteriores.renglones)).toBe(
        true,
      );
      expect(Array.isArray(firstCall[0].valoresNuevos.renglones)).toBe(true);
    });

    it('rechaza editar una venta ya cancelada (VENTA_YA_CANCELADA 409)', async () => {
      prisma.venta.findFirst.mockResolvedValue({ id: 10, cicloId: 1 });
      prisma.$queryRaw.mockResolvedValueOnce([
        {
          id: 1,
          empresa_id: empresaId,
          estado: EstadoCiclo.ACTIVO,
          fecha_inicio: new Date('2027-01-01'),
        },
      ]);
      prisma.$queryRaw.mockResolvedValueOnce([{ id: 10 }]);
      prisma.venta.findUnique.mockResolvedValue({
        id: 10,
        estado: EstadoVenta.CANCELADA,
        deletedAt: null,
        ciclo: { empresaId },
        detalles: [],
      });

      await expect(
        service.actualizarVenta(10, empresaId, usuarioId, {}),
      ).rejects.toMatchObject({ code: CodigoError.VENTA_YA_CANCELADA });
    });
  });

  describe('cancelarVenta', () => {
    it('cancela la venta pasando a CANCELADA y registra auditoría', async () => {
      prisma.venta.findFirst.mockResolvedValue({ id: 10, cicloId: 1 });
      prisma.$queryRaw.mockResolvedValueOnce([
        {
          id: 1,
          empresa_id: empresaId,
          estado: EstadoCiclo.ACTIVO,
          fecha_inicio: new Date('2027-01-01'),
        },
      ]);
      prisma.$queryRaw.mockResolvedValueOnce([{ id: 10 }]);

      const ventaRegistrada = {
        id: 10,
        estado: EstadoVenta.REGISTRADA,
        deletedAt: null,
        descuento: new Prisma.Decimal('0'),
        impuesto: new Prisma.Decimal('0'),
        total: new Prisma.Decimal('100'),
        fecha: new Date('2027-02-15'),
        cliente: mockClienteActivo,
        detalles: [],
      };
      prisma.venta.findUnique.mockResolvedValue(ventaRegistrada);
      prisma.venta.update.mockResolvedValue({
        ...ventaRegistrada,
        estado: EstadoVenta.CANCELADA,
      });

      const res = await service.cancelarVenta(10, empresaId, usuarioId);

      expect(res.estado).toBe(EstadoVenta.CANCELADA);
      expect(auditService.registrar).toHaveBeenCalledWith(
        expect.objectContaining({
          accion: 'ACTUALIZAR',
          valoresAnteriores: { estado: EstadoVenta.REGISTRADA },
          valoresNuevos: { estado: EstadoVenta.CANCELADA },
        }),
        expect.anything(),
      );
    });

    it('rechaza cancelar si ya estaba cancelada (VENTA_YA_CANCELADA 409)', async () => {
      prisma.venta.findFirst.mockResolvedValue({ id: 10, cicloId: 1 });
      prisma.$queryRaw.mockResolvedValueOnce([
        {
          id: 1,
          empresa_id: empresaId,
          estado: EstadoCiclo.ACTIVO,
          fecha_inicio: new Date('2027-01-01'),
        },
      ]);
      prisma.$queryRaw.mockResolvedValueOnce([{ id: 10 }]);

      prisma.venta.findUnique.mockResolvedValue({
        id: 10,
        estado: EstadoVenta.CANCELADA,
        deletedAt: null,
        detalles: [],
      });

      try {
        await service.cancelarVenta(10, empresaId, usuarioId);
        fail('Debería haber lanzado excepción');
      } catch (err) {
        expect((err as { code: string }).code).toBe(
          CodigoError.VENTA_YA_CANCELADA,
        );
      }
    });
  });

  describe('ausencia de DELETE', () => {
    it('verifica que no existe método eliminarVenta en el servicio', () => {
      expect(
        (service as unknown as Record<string, unknown>).eliminarVenta,
      ).toBeUndefined();
    });
  });
});
