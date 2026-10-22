import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { IndicadoresService } from './services/indicadores.service';
import { CuentasPorCobrarService } from './services/cuentas-por-cobrar.service';
import { AlertasService } from './services/alertas.service';
import { ReportesController } from './reportes.controller';

@Module({
  imports: [PrismaModule],
  controllers: [ReportesController],
  providers: [IndicadoresService, CuentasPorCobrarService, AlertasService],
  exports: [IndicadoresService, CuentasPorCobrarService, AlertasService],
})
export class ReportesModule {}
