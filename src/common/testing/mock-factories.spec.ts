import { createMockAuditService } from './mock-factories';

describe('MockFactories', () => {
  describe('createMockAuditService', () => {
    it('debe generar una instancia con el método registrar como función Jest mock', () => {
      const mockAudit = createMockAuditService();
      expect(mockAudit).toBeDefined();
      expect(mockAudit.registrar).toBeDefined();
      expect(jest.isMockFunction(mockAudit.registrar)).toBe(true);
    });

    it('debe resolver a undefined por defecto', async () => {
      const mockAudit = createMockAuditService();
      const resultado = await mockAudit.registrar({
        empresaId: 1,
        entidad: 'test',
        entidadId: 1,
        accion: 'CREAR' as any,
      });
      expect(resultado).toBeUndefined();
      expect(mockAudit.registrar).toHaveBeenCalledTimes(1);
    });

    it('cada invocación debe retornar una instancia independiente', () => {
      const mock1 = createMockAuditService();
      const mock2 = createMockAuditService();

      mock1.registrar({ test: 1 });
      expect(mock1.registrar).toHaveBeenCalledTimes(1);
      expect(mock2.registrar).toHaveBeenCalledTimes(0);
    });
  });
});
