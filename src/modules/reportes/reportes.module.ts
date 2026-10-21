import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { IndicadoresService } from './services/indicadores.service';
import { ReportesController } from './reportes.controller';

@Module({
  imports: [PrismaModule],
  controllers: [ReportesController],
  providers: [IndicadoresService],
  exports: [IndicadoresService],
})
export class ReportesModule {}
