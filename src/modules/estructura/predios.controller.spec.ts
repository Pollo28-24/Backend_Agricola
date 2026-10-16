import { Test, TestingModule } from '@nestjs/testing';
import { PrediosController } from './predios.controller';
import { EstructuraService } from './estructura.service';

describe('PrediosController', () => {
  let controller: PrediosController;

  const mockEstructuraService = {
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
        { provide: EstructuraService, useValue: mockEstructuraService },
      ],
    }).compile();

    controller = module.get<PrediosController>(PrediosController);
  });

  it('debe estar definido', () => {
    expect(controller).toBeDefined();
  });

  it('debe delegar crearPredio pasando empresaId y DTO', async () => {
    const dto = { nombre: 'Rancho Nuevo', superficieTotal: 10 };
    mockEstructuraService.crearPredio.mockResolvedValue({ id: 1, nombre: 'Rancho Nuevo' });

    const res = await controller.crear(5, dto as any);
    expect(mockEstructuraService.crearPredio).toHaveBeenCalledWith(5, dto);
    expect(res.id).toBe(1);
  });

  it('debe delegar listarPredios', async () => {
    mockEstructuraService.listarPredios.mockResolvedValue([{ id: 1 }]);
    const res = await controller.listar(5);
    expect(mockEstructuraService.listarPredios).toHaveBeenCalledWith(5);
    expect(res).toHaveLength(1);
  });

  it('debe delegar obtenerPredioPorId', async () => {
    mockEstructuraService.obtenerPredioPorId.mockResolvedValue({ id: 1 });
    const res = await controller.obtenerPorId(5, 1);
    expect(mockEstructuraService.obtenerPredioPorId).toHaveBeenCalledWith(5, 1);
    expect(res.id).toBe(1);
  });

  it('debe delegar actualizarPredio', async () => {
    const dto = { nombre: 'Rancho Editado' };
    mockEstructuraService.actualizarPredio.mockResolvedValue({ id: 1, nombre: 'Rancho Editado' });
    const res = await controller.actualizar(5, 1, dto);
    expect(mockEstructuraService.actualizarPredio).toHaveBeenCalledWith(5, 1, dto);
    expect(res.nombre).toBe('Rancho Editado');
  });

  it('debe delegar eliminarPredio', async () => {
    mockEstructuraService.eliminarPredio.mockResolvedValue({ mensaje: 'ok' });
    const res = await controller.eliminar(5, 1);
    expect(mockEstructuraService.eliminarPredio).toHaveBeenCalledWith(5, 1);
    expect(res.mensaje).toBe('ok');
  });
});
