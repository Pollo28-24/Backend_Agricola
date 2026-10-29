import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';

export function loadTestEnv(): void {
  const envTestPath = path.resolve(__dirname, '../../.env.test');
  if (fs.existsSync(envTestPath)) {
    const content = fs.readFileSync(envTestPath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx > 0) {
        const key = trimmed.substring(0, eqIdx).trim();
        let val = trimmed.substring(eqIdx + 1).trim();
        if (
          (val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'"))
        ) {
          val = val.substring(1, val.length - 1);
        }
        process.env[key] = val;
      }
    }
  }

  process.env.NODE_ENV = 'test';
  process.env.MAIL_TRANSPORT = 'memory';
  if (process.env.THROTTLE_ENABLED === undefined) {
    process.env.THROTTLE_ENABLED = 'false';
  }
}

loadTestEnv();

export function assertDatabaseUrlEsValida(rawUrl?: string): {
  database: string;
  host: string;
  port: number;
  user: string;
  password?: string;
} {
  const dbUrlString = rawUrl || process.env.DATABASE_URL;
  if (!dbUrlString) {
    throw new Error('CRITICAL [Guard Capa A]: DATABASE_URL no está definida.');
  }

  const url = new URL(dbUrlString);
  const host = url.hostname;
  const dbName = url.pathname.replace(/^\//, '');

  const hostsPermitidos = ['localhost', '127.0.0.1', '::1'];
  if (!hostsPermitidos.includes(host)) {
    throw new Error(
      `CRITICAL [Guard Capa A]: Host '${host}' no permitido para pruebas E2E. Solo se permite localhost/127.0.0.1.`,
    );
  }

  if (dbName !== 'rentabilidad_agricola_test') {
    throw new Error(
      `CRITICAL [Guard Capa A]: Intento de conectar a BD '${dbName}'. Solo se permite 'rentabilidad_agricola_test'.`,
    );
  }

  return {
    database: dbName,
    host,
    port: url.port ? Number(url.port) : 3306,
    user: url.username,
    password: url.password ? decodeURIComponent(url.password) : undefined,
  };
}

export async function assertDatabaseRealEsDeTest(
  prismaOrAdapter: PrismaClient,
): Promise<{ dbName: string; version: string; isMariaDb: boolean }> {
  // Capa A: comprobar la URL primero
  assertDatabaseUrlEsValida();

  // Capa B: SELECT DATABASE() y SELECT VERSION() sobre la conexión real
  const [dbResult, versionResult] = await Promise.all([
    prismaOrAdapter.$queryRawUnsafe<Array<{ db: string }>>(
      'SELECT DATABASE() as db',
    ),
    prismaOrAdapter.$queryRawUnsafe<Array<{ v: string }>>(
      'SELECT VERSION() as v',
    ),
  ]);

  const currentDb = dbResult[0]?.db;
  const version = versionResult[0]?.v ?? 'unknown';
  const isMariaDb = version.toLowerCase().includes('mariadb');

  // Capa C: abortar terminantemente si la BD activa no es rentabilidad_agricola_test
  if (currentDb !== 'rentabilidad_agricola_test') {
    throw new Error(
      `CRITICAL [Guard Capa C]: La conexión activa de MySQL/MariaDB está conectada a '${currentDb}'. ¡ABORTANDO INMEDIATAMENTE PARA PROTEGER LA BASE PRINCIPAL!`,
    );
  }

  return {
    dbName: currentDb,
    version,
    isMariaDb,
  };
}

export function createE2ePrismaClient(): PrismaClient {
  const params = assertDatabaseUrlEsValida();
  const adapter = new PrismaMariaDb({
    host: params.host,
    port: params.port,
    user: params.user,
    password: params.password,
    database: params.database,
    connectionLimit: 25,
    allowPublicKeyRetrieval: true,
  });

  return new PrismaClient({ adapter });
}
