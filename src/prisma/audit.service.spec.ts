import { Test, TestingModule } from '@nestjs/testing';
import { ClsService } from 'nestjs-cls';
import { AccionAuditoria } from '@prisma/client';
import { AuditService } from './audit.service';
import { PrismaService } from './prisma.service';

describe('AuditService', () => {
  let service: AuditService;

  const mockPrismaService = {
    bitacoraAuditoria: {
      create: jest.fn().mockResolvedValue({ id: BigInt(1) }),
    },
  };

  const mockClsService = {
    get: jest.fn((key: string) => {
      if (key === 'empresaId') return 10;
      if (key === 'usuarioId') return 5;
      if (key === 'ip') return '192.168.1.1';
      return undefined;
    }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: ClsService, useValue: mockClsService },
      ],
    }).compile();

    service = module.get<AuditService>(AuditService);
  });

  it('debe registrar evento en bitácora tomando valores de ClsService', async () => {
    await service.registrar({
      entidad: 'gasto',
      entidadId: 100,
      accion: AccionAuditoria.CREAR,
      valoresNuevos: { id: 100, total: '500.00', contrasenaHash: 'secret' },
    });

    expect(mockPrismaService.bitacoraAuditoria.create).toHaveBeenCalledTimes(1);
    const args =
      mockPrismaService.bitacoraAuditoria.create.mock.calls[0][0].data;

    expect(args.empresaId).toBe(10);
    expect(args.usuarioId).toBe(5);
    expect(args.direccionIp).toBe('192.168.1.1');
    expect(args.entidad).toBe('gasto');
    expect(args.entidadId).toBe(100);
    expect(args.accion).toBe(AccionAuditoria.CREAR);
    // Verificar que contrasenaHash fue sanitizada (RN-074)
    expect(args.valoresNuevos.contrasenaHash).toBeUndefined();
    expect(args.valoresNuevos.total).toBe('500.00');
  });

  it('no debe lanzar error si no existe empresaId en contexto, pero no registra', async () => {
    mockClsService.get.mockReturnValueOnce(undefined); // empresaId undefined

    await service.registrar({
      entidad: 'usuario',
      entidadId: 1,
      accion: AccionAuditoria.ACTUALIZAR,
    });

    expect(mockPrismaService.bitacoraAuditoria.create).not.toHaveBeenCalled();
  });

  describe('Modo Transaccional (con tx)', () => {
    it('debe registrar en bitácora usando el TransactionClient', async () => {
      const mockTx = {
        bitacoraAuditoria: {
          create: jest.fn().mockResolvedValue({ id: BigInt(2) }),
        },
      } as any;

      await service.registrar(
        {
          entidad: 'ciclo_produccion',
          entidadId: 50,
          accion: AccionAuditoria.CREAR,
          valoresNuevos: { nombre: 'Ciclo 2026', contrasenaHash: 'hidden' },
        },
        mockTx,
      );

      expect(mockTx.bitacoraAuditoria.create).toHaveBeenCalledTimes(1);
      expect(mockPrismaService.bitacoraAuditoria.create).not.toHaveBeenCalled();

      const args = mockTx.bitacoraAuditoria.create.mock.calls[0][0].data;
      expect(args.empresaId).toBe(10);
      expect(args.entidad).toBe('ciclo_produccion');
      expect(args.entidadId).toBe(50);
      expect(args.valoresNuevos.contrasenaHash).toBeUndefined();
    });

    it('debe lanzar DomainError si falta empresaId en contexto transaccional', async () => {
      mockClsService.get.mockReturnValueOnce(undefined); // empresaId undefined

      const mockTx = {
        bitacoraAuditoria: {
          create: jest.fn(),
        },
      } as any;

      await expect(
        service.registrar(
          {
            entidad: 'ciclo_produccion',
            entidadId: 50,
            accion: AccionAuditoria.CREAR,
          },
          mockTx,
        ),
      ).rejects.toThrow('falta empresaId en contexto transaccional');

      expect(mockTx.bitacoraAuditoria.create).not.toHaveBeenCalled();
    });

    it('debe relanzar el error si la base de datos falla dentro de la transacción (rethrow para rollback)', async () => {
      const dbError = new Error('Deadlock detected in InnoDB');
      const mockTx = {
        bitacoraAuditoria: {
          create: jest.fn().mockRejectedValue(dbError),
        },
      } as any;

      await expect(
        service.registrar(
          {
            entidad: 'ciclo_produccion',
            entidadId: 50,
            accion: AccionAuditoria.CREAR,
          },
          mockTx,
        ),
      ).rejects.toThrow('Deadlock detected in InnoDB');
    });
  });
});
