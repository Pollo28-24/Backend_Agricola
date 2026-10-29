import { Logger } from '@nestjs/common';
import {
  EnviarCorreoOpciones,
  IMailTransport,
} from '../interfaces/mail-transport.interface';

export class BrevoTransport implements IMailTransport {
  private readonly logger = new Logger(BrevoTransport.name);

  constructor(
    private readonly apiKey: string,
    private readonly remitenteEmail: string,
    private readonly remitenteNombre: string,
  ) {}

  async enviar(opciones: EnviarCorreoOpciones): Promise<void> {
    const url = 'https://api.brevo.com/v3/smtp/email';

    // B5: to.name va crudo en el JSON de Brevo
    const payload = {
      sender: {
        name: this.remitenteNombre,
        email: this.remitenteEmail,
      },
      to: [
        {
          email: opciones.destinatario,
          name: opciones.nombreDestinatario || opciones.destinatario,
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
        // B6: No registrar cuerpo de la respuesta de Brevo ni datos personales
        this.logger.error(
          `Fallo al enviar correo vía Brevo HTTP [Status ${response.status}]`,
        );
        throw new Error(`Brevo API HTTP error: ${response.status}`);
      }

      // B6: No registrar el correo destinatario en logs
      this.logger.log('Correo enviado exitosamente vía Brevo');
    } catch (error: unknown) {
      this.logger.error('Error de comunicación con Brevo API');
      throw error;
    }
  }
}
