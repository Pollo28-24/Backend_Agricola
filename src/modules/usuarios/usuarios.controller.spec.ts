import { Test, TestingModule } from '@nestjs/testing';
import { UsuariosController } from './usuarios.controller';
import { UsuariosService } from './usuarios.service';
import { RolCodigoEnum } from './dto/create-usuario.dto';

describe('UsuariosController', () => {
  let controller: UsuariosController;

  const mockUsuariosService = {
    crear: jest.fn(),
    listar: jest.fn(),
    obtenerPorId: jest.fn(),
    actualizar: jest.fn(),
    eliminar: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsuariosController],
      providers: [{ provide: UsuariosService, useValue: mockUsuariosService }],
    }).compile();

    controller = module.get<UsuariosController>(UsuariosController);
  });

  it('debe estar definido', () => {
    expect(controller).toBeDefined();
  });

  it('debe delegar crear usuario pasando el tenant del usuario autenticado', async () => {
    const dto = {
      nombre: 'Lucía',
      apellido: 'Juárez',
      correo: 'lucia@rancho.com',
      contrasena: 'Pass123456',
      rolCodigo: RolCodigoEnum.CONTADOR,
    };
    mockUsuariosService.crear.mockResolvedValue({
      id: 2,
      correo: 'lucia@rancho.com',
    });

    const res = await controller.crear(10, dto);
    expect(mockUsuariosService.crear).toHaveBeenCalledWith(10, dto);
    expect(res.id).toBe(2);
  });

  it('debe delegar listar usuarios con filtro opcional de activo', async () => {
    mockUsuariosService.listar.mockResolvedValue([{ id: 1 }, { id: 2 }]);

    const res = await controller.listar(10, true);
    expect(mockUsuariosService.listar).toHaveBeenCalledWith(10, true);
    expect(res).toHaveLength(2);
  });

  it('debe delegar obtenerPorId con validación de tenant', async () => {
    mockUsuariosService.obtenerPorId.mockResolvedValue({ id: 5 });

    const res = await controller.obtenerPorId(10, 5);
    expect(mockUsuariosService.obtenerPorId).toHaveBeenCalledWith(10, 5);
    expect(res.id).toBe(5);
  });

  it('debe delegar actualizar usuario', async () => {
    const dto = { nombre: 'Lucía María' };
    mockUsuariosService.actualizar.mockResolvedValue({
      id: 5,
      nombre: 'Lucía María',
    });

    const res = await controller.actualizar(10, 5, dto);
    expect(mockUsuariosService.actualizar).toHaveBeenCalledWith(10, 5, dto);
    expect(res.nombre).toBe('Lucía María');
  });

  it('debe delegar eliminar (baja lógica)', async () => {
    mockUsuariosService.eliminar.mockResolvedValue({
      mensaje: 'Usuario dado de baja exitosamente',
    });

    const res = await controller.eliminar(10, 5);
    expect(mockUsuariosService.eliminar).toHaveBeenCalledWith(10, 5);
    expect(res.mensaje).toContain('baja exitosamente');
  });
});
