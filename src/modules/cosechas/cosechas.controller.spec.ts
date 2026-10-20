import { Test, TestingModule } from '@nestjs/testing';
import { CosechasController } from './cosechas.controller';
import { CosechasService } from './cosechas.service';
import { UsuarioAutenticado } from '../auth/interfaces/jwt-payload.interface';
import { CreateCosechaDto } from './dto/create-cosecha.dto';
import { UpdateCosechaDto } from './dto/update-cosecha.dto';
import { FiltroCosechaDto } from './dto/filtro-cosecha.dto';
import { CalidadCosecha } from '@prisma/client';

describe('CosechasController', () => {
  let controller: CosechasController;
  let service: {
    crearCosecha: jest.Mock;
    listarCosechas: jest.Mock;
    obtenerCosechaPorId: jest.Mock;
    actualizarCosecha: jest.Mock;
    eliminarCosecha: jest.Mock;
  };

  const mockUser: UsuarioAutenticado = {
    id: 1,
    empresaId: 10,
    nombre: 'Capturista',
    apellido: 'Test',
    correo: 'test@empresa.com',
    rol: 'CAPTURISTA',
    permisos: ['cosecha:crear'],
    estadoSuscripcion: 'ACTIVA',
  };

  beforeEach(async () => {
    service = {
      crearCosecha: jest.fn(),
      listarCosechas: jest.fn(),
      obtenerCosechaPorId: jest.fn(),
      actualizarCosecha: jest.fn(),
      eliminarCosecha: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CosechasController],
      providers: [{ provide: CosechasService, useValue: service }],
    }).compile();

    controller = module.get<CosechasController>(CosechasController);
  });

  it('debe delegar crearCosecha al servicio con el usuario autenticado', async () => {
    const dto: CreateCosechaDto = {
      cicloId: 1,
      unidadId: 1,
      fecha: '2027-02-10',
      cantidad: '100.000',
      calidad: CalidadCosecha.PRIMERA,
    };
    service.crearCosecha.mockResolvedValue({ id: 10 });

    const result = await controller.crearCosecha(mockUser, dto);
    expect(service.crearCosecha).toHaveBeenCalledWith(
      mockUser.empresaId,
      mockUser.id,
      dto,
    );
    expect(result).toEqual({ id: 10 });
  });

  it('debe delegar listarCosechas con query filters', async () => {
    const query: FiltroCosechaDto = { cicloId: 1, page: 1, limit: 10 };
    service.listarCosechas.mockResolvedValue({ data: [], meta: {} });

    const result = await controller.listarCosechas(mockUser, query);
    expect(service.listarCosechas).toHaveBeenCalledWith(
      mockUser.empresaId,
      mockUser.id,
      false,
      query,
    );
    expect(result).toEqual({ data: [], meta: {} });
  });

  it('debe delegar obtenerCosechaPorId', async () => {
    service.obtenerCosechaPorId.mockResolvedValue({ id: 10 });
    const result = await controller.obtenerCosechaPorId(mockUser, 10);
    expect(service.obtenerCosechaPorId).toHaveBeenCalledWith(
      mockUser.empresaId,
      mockUser.id,
      false,
      10,
    );
    expect(result).toEqual({ id: 10 });
  });

  it('debe delegar actualizarCosecha', async () => {
    const dto: UpdateCosechaDto = { observaciones: 'Actualizado' };
    service.actualizarCosecha.mockResolvedValue({
      id: 10,
      observaciones: 'Actualizado',
    });
    const result = await controller.actualizarCosecha(mockUser, 10, dto);
    expect(service.actualizarCosecha).toHaveBeenCalledWith(
      mockUser.empresaId,
      mockUser.id,
      false,
      10,
      dto,
    );
    expect(result).toEqual({ id: 10, observaciones: 'Actualizado' });
  });

  it('debe delegar eliminarCosecha', async () => {
    service.eliminarCosecha.mockResolvedValue({
      message: 'Cosecha eliminada exitosamente',
    });
    const result = await controller.eliminarCosecha(mockUser, 10);
    expect(service.eliminarCosecha).toHaveBeenCalledWith(
      mockUser.empresaId,
      mockUser.id,
      false,
      10,
    );
    expect(result).toEqual({ message: 'Cosecha eliminada exitosamente' });
  });
});
