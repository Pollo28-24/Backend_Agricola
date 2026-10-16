import { Test, TestingModule } from '@nestjs/testing';
import { HttpStatus } from '@nestjs/common';
import { TipoCliente, AccionAuditoria } from '@prisma/client';
import { TercerosService } from './terceros.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../prisma/audit.service';
import { DomainError } from '../../common/errors/domain.error';
import { CodigoError } from '../../common/errors/codigos-error.enum';
import { CreateProveedorDto } from './dto/create-proveedor.dto';
import { UpdateProveedorDto } from './dto/update-proveedor.dto';
import { CreateClienteDto } from './dto/create-cliente.dto';
import { UpdateClienteDto } from './dto/update-cliente.dto';

describe('TercerosService', () => {
  let service: TercerosService;
  let prisma: {
    proveedor: {
      findFirst: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    cliente: {
      findFirst: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
  };
  let auditService: {
    registrar: jest.Mock;
  };

  const empresaId = 10;

  beforeEach(async () => {
    prisma = {
      proveedor: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      cliente: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
    };

    auditService = {
      registrar: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TercerosService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: auditService },
      ],
    }).compile();

    service = module.get<TercerosService>(TercerosService);
  });

  it('debe estar definido', () => {
    expect(service).toBeDefined();
  });

  // =====================================================================
  // PROVEEDORES
  // =====================================================================

  describe('crearProveedor', () => {
    it('debe registrar un proveedor exitosamente y auditar la creación', async () => {
      const dto: CreateProveedorDto = {
        nombre: 'Agroinsumos del Norte',
        rfc: 'AIN900101XYZ',
        telefono: '3311223344',
        correo: 'contacto@agroinsumos.com',
        direccion: 'Calle Falsa 123',
      };

      prisma.proveedor.findFirst.mockResolvedValue(null);
      prisma.proveedor.create.mockResolvedValue({
        id: 1,
        empresaId,
        nombre: 'Agroinsumos del Norte',
        rfc: 'AIN900101XYZ',
        telefono: '3311223344',
        correo: 'contacto@agroinsumos.com',
        direccion: 'Calle Falsa 123',
        activo: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      });

      const res = await service.crearProveedor(empresaId, dto);

      expect(res.id).toBe(1);
      expect(res.nombre).toBe('Agroinsumos del Norte');
      expect(res.totalGastos).toBe(0);
      expect(auditService.registrar).toHaveBeenCalledWith(
        expect.objectContaining({
          empresaId,
          entidad: 'proveedor',
          entidadId: 1,
          accion: AccionAuditoria.CREAR,
        }),
      );
    });

    it('debe rechazar la creación si ya existe un proveedor activo con el mismo nombre en la empresa', async () => {
      const dto: CreateProveedorDto = {
        nombre: 'Agroinsumos del Norte',
      };

      prisma.proveedor.findFirst.mockResolvedValue({ id: 99, nombre: 'Agroinsumos del Norte' });

      await expect(service.crearProveedor(empresaId, dto)).rejects.toThrow(DomainError);
    });
  });

  describe('listarProveedores', () => {
    it('debe retornar lista paginada de proveedores con conteo de gastos', async () => {
      prisma.proveedor.count.mockResolvedValue(1);
      prisma.proveedor.findMany.mockResolvedValue([
        {
          id: 1,
          empresaId,
          nombre: 'Agroinsumos del Norte',
          rfc: null,
          telefono: null,
          correo: null,
          direccion: null,
          activo: true,
          createdAt: new Date(),
          updatedAt: new Date(),
          _count: { gastos: 5 },
        },
      ]);

      const res = await service.listarProveedores(empresaId, { page: 1, limit: 10 });

      expect(res.data).toHaveLength(1);
      expect(res.data[0].totalGastos).toBe(5);
      expect(res.meta.total).toBe(1);
    });
  });

  describe('obtenerProveedorPorId', () => {
    it('debe retornar el proveedor cuando pertenece a la empresa', async () => {
      prisma.proveedor.findFirst.mockResolvedValue({
        id: 1,
        empresaId,
        nombre: 'Agroinsumos del Norte',
        rfc: null,
        telefono: null,
        correo: null,
        direccion: null,
        activo: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        _count: { gastos: 2 },
      });

      const res = await service.obtenerProveedorPorId(empresaId, 1);
      expect(res.id).toBe(1);
      expect(res.totalGastos).toBe(2);
    });

    it('debe responder 404 si el proveedor no existe o pertenece a otra empresa (RN-068)', async () => {
      prisma.proveedor.findFirst.mockResolvedValue(null);

      await expect(service.obtenerProveedorPorId(empresaId, 999)).rejects.toThrow(DomainError);
    });
  });

  describe('actualizarProveedor', () => {
    it('debe actualizar los datos y auditar los cambios', async () => {
      prisma.proveedor.findFirst
        .mockResolvedValueOnce({
          id: 1,
          empresaId,
          nombre: 'Agroinsumos Original',
          rfc: null,
          telefono: null,
          correo: null,
          direccion: null,
          activo: true,
          _count: { gastos: 0 },
        })
        .mockResolvedValueOnce(null); // No colisión

      prisma.proveedor.update.mockResolvedValue({
        id: 1,
        empresaId,
        nombre: 'Agroinsumos Nuevo',
        rfc: null,
        telefono: '3322110099',
        correo: null,
        direccion: null,
        activo: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const dto: UpdateProveedorDto = {
        nombre: 'Agroinsumos Nuevo',
        telefono: '3322110099',
      };

      const res = await service.actualizarProveedor(empresaId, 1, dto);

      expect(res.nombre).toBe('Agroinsumos Nuevo');
      expect(auditService.registrar).toHaveBeenCalledWith(
        expect.objectContaining({
          accion: AccionAuditoria.ACTUALIZAR,
        }),
      );
    });
  });

  describe('eliminarProveedor', () => {
    it('debe realizar baja lógica liberando el nombre con #baja{id} si no tiene gastos (RN-041)', async () => {
      prisma.proveedor.findFirst.mockResolvedValue({
        id: 7,
        empresaId,
        nombre: 'Semillas S.A.',
        activo: true,
        _count: { gastos: 0 },
      });
      prisma.proveedor.update.mockResolvedValue({});

      const res = await service.eliminarProveedor(empresaId, 7);

      expect(res.message).toContain('exitosamente');
      expect(prisma.proveedor.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 7 },
          data: expect.objectContaining({
            activo: false,
            nombre: 'Semillas S.A.#baja7',
          }),
        }),
      );
    });

    it('debe desactivar el proveedor en lugar de eliminarlo si tiene gastos vinculados (RN-041)', async () => {
      prisma.proveedor.findFirst.mockResolvedValue({
        id: 7,
        empresaId,
        nombre: 'Semillas S.A.',
        activo: true,
        _count: { gastos: 3 },
      });
      prisma.proveedor.update.mockResolvedValue({});

      const res = await service.eliminarProveedor(empresaId, 7);

      expect(res.message).toContain('desactivado');
      expect(prisma.proveedor.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 7 },
          data: { activo: false },
        }),
      );
    });
  });

  // =====================================================================
  // CLIENTES
  // =====================================================================

  describe('crearCliente', () => {
    it('debe registrar un cliente exitosamente con su tipo de canal', async () => {
      const dto: CreateClienteDto = {
        nombre: 'Supermercado Guadalajara',
        tipo: TipoCliente.SUPERMERCADO,
      };

      prisma.cliente.findFirst.mockResolvedValue(null);
      prisma.cliente.create.mockResolvedValue({
        id: 1,
        empresaId,
        nombre: 'Supermercado Guadalajara',
        rfc: null,
        telefono: null,
        correo: null,
        tipo: TipoCliente.SUPERMERCADO,
        activo: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await service.crearCliente(empresaId, dto);

      expect(res.id).toBe(1);
      expect(res.tipo).toBe(TipoCliente.SUPERMERCADO);
      expect(res.totalVentas).toBe(0);
      expect(auditService.registrar).toHaveBeenCalledWith(
        expect.objectContaining({
          accion: AccionAuditoria.CREAR,
        }),
      );
    });

    it('debe rechazar creación si ya existe cliente activo con el mismo nombre', async () => {
      prisma.cliente.findFirst.mockResolvedValue({ id: 5, nombre: 'Supermercado Guadalajara' });

      await expect(
        service.crearCliente(empresaId, { nombre: 'Supermercado Guadalajara' }),
      ).rejects.toThrow(DomainError);
    });
  });

  describe('eliminarCliente', () => {
    it('debe realizar baja lógica si no tiene ventas registradas', async () => {
      prisma.cliente.findFirst.mockResolvedValue({
        id: 12,
        empresaId,
        nombre: 'Distribuidora del Sur',
        activo: true,
        _count: { ventas: 0 },
      });
      prisma.cliente.update.mockResolvedValue({});

      const res = await service.eliminarCliente(empresaId, 12);

      expect(res.message).toContain('exitosamente');
      expect(prisma.cliente.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 12 },
          data: expect.objectContaining({
            activo: false,
            nombre: 'Distribuidora del Sur#baja12',
          }),
        }),
      );
    });

    it('debe desactivar el cliente en lugar de eliminarlo si tiene ventas vinculadas (RN-041)', async () => {
      prisma.cliente.findFirst.mockResolvedValue({
        id: 12,
        empresaId,
        nombre: 'Distribuidora del Sur',
        activo: true,
        _count: { ventas: 4 },
      });
      prisma.cliente.update.mockResolvedValue({});

      const res = await service.eliminarCliente(empresaId, 12);

      expect(res.message).toContain('desactivado');
      expect(prisma.cliente.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 12 },
          data: { activo: false },
        }),
      );
    });
  });
});
