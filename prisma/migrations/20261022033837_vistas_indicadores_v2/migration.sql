-- =====================================================================
-- OPTIMIZACIÓN DE RENDIMIENTO DE VISTAS DE INDICADORES (Hito 9A.1)
-- Reemplaza tablas derivadas globales con LEFT JOIN LATERAL (MySQL >= 8.0.14)
-- para acotar el cálculo exclusivamente a los ciclos consultados.
-- =====================================================================

DROP VIEW IF EXISTS v_comparativo_parcela_v2;
DROP VIEW IF EXISTS v_costo_por_actividad_v2;
DROP VIEW IF EXISTS v_rentabilidad_ciclo_v2;

-- 1. Vista de Rentabilidad de Ciclo con agregados LATERAL
CREATE OR REPLACE VIEW v_rentabilidad_ciclo AS
SELECT
  c.id AS cicloId, c.empresaId, c.parcelaId, c.variedadId, c.estado, c.fechaInicio, c.superficieSembrada,
  COALESCE(g.costoTotal, 0)                    AS costoTotal,
  COALESCE(h.kgCosechados, 0)                  AS kgCosechados,
  COALESCE(m.kgMerma, 0)                       AS kgMerma,
  COALESCE(m.kgMermaCampo, 0)                  AS kgMermaCampo,
  COALESCE(h.kgCosechados, 0) - COALESCE(m.kgMerma, 0) AS kgNetos,
  COALESCE(dv.kgVendidos, 0)                   AS kgVendidos,
  COALESCE(h.kgCosechados, 0) - COALESCE(m.kgMerma, 0) - COALESCE(dv.kgVendidos, 0) AS kgDisponibles,
  COALESCE(iv.ingresos, 0)                     AS ingresos,
  COALESCE(iv.totalFacturado, 0)               AS totalFacturado,
  COALESCE(cb.cobrado, 0)                      AS cobrado,
  COALESCE(iv.ingresos, 0) - COALESCE(g.costoTotal, 0) AS ganancia,
  CASE WHEN COALESCE(iv.ingresos, 0) > 0
       THEN (iv.ingresos - COALESCE(g.costoTotal, 0)) / iv.ingresos * 100 END AS margenPct,
  CASE WHEN COALESCE(g.costoTotal, 0) > 0
       THEN (COALESCE(iv.ingresos, 0) - g.costoTotal) / g.costoTotal * 100 END AS roiPct,
  CASE WHEN COALESCE(h.kgCosechados, 0) - COALESCE(m.kgMerma, 0) > 0
       THEN COALESCE(g.costoTotal, 0) / (h.kgCosechados - COALESCE(m.kgMerma, 0)) END AS costoPorKg,
  CASE WHEN COALESCE(dv.kgVendidos, 0) > 0
       THEN iv.ingresos / dv.kgVendidos END AS precioPromedioKg,
  CASE WHEN COALESCE(h.kgCosechados, 0) > 0
       THEN COALESCE(m.kgMerma, 0) / h.kgCosechados * 100 END AS mermaPct,
  CASE WHEN c.superficieSembrada > 0
       THEN COALESCE(g.costoTotal, 0) / c.superficieSembrada END AS costoPorHectarea,
  CASE WHEN c.superficieSembrada > 0
       THEN COALESCE(h.kgCosechados, 0) / c.superficieSembrada END AS rendimientoKgHa,
  COALESCE(iv.totalFacturado, 0) - COALESCE(cb.cobrado, 0) AS porCobrar
FROM ciclo_produccion c
LEFT JOIN LATERAL (
  SELECT SUM(total) AS costoTotal
  FROM gasto
  WHERE cicloId = c.id AND deletedAt IS NULL
) g ON TRUE
LEFT JOIN LATERAL (
  SELECT SUM(x.cantidad * u.factorABase) AS kgCosechados
  FROM cosecha x
  JOIN unidad_medida u ON u.id = x.unidadId
  WHERE x.cicloId = c.id AND x.deletedAt IS NULL
) h ON TRUE
LEFT JOIN LATERAL (
  SELECT
    SUM(CASE WHEN x.etapa <> 'CAMPO' THEN x.cantidad * u.factorABase ELSE 0 END) AS kgMerma,
    SUM(CASE WHEN x.etapa =  'CAMPO' THEN x.cantidad * u.factorABase ELSE 0 END) AS kgMermaCampo
  FROM merma x
  JOIN unidad_medida u ON u.id = x.unidadId
  WHERE x.cicloId = c.id AND x.deletedAt IS NULL
) m ON TRUE
LEFT JOIN LATERAL (
  SELECT SUM(d.cantidad * u.factorABase) AS kgVendidos
  FROM venta v
  JOIN detalle_venta d ON d.ventaId = v.id
  JOIN unidad_medida u ON u.id = d.unidadId
  WHERE v.cicloId = c.id AND v.deletedAt IS NULL AND v.estado <> 'CANCELADA'
) dv ON TRUE
LEFT JOIN LATERAL (
  SELECT SUM(total - impuesto) AS ingresos, SUM(total) AS totalFacturado
  FROM venta
  WHERE cicloId = c.id AND deletedAt IS NULL AND estado <> 'CANCELADA'
) iv ON TRUE
LEFT JOIN LATERAL (
  SELECT SUM(cv.monto) AS cobrado
  FROM cobro_venta cv
  JOIN venta v ON v.id = cv.ventaId
  WHERE v.cicloId = c.id AND cv.deletedAt IS NULL AND v.deletedAt IS NULL AND v.estado <> 'CANCELADA'
) cb ON TRUE
WHERE c.deletedAt IS NULL;

-- 2. Vista de Costo por Actividad con agregado LATERAL
CREATE OR REPLACE VIEW v_costo_por_actividad AS
SELECT a.cicloId, c.empresaId, ta.id AS tipoActividadId, ta.nombre AS tipoActividad,
COUNT(*)                       AS numeroActividades,
SUM(a.horasTrabajadas)         AS horasTotales,
SUM(COALESCE(g.costo, 0))      AS costoTotal
FROM actividad a
JOIN ciclo_produccion c ON c.id = a.cicloId AND c.deletedAt IS NULL
JOIN tipo_actividad ta ON ta.id = a.tipoActividadId
LEFT JOIN LATERAL (
  SELECT SUM(total) AS costo
  FROM gasto
  WHERE actividadId = a.id AND deletedAt IS NULL
) g ON TRUE
WHERE a.deletedAt IS NULL
GROUP BY a.cicloId, c.empresaId, ta.id, ta.nombre;

-- 3. Vista de Comparativo entre Ciclos de una Parcela (re-bind sobre v_rentabilidad_ciclo optimizada)
CREATE OR REPLACE VIEW v_comparativo_parcela AS
SELECT r.*,
  LAG(r.margenPct)  OVER (PARTITION BY r.parcelaId ORDER BY r.fechaInicio, r.cicloId) AS margenPctCicloAnterior,
  LAG(r.costoPorKg) OVER (PARTITION BY r.parcelaId ORDER BY r.fechaInicio, r.cicloId) AS costoPorKgCicloAnterior,
  LAG(r.ganancia)   OVER (PARTITION BY r.parcelaId ORDER BY r.fechaInicio, r.cicloId) AS gananciaCicloAnterior
FROM v_rentabilidad_ciclo r
WHERE r.estado IN ('ACTIVO','SUSPENDIDO','FINALIZADO');