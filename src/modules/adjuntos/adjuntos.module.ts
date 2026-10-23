import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { CicloCapturaPolicy } from '../../common/domain/policies/ciclo-captura.policy';
import { RecordWindowValidator } from '../../common/domain/validators/record-window.validator';
import { AdjuntosController } from './adjuntos.controller';
import { AdjuntosService } from './services/adjuntos.service';
import { LocalStorageService } from './services/local-storage.service';
import { TokenDescargaService } from './services/token-descarga.service';
import { STORAGE_SERVICE } from './interfaces/storage-service.interface';

@Module({
  imports: [PrismaModule],
  controllers: [AdjuntosController],
  providers: [
    AdjuntosService,
    TokenDescargaService,
    LocalStorageService,
    {
      provide: STORAGE_SERVICE,
      useExisting: LocalStorageService,
    },
    CicloCapturaPolicy,
    RecordWindowValidator,
  ],
  exports: [AdjuntosService, STORAGE_SERVICE],
})
export class AdjuntosModule {}
