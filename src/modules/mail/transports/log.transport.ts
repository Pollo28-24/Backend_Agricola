import { Logger } from '@nestjs/common';
import {
  EnviarCorreoOpciones,
  IMailTransport,
} from '../interfaces/mail-transport.interface';

export class LogTransport implements IMailTransport {
  private readonly logger = new Logger(LogTransport.name);

  async enviar(opciones: EnviarCorreoOpciones): Promise<void> {
    const nodeEnv = process.env.NODE_ENV || 'development';
    const transport = process.env.MAIL_TRANSPORT || 'log';

    if (nodeEnv === 'development' && transport === 'log') {
      this.logger.log(
        `[CORREO LOCAL/SIMULADO] Para: ${opciones.destinatario} | Asunto: ${opciones.asunto}`,
      );
      if (opciones.contenidoTexto) {
        this.logger.debug(`[TEXTO]: ${opciones.contenidoTexto}`);
      }
    }
    await Promise.resolve();
  }
}
