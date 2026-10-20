import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { CicloCapturaPolicy } from '../../common/domain/policies/ciclo-captura.policy';
import { RecordWindowValidator } from '../../common/domain/validators/record-window.validator';
import { UnidadPesoPolicy } from '../../common/domain/policies/unidad-peso.policy';
import { CicloBalanceMasaPolicy } from '../../common/domain/policies/ciclo-balance-masa.policy';
import { CosechaIntegridadPolicy } from './domain/policies/cosecha-integridad.policy';
import { CosechasService } from './cosechas.service';
import { CosechasController } from './cosechas.controller';

@Module({
  imports: [PrismaModule],
  controllers: [CosechasController],
  providers: [
    CosechasService,
    CicloCapturaPolicy,
    RecordWindowValidator,
    UnidadPesoPolicy,
    CicloBalanceMasaPolicy,
    CosechaIntegridadPolicy,
  ],
  exports: [CosechasService],
})
export class CosechasModule {}
