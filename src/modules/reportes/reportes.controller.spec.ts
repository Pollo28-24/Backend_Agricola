import { Test, TestingModule } from '@nestjs/testing';
import { ReportesController } from './reportes.controller';
import { IndicadoresService } from './services/indicadores.service';
import { UsuarioAutenticado } from '../auth/interfaces/jwt-payload.interface';
import { EstadoCiclo } from '@prisma/client';

describe('ReportesController (Unitario)', () => {
  let controller: ReportesController;
  let serviceMock: {
    obtenerRentabilidad: jest.Mock;
    obtenerRentabilidadCiclo: jest.Mock;
    obtenerCostosPorCategoria: jest.Mock;
    obtenerCostosPorActividad: jest.Mock;
    obtenerMermasDesglose: jest.Mock;
    obtenerComparativoParcela: jest.Mock;
  };

  const mockUsuario: UsuarioAutenticado = {
    id: 1,
    empresaId: 10,
    correo: 'admin@rancho.test',
    nombre: 'Admin',
    apellido: 'Test',
    rol: 'ADMIN',
    permisos: ['reporte:ver'],
    estadoSuscripcion: 'ACTIVA',
  };

  beforeEach(async () => {
    serviceMock = {
      obtenerRentabilidad: jest.fn(),
      obtenerRentabilidadCiclo: jest.fn(),
      obtenerCostosPorCategoria: jest.fn(),
      obtenerCostosPorActividad: jest.fn(),
      obtenerMermasDesglose: jest.fn(),
      obtenerComparativoParcela: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ReportesController],
      providers: [
        {
          provide: IndicadoresService,
          useValue: serviceMock,
        },
      ],
    }).compile();

    controller = module.get<ReportesController>(ReportesController);
  });

  it('GET /reportes/rentabilidad delega al servicio con empresaId y filtro', async () => {
    const mockRes = { data: [], meta: { total: 0, page: 1, limit: 10 } };
    serviceMock.obtenerRentabilidad.mockResolvedValue(mockRes);

    const res = await controller.obtenerRentabilidad(mockUsuario, {
      page: 1,
      limit: 10,
      estado: EstadoCiclo.FINALIZADO,
    });

    expect(res).toBe(mockRes);
    expect(serviceMock.obtenerRentabilidad).toHaveBeenCalledWith(10, {
      page: 1,
      limit: 10,
      estado: EstadoCiclo.FINALIZADO,
    });
  });

  it('GET /reportes/ciclos/:cicloId/rentabilidad delega al servicio', async () => {
    const mockRes = { ciclo: {}, indicadores: {} };
    serviceMock.obtenerRentabilidadCiclo.mockResolvedValue(mockRes);

    const res = await controller.obtenerRentabilidadCiclo(mockUsuario, 5);

    expect(res).toBe(mockRes);
    expect(serviceMock.obtenerRentabilidadCiclo).toHaveBeenCalledWith(10, 5);
  });

  it('GET /reportes/ciclos/:cicloId/costos-por-categoria delega al servicio', async () => {
    serviceMock.obtenerCostosPorCategoria.mockResolvedValue([]);
    const res = await controller.obtenerCostosPorCategoria(mockUsuario, 5);
    expect(res).toEqual([]);
    expect(serviceMock.obtenerCostosPorCategoria).toHaveBeenCalledWith(10, 5);
  });

  it('GET /reportes/ciclos/:cicloId/costos-por-actividad delega al servicio', async () => {
    serviceMock.obtenerCostosPorActividad.mockResolvedValue([]);
    const res = await controller.obtenerCostosPorActividad(mockUsuario, 5);
    expect(res).toEqual([]);
    expect(serviceMock.obtenerCostosPorActividad).toHaveBeenCalledWith(10, 5);
  });

  it('GET /reportes/ciclos/:cicloId/mermas delega al servicio', async () => {
    serviceMock.obtenerMermasDesglose.mockResolvedValue([]);
    const res = await controller.obtenerMermas(mockUsuario, 5);
    expect(res).toEqual([]);
    expect(serviceMock.obtenerMermasDesglose).toHaveBeenCalledWith(10, 5);
  });

  it('GET /reportes/parcelas/:parcelaId/comparativo delega al servicio con filtro', async () => {
    const mockRes = { data: [], meta: { total: 0, page: 1, limit: 10 } };
    serviceMock.obtenerComparativoParcela.mockResolvedValue(mockRes);

    const res = await controller.obtenerComparativoParcela(mockUsuario, 2, {
      incluirActivos: true,
    });
    expect(res).toBe(mockRes);
    expect(serviceMock.obtenerComparativoParcela).toHaveBeenCalledWith(10, 2, {
      incluirActivos: true,
    });
  });
});
