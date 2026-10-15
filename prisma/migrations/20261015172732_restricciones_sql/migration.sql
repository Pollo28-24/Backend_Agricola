-- ============ CHECK (MySQL 8.0.16+) ============
ALTER TABLE `predio`
  ADD CONSTRAINT chk_predio_superficie CHECK (`superficieTotal` > 0);

ALTER TABLE `parcela`
  ADD CONSTRAINT chk_parcela_superficie CHECK (`superficie` > 0);

ALTER TABLE `ciclo_produccion`
  ADD CONSTRAINT chk_ciclo_fechas     CHECK (`fechaFin` IS NULL OR `fechaFin` >= `fechaInicio`),
  ADD CONSTRAINT chk_ciclo_superficie CHECK (`superficieSembrada` > 0);

ALTER TABLE `actividad`
  ADD CONSTRAINT chk_actividad_horas CHECK (`horasTrabajadas` IS NULL OR `horasTrabajadas` >= 0);

ALTER TABLE `gasto`
  ADD CONSTRAINT chk_gasto_cantidad CHECK (`cantidad` > 0),
  ADD CONSTRAINT chk_gasto_costo    CHECK (`costoUnitario` >= 0),
  ADD CONSTRAINT chk_gasto_impuesto CHECK (`impuesto` >= 0),
  ADD CONSTRAINT chk_gasto_total    CHECK (`total` > 0);

ALTER TABLE `cosecha`
  ADD CONSTRAINT chk_cosecha_cantidad CHECK (`cantidad` > 0);

ALTER TABLE `venta`
  ADD CONSTRAINT chk_venta_descuento CHECK (`descuento` >= 0),
  ADD CONSTRAINT chk_venta_impuesto  CHECK (`impuesto` >= 0),
  ADD CONSTRAINT chk_venta_total     CHECK (`total` >= 0);

ALTER TABLE `detalle_venta`
  ADD CONSTRAINT chk_detalle_cantidad CHECK (`cantidad` > 0),
  ADD CONSTRAINT chk_detalle_precio   CHECK (`precioUnitario` > 0);

ALTER TABLE `cobro_venta`
  ADD CONSTRAINT chk_cobro_monto CHECK (`monto` > 0);

ALTER TABLE `merma`
  ADD CONSTRAINT chk_merma_cantidad CHECK (`cantidad` > 0);

ALTER TABLE `unidad_medida`
  ADD CONSTRAINT chk_unidad_factor CHECK (`factorABase` > 0);

ALTER TABLE `plan_suscripcion`
  ADD CONSTRAINT chk_plan_limites CHECK (`maxParcelas` > 0 AND `maxUsuarios` > 0 AND `precioMensual` >= 0);

-- ============ COLUMNAS GENERADAS ============
-- RN-009: un solo ciclo ACTIVO por parcela.
ALTER TABLE `ciclo_produccion` DROP INDEX `ciclo_produccion_claveCicloActivo_key`;
ALTER TABLE `ciclo_produccion` DROP COLUMN `claveCicloActivo`;
ALTER TABLE `ciclo_produccion`
  ADD COLUMN `claveCicloActivo` INT
    GENERATED ALWAYS AS (
      CASE WHEN `estado` = 'ACTIVO' AND `deletedAt` IS NULL THEN `parcelaId` END
    ) STORED,
  ADD UNIQUE INDEX `ciclo_produccion_claveCicloActivo_key` (`claveCicloActivo`);

-- Unicidad de categorías incluyendo raíces y alcance (sistema vs. empresa).
ALTER TABLE `categoria_gasto` DROP INDEX `categoria_gasto_claveNombre_key`;
ALTER TABLE `categoria_gasto` DROP COLUMN `claveNombre`;
ALTER TABLE `categoria_gasto`
  ADD COLUMN `claveNombre` VARCHAR(191)
    GENERATED ALWAYS AS (
      CONCAT(IFNULL(`empresaId`, 0), ':', IFNULL(`categoriaPadreId`, 0), ':', `nombre`)
    ) STORED,
  ADD UNIQUE INDEX `categoria_gasto_claveNombre_key` (`claveNombre`);