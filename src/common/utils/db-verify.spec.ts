import {
  evaluarMetricasBd,
  parsearDatabaseUrl,
} from '../../../scripts/db-verify';

describe('Evaluador de Verificación de Base de Datos (Hito 11C - Anexo D)', () => {
  describe('evaluarMetricasBd (Lógica pura de comparación)', () => {
    it('debe aprobar con exitoTotal: true cuando todas las métricas coinciden exactamente', () => {
      const metricas = [
        { concepto: 'Tablas Base', esperado: 28, obtenido: 28 },
        { concepto: 'Claves Foráneas', esperado: 49, obtenido: 49 },
        { concepto: 'Restricciones CHECK', esperado: 19, obtenido: 19 },
      ];

      const resultado = evaluarMetricasBd(metricas);

      expect(resultado.exitoTotal).toBe(true);
      expect(resultado.metricasFallidas).toBe(0);
      expect(resultado.metricasExitosas).toBe(3);
      expect(resultado.resultados[0].estado).toBe('OK');
      expect(resultado.resultados[1].estado).toBe('OK');
      expect(resultado.resultados[2].estado).toBe('OK');
    });

    it('debe reprobar con exitoTotal: false y registrar FALLA si alguna métrica discrepa', () => {
      const metricasConFalla = [
        { concepto: 'Tablas Base', esperado: 28, obtenido: 27 }, // Discrepancia intencional
        { concepto: 'Claves Foráneas', esperado: 49, obtenido: 49 },
        { concepto: 'Restricciones CHECK', esperado: 19, obtenido: 18 }, // Discrepancia intencional
      ];

      const resultado = evaluarMetricasBd(metricasConFalla);

      expect(resultado.exitoTotal).toBe(false);
      expect(resultado.metricasFallidas).toBe(2);
      expect(resultado.metricasExitosas).toBe(1);
      expect(resultado.resultados[0].estado).toBe('FALLA');
      expect(resultado.resultados[1].estado).toBe('OK');
      expect(resultado.resultados[2].estado).toBe('FALLA');
    });
  });

  describe('parsearDatabaseUrl (Extracción y salvaguardas)', () => {
    it('debe parsear correctamente una URL de MySQL estándar', () => {
      const url =
        'mysql://usuario_admin:secreto123@127.0.0.1:3307/rentabilidad_agricola_test';
      const parsed = parsearDatabaseUrl(url);

      expect(parsed.host).toBe('127.0.0.1');
      expect(parsed.port).toBe(3307);
      expect(parsed.user).toBe('usuario_admin');
      expect(parsed.password).toBe('secreto123');
      expect(parsed.database).toBe('rentabilidad_agricola_test');
    });

    it('debe lanzar error si no se provee DATABASE_URL', () => {
      const originalEnv = process.env.DATABASE_URL;
      delete process.env.DATABASE_URL;

      expect(() => parsearDatabaseUrl(undefined)).toThrow(
        'DATABASE_URL no está definida en el entorno.',
      );

      process.env.DATABASE_URL = originalEnv;
    });
  });
});
