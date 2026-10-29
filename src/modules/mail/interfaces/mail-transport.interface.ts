export interface EnviarCorreoOpciones {
  destinatario: string;
  nombreDestinatario?: string;
  asunto: string;
  contenidoHtml: string;
  contenidoTexto?: string;
}

export interface IMailTransport {
  enviar(opciones: EnviarCorreoOpciones): Promise<void>;
}
