import { Module } from '@nestjs/common';
import { ActividadesController } from './actividades.controller';
import { ActividadesService } from './actividades.service';
import { CicloCapturaPolicy } from './domain/policies/ciclo-captura.policy';
import { ActividadWindowValidator } from './domain/validators/actividad-window.validator';
import { ActividadOwnershipValidator } from './domain/validators/actividad-ownership.validator';

@Module({
  controllers: [ActividadesController],
  providers: [
    ActividadesService,
    CicloCapturaPolicy,
    ActividadWindowValidator,
    ActividadOwnershipValidator,
  ],
  exports: [ActividadesService, CicloCapturaPolicy],
})
export class ActividadesModule {}
