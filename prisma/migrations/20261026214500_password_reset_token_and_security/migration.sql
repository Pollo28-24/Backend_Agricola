-- AlterTable
ALTER TABLE `usuario` ADD COLUMN `cambioContrasenaEn` DATETIME(3) NULL;

-- AlterTable
ALTER TABLE `bitacora_auditoria` MODIFY COLUMN `accion` ENUM('CREAR', 'ACTUALIZAR', 'ELIMINAR', 'CERRAR_CICLO', 'REABRIR_CICLO', 'INICIO_SESION', 'CAMBIO_CONTRASENA', 'RESTABLECIMIENTO_CONTRASENA') NOT NULL;

-- CreateTable
CREATE TABLE `password_reset_token` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `usuarioId` INTEGER NOT NULL,
    `tokenHash` VARCHAR(64) NOT NULL,
    `expiraEn` DATETIME(3) NOT NULL,
    `usadoEn` DATETIME(3) NULL,
    `revocadoEn` DATETIME(3) NULL,
    `ipSolicitud` VARCHAR(45) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `password_reset_token_tokenHash_key`(`tokenHash`),
    INDEX `password_reset_token_usuarioId_expiraEn_idx`(`usuarioId`, `expiraEn`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `password_reset_token` ADD CONSTRAINT `password_reset_token_usuarioId_fkey` FOREIGN KEY (`usuarioId`) REFERENCES `usuario`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
