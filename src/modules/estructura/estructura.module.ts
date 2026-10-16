import { Module } from '@nestjs/common';
import { PrediosController } from './predios.controller';
import { ParcelasController } from './parcelas.controller';
import { PrediosService } from './predios.service';
import { ParcelasService } from './parcelas.service';

@Module({
  controllers: [PrediosController, ParcelasController],
  providers: [PrediosService, ParcelasService],
  exports: [PrediosService, ParcelasService],
})
export class EstructuraModule {}
