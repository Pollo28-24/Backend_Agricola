-- AlterTable: agregar familiaId anulable para backfill seguro
ALTER TABLE `refresh_token` ADD COLUMN `familiaId` VARCHAR(60) NULL;

-- Backfill: cada token existente asume su propio jti como familia inicial
UPDATE `refresh_token` SET `familiaId` = `jti` WHERE `familiaId` IS NULL;

-- AlterTable: exigir NOT NULL tras backfill
ALTER TABLE `refresh_token` MODIFY COLUMN `familiaId` VARCHAR(60) NOT NULL;

-- CreateIndex
CREATE INDEX `refresh_token_familiaId_idx` ON `refresh_token`(`familiaId`);
