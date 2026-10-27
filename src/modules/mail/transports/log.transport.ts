import { Logger } from '@nestjs/common';
import {
  EnviarCorreoOpciones,
  IMailTransport,
} from '../interfaces/mail-transport.interface';

export class LogTransport implements IMailTransport {
  private readonly logger = new Logger(LogTransport.name);

  async enviar(opciones: EnviarCorreoOpciones): Promise<void> {
    this.logger.log(
      `[CORREO LOCAL/SIMULADO] Para: ${opciones.destinatario} | Asunto: ${opciones.asunto}`,
    );
    if (opciones.contenidoTexto) {
      this.logger.debug(`[TEXTO]: ${opciones.contenidoTexto}`);
    }
  }
}
