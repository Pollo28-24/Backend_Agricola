import { Test, TestingModule } from '@nestjs/testing';
import { CatalogosController } from './catalogos.controller';
import { CatalogosService } from './catalogos.service';
import { TipoUnidad } from '@prisma/client';

describe('CatalogosController', () => {
  let controller: CatalogosController;

  const mockCatalogosService = {
    obtenerCultivos: jest.fn(),
    obtenerVariedades: jest.fn(),
    obtenerTiposSuelo: jest.fn(),
    obtenerUnidadesMedida: jest.fn(),
    obtenerTiposActividad: jest.fn(),
    obtenerMotivosMerma: jest.fn(),
    obtenerCategoriasGasto: jest.fn(),
    crearCategoriaGasto: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CatalogosController],
      providers: [
        { provide: CatalogosService, useValue: mockCatalogosService },
      ],
    }).compile();

    controller = module.get<CatalogosController>(CatalogosController);
  });

  it('debe estar definido', () => {
    expect(controller).toBeDefined();
  });

  it('debe delegar obtenerCultivos', async () => {
    mockCatalogosService.obtenerCultivos.mockResolvedValue([
      { id: 1, nombre: 'Tomate' },
    ]);
    const res = await controller.obtenerCultivos(true);
    expect(mockCatalogosService.obtenerCultivos).toHaveBeenCalledWith(true);
    expect(res).toHaveLength(1);
  });

  it('debe delegar obtenerVariedadesPorCultivo', async () => {
    mockCatalogosService.obtenerVariedades.mockResolvedValue([
      { id: 1, nombre: 'Saladette' },
    ]);
    const res = await controller.obtenerVariedadesPorCultivo(1, true);
    expect(mockCatalogosService.obtenerVariedades).toHaveBeenCalledWith(
      1,
      true,
    );
    expect(res).toHaveLength(1);
  });

  it('debe delegar obtenerTiposSuelo', async () => {
    mockCatalogosService.obtenerTiposSuelo.mockResolvedValue([
      { id: 1, nombre: 'Franco' },
    ]);
    const res = await controller.obtenerTiposSuelo();
    expect(mockCatalogosService.obtenerTiposSuelo).toHaveBeenCalled();
    expect(res).toHaveLength(1);
  });

  it('debe delegar obtenerUnidadesMedida con filtro de tipo', async () => {
    mockCatalogosService.obtenerUnidadesMedida.mockResolvedValue([
      { id: 1, codigo: 'KG' },
    ]);
    const res = await controller.obtenerUnidadesMedida({
      tipo: TipoUnidad.PESO,
    });
    expect(mockCatalogosService.obtenerUnidadesMedida).toHaveBeenCalledWith(
      TipoUnidad.PESO,
    );
    expect(res).toHaveLength(1);
  });

  it('debe delegar obtenerTiposActividad', async () => {
    mockCatalogosService.obtenerTiposActividad.mockResolvedValue([
      { id: 1, nombre: 'Poda' },
    ]);
    const res = await controller.obtenerTiposActividad(true);
    expect(mockCatalogosService.obtenerTiposActividad).toHaveBeenCalledWith(
      true,
    );
    expect(res).toHaveLength(1);
  });

  it('debe delegar obtenerMotivosMerma', async () => {
    mockCatalogosService.obtenerMotivosMerma.mockResolvedValue([
      { id: 1, nombre: 'Granizo' },
    ]);
    const res = await controller.obtenerMotivosMerma(true);
    expect(mockCatalogosService.obtenerMotivosMerma).toHaveBeenCalledWith(true);
    expect(res).toHaveLength(1);
  });

  it('debe delegar obtenerCategoriasGasto pasando el empresaId del tenant autenticado', async () => {
    mockCatalogosService.obtenerCategoriasGasto.mockResolvedValue([
      { id: 1, nombre: 'Insumos' },
    ]);
    const res = await controller.obtenerCategoriasGasto(10);
    expect(mockCatalogosService.obtenerCategoriasGasto).toHaveBeenCalledWith(
      10,
    );
    expect(res).toHaveLength(1);
  });

  it('debe delegar crearCategoriaGasto pasando el empresaId del tenant y DTO', async () => {
    const dto = { nombre: 'Empaques Biodegradables' };
    mockCatalogosService.crearCategoriaGasto.mockResolvedValue({
      id: 5,
      nombre: 'Empaques Biodegradables',
    });
    const res = await controller.crearCategoriaGasto(10, dto);
    expect(mockCatalogosService.crearCategoriaGasto).toHaveBeenCalledWith(
      10,
      dto,
    );
    expect(res.id).toBe(5);
  });
});
