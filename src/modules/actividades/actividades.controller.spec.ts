import { Test, TestingModule } from '@nestjs/testing';
import { ActividadesController } from './actividades.controller';
import { ActividadesService } from './actividades.service';
import { CreateActividadDto } from './dto/create-actividad.dto';
import { UpdateActividadDto } from './dto/update-actividad.dto';
import { UsuarioAutenticado } from '../auth/interfaces/jwt-payload.interface';

describe('ActividadesController', () => {
  let controller: ActividadesController;
  let service: {
    crearActividad: jest.Mock;
    listarActividades: jest.Mock;
    obtenerActividadPorId: jest.Mock;
    actualizarActividad: jest.Mock;
    eliminarActividad: jest.Mock;
  };

  const userMock: UsuarioAutenticado = {
    id: 1,
    empresaId: 10,
    nombre: 'Juan',
    apellido: 'Pérez',
    correo: 'juan@agricola.com',
    rol: 'ADMIN',
    permisos: ['actividad:crear', 'registro:administrar'],
    estadoSuscripcion: 'ACTIVA',
  };

  beforeEach(async () => {
    service = {
      crearActividad: jest.fn(),
      listarActividades: jest.fn(),
      obtenerActividadPorId: jest.fn(),
      actualizarActividad: jest.fn(),
      eliminarActividad: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ActividadesController],
      providers: [{ provide: ActividadesService, useValue: service }],
    }).compile();

    controller = module.get<ActividadesController>(ActividadesController);
  });

  it('debe estar definido', () => {
    expect(controller).toBeDefined();
  });

  it('crearActividad debe delegar en service.crearActividad', async () => {
    const dto: CreateActividadDto = {
      cicloId: 1,
      tipoActividadId: 2,
      fecha: '2027-01-15',
    };
    service.crearActividad.mockResolvedValue({ id: 100, ...dto });

    const res = await controller.crearActividad(userMock, dto);

    expect(service.crearActividad).toHaveBeenCalledWith(
      userMock.empresaId,
      userMock.id,
      dto,
    );
    expect(res.id).toBe(100);
  });

  it('listarActividades debe delegar en service.listarActividades', async () => {
    service.listarActividades.mockResolvedValue({
      data: [],
      meta: { total: 0 },
    });

    const res = await controller.listarActividades(userMock.empresaId, {
      page: 1,
      limit: 10,
    });

    expect(service.listarActividades).toHaveBeenCalledWith(userMock.empresaId, {
      page: 1,
      limit: 10,
    });
    expect(res.data).toEqual([]);
  });

  it('obtenerActividadPorId debe delegar en service.obtenerActividadPorId', async () => {
    service.obtenerActividadPorId.mockResolvedValue({ id: 100 });

    const res = await controller.obtenerActividadPorId(userMock.empresaId, 100);

    expect(service.obtenerActividadPorId).toHaveBeenCalledWith(
      userMock.empresaId,
      100,
    );
    expect(res.id).toBe(100);
  });

  it('actualizarActividad debe detectar tienePermisoAdministrar = true para ADMIN', async () => {
    const dto: UpdateActividadDto = { descripcion: 'Cambio' };
    service.actualizarActividad.mockResolvedValue({
      id: 100,
      descripcion: 'Cambio',
    });

    const res = await controller.actualizarActividad(userMock, 100, dto);

    expect(service.actualizarActividad).toHaveBeenCalledWith(
      userMock.empresaId,
      userMock.id,
      true, // tienePermisoAdministrar
      100,
      dto,
    );
    expect(res.descripcion).toBe('Cambio');
  });

  it('actualizarActividad debe detectar tienePermisoAdministrar = false para CAPTURISTA', async () => {
    const capturistaUser: UsuarioAutenticado = {
      ...userMock,
      rol: 'CAPTURISTA',
      permisos: ['actividad:crear'], // sin registro:administrar
    };
    const dto: UpdateActividadDto = { descripcion: 'Cambio' };
    service.actualizarActividad.mockResolvedValue({
      id: 100,
      descripcion: 'Cambio',
    });

    await controller.actualizarActividad(capturistaUser, 100, dto);

    expect(service.actualizarActividad).toHaveBeenCalledWith(
      capturistaUser.empresaId,
      capturistaUser.id,
      false, // tienePermisoAdministrar
      100,
      dto,
    );
  });

  it('eliminarActividad debe delegar en service.eliminarActividad', async () => {
    service.eliminarActividad.mockResolvedValue({
      message: 'Actividad eliminada exitosamente',
    });

    const res = await controller.eliminarActividad(userMock, 100);

    expect(service.eliminarActividad).toHaveBeenCalledWith(
      userMock.empresaId,
      userMock.id,
      true,
      100,
    );
    expect(res.message).toContain('exitosamente');
  });
});
