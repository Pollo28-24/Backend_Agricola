import { Module } from '@nestjs/common';
import { CiclosController } from './ciclos.controller';
import { CiclosService } from './ciclos.service';
import { CicloTransitionValidator } from './validators/ciclo-transition.validator';

@Module({
  controllers: [CiclosController],
  providers: [CiclosService, CicloTransitionValidator],
  exports: [CiclosService, CicloTransitionValidator],
})
export class CiclosModule {}
