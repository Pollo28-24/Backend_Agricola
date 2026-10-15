import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from './health.controller';
import { PrismaService } from '../../prisma/prisma.service';

describe('HealthController', () => {
  let controller: HealthController;

  const mockPrismaService = {
    $queryRaw: jest.fn().mockResolvedValue([{ 1: 1 }]),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  it('debe estar definido', () => {
    expect(controller).toBeDefined();
  });

  it('debe retornar status ok y database ok cuando MySQL responde', async () => {
    const res = await controller.check();
    expect(res.status).toBe('ok');
    expect(res.database).toBe('ok');
    expect(res.version).toBe('1.0.0');
    expect(res.timestamp).toBeDefined();
  });

  it('debe retornar database disconnected si la consulta falla', async () => {
    mockPrismaService.$queryRaw.mockRejectedValueOnce(new Error('Connection lost'));
    const res = await controller.check();
    expect(res.status).toBe('ok');
    expect(res.database).toBe('disconnected');
  });
});
