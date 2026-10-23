import { Test, TestingModule } from '@nestjs/testing';
import { Response } from 'express';
import { Readable, PassThrough } from 'stream';
import { AdjuntosController } from './adjuntos.controller';
import { AdjuntosService } from './services/adjuntos.service';
import { UsuarioAutenticado } from '../auth/interfaces/jwt-payload.interface';

describe('AdjuntosController', () => {
  let controller: AdjuntosController;
  let service: {
    subirAdjunto: jest.Mock;
    listarAdjuntos: jest.Mock;
    generarEnlaceDescarga: jest.Mock;
    descargarArchivo: jest.Mock;
    eliminarAdjunto: jest.Mock;
  };

  const mockUser: UsuarioAutenticado = {
    id: 1,
    empresaId: 10,
    rolId: 1,
    rolNombre: 'ADMIN',
    correo: 'admin@test.com',
    permisos: [
      'gasto:crear',
      'actividad:crear',
      'venta:crear',
      'cobro:crear',
      'registro:administrar',
    ],
  };

  const mockFile = {
    fieldname: 'archivo',
    originalname: 'test.pdf',
    encoding: '7bit',
    mimetype: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4 test'),
    size: 15,
  } as Express.Multer.File;

  beforeEach(async () => {
    const mockAdjuntosService = {
      subirAdjunto: jest.fn().mockResolvedValue({
        id: 100,
        entidad: 'gasto',
        entidadId: 5,
        nombreArchivo: 'test.pdf',
      }),
      listarAdjuntos: jest
        .fn()
        .mockResolvedValue([{ id: 100, nombreArchivo: 'test.pdf' }]),
      generarEnlaceDescarga: jest.fn().mockResolvedValue({
        urlDescarga: '/api/v1/adjuntos/descarga?token=abc',
        token: 'abc',
        expiraEn: new Date().toISOString(),
      }),
      descargarArchivo: jest.fn().mockResolvedValue({
        stream: Readable.from(['archivo binario']),
        adjunto: {
          nombreArchivo: 'test.pdf',
          tipoMime: 'application/pdf',
          tamanoBytes: 15,
        },
      }),
      eliminarAdjunto: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdjuntosController],
      providers: [
        {
          provide: AdjuntosService,
          useValue: mockAdjuntosService,
        },
      ],
    }).compile();

    controller = module.get<AdjuntosController>(AdjuntosController);
    service = mockAdjuntosService;
  });

  it('debe subir y listar adjuntos para gasto', async () => {
    const resSubir = await controller.subirAdjuntoGasto(mockUser, 5, mockFile);
    expect(resSubir.id).toBe(100);
    expect(service.subirAdjunto).toHaveBeenCalledWith(
      mockUser.empresaId,
      mockUser.id,
      'gasto',
      5,
      mockFile,
      mockUser.permisos,
    );

    const resListar = await controller.listarAdjuntosGasto(mockUser, 5);
    expect(resListar).toHaveLength(1);
    expect(service.listarAdjuntos).toHaveBeenCalledWith(
      mockUser.empresaId,
      mockUser.id,
      'gasto',
      5,
      mockUser.permisos,
    );
  });

  it('debe subir y listar adjuntos para actividad', async () => {
    await controller.subirAdjuntoActividad(mockUser, 7, mockFile);
    expect(service.subirAdjunto).toHaveBeenCalledWith(
      mockUser.empresaId,
      mockUser.id,
      'actividad',
      7,
      mockFile,
      mockUser.permisos,
    );

    await controller.listarAdjuntosActividad(mockUser, 7);
    expect(service.listarAdjuntos).toHaveBeenCalledWith(
      mockUser.empresaId,
      mockUser.id,
      'actividad',
      7,
      mockUser.permisos,
    );
  });

  it('debe subir y listar adjuntos para venta', async () => {
    await controller.subirAdjuntoVenta(mockUser, 8, mockFile);
    expect(service.subirAdjunto).toHaveBeenCalledWith(
      mockUser.empresaId,
      mockUser.id,
      'venta',
      8,
      mockFile,
      mockUser.permisos,
    );

    await controller.listarAdjuntosVenta(mockUser, 8);
    expect(service.listarAdjuntos).toHaveBeenCalled();
  });

  it('debe subir y listar adjuntos para cobro', async () => {
    await controller.subirAdjuntoCobro(mockUser, 9, mockFile);
    expect(service.subirAdjunto).toHaveBeenCalledWith(
      mockUser.empresaId,
      mockUser.id,
      'cobro',
      9,
      mockFile,
      mockUser.permisos,
    );

    await controller.listarAdjuntosCobro(mockUser, 9);
    expect(service.listarAdjuntos).toHaveBeenCalled();
  });

  it('debe obtener enlace de descarga temporal', async () => {
    const res = await controller.obtenerEnlaceDescarga(mockUser, 100);
    expect(res.token).toBe('abc');
    expect(service.generarEnlaceDescarga).toHaveBeenCalledWith(
      mockUser.empresaId,
      mockUser.id,
      100,
      mockUser.permisos,
    );
  });

  it('debe transmitir archivo en la descarga física con cabeceras de seguridad', async () => {
    const setHeaderMock = jest.fn();
    const mockRes = Object.assign(new PassThrough(), {
      setHeader: setHeaderMock,
    }) as unknown as Response;

    await controller.descargarArchivo('token_abc', mockRes);

    expect(service.descargarArchivo).toHaveBeenCalledWith('token_abc');
    expect(setHeaderMock).toHaveBeenCalledWith(
      'Content-Type',
      'application/pdf',
    );
    expect(setHeaderMock).toHaveBeenCalledWith(
      'X-Content-Type-Options',
      'nosniff',
    );
    expect(setHeaderMock).toHaveBeenCalledWith('Cache-Control', 'no-store');
  });

  it('debe eliminar adjunto correctamente', async () => {
    const res = await controller.eliminarAdjunto(mockUser, 100);
    expect(res.message).toContain('eliminado correctamente');
    expect(service.eliminarAdjunto).toHaveBeenCalledWith(
      mockUser.empresaId,
      mockUser.id,
      100,
    );
  });
});
