import { Test, TestingModule } from '@nestjs/testing';
import { PrediosController } from './predios.controller';
import { PrediosService } from './predios.service';

describe('PrediosController', () => {
  let controller: PrediosController;

  const mockPrediosService = {
    crearPredio: jest.fn(),
    listarPredios: jest.fn(),
    obtenerPredioPorId: jest.fn(),
    actualizarPredio: jest.fn(),
    eliminarPredio: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PrediosController],
      providers: [
        { provide: PrediosService, useValue: mockPrediosService },
      ],
    }).compile();

    controller = module.get<PrediosController>(PrediosController);
  });

  it('debe estar definido', () => {
    expect(controller).toBeDefined();
  });

  it('debe delegar crearPredio pasando empresaId y DTO', async () => {
    const dto = { nombre: 'Rancho Nuevo', superficieTotal: 10 };
    mockPrediosService.crearPredio.mockResolvedValue({ id: 1, nombre: 'Rancho Nuevo' });

    const res = await controller.crear(5, dto as any);
    expect(mockPrediosService.crearPredio).toHaveBeenCalledWith(5, dto);
    expect(res.id).toBe(1);
  });

  it('debe delegar listarPredios', async () => {
    mockPrediosService.listarPredios.mockResolvedValue([{ id: 1 }]);
    const res = await controller.listar(5);
    expect(mockPrediosService.listarPredios).toHaveBeenCalledWith(5);
    expect(res).toHaveLength(1);
  });

  it('debe delegar obtenerPredioPorId', async () => {
    mockPrediosService.obtenerPredioPorId.mockResolvedValue({ id: 1 });
    const res = await controller.obtenerPorId(5, 1);
    expect(mockPrediosService.obtenerPredioPorId).toHaveBeenCalledWith(5, 1);
    expect(res.id).toBe(1);
  });

  it('debe delegar actualizarPredio', async () => {
    const dto = { nombre: 'Rancho Editado' };
    mockPrediosService.actualizarPredio.mockResolvedValue({ id: 1, nombre: 'Rancho Editado' });
    const res = await controller.actualizar(5, 1, dto);
    expect(mockPrediosService.actualizarPredio).toHaveBeenCalledWith(5, 1, dto);
    expect(res.nombre).toBe('Rancho Editado');
  });

  it('debe delegar eliminarPredio', async () => {
    mockPrediosService.eliminarPredio.mockResolvedValue({ mensaje: 'ok' });
    const res = await controller.eliminar(5, 1);
    expect(mockPrediosService.eliminarPredio).toHaveBeenCalledWith(5, 1);
    expect(res.mensaje).toBe('ok');
  });

  describe('Permisos RBAC granulares (Fase 1)', () => {
    const reflector = new (require('@nestjs/core').Reflector)();

    it('la clase PrediosController no debe tener RequirePermisos a nivel global', () => {
      const permisosClase = reflector.get('permisos', PrediosController);
      expect(permisosClase).toBeUndefined();
    });

    it('crear, actualizar y eliminar deben exigir estructura:administrar', () => {
      expect(reflector.get('permisos', controller.crear)).toEqual(['estructura:administrar']);
      expect(reflector.get('permisos', controller.actualizar)).toEqual(['estructura:administrar']);
      expect(reflector.get('permisos', controller.eliminar)).toEqual(['estructura:administrar']);
    });

    it('listar y obtenerPorId deben permitir acceso de lectura sin estructura:administrar', () => {
      expect(reflector.get('permisos', controller.listar)).toBeUndefined();
      expect(reflector.get('permisos', controller.obtenerPorId)).toBeUndefined();
    });
  });
});

