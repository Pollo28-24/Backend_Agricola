import { Module } from '@nestjs/common';
import { CobrosController } from './cobros.controller';
import { CobrosService } from './cobros.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { CicloCapturaPolicy } from '../../common/domain/policies/ciclo-captura.policy';

@Module({
  imports: [PrismaModule],
  controllers: [CobrosController],
  providers: [CobrosService, CicloCapturaPolicy],
  exports: [CobrosService],
})
export class CobrosModule {}
