import { Test, TestingModule } from '@nestjs/testing';
import { ParcelasController } from './parcelas.controller';
import { EstructuraService } from './estructura.service';
import { EstadoParcela } from '@prisma/client';

describe('ParcelasController', () => {
  let controller: ParcelasController;

  const mockEstructuraService = {
    crearParcela: jest.fn(),
    listarParcelas: jest.fn(),
    obtenerParcelaPorId: jest.fn(),
    actualizarParcela: jest.fn(),
    eliminarParcela: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ParcelasController],
      providers: [
        { provide: EstructuraService, useValue: mockEstructuraService },
      ],
    }).compile();

    controller = module.get<ParcelasController>(ParcelasController);
  });

  it('debe estar definido', () => {
    expect(controller).toBeDefined();
  });

  it('debe delegar crearParcela pasando empresaId y DTO', async () => {
    const dto = {
      predioId: 1,
      nombre: 'Parcela Nueva',
      superficie: 3.5,
    };
    mockEstructuraService.crearParcela.mockResolvedValue({ id: 10, nombre: 'Parcela Nueva' });

    const res = await controller.crear(5, dto as any);
    expect(mockEstructuraService.crearParcela).toHaveBeenCalledWith(5, dto);
    expect(res.id).toBe(10);
  });

  it('debe delegar listarParcelas con filtros opcionales', async () => {
    mockEstructuraService.listarParcelas.mockResolvedValue([{ id: 10 }]);
    const res = await controller.listar(5, 1, EstadoParcela.DISPONIBLE);
    expect(mockEstructuraService.listarParcelas).toHaveBeenCalledWith(
      5,
      1,
      EstadoParcela.DISPONIBLE,
    );
    expect(res).toHaveLength(1);
  });

  it('debe delegar obtenerParcelaPorId', async () => {
    mockEstructuraService.obtenerParcelaPorId.mockResolvedValue({ id: 10 });
    const res = await controller.obtenerPorId(5, 10);
    expect(mockEstructuraService.obtenerParcelaPorId).toHaveBeenCalledWith(5, 10);
    expect(res.id).toBe(10);
  });

  it('debe delegar actualizarParcela', async () => {
    const dto = { superficie: 4.0 };
    mockEstructuraService.actualizarParcela.mockResolvedValue({ id: 10, superficie: '4.0' });
    const res = await controller.actualizar(5, 10, dto as any);
    expect(mockEstructuraService.actualizarParcela).toHaveBeenCalledWith(5, 10, dto);
    expect(res.superficie).toBe('4.0');
  });

  it('debe delegar eliminarParcela', async () => {
    mockEstructuraService.eliminarParcela.mockResolvedValue({ mensaje: 'ok' });
    const res = await controller.eliminar(5, 10);
    expect(mockEstructuraService.eliminarParcela).toHaveBeenCalledWith(5, 10);
    expect(res.mensaje).toBe('ok');
  });

  describe('Permisos RBAC granulares (Fase 1)', () => {
    const reflector = new (require('@nestjs/core').Reflector)();

    it('la clase ParcelasController no debe tener RequirePermisos a nivel global', () => {
      const permisosClase = reflector.get('permisos', ParcelasController);
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

