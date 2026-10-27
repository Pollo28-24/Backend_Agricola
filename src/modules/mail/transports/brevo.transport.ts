import { Logger } from '@nestjs/common';
import {
  EnviarCorreoOpciones,
  IMailTransport,
} from '../interfaces/mail-transport.interface';

function sanitizarNombre(nombre: string): string {
  return nombre.replace(/[<>&"']/g, (c) => {
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

export class BrevoTransport implements IMailTransport {
  private readonly logger = new Logger(BrevoTransport.name);

  constructor(
    private readonly apiKey: string,
    private readonly remitenteEmail: string,
    private readonly remitenteNombre: string,
  ) {}

  async enviar(opciones: EnviarCorreoOpciones): Promise<void> {
    const url = 'https://api.brevo.com/v3/smtp/email';

    const payload = {
      sender: {
        name: this.remitenteNombre,
        email: this.remitenteEmail,
      },
      to: [
        {
          email: opciones.destinatario,
          name: sanitizarNombre(
            opciones.nombreDestinatario || opciones.destinatario,
          ),
        },
      ],
      subject: opciones.asunto,
      htmlContent: opciones.contenidoHtml,
      ...(opciones.contenidoTexto
        ? { textContent: opciones.contenidoTexto }
        : {}),
    };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          'api-key': this.apiKey,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        this.logger.error(
          `Fallo al enviar correo vía Brevo HTTP [Status ${response.status}]: ${errorBody}`,
        );
        throw new Error(
          `Brevo API HTTP error: ${response.status} - ${errorBody}`,
        );
      }

      this.logger.log(
        `Correo enviado exitosamente vía Brevo a ${opciones.destinatario}`,
      );
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(
        `Error de comunicación con Brevo API: ${err.message}`,
        err.stack,
      );
      throw error;
    }
  }
}
