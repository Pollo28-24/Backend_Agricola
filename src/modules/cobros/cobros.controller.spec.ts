import { Test, TestingModule } from '@nestjs/testing';
import { MetodoPago } from '@prisma/client';
import { CobrosController } from './cobros.controller';
import { CobrosService } from './cobros.service';
import { CreateCobroDto } from './dto/create-cobro.dto';
import { FiltroCobroDto } from './dto/filtro-cobro.dto';
import type { UsuarioAutenticado } from '../auth/interfaces/jwt-payload.interface';

describe('CobrosController', () => {
  let controller: CobrosController;
  let service: {
    registrarCobro: jest.Mock;
    listarCobrosDeVenta: jest.Mock;
    obtenerCobroPorId: jest.Mock;
    anularCobro: jest.Mock;
  };

  const mockUser: UsuarioAutenticado = {
    id: 1,
    empresaId: 10,
    rol: 'ADMIN',
    correo: 'admin@test.com',
  };

  beforeEach(async () => {
    service = {
      registrarCobro: jest.fn(),
      listarCobrosDeVenta: jest.fn(),
      obtenerCobroPorId: jest.fn(),
      anularCobro: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CobrosController],
      providers: [{ provide: CobrosService, useValue: service }],
    }).compile();

    controller = module.get<CobrosController>(CobrosController);
  });

  it('debe estar definido', () => {
    expect(controller).toBeDefined();
  });

  it('registrarCobro delega al servicio con empresaId y usuarioId del token', async () => {
    const dto: CreateCobroDto = {
      fecha: '2026-03-15',
      monto: '500.00',
      metodo: MetodoPago.EFECTIVO,
    };
    service.registrarCobro.mockResolvedValue({ id: 1 });

    const res = await controller.registrarCobro(mockUser, 5, dto);

    expect(service.registrarCobro).toHaveBeenCalledWith(10, 1, 5, dto);
    expect(res).toEqual({ id: 1 });
  });

  it('listarCobrosDeVenta delega con empresaId, ventaId y filtro', async () => {
    const filtro: FiltroCobroDto = {
      page: 1,
      limit: 10,
      incluirAnulados: false,
    };
    service.listarCobrosDeVenta.mockResolvedValue({ data: [], meta: {} });

    const res = await controller.listarCobrosDeVenta(mockUser, 5, filtro);

    expect(service.listarCobrosDeVenta).toHaveBeenCalledWith(10, 5, filtro);
    expect(res).toEqual({ data: [], meta: {} });
  });

  it('obtenerCobroPorId delega con empresaId y cobroId', async () => {
    service.obtenerCobroPorId.mockResolvedValue({ id: 50 });

    const res = await controller.obtenerCobroPorId(mockUser, 50);

    expect(service.obtenerCobroPorId).toHaveBeenCalledWith(10, 50);
    expect(res).toEqual({ id: 50 });
  });

  it('anularCobro delega con empresaId, usuarioId y cobroId', async () => {
    service.anularCobro.mockResolvedValue({ id: 50, deletedAt: new Date() });

    const res = await controller.anularCobro(mockUser, 50);

    expect(service.anularCobro).toHaveBeenCalledWith(10, 1, 50);
    expect(res.id).toBe(50);
  });
});
