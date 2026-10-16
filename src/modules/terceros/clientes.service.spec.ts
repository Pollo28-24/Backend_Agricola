import { Test, TestingModule } from '@nestjs/testing';
import { TipoCliente, AccionAuditoria } from '@prisma/client';
import { ClientesService } from './clientes.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../prisma/audit.service';
import { DomainError } from '../../common/errors/domain.error';
import { CreateClienteDto } from './dto/create-cliente.dto';
import { UpdateClienteDto } from './dto/update-cliente.dto';

describe('ClientesService', () => {
  let service: ClientesService;
  let prisma: {
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
        ClientesService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: auditService },
      ],
    }).compile();

    service = module.get<ClientesService>(ClientesService);
  });

  it('debe estar definido', () => {
    expect(service).toBeDefined();
  });

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

  describe('listarClientes', () => {
    it('debe retornar lista paginada de clientes con conteo de ventas', async () => {
      prisma.cliente.count.mockResolvedValue(1);
      prisma.cliente.findMany.mockResolvedValue([
        {
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
          _count: { ventas: 3 },
        },
      ]);

      const res = await service.listarClientes(empresaId, { page: 1, limit: 10 });

      expect(res.data).toHaveLength(1);
      expect(res.data[0].totalVentas).toBe(3);
      expect(res.meta.total).toBe(1);
    });
  });

  describe('obtenerClientePorId', () => {
    it('debe retornar el cliente cuando pertenece a la empresa', async () => {
      prisma.cliente.findFirst.mockResolvedValue({
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
        _count: { ventas: 3 },
      });

      const res = await service.obtenerClientePorId(empresaId, 1);
      expect(res.id).toBe(1);
      expect(res.totalVentas).toBe(3);
    });

    it('debe responder 404 si el cliente no existe o pertenece a otra empresa (RN-068)', async () => {
      prisma.cliente.findFirst.mockResolvedValue(null);

      await expect(service.obtenerClientePorId(empresaId, 999)).rejects.toThrow(DomainError);
    });
  });

  describe('actualizarCliente', () => {
    it('debe actualizar los datos y auditar los cambios', async () => {
      prisma.cliente.findFirst
        .mockResolvedValueOnce({
          id: 1,
          empresaId,
          nombre: 'Supermercado Original',
          rfc: null,
          telefono: null,
          correo: null,
          tipo: TipoCliente.DISTRIBUIDOR,
          activo: true,
          _count: { ventas: 0 },
        })
        .mockResolvedValueOnce(null); // Sin colisión de nombre

      prisma.cliente.update.mockResolvedValue({
        id: 1,
        empresaId,
        nombre: 'Supermercado Nuevo',
        rfc: null,
        telefono: null,
        correo: null,
        tipo: TipoCliente.SUPERMERCADO,
        activo: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const dto: UpdateClienteDto = {
        nombre: 'Supermercado Nuevo',
        tipo: TipoCliente.SUPERMERCADO,
      };

      const res = await service.actualizarCliente(empresaId, 1, dto);

      expect(res.nombre).toBe('Supermercado Nuevo');
      expect(auditService.registrar).toHaveBeenCalledWith(
        expect.objectContaining({
          accion: AccionAuditoria.ACTUALIZAR,
        }),
      );
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
