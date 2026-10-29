import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MailService } from './mail.service';
import { MemoryTransport } from './transports/memory.transport';
import { LogTransport } from './transports/log.transport';
import { BrevoTransport } from './transports/brevo.transport';

describe('MailService (Hito 11E)', () => {
  let configService: jest.Mocked<ConfigService>;

  beforeEach(() => {
    configService = {
      get: jest.fn(),
    } as unknown as jest.Mocked<ConfigService>;
  });

  it('debe inicializar MemoryTransport cuando MAIL_TRANSPORT es "memory"', () => {
    configService.get.mockImplementation(
      (key: string, defaultValue?: unknown) => {
        if (key === 'MAIL_TRANSPORT') return 'memory';
        return defaultValue;
      },
    );

    const service = new MailService(configService);
    expect(service.getTransport()).toBeInstanceOf(MemoryTransport);
  });

  it('debe inicializar LogTransport cuando MAIL_TRANSPORT es "log"', () => {
    configService.get.mockImplementation(
      (key: string, defaultValue?: unknown) => {
        if (key === 'MAIL_TRANSPORT') return 'log';
        return defaultValue;
      },
    );

    const service = new MailService(configService);
    expect(service.getTransport()).toBeInstanceOf(LogTransport);
  });

  it('debe inicializar BrevoTransport cuando MAIL_TRANSPORT es "brevo" y BREVO_API_KEY está configurada', () => {
    configService.get.mockImplementation(
      (key: string, defaultValue?: unknown) => {
        if (key === 'MAIL_TRANSPORT') return 'brevo';
        if (key === 'BREVO_API_KEY') return 'xkeysib-test-fake-key-12345';
        if (key === 'MAIL_FROM_EMAIL') return 'remitente@test.com';
        if (key === 'MAIL_FROM_NAME') return 'Test Sender';
        return defaultValue;
      },
    );

    const service = new MailService(configService);
    expect(service.getTransport()).toBeInstanceOf(BrevoTransport);
  });

  it('debe enviar correo de recuperación estructurado mediante MemoryTransport', async () => {
    configService.get.mockImplementation(
      (key: string, defaultValue?: unknown) => {
        if (key === 'MAIL_TRANSPORT') return 'memory';
        if (key === 'NODE_ENV') return 'test';
        return defaultValue;
      },
    );

    const service = new MailService(configService);
    const transport = service.getTransport() as MemoryTransport;

    await service.enviarRecuperacionContrasena(
      'agricultor@ejemplo.com',
      'Don Ramón',
      'https://app.rentabilidad.com/restablecer?token=abc123token',
      'abc123token',
    );

    const correos = transport.obtenerCorreos();
    expect(correos).toHaveLength(1);
    expect(correos[0].destinatario).toBe('agricultor@ejemplo.com');
    expect(correos[0].nombreDestinatario).toBe('Don Ramón');
    expect(correos[0].asunto).toContain('Restablecimiento de Contraseña');
    expect(correos[0].contenidoHtml).toContain(
      'https://app.rentabilidad.com/restablecer?token=abc123token',
    );
    expect(correos[0].contenidoHtml).toContain('15 minutos');
    expect(correos[0].contenidoTexto).toContain(
      'https://app.rentabilidad.com/restablecer?token=abc123token',
    );
  });

  describe('BrevoTransport', () => {
    it('debe enviar payload correcto a la API de Brevo vía fetch', async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 201,
        text: jest.fn().mockResolvedValue(JSON.stringify({ messageId: '123' })),
      });
      global.fetch = mockFetch;

      const transport = new BrevoTransport(
        'clave-brevo-123',
        'remitente@test.com',
        'Remitente Test',
      );

      await transport.enviar({
        destinatario: 'destino@test.com',
        nombreDestinatario: 'Destinatario Test',
        asunto: 'Prueba Asunto',
        contenidoHtml: '<p>Hola</p>',
        contenidoTexto: 'Hola',
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, init] = mockFetch.mock.calls[0] as [
        string,
        { method: string; headers: Record<string, string>; body: string },
      ];
      expect(url).toBe('https://api.brevo.com/v3/smtp/email');
      expect(init.method).toBe('POST');
      expect(init.headers['api-key']).toBe('clave-brevo-123');

      const body = JSON.parse(init.body) as {
        sender: { name: string; email: string };
        to: Array<{ email: string; name: string }>;
        subject: string;
      };
      expect(body.sender).toEqual({
        name: 'Remitente Test',
        email: 'remitente@test.com',
      });
      expect(body.to).toEqual([
        { email: 'destino@test.com', name: 'Destinatario Test' },
      ]);
      expect(body.subject).toBe('Prueba Asunto');
    });

    it('debe lanzar error si Brevo responde con status de error', async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: jest.fn().mockResolvedValue('Key not found'),
      });
      global.fetch = mockFetch;

      const transport = new BrevoTransport(
        'clave-invalida',
        'remitente@test.com',
        'Remitente Test',
      );

      await expect(
        transport.enviar({
          destinatario: 'destino@test.com',
          asunto: 'Prueba',
          contenidoHtml: '<p>Hola</p>',
        }),
      ).rejects.toThrow('Brevo API HTTP error: 401');
    });

    it('B5/B6: BrevoTransport envía to.name crudo y no registra correo ni errorBody en logs', async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 201,
        text: jest.fn().mockResolvedValue(JSON.stringify({ messageId: '123' })),
      });
      global.fetch = mockFetch;

      const transport = new BrevoTransport('api-key', 'rem@test.com', 'Rem');
      const spyLog = jest.spyOn(Logger.prototype, 'log');

      await transport.enviar({
        destinatario: 'victima@test.com',
        nombreDestinatario: '<script>x</script>',
        asunto: 'Asunto',
        contenidoHtml: '<p>Hola</p>',
      });

      const fetchCallArgs = mockFetch.mock.calls[0] as unknown as [
        string,
        { body: string },
      ];
      const body = JSON.parse(fetchCallArgs[1].body) as {
        to: Array<{ email: string; name: string }>;
      };
      expect(body.to[0].name).toBe('<script>x</script>');
      expect(spyLog).toHaveBeenCalledWith(
        'Correo enviado exitosamente vía Brevo',
      );
      expect(spyLog).not.toHaveBeenCalledWith(
        expect.stringContaining('victima@test.com'),
      );
      spyLog.mockRestore();
    });
  });

  describe('NODE_ENV fail-closed y escape HTML (B4 y B5)', () => {
    it('B4: development + log imprime destinatario y enlace en logger; production o test nunca imprimen', async () => {
      const spyLogger = jest.spyOn(Logger.prototype, 'log');

      // Caso 1: development + log -> imprime
      configService.get.mockImplementation(
        (key: string, defaultValue?: unknown) => {
          if (key === 'MAIL_TRANSPORT') return 'log';
          if (key === 'NODE_ENV') return 'development';
          return defaultValue;
        },
      );
      const serviceDev = new MailService(configService);
      await serviceDev.enviarRecuperacionContrasena(
        'dev@test.com',
        'Dev User',
        'http://localhost#token=123',
        '123',
      );
      expect(spyLogger).toHaveBeenCalledWith(
        expect.stringContaining('[RECUPERACIÓN LOCAL]'),
      );

      spyLogger.mockClear();

      // Caso 2: production + log -> no imprime
      configService.get.mockImplementation(
        (key: string, defaultValue?: unknown) => {
          if (key === 'MAIL_TRANSPORT') return 'log';
          if (key === 'NODE_ENV') return 'production';
          return defaultValue;
        },
      );
      const serviceProd = new MailService(configService);
      await serviceProd.enviarRecuperacionContrasena(
        'prod@test.com',
        'Prod User',
        'https://app#token=123',
        '123',
      );
      expect(spyLogger).not.toHaveBeenCalled();

      // Caso 3: NODE_ENV ausente -> no imprime
      spyLogger.mockClear();
      configService.get.mockImplementation(
        (key: string, defaultValue?: unknown) => {
          if (key === 'MAIL_TRANSPORT') return 'log';
          if (key === 'NODE_ENV') return undefined;
          return defaultValue;
        },
      );
      const serviceNoEnv = new MailService(configService);
      await serviceNoEnv.enviarRecuperacionContrasena(
        'noenv@test.com',
        'NoEnv User',
        'http://localhost#token=123',
        '123',
      );
      expect(spyLogger).not.toHaveBeenCalled();

      spyLogger.mockRestore();
    });

    it('B5: escapa nombre con caracteres HTML en contenidoHtml', async () => {
      configService.get.mockImplementation(
        (key: string, defaultValue?: unknown) => {
          if (key === 'MAIL_TRANSPORT') return 'memory';
          if (key === 'NODE_ENV') return 'test';
          return defaultValue;
        },
      );
      const service = new MailService(configService);
      const transport = service.getTransport() as MemoryTransport;

      await service.enviarRecuperacionContrasena(
        'xss@test.com',
        '<script>x</script>',
        'http://localhost#token=abc',
      );

      const [correo] = transport.obtenerCorreos();
      expect(correo.contenidoHtml).toContain('&lt;script&gt;x&lt;/script&gt;');
      expect(correo.contenidoHtml).not.toContain('<script>x</script>');
    });

    it('B4: LogTransport no registra nada si NODE_ENV no es development o transport no es log', async () => {
      const configServiceMock = {
        get: jest.fn().mockImplementation((key: string) => {
          if (key === 'NODE_ENV') return 'production';
          if (key === 'MAIL_TRANSPORT') return 'log';
          return undefined;
        }),
      } as unknown as ConfigService;

      const logTransport = new LogTransport(configServiceMock);
      const spyLog = jest.spyOn(Logger.prototype, 'log');

      await logTransport.enviar({
        destinatario: 'test@example.com',
        asunto: 'Test',
      });

      expect(spyLog).not.toHaveBeenCalled();
      spyLog.mockRestore();
    });
  });
});
