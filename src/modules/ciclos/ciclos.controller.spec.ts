import { Test, TestingModule } from '@nestjs/testing';
import { EstadoCiclo } from '@prisma/client';
import { CiclosController } from './ciclos.controller';
import { CiclosService } from './ciclos.service';
import { AccionCiclo } from './constants/ciclo-state-machine.constant';
import { CreateCicloDto } from './dto/create-ciclo.dto';
import { UpdateCicloDto } from './dto/update-ciclo.dto';
import { FinalizarCicloDto } from './dto/finalizar-ciclo.dto';

describe('CiclosController', () => {
  let controller: CiclosController;
  let service: {
    crearCiclo: jest.Mock;
    listarCiclos: jest.Mock;
    obtenerCicloPorId: jest.Mock;
    actualizarCiclo: jest.Mock;
    ejecutarTransicion: jest.Mock;
    eliminarCiclo: jest.Mock;
  };

  const empresaId = 10;
  const usuarioId = 1;

  beforeEach(async () => {
    service = {
      crearCiclo: jest.fn(),
      listarCiclos: jest.fn(),
      obtenerCicloPorId: jest.fn(),
      actualizarCiclo: jest.fn(),
      ejecutarTransicion: jest.fn(),
      eliminarCiclo: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CiclosController],
      providers: [{ provide: CiclosService, useValue: service }],
    }).compile();

    controller = module.get<CiclosController>(CiclosController);
  });

  it('debe estar definido', () => {
    expect(controller).toBeDefined();
  });

  it('crear debe invocar a service.crearCiclo con empresaId y usuarioId', async () => {
    const dto: CreateCicloDto = {
      parcelaId: 2,
      variedadId: 5,
      fechaInicio: '2027-01-10',
      superficieSembrada: 2.5,
    };
    service.crearCiclo.mockResolvedValue({ id: 1, ...dto, estado: EstadoCiclo.PLANIFICADO });

    const res = await controller.crear(empresaId, usuarioId, dto);
    expect(service.crearCiclo).toHaveBeenCalledWith(empresaId, usuarioId, dto);
    expect(res.id).toBe(1);
    expect(res.estado).toBe(EstadoCiclo.PLANIFICADO);
  });

  it('listar debe delegar en service.listarCiclos', async () => {
    service.listarCiclos.mockResolvedValue({ data: [], meta: { total: 0 } });
    const res = await controller.listar(empresaId, {});
    expect(service.listarCiclos).toHaveBeenCalledWith(empresaId, {});
    expect(res.data).toEqual([]);
  });

  it('iniciar debe ejecutar la transición INICIAR', async () => {
    service.ejecutarTransicion.mockResolvedValue({ id: 1, estado: EstadoCiclo.ACTIVO });
    const res = await controller.iniciar(empresaId, usuarioId, 1);
    expect(service.ejecutarTransicion).toHaveBeenCalledWith(
      empresaId,
      usuarioId,
      1,
      AccionCiclo.INICIAR,
    );
    expect(res.estado).toBe(EstadoCiclo.ACTIVO);
  });

  it('finalizar debe enviar la fechaFin requerida', async () => {
    const dto: FinalizarCicloDto = { fechaFin: '2027-06-30' };
    service.ejecutarTransicion.mockResolvedValue({ id: 1, estado: EstadoCiclo.FINALIZADO });

    const res = await controller.finalizar(empresaId, usuarioId, 1, dto);
    expect(service.ejecutarTransicion).toHaveBeenCalledWith(
      empresaId,
      usuarioId,
      1,
      AccionCiclo.FINALIZAR,
      dto,
    );
    expect(res.estado).toBe(EstadoCiclo.FINALIZADO);
  });

  it('reabrir debe ejecutar la transición REABRIR', async () => {
    service.ejecutarTransicion.mockResolvedValue({ id: 1, estado: EstadoCiclo.ACTIVO });
    const res = await controller.reabrir(empresaId, usuarioId, 1);
    expect(service.ejecutarTransicion).toHaveBeenCalledWith(
      empresaId,
      usuarioId,
      1,
      AccionCiclo.REABRIR,
    );
    expect(res.estado).toBe(EstadoCiclo.ACTIVO);
  });

  it('eliminar debe delegar en service.eliminarCiclo', async () => {
    service.eliminarCiclo.mockResolvedValue({ message: 'Ciclo eliminado exitosamente' });
    const res = await controller.eliminar(empresaId, usuarioId, 1);
    expect(service.eliminarCiclo).toHaveBeenCalledWith(empresaId, usuarioId, 1);
    expect(res.message).toContain('exitosamente');
  });
});
