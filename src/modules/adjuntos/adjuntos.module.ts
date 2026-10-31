import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PrismaModule } from '../../prisma/prisma.module';
import { CicloCapturaPolicy } from '../../common/domain/policies/ciclo-captura.policy';
import { RecordWindowValidator } from '../../common/domain/validators/record-window.validator';
import { AdjuntosController } from './adjuntos.controller';
import { AdjuntosService } from './services/adjuntos.service';
import { LocalStorageService } from './services/local-storage.service';
import { R2StorageService } from './services/r2-storage.service';
import { TokenDescargaService } from './services/token-descarga.service';
import {
  STORAGE_SERVICE,
  IStorageService,
} from './interfaces/storage-service.interface';

export function crearStorageService(
  configService: ConfigService,
): IStorageService {
  const driver = configService.get<string>('STORAGE_DRIVER');
  if (driver === 'r2') {
    return new R2StorageService(configService);
  }
  return new LocalStorageService(configService);
}

@Module({
  imports: [
    PrismaModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
      }),
    }),
  ],
  controllers: [AdjuntosController],
  providers: [
    AdjuntosService,
    TokenDescargaService,
    {
      provide: STORAGE_SERVICE,
      inject: [ConfigService],
      useFactory: crearStorageService,
    },
    CicloCapturaPolicy,
    RecordWindowValidator,
  ],
  exports: [AdjuntosService, STORAGE_SERVICE],
})
export class AdjuntosModule {}
