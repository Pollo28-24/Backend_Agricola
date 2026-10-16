import { Test, TestingModule } from '@nestjs/testing';
import { AuditoriaController } from './auditoria.controller';
import { AuditoriaService } from './auditoria.service';
import { AccionAuditoria } from '@prisma/client';

describe('AuditoriaController', () => {
  let controller: AuditoriaController;

  const mockAuditoriaService = {
    listar: jest.fn(),
    obtenerPorId: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuditoriaController],
      providers: [
        { provide: AuditoriaService, useValue: mockAuditoriaService },
      ],
    }).compile();

    controller = module.get<AuditoriaController>(AuditoriaController);
  });

  it('debe estar definido', () => {
    expect(controller).toBeDefined();
  });

  it('debe delegar listar al servicio con empresaId y filtros query', async () => {
    const filtros = {
      page: 1,
      limit: 20,
      entidad: 'usuario',
      accion: AccionAuditoria.CREAR,
    };
    mockAuditoriaService.listar.mockResolvedValue({
      data: [],
      meta: { total: 0, page: 1, limit: 20, totalPages: 1 },
    });

    const res = await controller.listar(5, filtros);

    expect(mockAuditoriaService.listar).toHaveBeenCalledWith(5, filtros);
    expect(res.meta.total).toBe(0);
  });

  it('debe delegar obtenerPorId con empresaId e id BigInt', async () => {
    mockAuditoriaService.obtenerPorId.mockResolvedValue({
      id: '12345',
      entidad: 'parcela',
    });

    const res = await controller.obtenerPorId(5, BigInt(12345));

    expect(mockAuditoriaService.obtenerPorId).toHaveBeenCalledWith(
      5,
      BigInt(12345),
    );
    expect(res.id).toBe('12345');
  });
});
