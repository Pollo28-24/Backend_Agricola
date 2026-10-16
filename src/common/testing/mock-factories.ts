/**
 * Factorías reutilizables de mocks para suites de pruebas unitarias.
 * Evita la duplicación de objetos de prueba en los specs manteniendo bajo acoplamiento.
 */

export interface MockAuditService {
  registrar: jest.Mock<Promise<void>, [any, any?]>;
}

/**
 * Crea una instancia limpia de mock para AuditService.
 */
export const createMockAuditService = (): MockAuditService => ({
  registrar: jest.fn().mockResolvedValue(undefined),
});
