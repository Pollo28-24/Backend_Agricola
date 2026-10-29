import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IMailTransport } from './interfaces/mail-transport.interface';
import { BrevoTransport } from './transports/brevo.transport';
import { LogTransport } from './transports/log.transport';
import { MemoryTransport } from './transports/memory.transport';

function escapeHtml(texto: string): string {
  return texto.replace(/[<>&"']/g, (c) => {
    switch (c) {
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '&':
        return '&amp;';
      case '"':
        return '&quot;';
      case "'":
        return '&#39;';
      default:
        return c;
    }
  });
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transport: IMailTransport;
  private readonly enviosPendientes = new Set<Promise<unknown>>();

  registrarEnvio(promesa: Promise<unknown>): void {
    this.enviosPendientes.add(promesa);
    void promesa.finally(() => {
      this.enviosPendientes.delete(promesa);
    });
  }

  async esperarEnviosPendientes(): Promise<void> {
    await Promise.allSettled(Array.from(this.enviosPendientes));
  }

  constructor(private readonly configService: ConfigService) {
    // B4: Lectura solo vía ConfigService sin process.env ni defaults inseguros
    const modoTransport = this.configService.get<string>('MAIL_TRANSPORT');
    const apiKey = this.configService.get<string>('BREVO_API_KEY');
    const remitenteEmail = this.configService.get<string>(
      'MAIL_FROM_EMAIL',
      'no-reply@rentabilidad-agricola.com',
    );
    const remitenteNombre = this.configService.get<string>(
      'MAIL_FROM_NAME',
      'Rentabilidad Agrícola',
    );

    if (modoTransport === 'memory') {
      this.transport = new MemoryTransport();
    } else if (modoTransport === 'brevo' && apiKey) {
      this.transport = new BrevoTransport(
        apiKey,
        remitenteEmail,
        remitenteNombre,
      );
    } else {
      this.transport = new LogTransport(this.configService);
    }
  }

  getTransport(): IMailTransport {
    return this.transport;
  }

  async enviarRecuperacionContrasena(
    destinatario: string,
    nombre: string,
    enlace: string,
    tokenCrudo?: string,
  ): Promise<void> {
    const asunto = 'Restablecimiento de Contraseña - Rentabilidad Agrícola';
    // B5: Escapar nombre en el cuerpo HTML
    const nombreEscapado = escapeHtml(nombre);
    const contenidoHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
        <h2 style="color: #2e7d32;">Rentabilidad Agrícola</h2>
        <p>Hola, <strong>${nombreEscapado}</strong>:</p>
        <p>Recibimos una solicitud para restablecer la contraseña de tu cuenta.</p>
        <p style="margin: 25px 0;">
          <a href="${enlace}" style="background-color: #2e7d32; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold; display: inline-block;">
            Restablecer Contraseña
          </a>
        </p>
        <p>Este enlace es válido por <strong>15 minutos</strong> y puede utilizarse una única vez.</p>
        <p style="color: #666666; font-size: 13px;">Si no solicitaste este cambio, puedes ignorar este correo; tu contraseña actual permanecerá segura.</p>
        <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 20px 0;" />
        <p style="color: #999999; font-size: 11px;">Sistema de Gestión de Costos y Rentabilidad Agrícola</p>
      </div>
    `;

    const contenidoTexto = `Hola ${nombre},\n\nPara restablecer tu contraseña en Rentabilidad Agrícola, ingresa al siguiente enlace:\n${enlace}\n\nEste enlace expira en 15 minutos.\nSi no solicitaste este cambio, puedes ignorar este mensaje.`;

    // B4: en desarrollo imprimir en logger el destinatario, token en crudo y URL completa SOLO con log transport y NODE_ENV===development
    const nodeEnv = this.configService.get<string>('NODE_ENV');
    const mailTransport = this.configService.get<string>('MAIL_TRANSPORT');
    if (nodeEnv === 'development' && mailTransport === 'log') {
      this.logger.log(
        `[RECUPERACIÓN LOCAL] Destinatario: ${destinatario} | Token: ${tokenCrudo || 'N/A'} | Enlace: ${enlace}`,
      );
    }

    await this.transport.enviar({
      destinatario,
      nombreDestinatario: nombre,
      asunto,
      contenidoHtml,
      contenidoTexto,
    });
  }
}
