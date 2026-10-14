import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient  
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    const dbUrl = new URL(process.env.DATABASE_URL!);

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
