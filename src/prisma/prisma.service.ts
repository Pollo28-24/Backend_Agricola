import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor(configService: ConfigService) {
    const databaseUrl = configService.get<string>('DATABASE_URL') || process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error('La variable de entorno DATABASE_URL no está configurada');
    }

    const dbUrl = new URL(databaseUrl);

    const adapter = new PrismaMariaDb({
      host: dbUrl.hostname,
      port: dbUrl.port ? Number(dbUrl.port) : 3306,
      user: dbUrl.username,
      password: dbUrl.password ? decodeURIComponent(dbUrl.password) : undefined,
      database: dbUrl.pathname.substring(1),
    });

    super({
      adapter,
    });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
