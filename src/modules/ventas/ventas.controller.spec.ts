import { Test, TestingModule } from '@nestjs/testing';
import { VentasController } from './ventas.controller';
import { VentasService } from './ventas.service';
import { UsuarioAutenticado } from '../auth/interfaces/jwt-payload.interface';
import { CreateVentaDto } from './dto/create-venta.dto';
import { UpdateVentaDto } from './dto/update-venta.dto';
import { FiltroVentaDto } from './dto/filtro-venta.dto';
import { CalidadCosecha, EstadoVenta } from '@prisma/client';

describe('VentasController', () => {
  let controller: VentasController;
  let service: {
    crearVenta: jest.Mock;
    listarVentas: jest.Mock;
    obtenerVentaPorId: jest.Mock;
    actualizarVenta: jest.Mock;
    cancelarVenta: jest.Mock;
  };

  const mockUser: UsuarioAutenticado = {
    id: 1,
    empresaId: 10,
    nombre: 'Admin',
    apellido: 'Test',
    correo: 'admin@empresa.com',
    rol: 'ADMIN',
    permisos: ['venta:crear', 'venta:cancelar'],
    estadoSuscripcion: 'ACTIVA',
  };

  beforeEach(async () => {
    service = {
      crearVenta: jest.fn(),
      listarVentas: jest.fn(),
      obtenerVentaPorId: jest.fn(),
      actualizarVenta: jest.fn(),
      cancelarVenta: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [VentasController],
      providers: [{ provide: VentasService, useValue: service }],
    }).compile();

    controller = module.get<VentasController>(VentasController);
  });

  it('debe estar definido', () => {
    expect(controller).toBeDefined();
  });

  it('debe delegar crearVenta al servicio', async () => {
    const dto: CreateVentaDto = {
      cicloId: 1,
      clienteId: 1,
      fecha: '2027-02-15',
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
    service.crearVenta.mockResolvedValue({ id: 10, total: '2500.00' });

    const result = await controller.crearVenta(mockUser, dto);
    expect(service.crearVenta).toHaveBeenCalledWith(
      mockUser.empresaId,
      mockUser.id,
      dto,
    );
    expect(result).toEqual({ id: 10, total: '2500.00' });
  });

  it('debe delegar listarVentas al servicio', async () => {
    const query: FiltroVentaDto = { cicloId: 1, page: 1, limit: 10 };
    service.listarVentas.mockResolvedValue({ data: [], meta: { total: 0 } });

    const result = await controller.listarVentas(mockUser, query);
    expect(service.listarVentas).toHaveBeenCalledWith(
      mockUser.empresaId,
      query,
    );
    expect(result).toEqual({ data: [], meta: { total: 0 } });
  });

  it('debe delegar obtenerVenta al servicio', async () => {
    service.obtenerVentaPorId.mockResolvedValue({ id: 10 });

    const result = await controller.obtenerVenta(mockUser, 10);
    expect(service.obtenerVentaPorId).toHaveBeenCalledWith(
      10,
      mockUser.empresaId,
    );
    expect(result).toEqual({ id: 10 });
  });

  it('debe delegar actualizarVenta al servicio', async () => {
    const dto: UpdateVentaDto = { total: '2600.00' };
    service.actualizarVenta.mockResolvedValue({ id: 10, total: '2600.00' });

    const result = await controller.actualizarVenta(mockUser, 10, dto);
    expect(service.actualizarVenta).toHaveBeenCalledWith(
      10,
      mockUser.empresaId,
      mockUser.id,
      dto,
    );
    expect(result).toEqual({ id: 10, total: '2600.00' });
  });

  it('debe delegar cancelarVenta al servicio', async () => {
    service.cancelarVenta.mockResolvedValue({
      id: 10,
      estado: EstadoVenta.CANCELADA,
    });

    const result = await controller.cancelarVenta(mockUser, 10);
    expect(service.cancelarVenta).toHaveBeenCalledWith(
      10,
      mockUser.empresaId,
      mockUser.id,
    );
    expect(result).toEqual({ id: 10, estado: EstadoVenta.CANCELADA });
  });
});
