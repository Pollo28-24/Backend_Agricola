import { Test, TestingModule } from '@nestjs/testing';
import { Readable } from 'stream';
import { AdjuntosService } from './adjuntos.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuditService } from '../../../prisma/audit.service';
import { STORAGE_SERVICE } from '../interfaces/storage-service.interface';
import { TokenDescargaService } from './token-descarga.service';
import { CicloCapturaPolicy } from '../../../common/domain/policies/ciclo-captura.policy';
import { RecordWindowValidator } from '../../../common/domain/validators/record-window.validator';
import { CodigoError } from '../../../common/errors/codigos-error.enum';
import { DomainError } from '../../../common/errors/domain.error';

describe('AdjuntosService', () => {
  let service: AdjuntosService;
  let mockPrisma: {
    gasto: { findFirst: jest.Mock };
    actividad: { findFirst: jest.Mock };
    venta: { findFirst: jest.Mock };
    cobroVenta: { findFirst: jest.Mock };
    adjunto: {
      count: jest.Mock;
      create: jest.Mock;
      findFirst: jest.Mock;
      findMany: jest.Mock;
      delete: jest.Mock;
    };
    usuario: { findFirst: jest.Mock };
    $transaction: jest.Mock;
    $queryRaw: jest.Mock;
  };
  let mockStorage: {
    guardar: jest.Mock;
    leerStream: jest.Mock;
    borrar: jest.Mock;
    existe: jest.Mock;
  };
  let mockTokenService: {
    generarToken: jest.Mock;
    verificarToken: jest.Mock;
    setReloj: jest.Mock;
    resetReloj: jest.Mock;
  };
  let mockAuditService: {
    registrar: jest.Mock;
  };
  let mockPolicy: {
    assertCaptureAllowed: jest.Mock;
  };
  let mockWindowValidator: {
    assertEdicionPermitida: jest.Mock;
    assertEliminacionPermitida: jest.Mock;
  };

  beforeEach(async () => {
    mockStorage = {
      guardar: jest.fn().mockResolvedValue(undefined),
      leerStream: jest.fn().mockResolvedValue(Readable.from(['datos'])),
      borrar: jest.fn().mockResolvedValue(undefined),
      existe: jest.fn().mockResolvedValue(true),
    };

    mockTokenService = {
      generarToken: jest.fn().mockReturnValue({
        token: 'token_valido_123',
        expiraEn: new Date(Date.now() + 300000),
      }),
      verificarToken: jest.fn().mockReturnValue({
        adjuntoId: 1,
        empresaId: 1,
        usuarioId: 10,
        exp: Math.floor(Date.now() / 1000) + 300,
      }),
      setReloj: jest.fn(),
      resetReloj: jest.fn(),
    };

    mockAuditService = {
      registrar: jest.fn().mockResolvedValue(undefined),
    };

    mockPolicy = {
      assertCaptureAllowed: jest.fn(),
    };

    mockWindowValidator = {
      assertEdicionPermitida: jest.fn(),
      assertEliminacionPermitida: jest.fn(),
    };

    mockPrisma = {
      gasto: { findFirst: jest.fn() },
      actividad: { findFirst: jest.fn() },
      venta: { findFirst: jest.fn() },
      cobroVenta: { findFirst: jest.fn() },
      adjunto: {
        count: jest.fn(),
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        delete: jest.fn(),
      },
      usuario: { findFirst: jest.fn() },
      $transaction: jest.fn((cb: (tx: typeof mockPrisma) => Promise<unknown>) =>
        cb(mockPrisma),
      ),
      $queryRaw: jest
        .fn()
        .mockResolvedValue([{ id: 10, estado: 'EN_PROCESO' }]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdjuntosService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: STORAGE_SERVICE, useValue: mockStorage },
        { provide: TokenDescargaService, useValue: mockTokenService },
        { provide: AuditService, useValue: mockAuditService },
        { provide: CicloCapturaPolicy, useValue: mockPolicy },
        { provide: RecordWindowValidator, useValue: mockWindowValidator },
      ],
    }).compile();

    service = module.get<AdjuntosService>(AdjuntosService);
  });

  describe('subirAdjunto', () => {
    const validPdfBuffer = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj');
    const validFile = {
      fieldname: 'archivo',
      originalname: 'factura.pdf',
      encoding: '7bit',
      mimetype: 'application/pdf',
      buffer: validPdfBuffer,
      size: validPdfBuffer.length,
    } as Express.Multer.File;

    it('debe rechazar entidades no soportadas', async () => {
      await expect(
        service.subirAdjunto(1, 10, 'entidad_invalida', 1, validFile, [
          'gasto:crear',
        ]),
      ).rejects.toThrow(DomainError);
    });

    it('debe rechazar archivo ausente o vacío', async () => {
      await expect(
        service.subirAdjunto(
          1,
          10,
          'gasto',
          1,
          null as unknown as Express.Multer.File,
          ['gasto:crear'],
        ),
      ).rejects.toThrow(DomainError);

      const emptyFile = { ...validFile, buffer: Buffer.alloc(0), size: 0 };
      await expect(
        service.subirAdjunto(1, 10, 'gasto', 1, emptyFile, ['gasto:crear']),
      ).rejects.toThrow(DomainError);
    });

    it('debe rechazar archivo mayor a 10MB con 413 ARCHIVO_DEMASIADO_GRANDE', async () => {
      const hugeFile = {
        ...validFile,
        size: 10 * 1024 * 1024 + 1,
        buffer: Buffer.alloc(10 * 1024 * 1024 + 1),
      };
      await expect(
        service.subirAdjunto(1, 10, 'gasto', 1, hugeFile, ['gasto:crear']),
      ).rejects.toThrow(DomainError);
      try {
        await service.subirAdjunto(1, 10, 'gasto', 1, hugeFile, [
          'gasto:crear',
        ]);
      } catch (err) {
        expect((err as DomainError).code).toBe(
          CodigoError.ARCHIVO_DEMASIADO_GRANDE,
        );
        expect((err as DomainError).getStatus()).toBe(413);
      }
    });

    it('debe rechazar archivo con firma no permitida o no coincidente con mimetype con 415', async () => {
      const fakeFile = {
        ...validFile,
        buffer: Buffer.from('archivo falso sin cabecera binaria valida'),
      };
      await expect(
        service.subirAdjunto(1, 10, 'gasto', 1, fakeFile, ['gasto:crear']),
      ).rejects.toThrow(DomainError);
      try {
        await service.subirAdjunto(1, 10, 'gasto', 1, fakeFile, [
          'gasto:crear',
        ]);
      } catch (err) {
        expect((err as DomainError).code).toBe(
          CodigoError.TIPO_ARCHIVO_NO_PERMITIDO,
        );
        expect((err as DomainError).getStatus()).toBe(415);
      }
    });

    it('debe rechazar si la entidad destino no existe (404)', async () => {
      mockPrisma.gasto.findFirst.mockResolvedValue(null);

      await expect(
        service.subirAdjunto(1, 10, 'gasto', 999, validFile, ['gasto:crear']),
      ).rejects.toThrow(DomainError);
    });

    it('debe rechazar si ya se alcanzó el límite de 10 adjuntos', async () => {
      mockPrisma.gasto.findFirst.mockResolvedValue({
        id: 1,
        cicloId: 10,
        creadoPorId: 10,
        createdAt: new Date(),
      });
      mockPrisma.adjunto.count.mockResolvedValue(10);

      await expect(
        service.subirAdjunto(1, 10, 'gasto', 1, validFile, ['gasto:crear']),
      ).rejects.toThrow(DomainError);

      expect(mockStorage.borrar).toHaveBeenCalled();
    });

    it('debe subir y persistir exitosamente el adjunto con auditoría', async () => {
      mockPrisma.gasto.findFirst.mockResolvedValue({
        id: 1,
        cicloId: 10,
        creadoPorId: 10,
        createdAt: new Date(),
      });
      mockPrisma.adjunto.count.mockResolvedValue(2);
      mockPrisma.adjunto.create.mockResolvedValue({
        id: 42,
        empresaId: 1,
        subidoPorId: 10,
        entidad: 'gasto',
        entidadId: 1,
        nombreArchivo: 'factura.pdf',
        tipoMime: 'application/pdf',
        tamanoBytes: validFile.buffer.length,
        claveAlmacenamiento: '1/random.pdf',
        createdAt: new Date(),
      });

      const res = await service.subirAdjunto(1, 10, 'gasto', 1, validFile, [
        'gasto:crear',
      ]);

      expect(res.id).toBe(42);
      expect(mockStorage.guardar).toHaveBeenCalled();
      expect(mockPrisma.adjunto.create).toHaveBeenCalled();
      expect(mockAuditService.registrar).toHaveBeenCalled();
    });

    it('debe compensar borrando el archivo físico si la transacción de BD falla', async () => {
      mockPrisma.gasto.findFirst.mockResolvedValue({
        id: 1,
        cicloId: 10,
        creadoPorId: 10,
        createdAt: new Date(),
      });
      mockPrisma.$transaction.mockRejectedValue(new Error('DB failure'));

      await expect(
        service.subirAdjunto(1, 10, 'gasto', 1, validFile, ['gasto:crear']),
      ).rejects.toThrow('DB failure');

      expect(mockStorage.borrar).toHaveBeenCalled();
    });
  });

  describe('generarEnlaceDescarga', () => {
    it('debe rechazar si el adjunto no existe', async () => {
      mockPrisma.adjunto.findFirst.mockResolvedValue(null);

      await expect(
        service.generarEnlaceDescarga(1, 10, 999, ['gasto:crear']),
      ).rejects.toThrow(DomainError);
    });

    it('debe generar enlace firmado si el usuario tiene permisos', async () => {
      mockPrisma.adjunto.findFirst.mockResolvedValue({
        id: 1,
        empresaId: 1,
        entidad: 'gasto',
        entidadId: 5,
        nombreArchivo: 'factura.pdf',
      });
      mockPrisma.gasto.findFirst.mockResolvedValue({
        id: 5,
        cicloId: 10,
        creadoPorId: 10,
        createdAt: new Date(),
      });

      const res = await service.generarEnlaceDescarga(1, 10, 1, [
        'gasto:crear',
      ]);
      expect(res.urlDescarga).toContain('token=token_valido_123');
      expect(mockTokenService.generarToken).toHaveBeenCalledWith(1, 1, 10);
    });
  });

  describe('descargarArchivo', () => {
    it('debe rechazar si el usuario o la empresa ya no están activos', async () => {
      mockPrisma.usuario.findFirst.mockResolvedValue(null);

      await expect(service.descargarArchivo('token_xyz')).rejects.toThrow(
        DomainError,
      );
    });

    it('debe retornar el stream y metadatos cuando todo es válido', async () => {
      mockPrisma.usuario.findFirst.mockResolvedValue({ id: 10, activo: true });
      mockPrisma.adjunto.findFirst.mockResolvedValue({
        id: 1,
        empresaId: 1,
        claveAlmacenamiento: '1/uuid.pdf',
        nombreArchivo: 'factura.pdf',
        tipoMime: 'application/pdf',
        tamanoBytes: 500,
      });

      const res = await service.descargarArchivo('token_xyz');
      expect(res.stream).toBeDefined();
      expect(res.adjunto.nombreArchivo).toBe('factura.pdf');
    });
  });

  describe('eliminarAdjunto', () => {
    it('debe rechazar eliminación si el adjunto no existe', async () => {
      mockPrisma.adjunto.findFirst.mockResolvedValue(null);

      await expect(service.eliminarAdjunto(1, 10, 999)).rejects.toThrow(
        DomainError,
      );
    });

    it('debe bloquear ciclo, eliminar fila, auditar y borrar archivo de storage', async () => {
      mockPrisma.adjunto.findFirst.mockResolvedValue({
        id: 1,
        empresaId: 1,
        entidad: 'gasto',
        entidadId: 5,
        claveAlmacenamiento: '1/doc.pdf',
      });
      mockPrisma.gasto.findFirst.mockResolvedValue({
        id: 5,
        cicloId: 10,
        creadoPorId: 10,
        createdAt: new Date(),
      });
      mockPrisma.$queryRaw.mockResolvedValue([
        { id: 10, estado: 'EN_PROCESO' },
      ]);

      await service.eliminarAdjunto(1, 10, 1);

      expect(mockPrisma.adjunto.delete).toHaveBeenCalledWith({
        where: { id: 1 },
      });
      expect(mockAuditService.registrar).toHaveBeenCalled();
      expect(mockStorage.borrar).toHaveBeenCalledWith('1/doc.pdf');
    });
  });
});
