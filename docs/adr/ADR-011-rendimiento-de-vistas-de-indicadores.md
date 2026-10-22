# ADR-011: Optimización de Rendimiento de Vistas de Indicadores con LEFT JOIN LATERAL (Hito 9A.1)

## Estado
Aceptado

## Contexto
En el Hito 9A, las vistas `v_rentabilidad_ciclo`, `v_costo_por_actividad` y `v_comparativo_parcela` fueron implementadas utilizando tablas derivadas globales agrupadas por `cicloId` o `actividadId` (`LEFT JOIN (SELECT cicloId, SUM(...) ... GROUP BY cicloId)`). 

### El Problema de Escala
El optimizador de MySQL 8 materializa las subconsultas derivadas globales en tablas temporales internas antes de evaluar el join con `ciclo_produccion`. En consecuencia, al filtrar por una empresa específica (`WHERE empresaId = ? AND cicloId IN (?)`), MySQL escanea y agrega todas las filas de todas las empresas de la base de datos (N+1 multi-tenant a nivel de agregados). Con 200 empresas y ~300,000 gastos, el tiempo de respuesta de una sola consulta crecía de 242 ms a 1,977 ms, degradando el SLA de forma inaceptable conforme crecía el volumen ajeno.

## Mediciones de Rendimiento (Escala N1 vs N2)

Medición sobre MySQL 8.0.46 con datos en lote: Empresa A fija (3 ciclos, 3,000 gastos, 1,000 cosechas, 300 ventas con renglones, 500 cobros) y empresas de relleno en dos escalas:
- **N1**: 20 empresas de relleno (~45,000 gastos totales en BD).
- **N2**: 200 empresas de relleno (~315,000 gastos totales en BD).

### Tabla Comparativa: Antes (Vistas Base 9A) vs Después (Vistas Candidatas LATERAL 9A.1)

| Vista / Consulta | Base N1 (ms) | Base N1 (Filas Leídas Gasto) | Base N2 (ms) | Base N2 (Filas Leídas Gasto) | Candidata N2 (ms) | Candidata N2 (Filas Leídas Gasto) | Reducción de Latencia |
|---|---|---|---|---|---|---|---|
| `v_rentabilidad_ciclo` | 242 ms | 45,004 | 1,977 ms | 315,004 | **37 ms** | **3,000** | **-98.1 %** |
| `v_comparativo_parcela` | 248 ms | 45,004 | 1,621 ms | 315,004 | **38 ms** | **3,000** | **-97.7 %** |
| `v_costo_por_actividad` | 131 ms | 45,004 | 68 ms | 15,003 | **15 ms** | **300** | **-77.9 %** |
| `v_costo_por_categoria` | 32 ms | 3,000 | 38 ms | 3,000 | **38 ms** | **3,000** | 0 % (ya óptima) |

### Análisis del Plan de Ejecución (EXPLAIN ANALYZE FORMAT=TREE)
- **Vistas Base 9A**:
  `-> Index scan on gasto using gasto_cicloId_idx (actual time=0.312..1147 rows=315004 loops=1)`
  Escaneaba todas las filas de la tabla `gasto` de todas las empresas para materializar `<auto_key0>`.
- **Vistas Candidatas LATERAL 9A.1**:
  `-> Table scan on g (cost=24.5..24.5 rows=1) (actual time=2.97..2.98 rows=1 loops=3)`
  `-> Aggregate: sum(gasto.total)`
  `-> Index lookup on gasto using gasto_cicloId_idx (cicloId=c.id) (actual time=0.03..2.4 rows=1000 loops=3)`
  Solo lee exactamente las filas de los ciclos pertenecientes a la empresa consultada (1,000 filas por ciclo), aprovechando los índices por clave foránea.

## Decisión
1. Reemplazar las subconsultas derivadas con cláusulas `LEFT JOIN LATERAL (...)` correlacionadas con `c.id` (`cicloId = c.id`) en `v_rentabilidad_ciclo` y `v_costo_por_actividad`.
2. Mantener exactamente las mismas 26 columnas, mismos tipos, mismo orden y fórmulas en `v_rentabilidad_ciclo`.
3. Re-crear `v_comparativo_parcela` sobre la vista optimizada para heredar la evaluación acotada.
4. Aplicar los cambios mediante la migración `20261022033837_vistas_indicadores_v2` con `CREATE OR REPLACE VIEW`.

## Alternativas Descartadas
1. **Subconsultas escalares en la cláusula SELECT**: Descartadas porque no permiten calcular múltiples agregados simultáneos en una sola pasada (p.ej. `kgMerma` y `kgMermaCampo`, o `ingresos` y `totalFacturado`), forzando duplicación de lecturas.
2. **Cálculos en capa de aplicación TypeScript**: Descartada rotundamente conforme a la regla arquitectónica de que las fórmulas viven exclusivamente en las vistas SQL.
3. **Tablas de resumen o snapshots periódicos**: Descartada por complejidad operativa y pérdida de reactividad transaccional inmediata.

## Riesgos y Mitigaciones
- **Requisito de Motor RDBMS**: `LEFT JOIN LATERAL` requiere MySQL >= 8.0.14. En este entorno se cuenta con MySQL nativo 8.0.46, por lo que la compatibilidad es 100% nativa.
- **Drift de Esquema**: Se verificó `npx prisma migrate diff` contra `schema.prisma` con código de salida 0 (cero drift).

## Criterio de Éxito Cumplido
El trabajo de la consulta de una empresa es estrictamente proporcional al volumen de sus propios ciclos y **NO crece** cuando crece el volumen de las demás empresas en la base de datos multi-tenant.
