import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { CicloCapturaPolicy } from '../../common/domain/policies/ciclo-captura.policy';
import { RecordWindowValidator } from '../../common/domain/validators/record-window.validator';
import { UnidadPesoPolicy } from '../../common/domain/policies/unidad-peso.policy';
import { CicloBalanceMasaPolicy } from '../../common/domain/policies/ciclo-balance-masa.policy';
import { MermaCosechaPolicy } from './domain/policies/merma-cosecha.policy';
import { MermasService } from './mermas.service';
import { MermasController } from './mermas.controller';

@Module({
  imports: [PrismaModule],
  controllers: [MermasController],
  providers: [
    MermasService,
    CicloCapturaPolicy,
    RecordWindowValidator,
    UnidadPesoPolicy,
    CicloBalanceMasaPolicy,
    MermaCosechaPolicy,
  ],
  exports: [MermasService],
})
export class MermasModule {}
