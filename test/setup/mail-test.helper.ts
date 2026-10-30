import { MailService } from '../../src/modules/mail/mail.service';
import { MemoryTransport } from '../../src/modules/mail/transports/memory.transport';
import { EnviarCorreoOpciones } from '../../src/modules/mail/interfaces/mail-transport.interface';

/**
 * Helper compartido para pruebas que interactúan con MemoryTransport y tareas asíncronas de MailService.
 * Garantiza que cualquier tarea diferida registrada concluya antes de leer los correos en memoria,
 * eliminando condiciones de carrera en assertions sobre correos enviados.
 */
export async function obtenerCorreosSincronizados(
  mailService: MailService,
  memoryTransport: MemoryTransport,
): Promise<EnviarCorreoOpciones[]> {
  await mailService.esperarEnviosPendientes();
  return memoryTransport.obtenerCorreos();
}

export async function limpiarCorreosSincronizados(
  mailService: MailService,
  memoryTransport: MemoryTransport,
): Promise<void> {
  await mailService.esperarEnviosPendientes();
  memoryTransport.limpiar();
}
