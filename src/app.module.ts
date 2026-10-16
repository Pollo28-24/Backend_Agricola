import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
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
import { envValidationSchema } from './config/env.validation';
import { JwtAuthGuard } from './modules/auth/guards/jwt-auth.guard';
import { AccesoVigenteGuard } from './common/guards/acceso-vigente.guard';
import { PermisosGuard } from './common/guards/permisos.guard';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: envValidationSchema,
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
  ],
  providers: [
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
export class AppModule {}

