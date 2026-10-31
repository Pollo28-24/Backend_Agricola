import { Test, TestingModule } from '@nestjs/testing';
import { AccionAuditoria, EstadoCiclo, Prisma } from '@prisma/client';
import { GastosService } from './gastos.service';
import { CicloCapturaPolicy } from '../actividades/domain/policies/ciclo-captura.policy';
import { GastoToleranciaPolicy } from './domain/policies/gasto-tolerancia.policy';
import { GastoActividadPolicy } from './domain/policies/gasto-actividad.policy';
import { GastoWindowValidator } from './domain/validators/gasto-window.validator';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../prisma/audit.service';
import { CodigoError } from '../../common/errors/codigos-error.enum';
import { CreateGastoDto } from './dto/create-gasto.dto';
import { UpdateGastoDto } from './dto/update-gasto.dto';

describe('GastosService', () => {
  let service: GastosService;
  let prisma: {
    gasto: {
      findFirst: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    cicloProduccion: {
      findFirst: jest.Mock;
    };
    categoriaGasto: {
      findFirst: jest.Mock;
    };
    proveedor: {
      findFirst: jest.Mock;
    };
    actividad: {
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
      gasto: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      cicloProduccion: {
        findFirst: jest.fn(),
      },
      categoriaGasto: {
        findFirst: jest.fn(),
      },
      proveedor: {
        findFirst: jest.fn(),
      },
      actividad: {
        findFirst: jest.fn(),
      },
      unidadMedida: {
        findUnique: jest.fn(),
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
        GastosService,
        CicloCapturaPolicy,
        GastoToleranciaPolicy,
        GastoActividadPolicy,
        GastoWindowValidator,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: auditService },
      ],
    }).compile();

    service = module.get<GastosService>(GastosService);
  });

  it('debe estar definido', () => {
    expect(service).toBeDefined();
  });

  // =====================================================================
  // 1. CREACIÓN
  // =====================================================================

  describe('crearGasto', () => {
    const validDto: CreateGastoDto = {
      cicloId: 1,
      categoriaId: 2,
      fecha: '2027-01-15',
      total: '1000.00',
      proveedorId: 5,
      actividadId: 3,
      unidadId: 1,
      cantidad: '10.000',
      costoUnitario: '100.00',
      impuesto: '0.00',
      descripcion: 'Fertilizante soluble',
      numeroComprobante: 'FAC-001',
    };

    const mockCiclo = {
      id: 1,
      empresaId,
      estado: EstadoCiclo.ACTIVO,
      fechaInicio: new Date('2027-01-01T00:00:00.000Z'),
    };

    const mockCategoria = {
      id: 2,
      empresaId,
      activo: true,
    };

    const mockProveedor = {
      id: 5,
      empresaId,
      activo: true,
    };

    const mockActividad = {
      id: 3,
      cicloId: 1,
    };

    const mockUnidad = {
      id: 1,
      codigo: 'KG',
      nombre: 'Kilogramo',
    };

    it('debe crear un gasto exitosamente registrando auditoría en la misma transacción', async () => {
      prisma.cicloProduccion.findFirst.mockResolvedValue(mockCiclo);
      prisma.categoriaGasto.findFirst.mockResolvedValue(mockCategoria);
      prisma.proveedor.findFirst.mockResolvedValue(mockProveedor);
      prisma.actividad.findFirst.mockResolvedValue(mockActividad);
      prisma.unidadMedida.findUnique.mockResolvedValue(mockUnidad);

      const gastoCreado = {
        id: 100,
        cicloId: 1,
        categoriaId: 2,
        proveedorId: 5,
        actividadId: 3,
        unidadId: 1,
        creadoPorId: usuarioId,
        fecha: new Date('2027-01-15T00:00:00.000Z'),
        descripcion: 'Fertilizante soluble',
        cantidad: new Prisma.Decimal('10.000'),
        costoUnitario: new Prisma.Decimal('100.00'),
        impuesto: new Prisma.Decimal('0.00'),
        total: new Prisma.Decimal('1000.00'),
        numeroComprobante: 'FAC-001',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      prisma.gasto.create.mockResolvedValue(gastoCreado);

      const result = await service.crearGasto(empresaId, usuarioId, validDto);

      expect(result.id).toBe(100);
      expect(result.total).toBe('1000');
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(auditService.registrar).toHaveBeenCalledWith(
        expect.objectContaining({
          entidad: 'Gasto',
          entidadId: 100,
          accion: AccionAuditoria.CREAR,
          empresaId,
          usuarioId,
        }),
        prisma,
      );
    });

    it('debe abortar la transacción si la auditoría falla (rollback garantizado)', async () => {
      prisma.cicloProduccion.findFirst.mockResolvedValue(mockCiclo);
      prisma.categoriaGasto.findFirst.mockResolvedValue(mockCategoria);
      prisma.proveedor.findFirst.mockResolvedValue(mockProveedor);
      prisma.actividad.findFirst.mockResolvedValue(mockActividad);
      prisma.unidadMedida.findUnique.mockResolvedValue(mockUnidad);
      prisma.gasto.create.mockResolvedValue({
        id: 100,
        total: new Prisma.Decimal('1000'),
      });

      auditService.registrar.mockRejectedValue(
        new Error('Fallo crítico en audit log'),
      );

      await expect(
        service.crearGasto(empresaId, usuarioId, validDto),
      ).rejects.toThrow('Fallo crítico en audit log');
    });

    it('debe rechazar con 404 si el ciclo pertenece a otra empresa (RN-068)', async () => {
      prisma.cicloProduccion.findFirst.mockResolvedValue(null);

      await expect(
        service.crearGasto(empresaId, usuarioId, validDto),
      ).rejects.toMatchObject({
        code: CodigoError.RECURSO_NO_ENCONTRADO,
        status: 404,
      });
    });

    it('debe rechazar con 400 si la fecha del gasto es anterior a la fechaInicio del ciclo (RN-044)', async () => {
      prisma.cicloProduccion.findFirst.mockResolvedValue({
        ...mockCiclo,
        fechaInicio: new Date('2027-02-01T00:00:00.000Z'), // Ciclo inicia en febrero
      });
      prisma.categoriaGasto.findFirst.mockResolvedValue(mockCategoria);
      prisma.proveedor.findFirst.mockResolvedValue(mockProveedor);
      prisma.actividad.findFirst.mockResolvedValue(mockActividad);
      prisma.unidadMedida.findUnique.mockResolvedValue(mockUnidad);

      await expect(
        service.crearGasto(empresaId, usuarioId, {
          ...validDto,
          fecha: '2027-01-15',
        }),
      ).rejects.toMatchObject({
        code: CodigoError.FECHA_ANTERIOR_AL_INICIO,
        status: 400,
      });
    });

    it('debe rechazar con 409 si el ciclo está en estado FINALIZADO (RN-015 / RN-023)', async () => {
      prisma.cicloProduccion.findFirst.mockResolvedValue({
        ...mockCiclo,
        estado: EstadoCiclo.FINALIZADO,
      });
      prisma.categoriaGasto.findFirst.mockResolvedValue(mockCategoria);
      prisma.proveedor.findFirst.mockResolvedValue(mockProveedor);
      prisma.actividad.findFirst.mockResolvedValue(mockActividad);
      prisma.unidadMedida.findUnique.mockResolvedValue(mockUnidad);

      await expect(
        service.crearGasto(empresaId, usuarioId, validDto),
      ).rejects.toMatchObject({
        code: CodigoError.CICLO_CERRADO,
        status: 409,
      });
    });

    it('debe rechazar con 400 si la actividad pertenece a otro ciclo (RN-046)', async () => {
      prisma.cicloProduccion.findFirst.mockResolvedValue(mockCiclo);
      prisma.categoriaGasto.findFirst.mockResolvedValue(mockCategoria);
      prisma.proveedor.findFirst.mockResolvedValue(mockProveedor);
      prisma.actividad.findFirst.mockResolvedValue({ id: 3, cicloId: 999 }); // Ciclo distinto
      prisma.unidadMedida.findUnique.mockResolvedValue(mockUnidad);

      await expect(
        service.crearGasto(empresaId, usuarioId, validDto),
      ).rejects.toMatchObject({
        code: CodigoError.ACTIVIDAD_DE_OTRO_CICLO,
        status: 400,
      });
    });

    it('debe rechazar con 400 si viene cantidad pero no se especifica unidadId (RN-024 / A7)', async () => {
      await expect(
        service.crearGasto(empresaId, usuarioId, {
          ...validDto,
          cantidad: '5.000',
          unidadId: undefined,
        }),
      ).rejects.toMatchObject({
        code: CodigoError.PETICION_INVALIDA,
        status: 400,
      });
    });
  });

  // =====================================================================
  // 2. LISTADO CON SCOPED VISIBILITY
  // =====================================================================

  describe('listarGastos', () => {
    it('debe filtrar por creadoPorId si el usuario es CAPTURISTA (sin permiso gasto:editar_todos) (A3)', async () => {
      prisma.gasto.count.mockResolvedValue(1);
      prisma.gasto.findMany.mockResolvedValue([]);

      await service.listarGastos(empresaId, usuarioId, false, {
        page: 1,
        limit: 10,
      });

      expect(prisma.gasto.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            creadoPorId: usuarioId,
            deletedAt: null,
            ciclo: { empresaId, deletedAt: null },
          },
        }),
      );
    });

    it('no debe restringir por creadoPorId si el usuario es CONTADOR o ADMIN (A3)', async () => {
      prisma.gasto.count.mockResolvedValue(5);
      prisma.gasto.findMany.mockResolvedValue([]);

      await service.listarGastos(empresaId, usuarioId, true, {
        page: 1,
        limit: 10,
      });

      expect(prisma.gasto.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            deletedAt: null,
            ciclo: { empresaId, deletedAt: null },
          },
        }),
      );
    });
  });

  // =====================================================================
  // 3. DETALLE CON SCOPED VISIBILITY
  // =====================================================================

  describe('obtenerGastoPorId', () => {
    const mockGasto = {
      id: 50,
      cicloId: 1,
      categoriaId: 2,
      proveedorId: null,
      actividadId: null,
      unidadId: null,
      creadoPorId: 99, // Creado por otro usuario
      fecha: new Date('2027-01-15T00:00:00.000Z'),
      descripcion: 'Gasto ajeno',
      cantidad: new Prisma.Decimal('1'),
      costoUnitario: new Prisma.Decimal('100'),
      impuesto: new Prisma.Decimal('0'),
      total: new Prisma.Decimal('100'),
      numeroComprobante: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      ciclo: {
        id: 1,
        nombre: 'Ciclo 1',
        estado: 'ACTIVO',
        parcelaId: 1,
        parcela: { nombre: 'P1' },
      },
      categoria: { id: 2, nombre: 'Semillas', descripcion: null },
      proveedor: null,
      actividad: null,
      unidad: null,
      creadoPor: { id: 99, nombre: 'Juan', apellido: 'Perez' },
    };

    it('debe responder 404 a un CAPTURISTA que intenta consultar un gasto ajeno (A3)', async () => {
      prisma.gasto.findFirst.mockResolvedValue(mockGasto);

      await expect(
        service.obtenerGastoPorId(empresaId, usuarioId, false, 50),
      ).rejects.toMatchObject({
        code: CodigoError.RECURSO_NO_ENCONTRADO,
        status: 404,
      });
    });

    it('debe permitir la consulta a un CONTADOR o ADMIN aunque el gasto sea ajeno (A3)', async () => {
      prisma.gasto.findFirst.mockResolvedValue(mockGasto);

      const result = await service.obtenerGastoPorId(
        empresaId,
        usuarioId,
        true,
        50,
      );
      expect(result.id).toBe(50);
    });
  });

  // =====================================================================
  // 4. ACTUALIZACIÓN CON FUSIÓN (A4)
  // =====================================================================

  describe('actualizarGasto', () => {
    const baseGasto = {
      id: 10,
      cicloId: 1,
      categoriaId: 2,
      proveedorId: null,
      actividadId: null,
      unidadId: 1,
      creadoPorId: usuarioId,
      fecha: new Date('2027-01-15T00:00:00.000Z'),
      descripcion: 'Original',
      cantidad: new Prisma.Decimal('10'),
      costoUnitario: new Prisma.Decimal('100'),
      impuesto: new Prisma.Decimal('0'),
      total: new Prisma.Decimal('1000'),
      numeroComprobante: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      ciclo: {
        id: 1,
        empresaId,
        estado: EstadoCiclo.ACTIVO,
        fechaInicio: new Date('2027-01-01T00:00:00.000Z'),
      },
    };

    it('debe recalcular RN-045 fusionando cantidad original con nuevo total', async () => {
      prisma.gasto.findFirst.mockResolvedValue(baseGasto);
      prisma.cicloProduccion.findFirst.mockResolvedValue(baseGasto.ciclo);

      // Si se envía solo total = 1500 pero cantidad=10 y costo=100 (subtotal=1000), la diferencia es 500 -> debe fallar RN-045
      const dtoInvalido: UpdateGastoDto = {
        total: '1500.00',
      };

      await expect(
        service.actualizarGasto(
          empresaId,
          usuarioId,
          false,
          false,
          10,
          dtoInvalido,
        ),
      ).rejects.toMatchObject({
        code: CodigoError.TOTAL_NO_COINCIDE,
        status: 400,
      });
    });

    // B3 — Gasto de monto directo (unidadId=null, cantidad=1, costoUnitario=total)
    const gastoMontoDirecto = {
      id: 20,
      cicloId: 1,
      categoriaId: 2,
      proveedorId: null,
      actividadId: null,
      unidadId: null, // sin desglose real
      creadoPorId: usuarioId,
      fecha: new Date('2027-01-15T00:00:00.000Z'),
      descripcion: 'Gasto por monto directo',
      cantidad: new Prisma.Decimal('1'),
      costoUnitario: new Prisma.Decimal('500'),
      impuesto: new Prisma.Decimal('0'),
      total: new Prisma.Decimal('500'),
      numeroComprobante: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      ciclo: {
        id: 1,
        empresaId,
        estado: EstadoCiclo.ACTIVO,
        fechaInicio: new Date('2027-01-01T00:00:00.000Z'),
      },
    };

    it('B3: gasto monto directo - PATCH solo total NO debe lanzar PETICION_INVALIDA por unidadId null', async () => {
      prisma.gasto.findFirst.mockResolvedValue(gastoMontoDirecto);
      prisma.cicloProduccion.findFirst.mockResolvedValue(
        gastoMontoDirecto.ciclo,
      );
      prisma.gasto.update.mockResolvedValue({
        ...gastoMontoDirecto,
        total: new Prisma.Decimal('600'),
        costoUnitario: new Prisma.Decimal('600'),
      });

      const dto: UpdateGastoDto = { total: '600.00' };

      const result = await service.actualizarGasto(
        empresaId,
        usuarioId,
        false,
        false,
        20,
        dto,
      );

      expect(result.total).toBe('600');
    });

    it('B3: gasto monto directo - PATCH solo total debe actualizar costoUnitario = total - impuesto', async () => {
      const gastoConImpuesto = {
        ...gastoMontoDirecto,
        impuesto: new Prisma.Decimal('50'),
        total: new Prisma.Decimal('550'),
        costoUnitario: new Prisma.Decimal('500'),
      };
      prisma.gasto.findFirst.mockResolvedValue(gastoConImpuesto);
      prisma.cicloProduccion.findFirst.mockResolvedValue(
        gastoMontoDirecto.ciclo,
      );
      prisma.gasto.update.mockResolvedValue({
        ...gastoConImpuesto,
        total: new Prisma.Decimal('660'),
        costoUnitario: new Prisma.Decimal('610'),
      });

      const dto: UpdateGastoDto = { total: '660.00' };

      await service.actualizarGasto(
        empresaId,
        usuarioId,
        false,
        false,
        20,
        dto,
      );

      // El update debe haber seteado costoUnitario = 660 - 50 = 610
      const calls = prisma.gasto.update.mock.calls as Array<
        [{ data: { costoUnitario?: Prisma.Decimal } }]
      >;
      const updateCall = calls[0][0];
      expect(updateCall.data.costoUnitario?.toString()).toBe('610');
    });

    it('debe actualizar exitosamente cuando los valores fusionados son coherentes', async () => {
      prisma.gasto.findFirst.mockResolvedValue(baseGasto);
      prisma.cicloProduccion.findFirst.mockResolvedValue(baseGasto.ciclo);

      const gastoActualizado = {
        ...baseGasto,
        total: new Prisma.Decimal('1200'),
        costoUnitario: new Prisma.Decimal('120'),
      };
      prisma.gasto.update.mockResolvedValue(gastoActualizado);

      const dtoValido: UpdateGastoDto = {
        total: '1200.00',
        costoUnitario: '120.00',
      };

      const result = await service.actualizarGasto(
        empresaId,
        usuarioId,
        false,
        false,
        10,
        dtoValido,
      );

      expect(result.total).toBe('1200');
      expect(auditService.registrar).toHaveBeenCalledWith(
        expect.objectContaining({
          entidad: 'Gasto',
          entidadId: 10,
          accion: AccionAuditoria.ACTUALIZAR,
        }),
        prisma,
      );
    });
  });

  // =====================================================================
  // 5. ELIMINACIÓN EXCLUSIVA ADMIN (A2)
  // =====================================================================

  describe('eliminarGasto', () => {
    it('debe rechazar con PERMISO_DENEGADO (403) si quien intenta eliminar no es ADMIN (A2)', async () => {
      await expect(
        service.eliminarGasto(empresaId, usuarioId, false, 10),
      ).rejects.toMatchObject({
        code: CodigoError.PERMISO_DENEGADO,
        status: 403,
      });
    });

    it('debe permitir soft delete y registrar auditoría si es ADMIN con registro:administrar', async () => {
      const mockGasto = {
        id: 10,
        cicloId: 1,
        total: new Prisma.Decimal('500'),
        ciclo: {
          id: 1,
          empresaId,
          estado: EstadoCiclo.ACTIVO,
          fechaInicio: new Date('2027-01-01T00:00:00.000Z'),
        },
      };
      prisma.gasto.findFirst.mockResolvedValue(mockGasto);
      prisma.cicloProduccion.findFirst.mockResolvedValue(mockGasto.ciclo);
      prisma.gasto.update.mockResolvedValue({
        ...mockGasto,
        deletedAt: new Date(),
      });

      const result = await service.eliminarGasto(
        empresaId,
        usuarioId,
        true,
        10,
      );

      expect(result.message).toBe('Gasto eliminado exitosamente');
      expect(prisma.gasto.update).toHaveBeenCalledTimes(1);
      const updateArgs = (
        prisma.gasto.update.mock.calls as [
          { where: { id: number }; data: { deletedAt: Date } },
        ][]
      )[0][0];
      expect(updateArgs.where.id).toBe(10);
      expect(updateArgs.data.deletedAt).toBeInstanceOf(Date);
      expect(auditService.registrar).toHaveBeenCalledWith(
        expect.objectContaining({
          entidad: 'Gasto',
          entidadId: 10,
          accion: AccionAuditoria.ELIMINAR,
        }),
        prisma,
      );
    });
  });
});
