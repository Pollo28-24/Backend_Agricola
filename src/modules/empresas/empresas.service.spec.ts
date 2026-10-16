import { Test, TestingModule } from '@nestjs/testing';
import { EstadoSuscripcion } from '@prisma/client';
import { EmpresasService } from './empresas.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../prisma/audit.service';
import { PasswordService } from '../../common/services/password.service';
import { AuthService } from '../auth/auth.service';
import { PlanCodigoEnum } from './dto/registro-empresa.dto';
import { DomainError } from '../../common/errors/domain.error';
import { CodigoError } from '../../common/errors/codigos-error.enum';

describe('EmpresasService (F-01, F0, RN-037)', () => {
  let service: EmpresasService;

  const mockPrismaService = {
    empresa: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    usuario: {
      findUnique: jest.fn(),
      create: jest.fn(),
      count: jest.fn(),
    },
    parcela: {
      count: jest.fn(),
    },
    planSuscripcion: {
      findUnique: jest.fn(),
    },
    rol: {
      findUnique: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const mockAuditService = {
    registrar: jest.fn().mockResolvedValue(undefined),
  };

  const mockPasswordService = {
    hash: jest.fn().mockResolvedValue('argon2_hashed_password'),
  };

  const mockAuthService = {
    login: jest.fn().mockResolvedValue({
      accessToken: 'access_token_123',
      refreshToken: 'refresh_token_123',
      usuario: { id: 1, correo: 'admin@rancho.com' },
    }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmpresasService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: AuditService, useValue: mockAuditService },
        { provide: PasswordService, useValue: mockPasswordService },
        { provide: AuthService, useValue: mockAuthService },
      ],
    }).compile();

    service = module.get<EmpresasService>(EmpresasService);
  });

  it('debe estar definido', () => {
    expect(service).toBeDefined();
  });

  describe('registrar (F0)', () => {
    const dtoRegistro = {
      nombre: 'Rancho Los Pinos',
      rfc: 'OERA700101XX0',
      correo: 'contacto@rancho.com',
      planCodigo: PlanCodigoEnum.PRODUCTOR,
      usuarioNombre: 'Ramón',
      usuarioApellido: 'Ortega',
      usuarioCorreo: 'admin@rancho.com',
      usuarioContrasena: 'Clave123456',
    };

    it('debe registrar atómicamente la empresa y el admin, retornando sesión autenticada', async () => {
      mockPrismaService.empresa.findUnique.mockResolvedValue(null);
      mockPrismaService.usuario.findUnique.mockResolvedValue(null);

      // Simular transacción
      mockPrismaService.$transaction.mockImplementation(async (callback: any) => {
        const tx = {
          planSuscripcion: {
            findUnique: jest.fn().mockResolvedValue({
              id: 2,
              codigo: 'PRODUCTOR',
              activo: true,
            }),
          },
          rol: {
            findUnique: jest.fn().mockResolvedValue({
              id: 1,
              codigo: 'ADMIN',
            }),
          },
          empresa: {
            create: jest.fn().mockResolvedValue({
              id: 10,
              nombre: 'Rancho Los Pinos',
              rfc: 'OERA700101XX0',
              estadoSuscripcion: EstadoSuscripcion.PRUEBA,
            }),
          },
          usuario: {
            create: jest.fn().mockResolvedValue({
              id: 1,
              nombre: 'Ramón',
              correo: 'admin@rancho.com',
            }),
          },
        };
        return callback(tx);
      });

      const res = await service.registrar(dtoRegistro, '192.168.1.1');

      expect(res.accessToken).toBe('access_token_123');
      expect(mockPasswordService.hash).toHaveBeenCalledWith('Clave123456');
      expect(mockAuditService.registrar).toHaveBeenCalledTimes(2);
      expect(mockAuthService.login).toHaveBeenCalledWith(
        { correo: 'admin@rancho.com', contrasena: 'Clave123456' },
        '192.168.1.1',
      );
    });

    it('debe rechazar con 409 CONFLICTO si el RFC ya está registrado', async () => {
      mockPrismaService.empresa.findUnique.mockResolvedValue({
        id: 5,
        rfc: 'OERA700101XX0',
        deletedAt: null,
      });

      await expect(service.registrar(dtoRegistro)).rejects.toThrow(DomainError);
      try {
        await service.registrar(dtoRegistro);
      } catch (e: any) {
        expect(e.code).toBe(CodigoError.CONFLICTO);
        expect(e.getStatus()).toBe(409);
      }
    });

    it('debe rechazar con 409 CONFLICTO si el correo del admin ya está registrado (RN-002)', async () => {
      mockPrismaService.empresa.findUnique.mockResolvedValue(null);
      mockPrismaService.usuario.findUnique.mockResolvedValue({
        id: 3,
        correo: 'admin@rancho.com',
        deletedAt: null,
      });

      await expect(service.registrar(dtoRegistro)).rejects.toThrow(DomainError);
      try {
        await service.registrar(dtoRegistro);
      } catch (e: any) {
        expect(e.code).toBe(CodigoError.CONFLICTO);
        expect(e.getStatus()).toBe(409);
      }
    });
  });

  describe('obtenerMiEmpresa', () => {
    it('debe calcular las cuotas de usuarios y parcelas del plan (RN-037)', async () => {
      mockPrismaService.empresa.findUnique.mockResolvedValue({
        id: 10,
        nombre: 'Rancho Los Pinos',
        rfc: 'OERA700101XX0',
        correo: 'contacto@rancho.com',
        moneda: 'MXN',
        estadoSuscripcion: 'ACTIVA',
        deletedAt: null,
        plan: {
          codigo: 'PRODUCTOR',
          nombre: 'Productor',
          precioMensual: '699.00',
          maxParcelas: 10,
          maxUsuarios: 3,
          incluyeReportes: false,
        },
      });

      mockPrismaService.usuario.count.mockResolvedValue(2);
      mockPrismaService.parcela.count.mockResolvedValue(4);

      const res = await service.obtenerMiEmpresa(10);

      expect(res.id).toBe(10);
      expect(res.cuotas.usuariosActivos).toBe(2);
      expect(res.cuotas.maxUsuarios).toBe(3);
      expect(res.cuotas.parcelasActivas).toBe(4);
      expect(res.cuotas.maxParcelas).toBe(10);
    });
  });
});
