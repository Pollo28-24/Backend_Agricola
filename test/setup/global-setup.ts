import { execSync } from 'child_process';
import * as mariadb from 'mariadb';
import {
  loadTestEnv,
  assertDatabaseUrlEsValida,
  assertDatabaseRealEsDeTest,
  createE2ePrismaClient,
} from './e2e-env';
import { seedMultiempresaE2e } from './e2e-seed';

export default async function globalSetup(): Promise<void> {
  loadTestEnv();
  const dbParams = assertDatabaseUrlEsValida();

  console.log('\n======================================================');
  console.log('🚀 INICIANDO GLOBAL SETUP E2E (HITO 6B)');
  console.log(`🎯 Base de pruebas objetivo: ${dbParams.database}`);
  console.log(`🖥️  Host: ${dbParams.host}:${dbParams.port}`);
  console.log('======================================================\n');

  // 1. Conexión administrativa para recrear limpiamente la base de pruebas desde cero
  const adminConn = await mariadb.createConnection({
    host: dbParams.host,
    port: dbParams.port,
    user: dbParams.user,
    password: dbParams.password,
    allowPublicKeyRetrieval: true,
  });

  try {
    await adminConn.query(`DROP DATABASE IF EXISTS \`${dbParams.database}\``);
    await adminConn.query(
      `CREATE DATABASE \`${dbParams.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    );
  } finally {
    await adminConn.end();
  }

  // 2. Conexión con Prisma sobre la base recién creada y verificación del guard de 3 capas
  const prisma = createE2ePrismaClient();
  let dbInfo: { dbName: string; version: string; isMariaDb: boolean };

  try {
    await prisma.$connect();
    dbInfo = await assertDatabaseRealEsDeTest(prisma);
    console.log(
      `✅ Guard de 3 capas verificado con éxito sobre '${dbInfo.dbName}'`,
    );
    console.log(
      `📦 Motor de base de datos detectado: ${dbInfo.isMariaDb ? 'MariaDB' : 'MySQL nativo'} (Versión: ${dbInfo.version})`,
    );
  } finally {
    await prisma.$disconnect();
  }

  // 3. Ejecutar prisma migrate deploy en proceso hijo con env explícito
  console.log('🔄 Aplicando migraciones desde cero sobre la base limpia...');
  const envChild = {
    ...process.env,
    DATABASE_URL: `mysql://${dbParams.user}:${encodeURIComponent(dbParams.password ?? '')}@${dbParams.host}:${dbParams.port}/${dbParams.database}`,
  };

  execSync('npx prisma migrate deploy', {
    env: envChild,
    stdio: 'inherit',
  });

  // 4. Sembrar catálogos base (reutilizando lógica del seed principal)
  console.log('🌱 Sembrando datos base...');
  execSync('npx ts-node prisma/seed.ts', {
    env: envChild,
    stdio: 'inherit',
  });

  // 5. Sembrar entidades E2E de Empresa A y Empresa B
  const prismaSeed = createE2ePrismaClient();
  try {
    await prismaSeed.$connect();
    await assertDatabaseRealEsDeTest(prismaSeed);
    await seedMultiempresaE2e(prismaSeed);
    console.log('✅ Semilla multiempresa sembrada exitosamente.');
  } catch (err) {
    console.error('❌ ERROR EN SEED MULTIEMPRESA E2E:', err);
    throw err;
  } finally {
    await prismaSeed.$disconnect();
  }

  console.log('\n======================================================');
  console.log('🏁 GLOBAL SETUP E2E FINALIZADO CON ÉXITO');
  console.log('======================================================\n');
}
