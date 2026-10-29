import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  EnviarCorreoOpciones,
  IMailTransport,
} from '../interfaces/mail-transport.interface';

export class LogTransport implements IMailTransport {
  private readonly logger = new Logger(LogTransport.name);

  constructor(private readonly configService?: ConfigService) {}

  async enviar(opciones: EnviarCorreoOpciones): Promise<void> {
    // B4: NODE_ENV fail-closed solo vía ConfigService sin valor por defecto
    const nodeEnv = this.configService?.get<string>('NODE_ENV');
    const transport = this.configService?.get<string>('MAIL_TRANSPORT');

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
