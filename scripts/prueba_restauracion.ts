import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as mariadb from 'mariadb';
import { ejecutarVerificacion, parsearDatabaseUrl } from './db-verify';
import { permitirRecuperacionClavePublica } from '../src/config/database-security.config';

export async function ejecutarPruebaRestauracion(): Promise<void> {
  const connParams = parsearDatabaseUrl();
  const dumpFilePath = path.resolve(__dirname, 'dump_test.sql');
  const cnfFilePath = path.resolve(__dirname, '.my_temp.cnf');
  const restoreDbName = 'rentabilidad_agricola_restore_test';

  console.log(
    '\n===============================================================',
  );
  console.log('🔄 PRUEBA OPERATIVA DE RESPALDO Y RESTAURACIÓN REAL (§3.24)');
  console.log(
    '===============================================================',
  );

  // 1. Crear archivo de credenciales seguro (sin password en argv/ps)
  const cnfContent = `[client]\nuser=${connParams.user}\npassword=${connParams.password}\n`;
  fs.writeFileSync(cnfFilePath, cnfContent, { encoding: 'utf-8', mode: 0o600 });

  const adminConn = await mariadb.createConnection({
    host: connParams.host,
    port: connParams.port,
    user: connParams.user,
    password: connParams.password,
    allowPublicKeyRetrieval: permitirRecuperacionClavePublica(),
  });

  try {
    // 2. Ejecutar mysqldump con flags canónicos de consistencia
    console.log(
      `📦 1. Generando respaldo de '${connParams.database}' con mysqldump...`,
    );
    const dumpCmd = `mysqldump --defaults-extra-file="${cnfFilePath}" --host=${connParams.host} --port=${connParams.port} --single-transaction --routines --triggers --events "${connParams.database}" > "${dumpFilePath}"`;
    execSync(dumpCmd, { stdio: 'inherit', shell: 'cmd.exe' });

    const stats = fs.statSync(dumpFilePath);
    console.log(
      `✅ Respaldo generado con éxito: ${(stats.size / 1024).toFixed(2)} KB en ${dumpFilePath}`,
    );

    // 3. Crear base de datos de restauración aislada
    console.log(`🏗️  2. Creando base de datos temporal '${restoreDbName}'...`);
    await adminConn.query(`DROP DATABASE IF EXISTS \`${restoreDbName}\`;`);
    await adminConn.query(
      `CREATE DATABASE \`${restoreDbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`,
    );

    // 4. Restaurar el dump mediante mysql client
    console.log(`📥 3. Restaurando respaldo en '${restoreDbName}'...`);
    const restoreCmd = `mysql --defaults-extra-file="${cnfFilePath}" --host=${connParams.host} --port=${connParams.port} "${restoreDbName}" < "${dumpFilePath}"`;
    execSync(restoreCmd, { stdio: 'inherit', shell: 'cmd.exe' });
    console.log(`✅ Restauración completada exitosamente.`);

    // 5. Ejecutar verificación de integridad sobre la base restaurada
    console.log(
      `🔍 4. Ejecutando verificación estructural y semántica sobre '${restoreDbName}'...`,
    );
    const resumen = await ejecutarVerificacion(restoreDbName);

    console.log(
      '\n| #  | Concepto Estructural / Semántico        | Esperado | Obtenido | Estado |',
    );
    console.log(
      '|----|------------------------------------------|:--------:|:--------:|:------:|',
    );
    resumen.resultados.forEach((r, idx) => {
      const num = String(idx + 1).padStart(2, '0');
      const concepto = r.concepto.padEnd(40, ' ');
      const esp = String(r.esperado).padStart(8, ' ');
      const obt = String(r.obtenido).padStart(8, ' ');
      const est = r.estado === 'OK' ? '  ✅ OK  ' : ' ❌ FALLA ';
      console.log(`| ${num} | ${concepto} | ${esp} | ${obt} |${est}|`);
    });

    if (!resumen.exitoTotal) {
      throw new Error(
        `La base de datos restaurada presenta discrepancias estructurales.`,
      );
    }

    console.log(
      `\n🎉 ÉXITO: La base restaurada '${restoreDbName}' es 100% idéntica y consistente.\n`,
    );
  } finally {
    // 6. Limpieza integral de artefactos temporales y base temporal
    console.log('🧹 5. Limpiando base temporal y archivos de respaldo...');
    await adminConn.query(`DROP DATABASE IF EXISTS \`${restoreDbName}\`;`);
    await adminConn.end();

    if (fs.existsSync(dumpFilePath)) {
      fs.unlinkSync(dumpFilePath);
    }
    if (fs.existsSync(cnfFilePath)) {
      fs.unlinkSync(cnfFilePath);
    }
    console.log('✅ Entorno limpio y seguro.');
  }
}

if (require.main === module) {
  void ejecutarPruebaRestauracion();
}
