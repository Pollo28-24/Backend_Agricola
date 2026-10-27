import {
  EnviarCorreoOpciones,
  IMailTransport,
} from '../interfaces/mail-transport.interface';

export class MemoryTransport implements IMailTransport {
  private correos: EnviarCorreoOpciones[] = [];

  async enviar(opciones: EnviarCorreoOpciones): Promise<void> {
    this.correos.push({ ...opciones });
  }

  obtenerCorreos(): EnviarCorreoOpciones[] {
    return [...this.correos];
  }

  obtenerUltimoCorreo(): EnviarCorreoOpciones | undefined {
    return this.correos[this.correos.length - 1];
  }

  limpiar(): void {
    this.correos = [];
  }
}
