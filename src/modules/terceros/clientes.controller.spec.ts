import { Test, TestingModule } from '@nestjs/testing';
import { ClientesController } from './clientes.controller';
import { ClientesService } from './clientes.service';
import { TipoCliente } from '@prisma/client';
import { CreateClienteDto } from './dto/create-cliente.dto';
import { UpdateClienteDto } from './dto/update-cliente.dto';

describe('ClientesController', () => {
  let controller: ClientesController;
  let service: {
    crearCliente: jest.Mock;
    listarClientes: jest.Mock;
    obtenerClientePorId: jest.Mock;
    actualizarCliente: jest.Mock;
    eliminarCliente: jest.Mock;
  };

  const empresaId = 10;

  beforeEach(async () => {
    service = {
      crearCliente: jest.fn(),
      listarClientes: jest.fn(),
      obtenerClientePorId: jest.fn(),
      actualizarCliente: jest.fn(),
      eliminarCliente: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ClientesController],
      providers: [{ provide: ClientesService, useValue: service }],
    }).compile();

    controller = module.get<ClientesController>(ClientesController);
  });

  it('debe estar definido', () => {
    expect(controller).toBeDefined();
  });

  it('crear debe invocar al servicio con empresaId', async () => {
    const dto: CreateClienteDto = {
      nombre: 'Restaurante El Huerto',
      tipo: TipoCliente.RESTAURANTE,
    };
    service.crearCliente.mockResolvedValue({ id: 1, ...dto });

    const res = await controller.crear(empresaId, dto);
    expect(service.crearCliente).toHaveBeenCalledWith(empresaId, dto);
    expect(res.id).toBe(1);
    expect(res.tipo).toBe(TipoCliente.RESTAURANTE);
  });

  it('listar debe delegar en listarClientes', async () => {
    service.listarClientes.mockResolvedValue({ data: [], meta: { total: 0 } });
    const res = await controller.listar(empresaId, {});
    expect(service.listarClientes).toHaveBeenCalledWith(empresaId, {});
    expect(res.data).toEqual([]);
  });

  it('obtenerPorId debe buscar por id y empresaId', async () => {
    service.obtenerClientePorId.mockResolvedValue({
      id: 5,
      nombre: 'Cliente 5',
    });
    const res = await controller.obtenerPorId(empresaId, 5);
    expect(service.obtenerClientePorId).toHaveBeenCalledWith(empresaId, 5);
    expect(res.id).toBe(5);
  });

  it('actualizar debe invocar al servicio', async () => {
    const dto: UpdateClienteDto = { tipo: TipoCliente.EXPORTADOR };
    service.actualizarCliente.mockResolvedValue({ id: 5, ...dto });
    const res = await controller.actualizar(empresaId, 5, dto);
    expect(service.actualizarCliente).toHaveBeenCalledWith(empresaId, 5, dto);
    expect(res.tipo).toBe(TipoCliente.EXPORTADOR);
  });

  it('eliminar debe delegar la baja lógica', async () => {
    service.eliminarCliente.mockResolvedValue({
      message: 'Cliente eliminado exitosamente',
    });
    const res = await controller.eliminar(empresaId, 5);
    expect(service.eliminarCliente).toHaveBeenCalledWith(empresaId, 5);
    expect(res.message).toContain('exitosamente');
  });
});
