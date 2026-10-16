import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

describe('AuthController', () => {
  let controller: AuthController;

  const mockAuthService = {
    login: jest.fn(),
    refresh: jest.fn(),
    logout: jest.fn(),
    me: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: mockAuthService }],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  it('debe estar definido', () => {
    expect(controller).toBeDefined();
  });

  it('debe llamar a authService.login con dto e IP', async () => {
    const dto = { correo: 'test@correo.com', contrasena: '123456' };
    mockAuthService.login.mockResolvedValue({
      accessToken: 'a',
      refreshToken: 'r',
    });

    const res = await controller.login(dto, '192.168.1.50');
    expect(mockAuthService.login).toHaveBeenCalledWith(dto, '192.168.1.50');
    expect(res.accessToken).toBe('a');
  });

  it('debe llamar a authService.refresh', async () => {
    const dto = { refreshToken: 'ref_123' };
    mockAuthService.refresh.mockResolvedValue({
      accessToken: 'a2',
      refreshToken: 'r2',
    });

    const res = await controller.refresh(dto);
    expect(mockAuthService.refresh).toHaveBeenCalledWith(dto);
    expect(res.accessToken).toBe('a2');
  });

  it('debe llamar a authService.logout', async () => {
    mockAuthService.logout.mockResolvedValue({ mensaje: 'ok' });

    const res = await controller.logout(1, { refreshToken: 'r' });
    expect(mockAuthService.logout).toHaveBeenCalledWith('r');
    expect(res.mensaje).toBe('ok');
  });

  it('debe llamar a authService.me', async () => {
    mockAuthService.me.mockResolvedValue({ id: 1, correo: 'test@correo.com' });

    const res = await controller.me(1);
    expect(mockAuthService.me).toHaveBeenCalledWith(1);
    expect(res.id).toBe(1);
  });
});
