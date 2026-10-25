import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { ClsModule } from 'nestjs-cls';
import { Request } from 'express';
import { PrismaModule } from './prisma/prisma.module';
import { HealthModule } from './modules/health/health.module';
import { AuthModule } from './modules/auth/auth.module';
import { EmpresasModule } from './modules/empresas/empresas.module';
import { UsuariosModule } from './modules/usuarios/usuarios.module';
import { AuditoriaModule } from './modules/auditoria/auditoria.module';
import { CatalogosModule } from './modules/catalogos/catalogos.module';
import { EstructuraModule } from './modules/estructura/estructura.module';
import { TercerosModule } from './modules/terceros/terceros.module';
import { CiclosModule } from './modules/ciclos/ciclos.module';
import { ActividadesModule } from './modules/actividades/actividades.module';
import { GastosModule } from './modules/gastos/gastos.module';
import { CosechasModule } from './modules/cosechas/cosechas.module';
import { MermasModule } from './modules/mermas/mermas.module';
import { VentasModule } from './modules/ventas/ventas.module';
import { CobrosModule } from './modules/cobros/cobros.module';
import { ReportesModule } from './modules/reportes/reportes.module';
import { AdjuntosModule } from './modules/adjuntos/adjuntos.module';
import { ExportacionModule } from './modules/exportacion/exportacion.module';
import { envValidationSchema } from './config/env.validation';
import {
  AppThrottlerGuard,
  crearThrottlerOptions,
} from './modules/auth/guards/app-throttler.guard';
import { JwtAuthGuard } from './modules/auth/guards/jwt-auth.guard';
import { AccesoVigenteGuard } from './common/guards/acceso-vigente.guard';
import { PermisosGuard } from './common/guards/permisos.guard';
import { CorrelationIdMiddleware } from './common/middleware/correlation-id.middleware';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: envValidationSchema,
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        crearThrottlerOptions({
          enabled: config.get<boolean>('THROTTLE_ENABLED', true),
          defaultLimit: config.get<number>('THROTTLE_DEFAULT_LIMIT', 300),
          defaultTtlMs: config.get<number>('THROTTLE_DEFAULT_TTL_MS', 60_000),
          loginIpLimit: config.get<number>('THROTTLE_LOGIN_IP_LIMIT', 10),
          loginIpTtlMs: config.get<number>('THROTTLE_DEFAULT_TTL_MS', 60_000),
          loginCorreoLimit: config.get<number>(
            'THROTTLE_LOGIN_CORREO_LIMIT',
            5,
          ),
          loginCorreoTtlMs: config.get<number>(
            'THROTTLE_DEFAULT_TTL_MS',
            60_000,
          ),
          loginCorreoBlockDurationMs: config.get<number>(
            'THROTTLE_LOGIN_BLOCK_MS',
            900_000,
          ),
        }),
    }),
    ClsModule.forRoot({
      global: true,
      middleware: {
        mount: true,
        setup: (cls, req: Request) => {
          cls.set('ip', req.ip || req.socket.remoteAddress || undefined);
        },
      },
    }),
    PrismaModule,
    HealthModule,
    AuthModule,
    EmpresasModule,
    UsuariosModule,
    AuditoriaModule,
    CatalogosModule,
    EstructuraModule,
    TercerosModule,
    CiclosModule,
    ActividadesModule,
    GastosModule,
    CosechasModule,
    MermasModule,
    VentasModule,
    CobrosModule,
    ReportesModule,
    AdjuntosModule,
    ExportacionModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: AppThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: AccesoVigenteGuard,
    },
    {
      provide: APP_GUARD,
      useClass: PermisosGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CorrelationIdMiddleware).forRoutes('*');
  }
}
