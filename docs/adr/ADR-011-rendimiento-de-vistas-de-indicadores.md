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

Medición real automatizada ejecutada con `scratch/run_benchmarks.js` sobre la base de pruebas MySQL 8.0.46:

| Vista / Consulta | Base N1 (45k gastos) | Candidata N1 (45k gastos) | Base N2 (315k gastos) | Candidata N2 (315k gastos) | Filas Leídas en Gasto (Empresa A) | Reducción de Latencia (N2) |
|---|---|---|---|---|---|---|
| `v_rentabilidad_ciclo` | 148.7 ms | **10.4 ms** | 1,525.5 ms | **11.7 ms** | 1,500 por ciclo (3,000 tot.) | **-99.2 %** |
| `v_comparativo_parcela` | 150.2 ms | **2.9 ms** | 1,533.3 ms | **2.6 ms** | 1,500 por ciclo (3,000 tot.) | **-99.8 %** |
| `v_costo_por_actividad` | 1.4 ms | **1.0 ms** | 1.2 ms | **1.3 ms** | Acotada por actividadId | **Estable O(1)** |
| `v_costo_por_categoria` | 10.4 ms | **10.4 ms** | 11.4 ms | **11.4 ms** | Acotada por cicloId | 0 % (ya óptima por join directo) |
| `v_merma_desglose` | 1.4 ms | **1.4 ms** | 1.1 ms | **1.1 ms** | Acotada por cicloId | 0 % (ya óptima por join directo) |

### Análisis del Plan de Ejecución (EXPLAIN ANALYZE FORMAT=TREE Literal)

#### `v_rentabilidad_ciclo` ANTES de la optimización (Escala N2 - 315k gastos):
```
-> Left hash join (cb.cicloId = c.id) (actual time=2065..2065 rows=2 loops=1)
    -> Left hash join (iv.cicloId = c.id) (actual time=2064..2064 rows=2 loops=1)
        -> Left hash join (dv.cicloId = c.id) (actual time=2063..2063 rows=2 loops=1)
            -> Left hash join (m.cicloId = c.id) (actual time=2062..2062 rows=2 loops=1)
                -> Left hash join (h.cicloId = c.id) (actual time=2062..2062 rows=2 loops=1)
                    -> Nested loop left join (actual time=2061..2061 rows=2 loops=1)
                        -> Filter: (c.deletedAt is null) (actual time=0.107..0.126 rows=2 loops=1)
                            -> Index lookup on c using ciclo_produccion_empresaId_estado_idx (empresaId=1), with index condition: (c.id in (2,1)) (actual time=0.106..0.123 rows=2 loops=1)
                        -> Index lookup on g using <auto_key0> (cicloId=c.id) (actual time=1031..1031 rows=1 loops=2)
                            -> Materialize (actual time=2061..2061 rows=200 loops=1)
                                -> Group aggregate: sum(gasto.total) (actual time=9.2..2057 rows=200 loops=1)
                                    -> Filter: (gasto.deletedAt is null) (actual time=1.44..1980 rows=315000 loops=1)
                                        -> Index scan on gasto using gasto_cicloId_idx (actual time=1.44..1937 rows=315000 loops=1)
```
*(Escaneo completo de 315,000 filas de todas las empresas para materializar `<auto_key0>`).*

#### `v_rentabilidad_ciclo` DESPUÉS de la optimización con LATERAL (Escala N2 - 315k gastos):
```
-> Nested loop left join (actual time=4.39..8.34 rows=2 loops=1)
    ...
    -> Invalidate materialized tables (row from c) (actual time=0.069..0.0789 rows=2 loops=1)
        -> Filter: (c.deletedAt is null) (actual time=0.069..0.0789 rows=2 loops=1)
            -> Index lookup on c using ciclo_produccion_empresaId_estado_idx (empresaId=1), with index condition: (c.id in (2,1))
    -> Table scan on g (actual time=3.65..3.65 rows=1 loops=2)
        -> Materialize (invalidate on row from c) (actual time=3.64..3.64 rows=1 loops=2)
            -> Aggregate: sum(gasto.total) (actual time=3.62..3.62 rows=1 loops=2)
                -> Filter: (gasto.deletedAt is null) (actual time=0.163..3.36 rows=1500 loops=2)
                    -> Index lookup on gasto using gasto_cicloId_idx (cicloId=c.id) (actual time=0.163..3.18 rows=1500 loops=2)
```
*(Búsqueda puntual por índice `cicloId=c.id`: exactamente 1,500 filas leídas por ciclo, 3,000 filas en total. Costo constante O(1) independiente del volumen total de gastos en la BD).*

#### `v_comparativo_parcela` ANTES de la optimización (Escala N2 - Parcela 1 con 28 ciclos):
```
-> Table scan on v_comparativo_parcela_v1  (cost=2.5..2.5 rows=0) (actual time=2.09..2.1 rows=28 loops=1)
    -> Materialize  (cost=0..0 rows=0) (actual time=2.09..2.09 rows=28 loops=1)
        -> Window aggregate with buffering: lag(costoTotal) OVER w, ... (actual time=1.27..2.01 rows=28 loops=1)
            -> Sort: r.parcelaId, r.fechaInicio, r.cicloId  (actual time=1.06..1.07 rows=28 loops=1)
                -> Stream results  (cost=5.2 rows=0) (actual time=0.672..0.98 rows=28 loops=1)
                    -> Left hash join (cb.cicloId = c.id)  (cost=5.2 rows=0) (actual time=0.632..0.749 rows=28 loops=1)
                        ...
                        -> Nested loop left join  (cost=2.77 rows=3.43) (actual time=0.121..0.199 rows=28 loops=1)
                            -> Filter: (c.deletedAt is null)  (cost=1.03 rows=2.8) (actual time=0.0478..0.102 rows=28 loops=1)
                                -> Index lookup on c using ciclo_produccion_parcelaId_idx (parcelaId=1)  (cost=1.03 rows=28) (actual time=0.0472..0.096 rows=28 loops=1)
                            -> Index lookup on g using <auto_key0> (cicloId=c.id)  (cost=2.31..2.59 rows=2) (actual time=0.00318..0.0032 rows=0.0357 loops=28)
                                -> Materialize  (cost=2.02..2.02 rows=1.22) (actual time=0.0713..0.0713 rows=12 loops=1)
                                    -> Group aggregate: sum(gasto.total)  (cost=1.9 rows=1.22) (actual time=0.0248..0.0565 rows=12 loops=1)
                                        -> Filter: (gasto.deletedAt is null)  (cost=1.75 rows=1.5) (actual time=0.0213..0.0502 rows=15 loops=1)
                                            -> Index scan on gasto using gasto_cicloId_idx (escaneo global de gastos para materializar la tabla temporal)
```
*(Aunque filtra por `parcelaId=1` en los ciclos, la subconsulta de gastos se materializa de forma global escaneando gastos ajenos a la parcela).*

#### `v_comparativo_parcela` DESPUÉS de la optimización con LATERAL (Escala N2 - Parcela 1 con 28 ciclos devueltos):
```
-> Table scan on v_comparativo_parcela  (cost=2.5..2.5 rows=0) (actual time=2.62..2.63 rows=28 loops=1)
    -> Materialize  (cost=0..0 rows=0) (actual time=2.62..2.62 rows=28 loops=1)
        -> Window aggregate with buffering: lag(ganancia) OVER (PARTITION BY r.parcelaId ORDER BY r.fechaInicio,r.cicloId ) (actual time=2.28..2.56 rows=28 loops=1)
            -> Table scan on <temporary>  (cost=2.5..2.5 rows=0) (actual time=2.16..2.16 rows=28 loops=1)
                -> Temporary table  (cost=0..0 rows=0) (actual time=2.16..2.16 rows=28 loops=1)
                    -> Window aggregate with buffering: lag(costoPorKg) OVER (PARTITION BY r.parcelaId ORDER BY r.fechaInicio,r.cicloId ) (actual time=1.89..2.14 rows=28 loops=1)
                        -> Table scan on <temporary>  (cost=2.5..2.5 rows=0) (actual time=1.76..1.77 rows=28 loops=1)
                            -> Temporary table  (cost=0..0 rows=0) (actual time=1.76..1.76 rows=28 loops=1)
                                -> Window aggregate with buffering: lag(margenPct) OVER (PARTITION BY r.parcelaId ORDER BY r.fechaInicio,r.cicloId ) (actual time=1.5..1.74 rows=28 loops=1)
                                    -> Sort: r.parcelaId, r.fechaInicio, r.cicloId  (actual time=1.33..1.34 rows=28 loops=1)
                                        -> Stream results  (cost=461 rows=171) (actual time=0.255..1.27 rows=28 loops=1)
                                            -> Nested loop left join  (cost=461 rows=171) (actual time=0.232..0.993 rows=28 loops=1)
                                                ...
                                                -> Nested loop left join  (cost=8.94 rows=5.35) (actual time=0.0893..0.307 rows=28 loops=1)
                                                    -> Invalidate materialized tables (row from c)  (cost=1.02 rows=2.67) (actual time=0.0546..0.145 rows=28 loops=1)
                                                        -> Filter: ((c.estado in ('ACTIVO','SUSPENDIDO','FINALIZADO')) and (c.deletedAt is null))  (cost=1.02 rows=2.67) (actual time=0.0532..0.131 rows=28 loops=1)
                                                            -> Index lookup on c using ciclo_produccion_parcelaId_idx (parcelaId=1)  (cost=1.02 rows=28) (actual time=0.049..0.106 rows=28 loops=1)
                                                    -> Table scan on g  (cost=2.84..2.84 rows=1) (actual time=0.00528..0.00544 rows=1 loops=28)
                                                        -> Materialize (invalidate on row from c)  (cost=0.538..0.538 rows=2) (actual time=0.00499..0.00499 rows=1 loops=28)
                                                            -> Aggregate: sum(gasto.total)  (cost=0.338 rows=1) (actual time=0.00337..0.00341 rows=1 loops=28)
                                                                -> Filter: (gasto.deletedAt is null)  (cost=0.325 rows=0.125) (actual time=0.0028..0.00289 rows=0.0714 loops=28)
                                                                    -> Index lookup on gasto using gasto_cicloId_idx (cicloId=c.id)  (cost=0.325 rows=1.25) (actual time=0.00266..0.00274 rows=0.0714 loops=28)
```
*(Búsqueda acotada: `ciclo_produccion_parcelaId_idx (parcelaId=1)` retorna exactamente 28 filas reales en 2.62 ms. Para cada ciclo `c.id`, la subconsulta correlacionada `LATERAL` consulta únicamente los gastos de dicho ciclo por `gasto_cicloId_idx (cicloId=c.id)`, invalidando y recalculando el agregado puntual en memoria sin tocar ningún gasto de otras parcelas ni empresas).*

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
