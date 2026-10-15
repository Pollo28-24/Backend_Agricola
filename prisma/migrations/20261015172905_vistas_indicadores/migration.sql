-- =====================================================================
-- VISTAS DE INDICADORES (MySQL 8)
-- =====================================================================

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
LEFT JOIN (SELECT cicloId, SUM(total) AS costoTotal FROM gasto WHERE deletedAt IS NULL GROUP BY cicloId) g ON g.cicloId = c.id
LEFT JOIN (SELECT x.cicloId, SUM(x.cantidad * u.factorABase) AS kgCosechados
           FROM cosecha x JOIN unidad_medida u ON u.id = x.unidadId
           WHERE x.deletedAt IS NULL GROUP BY x.cicloId) h ON h.cicloId = c.id
LEFT JOIN (SELECT x.cicloId,
                  SUM(CASE WHEN x.etapa <> 'CAMPO' THEN x.cantidad * u.factorABase ELSE 0 END) AS kgMerma,
                  SUM(CASE WHEN x.etapa =  'CAMPO' THEN x.cantidad * u.factorABase ELSE 0 END) AS kgMermaCampo
           FROM merma x JOIN unidad_medida u ON u.id = x.unidadId
           WHERE x.deletedAt IS NULL GROUP BY x.cicloId) m ON m.cicloId = c.id
LEFT JOIN (SELECT v.cicloId, SUM(d.cantidad * u.factorABase) AS kgVendidos
           FROM venta v JOIN detalle_venta d ON d.ventaId = v.id JOIN unidad_medida u ON u.id = d.unidadId
           WHERE v.deletedAt IS NULL AND v.estado <> 'CANCELADA' GROUP BY v.cicloId) dv ON dv.cicloId = c.id
LEFT JOIN (SELECT cicloId, SUM(total - impuesto) AS ingresos, SUM(total) AS totalFacturado
           FROM venta WHERE deletedAt IS NULL AND estado <> 'CANCELADA' GROUP BY cicloId) iv ON iv.cicloId = c.id
LEFT JOIN (SELECT v.cicloId, SUM(cv.monto) AS cobrado
           FROM cobro_venta cv JOIN venta v ON v.id = cv.ventaId
           WHERE cv.deletedAt IS NULL AND v.deletedAt IS NULL AND v.estado <> 'CANCELADA'
           GROUP BY v.cicloId) cb ON cb.cicloId = c.id
WHERE c.deletedAt IS NULL;

CREATE OR REPLACE VIEW v_costo_por_categoria AS
SELECT g.cicloId, c.empresaId,
COALESCE(p.id, cg.id)         AS categoriaRaizId,
COALESCE(p.nombre, cg.nombre) AS categoriaRaiz,
SUM(g.total)                  AS monto,
SUM(g.total) / SUM(SUM(g.total)) OVER (PARTITION BY g.cicloId) * 100 AS porcentaje
FROM gasto g
JOIN ciclo_produccion c ON c.id = g.cicloId AND c.deletedAt IS NULL
JOIN categoria_gasto cg ON cg.id = g.categoriaId
LEFT JOIN categoria_gasto p ON p.id = cg.categoriaPadreId
WHERE g.deletedAt IS NULL
GROUP BY g.cicloId, c.empresaId, COALESCE(p.id, cg.id), COALESCE(p.nombre, cg.nombre);

CREATE OR REPLACE VIEW v_costo_por_actividad AS
SELECT a.cicloId, c.empresaId, ta.id AS tipoActividadId, ta.nombre AS tipoActividad,
COUNT(*)                       AS numeroActividades,
SUM(a.horasTrabajadas)         AS horasTotales,
SUM(COALESCE(g.costo, 0))      AS costoTotal
FROM actividad a
JOIN ciclo_produccion c ON c.id = a.cicloId AND c.deletedAt IS NULL
JOIN tipo_actividad ta ON ta.id = a.tipoActividadId
LEFT JOIN (SELECT actividadId, SUM(total) AS costo
FROM gasto WHERE deletedAt IS NULL AND actividadId IS NOT NULL
GROUP BY actividadId) g ON g.actividadId = a.id
WHERE a.deletedAt IS NULL
GROUP BY a.cicloId, c.empresaId, ta.id, ta.nombre;

CREATE OR REPLACE VIEW v_merma_desglose AS
SELECT m.cicloId, c.empresaId, mm.nombre AS motivo, m.etapa, SUM(m.cantidad * u.factorABase) AS kgMerma
FROM merma m
JOIN ciclo_produccion c ON c.id = m.cicloId AND c.deletedAt IS NULL
JOIN motivo_merma mm ON mm.id = m.motivoId
JOIN unidad_medida u ON u.id = m.unidadId
WHERE m.deletedAt IS NULL
GROUP BY m.cicloId, c.empresaId, mm.nombre, m.etapa;

CREATE OR REPLACE VIEW v_comparativo_parcela AS
SELECT r.*,
  LAG(r.margenPct)  OVER (PARTITION BY r.parcelaId ORDER BY r.fechaInicio, r.cicloId) AS margenPctCicloAnterior,
  LAG(r.costoPorKg) OVER (PARTITION BY r.parcelaId ORDER BY r.fechaInicio, r.cicloId) AS costoPorKgCicloAnterior,
  LAG(r.ganancia)   OVER (PARTITION BY r.parcelaId ORDER BY r.fechaInicio, r.cicloId) AS gananciaCicloAnterior
FROM v_rentabilidad_ciclo r
WHERE r.estado IN ('ACTIVO','SUSPENDIDO','FINALIZADO');
