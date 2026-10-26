-- =====================================================================
-- ANEXO D / ESPECIFICACIÓN §3.25: SCRIPT DE VERIFICACIÓN DE BASE DE DATOS
-- Sistema de Gestión de Costos y Rentabilidad Agrícola
-- =====================================================================
-- Este script valida la integridad estructural y semántica de la base de datos.
-- Delta justificado Hito 11A / 11C:
--   - 28 tablas base (27 docx + 1 refresh_token por rotación de sesión)
--   - 49 foreign keys (48 docx + 1 refresh_token -> usuario)
--   - 19 restricciones CHECK
--   - 5 vistas analíticas de indicadores
--   - 2 columnas generadas STORED
-- =====================================================================

-- 1. CONTEO DE TABLAS BASE (Excluyendo metadatos de migraciones)
SELECT 
  'TABLAS_BASE' AS concepto,
  28 AS esperado,
  COUNT(*) AS obtenido,
  CASE WHEN COUNT(*) = 28 THEN 'OK' ELSE 'FALLA' END AS estado
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_TYPE = 'BASE TABLE'
  AND TABLE_NAME <> '_prisma_migrations';

-- 2. CONTEO DE CLAVES FORÁNEAS (FK)
SELECT 
  'CLAVES_FORANEAS' AS concepto,
  49 AS esperado,
  COUNT(*) AS obtenido,
  CASE WHEN COUNT(*) = 49 THEN 'OK' ELSE 'FALLA' END AS estado
FROM information_schema.KEY_COLUMN_USAGE
WHERE TABLE_SCHEMA = DATABASE()
  AND REFERENCED_TABLE_NAME IS NOT NULL;

-- 3. CONTEO DE RESTRICCIONES CHECK
SELECT 
  'RESTRICCIONES_CHECK' AS concepto,
  19 AS esperado,
  COUNT(*) AS obtenido,
  CASE WHEN COUNT(*) = 19 THEN 'OK' ELSE 'FALLA' END AS estado
FROM information_schema.TABLE_CONSTRAINTS
WHERE TABLE_SCHEMA = DATABASE()
  AND CONSTRAINT_TYPE = 'CHECK';

-- 4. CONTEO DE VISTAS ANALÍTICAS
SELECT 
  'VISTAS_ANALITICAS' AS concepto,
  5 AS esperado,
  COUNT(*) AS obtenido,
  CASE WHEN COUNT(*) = 5 THEN 'OK' ELSE 'FALLA' END AS estado
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_TYPE = 'VIEW';

-- 5. CONTEO DE COLUMNAS GENERADAS STORED
SELECT 
  'COLUMNAS_STORED' AS concepto,
  2 AS esperado,
  COUNT(*) AS obtenido,
  CASE WHEN COUNT(*) = 2 THEN 'OK' ELSE 'FALLA' END AS estado
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND EXTRA LIKE '%STORED GENERATED%';

-- 6. DATOS SEMILLA: ROLES
SELECT 
  'ROLES' AS concepto,
  3 AS esperado,
  COUNT(*) AS obtenido,
  CASE WHEN COUNT(*) = 3 THEN 'OK' ELSE 'FALLA' END AS estado
FROM rol;

-- 7. DATOS SEMILLA: PERMISOS
SELECT 
  'PERMISOS' AS concepto,
  19 AS esperado,
  COUNT(*) AS obtenido,
  CASE WHEN COUNT(*) = 19 THEN 'OK' ELSE 'FALLA' END AS estado
FROM permiso;

-- 8. MATRIZ DE PERMISOS: ADMIN (19)
SELECT 
  'PERMISOS_ADMIN' AS concepto,
  19 AS esperado,
  COUNT(rp.permisoId) AS obtenido,
  CASE WHEN COUNT(rp.permisoId) = 19 THEN 'OK' ELSE 'FALLA' END AS estado
FROM rol r
JOIN rol_permiso rp ON rp.rolId = r.id
WHERE r.codigo = 'ADMIN';

-- 9. MATRIZ DE PERMISOS: CAPTURISTA (4)
SELECT 
  'PERMISOS_CAPTURISTA' AS concepto,
  4 AS esperado,
  COUNT(rp.permisoId) AS obtenido,
  CASE WHEN COUNT(rp.permisoId) = 4 THEN 'OK' ELSE 'FALLA' END AS estado
FROM rol r
JOIN rol_permiso rp ON rp.rolId = r.id
WHERE r.codigo = 'CAPTURISTA';

-- 10. MATRIZ DE PERMISOS: CONTADOR (8)
SELECT 
  'PERMISOS_CONTADOR' AS concepto,
  8 AS esperado,
  COUNT(rp.permisoId) AS obtenido,
  CASE WHEN COUNT(rp.permisoId) = 8 THEN 'OK' ELSE 'FALLA' END AS estado
FROM rol r
JOIN rol_permiso rp ON rp.rolId = r.id
WHERE r.codigo = 'CONTADOR';

-- 11. DATOS SEMILLA: PLANES DE SUSCRIPCIÓN (3)
SELECT 
  'PLANES_SUSCRIPCION' AS concepto,
  3 AS esperado,
  COUNT(*) AS obtenido,
  CASE WHEN COUNT(*) = 3 THEN 'OK' ELSE 'FALLA' END AS estado
FROM plan_suscripcion;
