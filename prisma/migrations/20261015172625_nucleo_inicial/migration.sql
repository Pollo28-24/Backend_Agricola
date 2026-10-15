-- CreateTable
CREATE TABLE `plan_suscripcion` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `codigo` VARCHAR(30) NOT NULL,
    `nombre` VARCHAR(80) NOT NULL,
    `precioMensual` DECIMAL(10, 2) NOT NULL,
    `maxParcelas` INTEGER NOT NULL,
    `maxUsuarios` INTEGER NOT NULL,
    `incluyeReportes` BOOLEAN NOT NULL DEFAULT false,
    `activo` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `plan_suscripcion_codigo_key`(`codigo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `empresa` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `planId` INTEGER NOT NULL,
    `nombre` VARCHAR(150) NOT NULL,
    `razonSocial` VARCHAR(200) NULL,
    `rfc` VARCHAR(13) NOT NULL,
    `correo` VARCHAR(150) NOT NULL,
    `telefono` VARCHAR(30) NULL,
    `direccion` VARCHAR(300) NULL,
    `moneda` CHAR(3) NOT NULL DEFAULT 'MXN',
    `estadoSuscripcion` ENUM('PRUEBA', 'ACTIVA', 'VENCIDA', 'CANCELADA') NOT NULL DEFAULT 'PRUEBA',
    `fechaInicioPlan` DATE NULL,
    `activo` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    UNIQUE INDEX `empresa_rfc_key`(`rfc`),
    INDEX `empresa_planId_idx`(`planId`),
    INDEX `empresa_nombre_idx`(`nombre`),
    INDEX `empresa_estadoSuscripcion_idx`(`estadoSuscripcion`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `rol` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `codigo` VARCHAR(30) NOT NULL,
    `nombre` VARCHAR(80) NOT NULL,
    `descripcion` VARCHAR(255) NULL,

    UNIQUE INDEX `rol_codigo_key`(`codigo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `permiso` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `codigo` VARCHAR(60) NOT NULL,
    `descripcion` VARCHAR(255) NULL,

    UNIQUE INDEX `permiso_codigo_key`(`codigo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `rol_permiso` (
    `rolId` INTEGER NOT NULL,
    `permisoId` INTEGER NOT NULL,

    INDEX `rol_permiso_permisoId_idx`(`permisoId`),
    PRIMARY KEY (`rolId`, `permisoId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `usuario` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `empresaId` INTEGER NOT NULL,
    `rolId` INTEGER NOT NULL,
    `nombre` VARCHAR(80) NOT NULL,
    `apellido` VARCHAR(80) NOT NULL,
    `correo` VARCHAR(120) NOT NULL,
    `contrasenaHash` VARCHAR(255) NOT NULL,
    `telefono` VARCHAR(30) NULL,
    `activo` BOOLEAN NOT NULL DEFAULT true,
    `ultimoAcceso` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    UNIQUE INDEX `usuario_correo_key`(`correo`),
    INDEX `usuario_empresaId_idx`(`empresaId`),
    INDEX `usuario_rolId_idx`(`rolId`),
    INDEX `usuario_empresaId_activo_idx`(`empresaId`, `activo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `refresh_token` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `usuarioId` INTEGER NOT NULL,
    `tokenHash` VARCHAR(255) NOT NULL,
    `jti` VARCHAR(60) NOT NULL,
    `revocado` BOOLEAN NOT NULL DEFAULT false,
    `expiraEn` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `revocadoEn` DATETIME(3) NULL,

    UNIQUE INDEX `refresh_token_jti_key`(`jti`),
    INDEX `refresh_token_usuarioId_idx`(`usuarioId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `predio` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `empresaId` INTEGER NOT NULL,
    `nombre` VARCHAR(120) NOT NULL,
    `ubicacion` VARCHAR(255) NULL,
    `municipio` VARCHAR(100) NULL,
    `entidadFederativa` VARCHAR(100) NULL,
    `superficieTotal` DECIMAL(10, 2) NOT NULL,
    `latitud` DECIMAL(10, 7) NULL,
    `longitud` DECIMAL(10, 7) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    INDEX `predio_empresaId_idx`(`empresaId`),
    UNIQUE INDEX `predio_empresaId_nombre_key`(`empresaId`, `nombre`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `tipo_suelo` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nombre` VARCHAR(80) NOT NULL,
    `descripcion` VARCHAR(255) NULL,

    UNIQUE INDEX `tipo_suelo_nombre_key`(`nombre`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `parcela` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `predioId` INTEGER NOT NULL,
    `tipoSueloId` INTEGER NULL,
    `nombre` VARCHAR(120) NOT NULL,
    `superficie` DECIMAL(10, 2) NOT NULL,
    `latitud` DECIMAL(10, 7) NULL,
    `longitud` DECIMAL(10, 7) NULL,
    `poligono` JSON NULL,
    `estado` ENUM('DISPONIBLE', 'EN_USO', 'DESCANSO', 'INACTIVA') NOT NULL DEFAULT 'DISPONIBLE',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    INDEX `parcela_predioId_idx`(`predioId`),
    INDEX `parcela_tipoSueloId_idx`(`tipoSueloId`),
    INDEX `parcela_estado_idx`(`estado`),
    UNIQUE INDEX `parcela_predioId_nombre_key`(`predioId`, `nombre`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `cultivo` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nombre` VARCHAR(100) NOT NULL,
    `nombreCientifico` VARCHAR(150) NULL,
    `descripcion` VARCHAR(500) NULL,
    `activo` BOOLEAN NOT NULL DEFAULT true,

    UNIQUE INDEX `cultivo_nombre_key`(`nombre`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `variedad` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `cultivoId` INTEGER NOT NULL,
    `nombre` VARCHAR(100) NOT NULL,
    `descripcion` VARCHAR(500) NULL,
    `duracionCicloDias` INTEGER NULL,
    `activo` BOOLEAN NOT NULL DEFAULT true,

    INDEX `variedad_cultivoId_idx`(`cultivoId`),
    UNIQUE INDEX `variedad_cultivoId_nombre_key`(`cultivoId`, `nombre`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `unidad_medida` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `codigo` VARCHAR(20) NOT NULL,
    `nombre` VARCHAR(80) NOT NULL,
    `tipo` ENUM('PESO', 'VOLUMEN', 'AREA', 'TIEMPO', 'CONTEO') NOT NULL,
    `factorABase` DECIMAL(14, 6) NOT NULL DEFAULT 1,

    UNIQUE INDEX `unidad_medida_codigo_key`(`codigo`),
    INDEX `unidad_medida_tipo_idx`(`tipo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `tipo_actividad` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nombre` VARCHAR(100) NOT NULL,
    `descripcion` VARCHAR(255) NULL,
    `activo` BOOLEAN NOT NULL DEFAULT true,

    UNIQUE INDEX `tipo_actividad_nombre_key`(`nombre`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `categoria_gasto` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `empresaId` INTEGER NULL,
    `categoriaPadreId` INTEGER NULL,
    `nombre` VARCHAR(100) NOT NULL,
    `descripcion` VARCHAR(255) NULL,
    `activo` BOOLEAN NOT NULL DEFAULT true,
    `claveNombre` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `categoria_gasto_claveNombre_key`(`claveNombre`),
    INDEX `categoria_gasto_empresaId_idx`(`empresaId`),
    INDEX `categoria_gasto_categoriaPadreId_idx`(`categoriaPadreId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `motivo_merma` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nombre` VARCHAR(100) NOT NULL,
    `descripcion` VARCHAR(255) NULL,
    `activo` BOOLEAN NOT NULL DEFAULT true,

    UNIQUE INDEX `motivo_merma_nombre_key`(`nombre`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `proveedor` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `empresaId` INTEGER NOT NULL,
    `nombre` VARCHAR(150) NOT NULL,
    `rfc` VARCHAR(13) NULL,
    `telefono` VARCHAR(30) NULL,
    `correo` VARCHAR(150) NULL,
    `direccion` VARCHAR(300) NULL,
    `activo` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    INDEX `proveedor_empresaId_idx`(`empresaId`),
    UNIQUE INDEX `proveedor_empresaId_nombre_key`(`empresaId`, `nombre`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `cliente` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `empresaId` INTEGER NOT NULL,
    `nombre` VARCHAR(150) NOT NULL,
    `rfc` VARCHAR(13) NULL,
    `telefono` VARCHAR(30) NULL,
    `correo` VARCHAR(150) NULL,
    `tipo` ENUM('MERCADO_MAYOREO', 'DISTRIBUIDOR', 'SUPERMERCADO', 'RESTAURANTE', 'EXPORTADOR', 'MENUDEO', 'OTRO') NOT NULL DEFAULT 'OTRO',
    `activo` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    INDEX `cliente_empresaId_idx`(`empresaId`),
    UNIQUE INDEX `cliente_empresaId_nombre_key`(`empresaId`, `nombre`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ciclo_produccion` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `empresaId` INTEGER NOT NULL,
    `parcelaId` INTEGER NOT NULL,
    `variedadId` INTEGER NOT NULL,
    `nombre` VARCHAR(120) NULL,
    `fechaInicio` DATE NOT NULL,
    `fechaFin` DATE NULL,
    `superficieSembrada` DECIMAL(10, 2) NOT NULL,
    `metaProduccionKg` DECIMAL(14, 3) NULL,
    `estado` ENUM('PLANIFICADO', 'ACTIVO', 'SUSPENDIDO', 'FINALIZADO', 'CANCELADO') NOT NULL DEFAULT 'PLANIFICADO',
    `observaciones` TEXT NULL,
    `cerradoEn` DATETIME(3) NULL,
    `cerradoPorId` INTEGER NULL,
    `creadoPorId` INTEGER NOT NULL,
    `claveCicloActivo` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    UNIQUE INDEX `ciclo_produccion_claveCicloActivo_key`(`claveCicloActivo`),
    INDEX `ciclo_produccion_empresaId_estado_idx`(`empresaId`, `estado`),
    INDEX `ciclo_produccion_empresaId_fechaInicio_idx`(`empresaId`, `fechaInicio`),
    INDEX `ciclo_produccion_parcelaId_idx`(`parcelaId`),
    INDEX `ciclo_produccion_parcelaId_estado_idx`(`parcelaId`, `estado`),
    INDEX `ciclo_produccion_variedadId_idx`(`variedadId`),
    INDEX `ciclo_produccion_estado_idx`(`estado`),
    INDEX `ciclo_produccion_fechaInicio_idx`(`fechaInicio`),
    INDEX `ciclo_produccion_fechaFin_idx`(`fechaFin`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `actividad` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `cicloId` INTEGER NOT NULL,
    `tipoActividadId` INTEGER NOT NULL,
    `responsableId` INTEGER NULL,
    `creadoPorId` INTEGER NOT NULL,
    `fecha` DATE NOT NULL,
    `descripcion` VARCHAR(500) NULL,
    `horasTrabajadas` DECIMAL(6, 2) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    INDEX `actividad_cicloId_idx`(`cicloId`),
    INDEX `actividad_cicloId_fecha_idx`(`cicloId`, `fecha`),
    INDEX `actividad_tipoActividadId_idx`(`tipoActividadId`),
    INDEX `actividad_responsableId_idx`(`responsableId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `gasto` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `cicloId` INTEGER NOT NULL,
    `categoriaId` INTEGER NOT NULL,
    `proveedorId` INTEGER NULL,
    `actividadId` INTEGER NULL,
    `unidadId` INTEGER NULL,
    `creadoPorId` INTEGER NOT NULL,
    `fecha` DATE NOT NULL,
    `descripcion` VARCHAR(500) NULL,
    `cantidad` DECIMAL(12, 3) NOT NULL DEFAULT 1,
    `costoUnitario` DECIMAL(12, 2) NOT NULL,
    `impuesto` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `total` DECIMAL(12, 2) NOT NULL,
    `numeroComprobante` VARCHAR(60) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    INDEX `gasto_cicloId_idx`(`cicloId`),
    INDEX `gasto_cicloId_fecha_idx`(`cicloId`, `fecha`),
    INDEX `gasto_cicloId_categoriaId_idx`(`cicloId`, `categoriaId`),
    INDEX `gasto_categoriaId_idx`(`categoriaId`),
    INDEX `gasto_proveedorId_idx`(`proveedorId`),
    INDEX `gasto_actividadId_idx`(`actividadId`),
    INDEX `gasto_fecha_idx`(`fecha`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `cosecha` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `cicloId` INTEGER NOT NULL,
    `unidadId` INTEGER NOT NULL,
    `creadoPorId` INTEGER NOT NULL,
    `fecha` DATE NOT NULL,
    `cantidad` DECIMAL(12, 3) NOT NULL,
    `calidad` ENUM('EXTRA', 'PRIMERA', 'SEGUNDA', 'TERCERA', 'INDUSTRIAL') NOT NULL DEFAULT 'PRIMERA',
    `observaciones` VARCHAR(500) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    INDEX `cosecha_cicloId_idx`(`cicloId`),
    INDEX `cosecha_cicloId_fecha_idx`(`cicloId`, `fecha`),
    INDEX `cosecha_cicloId_calidad_idx`(`cicloId`, `calidad`),
    INDEX `cosecha_fecha_idx`(`fecha`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `venta` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `cicloId` INTEGER NOT NULL,
    `clienteId` INTEGER NOT NULL,
    `creadoPorId` INTEGER NOT NULL,
    `fecha` DATE NOT NULL,
    `numeroFactura` VARCHAR(60) NULL,
    `descuento` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `impuesto` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `total` DECIMAL(12, 2) NOT NULL,
    `fechaLimitePago` DATE NULL,
    `estado` ENUM('REGISTRADA', 'CANCELADA') NOT NULL DEFAULT 'REGISTRADA',
    `notas` VARCHAR(500) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    INDEX `venta_cicloId_idx`(`cicloId`),
    INDEX `venta_cicloId_fecha_idx`(`cicloId`, `fecha`),
    INDEX `venta_clienteId_idx`(`clienteId`),
    INDEX `venta_clienteId_fecha_idx`(`clienteId`, `fecha`),
    INDEX `venta_fecha_idx`(`fecha`),
    INDEX `venta_numeroFactura_idx`(`numeroFactura`),
    INDEX `venta_fechaLimitePago_idx`(`fechaLimitePago`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `detalle_venta` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `ventaId` INTEGER NOT NULL,
    `cosechaId` INTEGER NULL,
    `unidadId` INTEGER NOT NULL,
    `calidad` ENUM('EXTRA', 'PRIMERA', 'SEGUNDA', 'TERCERA', 'INDUSTRIAL') NOT NULL DEFAULT 'PRIMERA',
    `cantidad` DECIMAL(12, 3) NOT NULL,
    `precioUnitario` DECIMAL(12, 2) NOT NULL,

    INDEX `detalle_venta_ventaId_idx`(`ventaId`),
    INDEX `detalle_venta_cosechaId_idx`(`cosechaId`),
    INDEX `detalle_venta_unidadId_idx`(`unidadId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `cobro_venta` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `ventaId` INTEGER NOT NULL,
    `registradoPorId` INTEGER NOT NULL,
    `fecha` DATE NOT NULL,
    `monto` DECIMAL(12, 2) NOT NULL,
    `metodo` ENUM('EFECTIVO', 'TRANSFERENCIA', 'CHEQUE', 'TARJETA', 'OTRO') NOT NULL DEFAULT 'EFECTIVO',
    `referencia` VARCHAR(100) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `deletedAt` DATETIME(3) NULL,

    INDEX `cobro_venta_ventaId_idx`(`ventaId`),
    INDEX `cobro_venta_ventaId_fecha_idx`(`ventaId`, `fecha`),
    INDEX `cobro_venta_fecha_idx`(`fecha`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `merma` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `cicloId` INTEGER NOT NULL,
    `motivoId` INTEGER NOT NULL,
    `cosechaId` INTEGER NULL,
    `unidadId` INTEGER NOT NULL,
    `creadoPorId` INTEGER NOT NULL,
    `fecha` DATE NOT NULL,
    `cantidad` DECIMAL(12, 3) NOT NULL,
    `etapa` ENUM('CAMPO', 'POSCOSECHA', 'TRANSPORTE', 'ALMACEN') NOT NULL DEFAULT 'POSCOSECHA',
    `observaciones` VARCHAR(500) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    INDEX `merma_cicloId_idx`(`cicloId`),
    INDEX `merma_cicloId_fecha_idx`(`cicloId`, `fecha`),
    INDEX `merma_cicloId_etapa_idx`(`cicloId`, `etapa`),
    INDEX `merma_motivoId_idx`(`motivoId`),
    INDEX `merma_cosechaId_idx`(`cosechaId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `bitacora_auditoria` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `empresaId` INTEGER NOT NULL,
    `usuarioId` INTEGER NULL,
    `entidad` VARCHAR(60) NOT NULL,
    `entidadId` INTEGER NOT NULL,
    `accion` ENUM('CREAR', 'ACTUALIZAR', 'ELIMINAR', 'CERRAR_CICLO', 'REABRIR_CICLO', 'INICIO_SESION') NOT NULL,
    `valoresAnteriores` JSON NULL,
    `valoresNuevos` JSON NULL,
    `direccionIp` VARCHAR(45) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `bitacora_auditoria_empresaId_createdAt_idx`(`empresaId`, `createdAt`),
    INDEX `bitacora_auditoria_entidad_entidadId_idx`(`entidad`, `entidadId`),
    INDEX `bitacora_auditoria_usuarioId_idx`(`usuarioId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `adjunto` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `empresaId` INTEGER NOT NULL,
    `subidoPorId` INTEGER NOT NULL,
    `entidad` VARCHAR(60) NOT NULL,
    `entidadId` INTEGER NOT NULL,
    `nombreArchivo` VARCHAR(255) NOT NULL,
    `tipoMime` VARCHAR(100) NOT NULL,
    `tamanoBytes` INTEGER NOT NULL,
    `claveAlmacenamiento` VARCHAR(500) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `adjunto_empresaId_idx`(`empresaId`),
    INDEX `adjunto_entidad_entidadId_idx`(`entidad`, `entidadId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `empresa` ADD CONSTRAINT `empresa_planId_fkey` FOREIGN KEY (`planId`) REFERENCES `plan_suscripcion`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `rol_permiso` ADD CONSTRAINT `rol_permiso_rolId_fkey` FOREIGN KEY (`rolId`) REFERENCES `rol`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `rol_permiso` ADD CONSTRAINT `rol_permiso_permisoId_fkey` FOREIGN KEY (`permisoId`) REFERENCES `permiso`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `usuario` ADD CONSTRAINT `usuario_empresaId_fkey` FOREIGN KEY (`empresaId`) REFERENCES `empresa`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `usuario` ADD CONSTRAINT `usuario_rolId_fkey` FOREIGN KEY (`rolId`) REFERENCES `rol`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `refresh_token` ADD CONSTRAINT `refresh_token_usuarioId_fkey` FOREIGN KEY (`usuarioId`) REFERENCES `usuario`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `predio` ADD CONSTRAINT `predio_empresaId_fkey` FOREIGN KEY (`empresaId`) REFERENCES `empresa`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `parcela` ADD CONSTRAINT `parcela_predioId_fkey` FOREIGN KEY (`predioId`) REFERENCES `predio`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `parcela` ADD CONSTRAINT `parcela_tipoSueloId_fkey` FOREIGN KEY (`tipoSueloId`) REFERENCES `tipo_suelo`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `variedad` ADD CONSTRAINT `variedad_cultivoId_fkey` FOREIGN KEY (`cultivoId`) REFERENCES `cultivo`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `categoria_gasto` ADD CONSTRAINT `categoria_gasto_empresaId_fkey` FOREIGN KEY (`empresaId`) REFERENCES `empresa`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `categoria_gasto` ADD CONSTRAINT `categoria_gasto_categoriaPadreId_fkey` FOREIGN KEY (`categoriaPadreId`) REFERENCES `categoria_gasto`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `proveedor` ADD CONSTRAINT `proveedor_empresaId_fkey` FOREIGN KEY (`empresaId`) REFERENCES `empresa`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `cliente` ADD CONSTRAINT `cliente_empresaId_fkey` FOREIGN KEY (`empresaId`) REFERENCES `empresa`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ciclo_produccion` ADD CONSTRAINT `ciclo_produccion_empresaId_fkey` FOREIGN KEY (`empresaId`) REFERENCES `empresa`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ciclo_produccion` ADD CONSTRAINT `ciclo_produccion_parcelaId_fkey` FOREIGN KEY (`parcelaId`) REFERENCES `parcela`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `ciclo_produccion` ADD CONSTRAINT `ciclo_produccion_variedadId_fkey` FOREIGN KEY (`variedadId`) REFERENCES `variedad`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ciclo_produccion` ADD CONSTRAINT `ciclo_produccion_creadoPorId_fkey` FOREIGN KEY (`creadoPorId`) REFERENCES `usuario`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ciclo_produccion` ADD CONSTRAINT `ciclo_produccion_cerradoPorId_fkey` FOREIGN KEY (`cerradoPorId`) REFERENCES `usuario`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `actividad` ADD CONSTRAINT `actividad_cicloId_fkey` FOREIGN KEY (`cicloId`) REFERENCES `ciclo_produccion`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `actividad` ADD CONSTRAINT `actividad_tipoActividadId_fkey` FOREIGN KEY (`tipoActividadId`) REFERENCES `tipo_actividad`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `actividad` ADD CONSTRAINT `actividad_responsableId_fkey` FOREIGN KEY (`responsableId`) REFERENCES `usuario`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `actividad` ADD CONSTRAINT `actividad_creadoPorId_fkey` FOREIGN KEY (`creadoPorId`) REFERENCES `usuario`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `gasto` ADD CONSTRAINT `gasto_cicloId_fkey` FOREIGN KEY (`cicloId`) REFERENCES `ciclo_produccion`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `gasto` ADD CONSTRAINT `gasto_categoriaId_fkey` FOREIGN KEY (`categoriaId`) REFERENCES `categoria_gasto`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `gasto` ADD CONSTRAINT `gasto_proveedorId_fkey` FOREIGN KEY (`proveedorId`) REFERENCES `proveedor`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `gasto` ADD CONSTRAINT `gasto_actividadId_fkey` FOREIGN KEY (`actividadId`) REFERENCES `actividad`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `gasto` ADD CONSTRAINT `gasto_unidadId_fkey` FOREIGN KEY (`unidadId`) REFERENCES `unidad_medida`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `gasto` ADD CONSTRAINT `gasto_creadoPorId_fkey` FOREIGN KEY (`creadoPorId`) REFERENCES `usuario`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `cosecha` ADD CONSTRAINT `cosecha_cicloId_fkey` FOREIGN KEY (`cicloId`) REFERENCES `ciclo_produccion`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `cosecha` ADD CONSTRAINT `cosecha_unidadId_fkey` FOREIGN KEY (`unidadId`) REFERENCES `unidad_medida`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `cosecha` ADD CONSTRAINT `cosecha_creadoPorId_fkey` FOREIGN KEY (`creadoPorId`) REFERENCES `usuario`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `venta` ADD CONSTRAINT `venta_cicloId_fkey` FOREIGN KEY (`cicloId`) REFERENCES `ciclo_produccion`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `venta` ADD CONSTRAINT `venta_clienteId_fkey` FOREIGN KEY (`clienteId`) REFERENCES `cliente`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `venta` ADD CONSTRAINT `venta_creadoPorId_fkey` FOREIGN KEY (`creadoPorId`) REFERENCES `usuario`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `detalle_venta` ADD CONSTRAINT `detalle_venta_ventaId_fkey` FOREIGN KEY (`ventaId`) REFERENCES `venta`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `detalle_venta` ADD CONSTRAINT `detalle_venta_cosechaId_fkey` FOREIGN KEY (`cosechaId`) REFERENCES `cosecha`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `detalle_venta` ADD CONSTRAINT `detalle_venta_unidadId_fkey` FOREIGN KEY (`unidadId`) REFERENCES `unidad_medida`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `cobro_venta` ADD CONSTRAINT `cobro_venta_ventaId_fkey` FOREIGN KEY (`ventaId`) REFERENCES `venta`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `cobro_venta` ADD CONSTRAINT `cobro_venta_registradoPorId_fkey` FOREIGN KEY (`registradoPorId`) REFERENCES `usuario`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `merma` ADD CONSTRAINT `merma_cicloId_fkey` FOREIGN KEY (`cicloId`) REFERENCES `ciclo_produccion`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `merma` ADD CONSTRAINT `merma_motivoId_fkey` FOREIGN KEY (`motivoId`) REFERENCES `motivo_merma`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `merma` ADD CONSTRAINT `merma_cosechaId_fkey` FOREIGN KEY (`cosechaId`) REFERENCES `cosecha`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `merma` ADD CONSTRAINT `merma_unidadId_fkey` FOREIGN KEY (`unidadId`) REFERENCES `unidad_medida`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `merma` ADD CONSTRAINT `merma_creadoPorId_fkey` FOREIGN KEY (`creadoPorId`) REFERENCES `usuario`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `bitacora_auditoria` ADD CONSTRAINT `bitacora_auditoria_empresaId_fkey` FOREIGN KEY (`empresaId`) REFERENCES `empresa`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `bitacora_auditoria` ADD CONSTRAINT `bitacora_auditoria_usuarioId_fkey` FOREIGN KEY (`usuarioId`) REFERENCES `usuario`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `adjunto` ADD CONSTRAINT `adjunto_empresaId_fkey` FOREIGN KEY (`empresaId`) REFERENCES `empresa`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `adjunto` ADD CONSTRAINT `adjunto_subidoPorId_fkey` FOREIGN KEY (`subidoPorId`) REFERENCES `usuario`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
