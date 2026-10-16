import { Module } from '@nestjs/common';
import { PrediosController } from './predios.controller';
import { ParcelasController } from './parcelas.controller';
import { EstructuraService } from './estructura.service';

@Module({
  controllers: [PrediosController, ParcelasController],
  providers: [EstructuraService],
  exports: [EstructuraService],
})
export class EstructuraModule {}
