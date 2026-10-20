import { Test, TestingModule } from '@nestjs/testing';
import { GastosController } from './gastos.controller';
import { GastosService } from './gastos.service';
import { CreateGastoDto } from './dto/create-gasto.dto';
import { UpdateGastoDto } from './dto/update-gasto.dto';
import { FiltroGastoDto } from './dto/filtro-gasto.dto';
import { UsuarioAutenticado } from '../auth/interfaces/jwt-payload.interface';

describe('GastosController', () => {
  let controller: GastosController;
  let service: {
    crearGasto: jest.Mock;
    listarGastos: jest.Mock;
    obtenerGastoPorId: jest.Mock;
    actualizarGasto: jest.Mock;
    eliminarGasto: jest.Mock;
  };

  const userCapturista: UsuarioAutenticado = {
    id: 1,
    empresaId: 10,
    nombre: 'Carlos',
    apellido: 'Campo',
    correo: 'capturista@agro.com',
    rol: 'CAPTURISTA',
    permisos: ['gasto:crear'],
    estadoSuscripcion: 'ACTIVA',
  };

  const userContador: UsuarioAutenticado = {
    id: 2,
    empresaId: 10,
    nombre: 'Laura',
    apellido: 'Contable',
    correo: 'contador@agro.com',
    rol: 'CONTADOR',
    permisos: ['gasto:crear', 'gasto:editar_todos'],
    estadoSuscripcion: 'ACTIVA',
  };

  const userAdmin: UsuarioAutenticado = {
    id: 3,
    empresaId: 10,
    nombre: 'Admin',
    apellido: 'Principal',
    correo: 'admin@agro.com',
    rol: 'ADMIN',
    permisos: ['gasto:crear', 'gasto:editar_todos', 'registro:administrar'],
    estadoSuscripcion: 'ACTIVA',
  };

  beforeEach(async () => {
    service = {
      crearGasto: jest.fn(),
      listarGastos: jest.fn(),
      obtenerGastoPorId: jest.fn(),
      actualizarGasto: jest.fn(),
      eliminarGasto: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [GastosController],
      providers: [{ provide: GastosService, useValue: service }],
    }).compile();

    controller = module.get<GastosController>(GastosController);
  });

  it('debe estar definido', () => {
    expect(controller).toBeDefined();
  });

  describe('crearGasto', () => {
    it('debe delegar en el servicio pasando empresaId y usuarioId del token', async () => {
      const dto: CreateGastoDto = {
        cicloId: 1,
        categoriaId: 2,
        fecha: '2027-01-15',
        total: '500.00',
      };
      service.crearGasto.mockResolvedValue({ id: 1, ...dto });

      const result = await controller.crearGasto(userCapturista, dto);

      expect(service.crearGasto).toHaveBeenCalledWith(10, 1, dto);
      expect(result.id).toBe(1);
    });
  });

  describe('listarGastos', () => {
    it('debe enviar tienePermisoEditarTodos = false para un CAPTURISTA', async () => {
      const filtro: FiltroGastoDto = { page: 1, limit: 10 };
      service.listarGastos.mockResolvedValue({
        data: [],
        meta: { total: 0, page: 1, limit: 10, totalPages: 0 },
      });

      await controller.listarGastos(userCapturista, filtro);

      expect(service.listarGastos).toHaveBeenCalledWith(10, 1, false, filtro);
    });

    it('debe enviar tienePermisoEditarTodos = true para un CONTADOR', async () => {
      const filtro: FiltroGastoDto = { page: 1, limit: 10 };
      service.listarGastos.mockResolvedValue({
        data: [],
        meta: { total: 0, page: 1, limit: 10, totalPages: 0 },
      });

      await controller.listarGastos(userContador, filtro);

      expect(service.listarGastos).toHaveBeenCalledWith(10, 2, true, filtro);
    });
  });

  describe('obtenerGastoPorId', () => {
    it('debe delegar con el flag correspondiente de visibilidad', async () => {
      service.obtenerGastoPorId.mockResolvedValue({ id: 5 });

      await controller.obtenerGastoPorId(userCapturista, 5);

      expect(service.obtenerGastoPorId).toHaveBeenCalledWith(10, 1, false, 5);
    });
  });

  describe('actualizarGasto', () => {
    it('debe extraer correctamente tienePermisoAdministrar y tienePermisoEditarTodos', async () => {
      const dto: UpdateGastoDto = { total: '600.00' };
      service.actualizarGasto.mockResolvedValue({ id: 5, total: '600.00' });

      await controller.actualizarGasto(userContador, 5, dto);

      expect(service.actualizarGasto).toHaveBeenCalledWith(
        10,
        2,
        false,
        true,
        5,
        dto,
      );
    });
  });

  describe('eliminarGasto', () => {
    it('debe delegar al servicio con el flag de administrar', async () => {
      service.eliminarGasto.mockResolvedValue({
        message: 'Gasto eliminado exitosamente',
      });

      const result = await controller.eliminarGasto(userAdmin, 5);

      expect(service.eliminarGasto).toHaveBeenCalledWith(10, 3, true, 5);
      expect(result.message).toBe('Gasto eliminado exitosamente');
    });
  });
});
