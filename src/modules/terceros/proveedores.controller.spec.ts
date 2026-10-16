import { Test, TestingModule } from '@nestjs/testing';
import { ProveedoresController } from './proveedores.controller';
import { TercerosService } from './terceros.service';
import { CreateProveedorDto } from './dto/create-proveedor.dto';
import { UpdateProveedorDto } from './dto/update-proveedor.dto';

describe('ProveedoresController', () => {
  let controller: ProveedoresController;
  let service: {
    crearProveedor: jest.Mock;
    listarProveedores: jest.Mock;
    obtenerProveedorPorId: jest.Mock;
    actualizarProveedor: jest.Mock;
    eliminarProveedor: jest.Mock;
  };

  const empresaId = 10;

  beforeEach(async () => {
    service = {
      crearProveedor: jest.fn(),
      listarProveedores: jest.fn(),
      obtenerProveedorPorId: jest.fn(),
      actualizarProveedor: jest.fn(),
      eliminarProveedor: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProveedoresController],
      providers: [{ provide: TercerosService, useValue: service }],
    }).compile();

    controller = module.get<ProveedoresController>(ProveedoresController);
  });

  it('debe estar definido', () => {
    expect(controller).toBeDefined();
  });

  it('crear debe invocar al servicio con empresaId', async () => {
    const dto: CreateProveedorDto = { nombre: 'Insumos del Campo' };
    service.crearProveedor.mockResolvedValue({ id: 1, ...dto });

    const res = await controller.crear(empresaId, dto);
    expect(service.crearProveedor).toHaveBeenCalledWith(empresaId, dto);
    expect(res.id).toBe(1);
  });

  it('listar debe delegar en listarProveedores', async () => {
    service.listarProveedores.mockResolvedValue({ data: [], meta: { total: 0 } });
    const res = await controller.listar(empresaId, {});
    expect(service.listarProveedores).toHaveBeenCalledWith(empresaId, {});
    expect(res.data).toEqual([]);
  });

  it('obtenerPorId debe buscar por id y empresaId', async () => {
    service.obtenerProveedorPorId.mockResolvedValue({ id: 3, nombre: 'Proveedor 3' });
    const res = await controller.obtenerPorId(empresaId, 3);
    expect(service.obtenerProveedorPorId).toHaveBeenCalledWith(empresaId, 3);
    expect(res.id).toBe(3);
  });

  it('actualizar debe invocar al servicio', async () => {
    const dto: UpdateProveedorDto = { telefono: '123456' };
    service.actualizarProveedor.mockResolvedValue({ id: 3, ...dto });
    const res = await controller.actualizar(empresaId, 3, dto);
    expect(service.actualizarProveedor).toHaveBeenCalledWith(empresaId, 3, dto);
    expect(res.telefono).toBe('123456');
  });

  it('eliminar debe delegar la baja lógica', async () => {
    service.eliminarProveedor.mockResolvedValue({ message: 'Proveedor eliminado exitosamente' });
    const res = await controller.eliminar(empresaId, 3);
    expect(service.eliminarProveedor).toHaveBeenCalledWith(empresaId, 3);
    expect(res.message).toContain('exitosamente');
  });
});
