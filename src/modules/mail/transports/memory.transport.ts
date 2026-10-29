import {
  EnviarCorreoOpciones,
  IMailTransport,
} from '../interfaces/mail-transport.interface';

export class MemoryTransport implements IMailTransport {
  private correos: EnviarCorreoOpciones[] = [];
  private simularFallo = false;
  private errorSimulado: Error | null = null;

  simularFalloProximoEnvio(error?: Error): void {
    this.simularFallo = true;
    this.errorSimulado =
      error || new Error('Fallo simulado en transporte de correo');
  }

  async enviar(opciones: EnviarCorreoOpciones): Promise<void> {
    await Promise.resolve();
    if (this.simularFallo) {
      this.simularFallo = false;
      const err =
        this.errorSimulado ||
        new Error('Fallo simulado en transporte de correo');
      this.errorSimulado = null;
      throw err;
    }
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
