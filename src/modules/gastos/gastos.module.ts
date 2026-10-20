import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { CicloCapturaPolicy } from '../actividades/domain/policies/ciclo-captura.policy';
import { GastoToleranciaPolicy } from './domain/policies/gasto-tolerancia.policy';
import { GastoActividadPolicy } from './domain/policies/gasto-actividad.policy';
import { GastoWindowValidator } from './domain/validators/gasto-window.validator';
import { GastosService } from './gastos.service';
import { GastosController } from './gastos.controller';

@Module({
  imports: [PrismaModule],
  controllers: [GastosController],
  providers: [
    GastosService,
    CicloCapturaPolicy,
    GastoToleranciaPolicy,
    GastoActividadPolicy,
    GastoWindowValidator,
  ],
  exports: [GastosService],
})
export class GastosModule {}
