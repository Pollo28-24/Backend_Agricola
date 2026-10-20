import { Module } from '@nestjs/common';
import { VentasController } from './ventas.controller';
import { VentasService } from './ventas.service';
import { VentaTotalPolicy } from './domain/policies/venta-total.policy';
import { CicloCapturaPolicy } from '../../common/domain/policies/ciclo-captura.policy';
import { UnidadPesoPolicy } from '../../common/domain/policies/unidad-peso.policy';
import { CicloBalanceMasaPolicy } from '../../common/domain/policies/ciclo-balance-masa.policy';

@Module({
  controllers: [VentasController],
  providers: [
    VentasService,
    VentaTotalPolicy,
    CicloCapturaPolicy,
    UnidadPesoPolicy,
    CicloBalanceMasaPolicy,
  ],
  exports: [VentasService],
})
export class VentasModule {}
