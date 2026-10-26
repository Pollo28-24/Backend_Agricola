-- =====================================================================
-- ANEXO D / ESPECIFICACIÓN §3.25: SCRIPT DE VERIFICACIÓN DE BASE DE DATOS
-- Sistema de Gestión de Costos y Rentabilidad Agrícola (MySQL 8.0)
-- =====================================================================
-- Ejecución controlada de pruebas estructurales, semánticas y de vistas.
-- Los datos de prueba viven dentro de una transacción que termina en ROLLBACK:
-- no queda ningún dato persistido en la base. Si la ejecución se interrumpe: ROLLBACK;
--
-- DELTAS JUSTIFICADOS HITO 11A / 11C:
--   - Tablas base: 27 (docx) -> 28 (+refresh_token por rotación de sesión)
--   - Llaves foráneas: 48 (docx) -> 49 (+refresh_token -> usuario)
--   - FK ON DELETE CASCADE: 3 (docx) -> 4 (+refresh_token.usuarioId ON DELETE CASCADE)
-- =====================================================================

DROP TEMPORARY TABLE IF EXISTS tmp_chk;
CREATE TEMPORARY TABLE tmp_chk (
  n        INT AUTO_INCREMENT PRIMARY KEY,
  prueba   VARCHAR(110) NOT NULL,
  esperado DECIMAL(24,6) NOT NULL,
  obtenido DECIMAL(24,6) NULL
);

DROP PROCEDURE IF EXISTS tmp_esperar_error;
DELIMITER $$
CREATE PROCEDURE tmp_esperar_error(IN p_prueba VARCHAR(110), IN p_errno INT, IN p_sql TEXT)
BEGIN
  DECLARE v_err INT DEFAULT 0;
  DECLARE v_step_err INT DEFAULT 0;
  DECLARE CONTINUE HANDLER FOR SQLEXCEPTION
    GET DIAGNOSTICS CONDITION 1 v_step_err = MYSQL_ERRNO;

  SET @sql_prueba = p_sql;
  PREPARE st FROM @sql_prueba;
  IF v_step_err <> 0 THEN
    SET v_err = v_step_err;
  ELSE
    EXECUTE st;
    SET v_err = v_step_err;
    DEALLOCATE PREPARE st;
  END IF;

  INSERT INTO tmp_chk (prueba, esperado, obtenido) VALUES (p_prueba, p_errno, v_err);
END$$
DELIMITER ;

-- ---------------------------------------------------------------------
-- BLOQUE 1. Estructura y semilla (solo lectura)
-- ---------------------------------------------------------------------
INSERT INTO tmp_chk (prueba, esperado, obtenido)
SELECT 'Base en utf8mb4', 1, COUNT(*) FROM information_schema.SCHEMATA
 WHERE SCHEMA_NAME = DATABASE() AND DEFAULT_CHARACTER_SET_NAME = 'utf8mb4'
UNION ALL SELECT 'Tablas (sin _prisma_migrations)', 28, COUNT(*) FROM information_schema.TABLES
 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE' AND TABLE_NAME <> '_prisma_migrations'
UNION ALL SELECT 'Vistas', 5, COUNT(*) FROM information_schema.VIEWS
 WHERE TABLE_SCHEMA = DATABASE()
UNION ALL SELECT 'Llaves foráneas', 49, COUNT(*) FROM information_schema.REFERENTIAL_CONSTRAINTS
 WHERE CONSTRAINT_SCHEMA = DATABASE()
UNION ALL SELECT 'FK con ON UPDATE RESTRICT (3 relaciones, 3.12)', 3, COUNT(*)
 FROM information_schema.REFERENTIAL_CONSTRAINTS
 WHERE CONSTRAINT_SCHEMA = DATABASE() AND UPDATE_RULE = 'RESTRICT'
UNION ALL SELECT 'FK con ON DELETE CASCADE (rol_permiso x2, detalle_venta, refresh_token)', 4, COUNT(*)
 FROM information_schema.REFERENTIAL_CONSTRAINTS
 WHERE CONSTRAINT_SCHEMA = DATABASE() AND DELETE_RULE = 'CASCADE'
UNION ALL SELECT 'FK con ON DELETE SET NULL (bitacora_auditoria.usuarioId)', 1, COUNT(*)
 FROM information_schema.REFERENTIAL_CONSTRAINTS
 WHERE CONSTRAINT_SCHEMA = DATABASE() AND DELETE_RULE = 'SET NULL'
UNION ALL SELECT 'Restricciones CHECK (3.12)', 19, COUNT(*) FROM information_schema.CHECK_CONSTRAINTS
 WHERE CONSTRAINT_SCHEMA = DATABASE()
UNION ALL SELECT 'Columnas generadas STORED', 2, COUNT(*) FROM information_schema.COLUMNS
 WHERE TABLE_SCHEMA = DATABASE() AND EXTRA LIKE '%STORED GENERATED%'
UNION ALL SELECT 'Índices únicos de las columnas generadas', 2, COUNT(DISTINCT INDEX_NAME)
 FROM information_schema.STATISTICS
 WHERE TABLE_SCHEMA = DATABASE() AND NON_UNIQUE = 0
   AND INDEX_NAME IN ('ciclo_produccion_claveCicloActivo_key', 'categoria_gasto_claveNombre_key')
UNION ALL SELECT 'Migraciones fallidas o revertidas', 0, COUNT(*) FROM _prisma_migrations
 WHERE finished_at IS NULL OR rolled_back_at IS NOT NULL
UNION ALL SELECT 'Roles ADMIN, CAPTURISTA, CONTADOR', 3, COUNT(*) FROM rol
 WHERE codigo IN ('ADMIN', 'CAPTURISTA', 'CONTADOR')
UNION ALL SELECT 'Permisos', 19, COUNT(*) FROM permiso
UNION ALL SELECT 'Permisos de ADMIN', 19, COUNT(*) FROM rol_permiso rp
 JOIN rol r ON r.id = rp.rolId WHERE r.codigo = 'ADMIN'
UNION ALL SELECT 'Permisos de CAPTURISTA', 4, COUNT(*) FROM rol_permiso rp
 JOIN rol r ON r.id = rp.rolId WHERE r.codigo = 'CAPTURISTA'
UNION ALL SELECT 'Permisos de CONTADOR', 8, COUNT(*) FROM rol_permiso rp
 JOIN rol r ON r.id = rp.rolId WHERE r.codigo = 'CONTADOR'
UNION ALL SELECT 'CONTADOR NO tiene catalogo:administrar', 0, COUNT(*) FROM rol_permiso rp
 JOIN rol r ON r.id = rp.rolId JOIN permiso p ON p.id = rp.permisoId
 WHERE r.codigo = 'CONTADOR' AND p.codigo = 'catalogo:administrar'
UNION ALL SELECT 'Planes BASICO, PRODUCTOR, PROFESIONAL', 3, COUNT(*) FROM plan_suscripcion
 WHERE codigo IN ('BASICO', 'PRODUCTOR', 'PROFESIONAL')
UNION ALL SELECT 'Unidades KG (1) y CAJA_20KG (20) con su factor', 2, COUNT(*) FROM unidad_medida
 WHERE (codigo = 'KG' AND factorABase = 1) OR (codigo = 'CAJA_20KG' AND factorABase = 20);

-- ---------------------------------------------------------------------
-- BLOQUE 2. Datos de prueba (dentro de una transacción)
-- ---------------------------------------------------------------------
START TRANSACTION;

INSERT INTO plan_suscripcion (codigo, nombre, precioMensual, maxParcelas, maxUsuarios, updatedAt)
VALUES ('TEST_PLAN', 'Plan de prueba', 0, 5, 5, NOW(3));
SET @plan = LAST_INSERT_ID();

INSERT INTO empresa (planId, nombre, rfc, correo, updatedAt)
VALUES (@plan, 'Empresa de prueba', 'TEST000000001', 'prueba@test.local', NOW(3));
SET @emp = LAST_INSERT_ID();

INSERT INTO rol (codigo, nombre) VALUES ('TEST_ROL', 'Rol de prueba');
SET @rol = LAST_INSERT_ID();

INSERT INTO usuario (empresaId, rolId, nombre, apellido, correo, contrasenaHash, updatedAt)
VALUES (@emp, @rol, 'Test', 'Usuario', 'test.usuario@test.local', 'hash-de-prueba', NOW(3));
SET @usr = LAST_INSERT_ID();

INSERT INTO predio (empresaId, nombre, superficieTotal, updatedAt)
VALUES (@emp, 'Predio de prueba', 10, NOW(3));
SET @pre = LAST_INSERT_ID();

INSERT INTO parcela (predioId, nombre, superficie, updatedAt) VALUES (@pre, 'Parcela 1', 3, NOW(3));
SET @par1 = LAST_INSERT_ID();

INSERT INTO parcela (predioId, nombre, superficie, updatedAt) VALUES (@pre, 'Parcela 2', 3, NOW(3));
SET @par2 = LAST_INSERT_ID();

INSERT INTO cultivo (nombre) VALUES ('TEST Cultivo');
SET @cul = LAST_INSERT_ID();

INSERT INTO variedad (cultivoId, nombre) VALUES (@cul, 'TEST Variedad');
SET @var = LAST_INSERT_ID();

INSERT INTO unidad_medida (codigo, nombre, tipo, factorABase) VALUES ('T_KG', 'Kilogramo de prueba', 'PESO', 1);
SET @ukg = LAST_INSERT_ID();

INSERT INTO unidad_medida (codigo, nombre, tipo, factorABase) VALUES ('T_CAJA20', 'Caja 20 kg de prueba', 'PESO', 20);
SET @ucaja = LAST_INSERT_ID();

INSERT INTO motivo_merma (nombre) VALUES ('TEST Golpe');
SET @mot = LAST_INSERT_ID();

INSERT INTO tipo_actividad (nombre) VALUES ('TEST Fertilización');
SET @tact = LAST_INSERT_ID();

INSERT INTO categoria_gasto (empresaId, nombre, updatedAt) VALUES (@emp, 'TEST Fertilizantes', NOW(3));
SET @cat1 = LAST_INSERT_ID();

INSERT INTO categoria_gasto (empresaId, categoriaPadreId, nombre, updatedAt)
VALUES (@emp, @cat1, 'TEST NPK', NOW(3));
SET @cat2 = LAST_INSERT_ID();

INSERT INTO cliente (empresaId, nombre, updatedAt) VALUES (@emp, 'TEST Cliente', NOW(3));
SET @cli = LAST_INSERT_ID();

-- Ciclo A: ejemplo del Canvas (costo 86,000; ventas 121,000; 8,200 kg)
INSERT INTO ciclo_produccion (empresaId, parcelaId, variedadId, nombre, fechaInicio,
  superficieSembrada, estado, creadoPorId, updatedAt)
VALUES (@emp, @par1, @var, 'Ciclo A (Canvas)', '2027-01-10', 2.5, 'ACTIVO', @usr, NOW(3));
SET @cA = LAST_INSERT_ID();

INSERT INTO actividad (cicloId, tipoActividadId, creadoPorId, fecha, horasTrabajadas, updatedAt)
VALUES (@cA, @tact, @usr, '2027-01-15', 6, NOW(3));
SET @act = LAST_INSERT_ID();

INSERT INTO gasto (cicloId, categoriaId, actividadId, creadoPorId, fecha, cantidad, costoUnitario, impuesto, total, updatedAt)
VALUES (@cA, @cat2, @act, @usr, '2027-01-15', 1, 50000, 0, 50000, NOW(3));

INSERT INTO gasto (cicloId, categoriaId, creadoPorId, fecha, cantidad, costoUnitario, impuesto, total, updatedAt)
VALUES (@cA, @cat1, @usr, '2027-02-01', 1, 36000, 0, 36000, NOW(3));

INSERT INTO cosecha (cicloId, unidadId, creadoPorId, fecha, cantidad, calidad, updatedAt)
VALUES (@cA, @ucaja, @usr, '2027-03-20', 410, 'PRIMERA', NOW(3));

INSERT INTO venta (cicloId, clienteId, creadoPorId, fecha, impuesto, total, estado, updatedAt)
VALUES (@cA, @cli, @usr, '2027-04-02', 0, 121000, 'REGISTRADA', NOW(3));
SET @vA = LAST_INSERT_ID();

INSERT INTO detalle_venta (ventaId, unidadId, calidad, cantidad, precioUnitario)
VALUES (@vA, @ukg, 'PRIMERA', 8200, 14.76);

-- Ciclo B: IVA, merma poscosecha y de campo, venta cancelada y cobro parcial
INSERT INTO ciclo_produccion (empresaId, parcelaId, variedadId, nombre, fechaInicio,
  superficieSembrada, estado, creadoPorId, updatedAt)
VALUES (@emp, @par2, @var, 'Ciclo B (IVA y mermas)', '2027-01-10', 2, 'ACTIVO', @usr, NOW(3));
SET @cB = LAST_INSERT_ID();

INSERT INTO gasto (cicloId, categoriaId, creadoPorId, fecha, cantidad, costoUnitario, impuesto, total, updatedAt)
VALUES (@cB, @cat1, @usr, '2027-01-20', 1, 10000, 0, 10000, NOW(3));

INSERT INTO cosecha (cicloId, unidadId, creadoPorId, fecha, cantidad, calidad, updatedAt)
VALUES (@cB, @ukg, @usr, '2027-03-20', 1000, 'PRIMERA', NOW(3));

INSERT INTO merma (cicloId, motivoId, unidadId, creadoPorId, fecha, cantidad, etapa, updatedAt)
VALUES (@cB, @mot, @ukg, @usr, '2027-03-22', 50, 'POSCOSECHA', NOW(3));

INSERT INTO merma (cicloId, motivoId, unidadId, creadoPorId, fecha, cantidad, etapa, updatedAt)
VALUES (@cB, @mot, @ukg, @usr, '2027-03-10', 300, 'CAMPO', NOW(3));

INSERT INTO venta (cicloId, clienteId, creadoPorId, fecha, impuesto, total, estado, updatedAt)
VALUES (@cB, @cli, @usr, '2027-04-02', 2000, 14000, 'REGISTRADA', NOW(3));
SET @vB1 = LAST_INSERT_ID();

INSERT INTO detalle_venta (ventaId, unidadId, calidad, cantidad, precioUnitario)
VALUES (@vB1, @ukg, 'PRIMERA', 600, 20);

INSERT INTO venta (cicloId, clienteId, creadoPorId, fecha, impuesto, total, estado, updatedAt)
VALUES (@cB, @cli, @usr, '2027-04-03', 0, 5000, 'CANCELADA', NOW(3));
SET @vB2 = LAST_INSERT_ID();

INSERT INTO detalle_venta (ventaId, unidadId, calidad, cantidad, precioUnitario)
VALUES (@vB2, @ukg, 'SEGUNDA', 100, 50);

INSERT INTO cobro_venta (ventaId, registradoPorId, fecha, monto, metodo)
VALUES (@vB1, @usr, '2027-04-10', 8000, 'TRANSFERENCIA');

INSERT INTO cobro_venta (ventaId, registradoPorId, fecha, monto, metodo, deletedAt)
VALUES (@vB1, @usr, '2027-04-11', 1000, 'EFECTIVO', NOW(3));

-- Ciclo C: eliminado lógicamente; no debe aparecer en ninguna vista
INSERT INTO ciclo_produccion (empresaId, parcelaId, variedadId, nombre, fechaInicio,
  superficieSembrada, estado, creadoPorId, updatedAt, deletedAt)
VALUES (@emp, @par2, @var, 'Ciclo C (eliminado)', '2026-01-10', 1, 'FINALIZADO', @usr, NOW(3), NOW(3));
SET @cC = LAST_INSERT_ID();

INSERT INTO gasto (cicloId, categoriaId, creadoPorId, fecha, cantidad, costoUnitario, impuesto, total, updatedAt)
VALUES (@cC, @cat1, @usr, '2026-02-01', 1, 999, 0, 999, NOW(3));

-- ---------------------------------------------------------------------
-- BLOQUE 3. Indicadores de las vistas (valores de la sección 2.7 y 3.15)
-- ---------------------------------------------------------------------
INSERT INTO tmp_chk (prueba, esperado, obtenido)
SELECT 'Canvas · costoTotal', 86000, costoTotal FROM v_rentabilidad_ciclo WHERE cicloId = @cA
UNION ALL SELECT 'Canvas · kgCosechados (410 cajas x 20 kg)', 8200, kgCosechados FROM v_rentabilidad_ciclo WHERE cicloId = @cA
UNION ALL SELECT 'Canvas · kgDisponibles', 0, kgDisponibles FROM v_rentabilidad_ciclo WHERE cicloId = @cA
UNION ALL SELECT 'Canvas · ingresos', 121000, ingresos FROM v_rentabilidad_ciclo WHERE cicloId = @cA
UNION ALL SELECT 'Canvas · ganancia', 35000, ganancia FROM v_rentabilidad_ciclo WHERE cicloId = @cA
UNION ALL SELECT 'Canvas · margenPct', 28.9256, margenPct FROM v_rentabilidad_ciclo WHERE cicloId = @cA
UNION ALL SELECT 'Canvas · roiPct', 40.6977, roiPct FROM v_rentabilidad_ciclo WHERE cicloId = @cA
UNION ALL SELECT 'Canvas · costoPorKg', 10.4878, costoPorKg FROM v_rentabilidad_ciclo WHERE cicloId = @cA
UNION ALL SELECT 'Canvas · precioPromedioKg', 14.7561, precioPromedioKg FROM v_rentabilidad_ciclo WHERE cicloId = @cA
UNION ALL SELECT 'Canvas · porCobrar', 121000, porCobrar FROM v_rentabilidad_ciclo WHERE cicloId = @cA
UNION ALL SELECT 'Ciclo B · costoTotal', 10000, costoTotal FROM v_rentabilidad_ciclo WHERE cicloId = @cB
UNION ALL SELECT 'Ciclo B · kgMerma (poscosecha)', 50, kgMerma FROM v_rentabilidad_ciclo WHERE cicloId = @cB
UNION ALL SELECT 'Ciclo B · kgMermaCampo (no resta)', 300, kgMermaCampo FROM v_rentabilidad_ciclo WHERE cicloId = @cB
UNION ALL SELECT 'Ciclo B · kgNetos', 950, kgNetos FROM v_rentabilidad_ciclo WHERE cicloId = @cB
UNION ALL SELECT 'Ciclo B · kgVendidos (sin cancelada)', 600, kgVendidos FROM v_rentabilidad_ciclo WHERE cicloId = @cB
UNION ALL SELECT 'Ciclo B · kgDisponibles', 350, kgDisponibles FROM v_rentabilidad_ciclo WHERE cicloId = @cB
UNION ALL SELECT 'Ciclo B · ingresos (sin IVA)', 12000, ingresos FROM v_rentabilidad_ciclo WHERE cicloId = @cB
UNION ALL SELECT 'Ciclo B · totalFacturado', 14000, totalFacturado FROM v_rentabilidad_ciclo WHERE cicloId = @cB
UNION ALL SELECT 'Ciclo B · cobrado (sin cobro anulado)', 8000, cobrado FROM v_rentabilidad_ciclo WHERE cicloId = @cB
UNION ALL SELECT 'Ciclo B · ganancia', 2000, ganancia FROM v_rentabilidad_ciclo WHERE cicloId = @cB
UNION ALL SELECT 'Ciclo B · margenPct', 16.6667, margenPct FROM v_rentabilidad_ciclo WHERE cicloId = @cB
UNION ALL SELECT 'Ciclo B · roiPct', 20, roiPct FROM v_rentabilidad_ciclo WHERE cicloId = @cB
UNION ALL SELECT 'Ciclo B · costoPorKg', 10.5263, costoPorKg FROM v_rentabilidad_ciclo WHERE cicloId = @cB
UNION ALL SELECT 'Ciclo B · precioPromedioKg', 20, precioPromedioKg FROM v_rentabilidad_ciclo WHERE cicloId = @cB
UNION ALL SELECT 'Ciclo B · mermaPct', 5, mermaPct FROM v_rentabilidad_ciclo WHERE cicloId = @cB
UNION ALL SELECT 'Ciclo B · porCobrar', 6000, porCobrar FROM v_rentabilidad_ciclo WHERE cicloId = @cB
UNION ALL SELECT 'Ciclo C eliminado: no aparece en v_rentabilidad_ciclo', 0, COUNT(*) FROM v_rentabilidad_ciclo WHERE cicloId = @cC
UNION ALL SELECT 'Ciclo C eliminado: no aparece en v_costo_por_categoria', 0, COUNT(*) FROM v_costo_por_categoria WHERE cicloId = @cC
UNION ALL SELECT 'v_costo_por_categoria · la subcategoría suma a su raíz', 86000, monto FROM v_costo_por_categoria WHERE cicloId = @cA AND categoriaRaizId = @cat1
UNION ALL SELECT 'v_costo_por_categoria · porcentaje de la raíz', 100, porcentaje FROM v_costo_por_categoria WHERE cicloId = @cA AND categoriaRaizId = @cat1
UNION ALL SELECT 'v_costo_por_categoria · expone empresaId (v3.1)', @emp, MIN(empresaId) FROM v_costo_por_categoria WHERE cicloId = @cA
UNION ALL SELECT 'v_costo_por_actividad · costoTotal', 50000, costoTotal FROM v_costo_por_actividad WHERE cicloId = @cA
UNION ALL SELECT 'v_costo_por_actividad · horasTotales', 6, horasTotales FROM v_costo_por_actividad WHERE cicloId = @cA
UNION ALL SELECT 'v_costo_por_actividad · expone empresaId (v3.1)', @emp, MIN(empresaId) FROM v_costo_por_actividad WHERE cicloId = @cA
UNION ALL SELECT 'v_merma_desglose · filas del ciclo B', 2, COUNT(*) FROM v_merma_desglose WHERE cicloId = @cB
UNION ALL SELECT 'v_merma_desglose · kg en etapa CAMPO', 300, kgMerma FROM v_merma_desglose WHERE cicloId = @cB AND etapa = 'CAMPO'
UNION ALL SELECT 'v_merma_desglose · expone empresaId (v3.1)', @emp, MIN(empresaId) FROM v_merma_desglose WHERE cicloId = @cB
UNION ALL SELECT 'v_comparativo_parcela · incluye el ciclo A', 1, COUNT(*) FROM v_comparativo_parcela WHERE cicloId = @cA;

-- ---------------------------------------------------------------------
-- BLOQUE 4. Restricciones: cada sentencia debe fallar con el código indicado
-- (1062 = duplicado, 3819 = CHECK, 3105 = columna generada, 1451 = FK).
-- Un 0 significa que la sentencia debe FUNCIONAR.
-- ---------------------------------------------------------------------
CALL tmp_esperar_error('RN-009 · segundo ciclo ACTIVO en la misma parcela', 1062,
  "INSERT INTO ciclo_produccion (empresaId, parcelaId, variedadId, fechaInicio, superficieSembrada, estado, creadoPorId, updatedAt) VALUES (@emp, @par1, @var, '2027-02-01', 1, 'ACTIVO', @usr, NOW(3))");
CALL tmp_esperar_error('RN-009 · un ciclo SUSPENDIDO en la misma parcela sí se permite', 0,
  "INSERT INTO ciclo_produccion (empresaId, parcelaId, variedadId, fechaInicio, superficieSembrada, estado, creadoPorId, updatedAt) VALUES (@emp, @par1, @var, '2027-02-01', 1, 'SUSPENDIDO', @usr, NOW(3))");
CALL tmp_esperar_error('RN-017 · fechaFin anterior a fechaInicio', 3819,
  "INSERT INTO ciclo_produccion (empresaId, parcelaId, variedadId, fechaInicio, fechaFin, superficieSembrada, estado, creadoPorId, updatedAt) VALUES (@emp, @par2, @var, '2027-02-01', '2027-01-01', 1, 'PLANIFICADO', @usr, NOW(3))");
CALL tmp_esperar_error('RN-020 · gasto con total negativo', 3819,
  "INSERT INTO gasto (cicloId, categoriaId, creadoPorId, fecha, cantidad, costoUnitario, impuesto, total, updatedAt) VALUES (@cA, @cat1, @usr, '2027-02-02', 1, 10, 0, -5, NOW(3))");
CALL tmp_esperar_error('Gasto con costoUnitario negativo', 3819,
  "INSERT INTO gasto (cicloId, categoriaId, creadoPorId, fecha, cantidad, costoUnitario, impuesto, total, updatedAt) VALUES (@cA, @cat1, @usr, '2027-02-02', 1, -10, 0, 5, NOW(3))");
CALL tmp_esperar_error('Gasto con costoUnitario 0 y total > 0 sí se permite (>= 0)', 0,
  "INSERT INTO gasto (cicloId, categoriaId, creadoPorId, fecha, cantidad, costoUnitario, impuesto, total, updatedAt) VALUES (@cA, @cat1, @usr, '2027-02-02', 1, 0, 0, 5, NOW(3))");
CALL tmp_esperar_error('RN-026 · cosecha con cantidad 0', 3819,
  "INSERT INTO cosecha (cicloId, unidadId, creadoPorId, fecha, cantidad, calidad, updatedAt) VALUES (@cA, @ukg, @usr, '2027-03-21', 0, 'PRIMERA', NOW(3))");
CALL tmp_esperar_error('Merma con cantidad 0', 3819,
  "INSERT INTO merma (cicloId, motivoId, unidadId, creadoPorId, fecha, cantidad, etapa, updatedAt) VALUES (@cB, @mot, @ukg, @usr, '2027-03-22', 0, 'POSCOSECHA', NOW(3))");
CALL tmp_esperar_error('RN-029 · renglón de venta con precio 0', 3819,
  "INSERT INTO detalle_venta (ventaId, unidadId, calidad, cantidad, precioUnitario) VALUES (@vA, @ukg, 'PRIMERA', 1, 0)");
CALL tmp_esperar_error('Cobro con monto 0', 3819,
  "INSERT INTO cobro_venta (ventaId, registradoPorId, fecha, monto) VALUES (@vB1, @usr, '2027-04-12', 0)");
CALL tmp_esperar_error('unidad_medida con factorABase 0', 3819,
  "INSERT INTO unidad_medida (codigo, nombre, tipo, factorABase) VALUES ('T_CERO', 'Cero', 'PESO', 0)");
CALL tmp_esperar_error('plan_suscripcion con maxParcelas 0', 3819,
  "INSERT INTO plan_suscripcion (codigo, nombre, precioMensual, maxParcelas, maxUsuarios, updatedAt) VALUES ('T_CERO', 'Cero', 0, 0, 1, NOW(3))");
CALL tmp_esperar_error('RN-048 · categoría raíz duplicada en la misma empresa', 1062,
  "INSERT INTO categoria_gasto (empresaId, nombre, updatedAt) VALUES (@emp, 'TEST Fertilizantes', NOW(3))");
CALL tmp_esperar_error('RN-002 · correo de usuario duplicado', 1062,
  "INSERT INTO usuario (empresaId, rolId, nombre, apellido, correo, contrasenaHash, updatedAt) VALUES (@emp, @rol, 'Otro', 'Usuario', 'test.usuario@test.local', 'x', NOW(3))");
CALL tmp_esperar_error('RFC de empresa duplicado', 1062,
  "INSERT INTO empresa (planId, nombre, rfc, correo, updatedAt) VALUES (@plan, 'Otra empresa', 'TEST000000001', 'otra@test.local', NOW(3))");
CALL tmp_esperar_error('La columna generada claveCicloActivo no se puede escribir', 3105,
  "UPDATE ciclo_produccion SET claveCicloActivo = 5 WHERE id = @cA");
CALL tmp_esperar_error('RN-016 · no se borra una parcela con ciclos (ON DELETE RESTRICT)', 1451,
  "DELETE FROM parcela WHERE id = @par1");

-- ---------------------------------------------------------------------
-- RESULTADO Y REPORTE
-- ---------------------------------------------------------------------
SELECT n AS '#', prueba AS Prueba, esperado AS Esperado, obtenido AS Obtenido,
  IF(obtenido IS NOT NULL AND ROUND(obtenido, 4) = ROUND(esperado, 4), 'OK', 'FALLA') AS Resultado
FROM tmp_chk ORDER BY n;

SELECT COUNT(*) AS pruebas,
  SUM(NOT (obtenido IS NOT NULL AND ROUND(obtenido, 4) = ROUND(esperado, 4))) AS pruebas_fallidas
FROM tmp_chk;

-- Rollback garantizado: no persiste ningún dato en la base
ROLLBACK;
DROP PROCEDURE IF EXISTS tmp_esperar_error;
DROP TEMPORARY TABLE IF EXISTS tmp_chk;
