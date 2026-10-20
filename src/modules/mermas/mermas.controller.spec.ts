import { Test, TestingModule } from '@nestjs/testing';
import { MermasController } from './mermas.controller';
import { MermasService } from './mermas.service';
import { UsuarioAutenticado } from '../auth/interfaces/jwt-payload.interface';
import { CreateMermaDto } from './dto/create-merma.dto';
import { UpdateMermaDto } from './dto/update-merma.dto';
import { FiltroMermaDto } from './dto/filtro-merma.dto';
import { EtapaMerma } from '@prisma/client';

describe('MermasController', () => {
  let controller: MermasController;
  let service: {
    crearMerma: jest.Mock;
    listarMermas: jest.Mock;
    obtenerMermaPorId: jest.Mock;
    actualizarMerma: jest.Mock;
    eliminarMerma: jest.Mock;
  };

  const mockUser: UsuarioAutenticado = {
    id: 1,
    empresaId: 10,
    nombre: 'Capturista',
    apellido: 'Test',
    correo: 'test@empresa.com',
    rol: 'CAPTURISTA',
    permisos: ['merma:crear'],
    estadoSuscripcion: 'ACTIVA',
  };

  beforeEach(async () => {
    service = {
      crearMerma: jest.fn(),
      listarMermas: jest.fn(),
      obtenerMermaPorId: jest.fn(),
      actualizarMerma: jest.fn(),
      eliminarMerma: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [MermasController],
      providers: [{ provide: MermasService, useValue: service }],
    }).compile();

    controller = module.get<MermasController>(MermasController);
  });

  it('debe delegar crearMerma al servicio con el usuario autenticado', async () => {
    const dto: CreateMermaDto = {
      cicloId: 1,
      motivoId: 2,
      unidadId: 1,
      fecha: '2027-02-15',
      etapa: EtapaMerma.POSCOSECHA,
      cantidad: '30.000',
    };
    service.crearMerma.mockResolvedValue({ id: 20 });

    const result = await controller.crearMerma(mockUser, dto);
    expect(service.crearMerma).toHaveBeenCalledWith(
      mockUser.empresaId,
      mockUser.id,
      dto,
    );
    expect(result).toEqual({ id: 20 });
  });

  it('debe delegar listarMermas con query filters', async () => {
    const query: FiltroMermaDto = { cicloId: 1, page: 1, limit: 10 };
    service.listarMermas.mockResolvedValue({ data: [], meta: {} });

    const result = await controller.listarMermas(mockUser, query);
    expect(service.listarMermas).toHaveBeenCalledWith(
      mockUser.empresaId,
      mockUser.id,
      false,
      query,
    );
    expect(result).toEqual({ data: [], meta: {} });
  });

  it('debe delegar obtenerMermaPorId', async () => {
    service.obtenerMermaPorId.mockResolvedValue({ id: 20 });
    const result = await controller.obtenerMermaPorId(mockUser, 20);
    expect(service.obtenerMermaPorId).toHaveBeenCalledWith(
      mockUser.empresaId,
      mockUser.id,
      false,
      20,
    );
    expect(result).toEqual({ id: 20 });
  });

  it('debe delegar actualizarMerma', async () => {
    const dto: UpdateMermaDto = { observaciones: 'Actualizada' };
    service.actualizarMerma.mockResolvedValue({
      id: 20,
      observaciones: 'Actualizada',
    });
    const result = await controller.actualizarMerma(mockUser, 20, dto);
    expect(service.actualizarMerma).toHaveBeenCalledWith(
      mockUser.empresaId,
      mockUser.id,
      false,
      20,
      dto,
    );
    expect(result).toEqual({ id: 20, observaciones: 'Actualizada' });
  });

  it('debe delegar eliminarMerma', async () => {
    service.eliminarMerma.mockResolvedValue({
      message: 'Merma eliminada exitosamente',
    });
    const result = await controller.eliminarMerma(mockUser, 20);
    expect(service.eliminarMerma).toHaveBeenCalledWith(
      mockUser.empresaId,
      mockUser.id,
      false,
      20,
    );
    expect(result).toEqual({ message: 'Merma eliminada exitosamente' });
  });
});
