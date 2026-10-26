import * as mariadb from 'mariadb';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

// Cargar entorno de pruebas o desarrollo
const envTestPath = path.resolve(__dirname, '../.env.test');
const envPath = path.resolve(__dirname, '../.env');
if (fs.existsSync(envTestPath)) {
  dotenv.config({ path: envTestPath });
} else if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

export interface MetricaResultado {
  concepto: string;
  esperado: number;
  obtenido: number;
  estado: 'OK' | 'FALLA';
  detalle?: string;
}

export interface VerificacionResumen {
  exitoTotal: boolean;
  totalMetricas: number;
  metricasExitosas: number;
  metricasFallidas: number;
  resultados: MetricaResultado[];
}

interface ConteoRow {
  total: number | bigint;
}

/**
 * Función pura que evalúa un conjunto de métricas esperadas vs obtenidas.
 * Usada para certificar el comportamiento y garantizar fallo (exit code 1) ante discrepancias.
 */
export function evaluarMetricasBd(
  metricas: Array<{ concepto: string; esperado: number; obtenido: number }>,
): VerificacionResumen {
  const resultados: MetricaResultado[] = metricas.map((m) => {
    const estado = m.obtenido === m.esperado ? 'OK' : 'FALLA';
    return {
      concepto: m.concepto,
      esperado: m.esperado,
      obtenido: m.obtenido,
      estado,
    };
  });

  const fallidas = resultados.filter((r) => r.estado === 'FALLA').length;
  const exitosas = resultados.filter((r) => r.estado === 'OK').length;

  return {
    exitoTotal: fallidas === 0,
    totalMetricas: resultados.length,
    metricasExitosas: exitosas,
    metricasFallidas: fallidas,
    resultados,
  };
}

export function parsearDatabaseUrl(rawUrl?: string): {
  database: string;
  host: string;
  port: number;
  user: string;
  password?: string;
} {
  const dbUrl = rawUrl || process.env.DATABASE_URL;
  if (!dbUrl) {
    throw new Error('DATABASE_URL no está definida en el entorno.');
  }
  const parsed = new URL(dbUrl);
  return {
    database: parsed.pathname.replace(/^\//, ''),
    host: parsed.hostname || 'localhost',
    port: parsed.port ? parseInt(parsed.port, 10) : 3306,
    user: decodeURIComponent(parsed.username || 'root'),
    password: decodeURIComponent(parsed.password || ''),
  };
}

export async function ejecutarVerificacion(
  dbNameOverride?: string,
): Promise<VerificacionResumen> {
  const connParams = parsearDatabaseUrl();
  const dbName = dbNameOverride || connParams.database;

  // Safeguard de seguridad: la verificación se ejecuta sobre bases de prueba
  if (!dbName.endsWith('_test') && !dbName.includes('test')) {
    throw new Error(
      `[SEGURIDAD] La verificación de base de datos solo está permitida sobre bases '_test'. Base objetivo: '${dbName}'`,
    );
  }

  const conn = await mariadb.createConnection({
    host: connParams.host,
    port: connParams.port,
    user: connParams.user,
    password: connParams.password,
    database: dbName,
    allowPublicKeyRetrieval: true,
  });

  try {
    // 1. Tablas Base (excluyendo _prisma_migrations)
    const rowsTablas: ConteoRow[] = await conn.query(
      `SELECT COUNT(*) AS total FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE' AND TABLE_NAME <> '_prisma_migrations';`,
      [dbName],
    );
    const totalTablas = Number(rowsTablas[0]?.total ?? 0);

    // 2. Claves Foráneas
    const rowsFks: ConteoRow[] = await conn.query(
      `SELECT COUNT(*) AS total FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA = ? AND REFERENCED_TABLE_NAME IS NOT NULL;`,
      [dbName],
    );
    const totalFks = Number(rowsFks[0]?.total ?? 0);

    // 3. Restricciones CHECK
    const rowsChecks: ConteoRow[] = await conn.query(
      `SELECT COUNT(*) AS total FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = ? AND CONSTRAINT_TYPE = 'CHECK';`,
      [dbName],
    );
    const totalChecks = Number(rowsChecks[0]?.total ?? 0);

    // 4. Vistas Analíticas
    const rowsVistas: ConteoRow[] = await conn.query(
      `SELECT COUNT(*) AS total FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'VIEW';`,
      [dbName],
    );
    const totalVistas = Number(rowsVistas[0]?.total ?? 0);

    // 5. Columnas STORED GENERATED
    const rowsStored: ConteoRow[] = await conn.query(
      `SELECT COUNT(*) AS total FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND EXTRA LIKE '%STORED GENERATED%';`,
      [dbName],
    );
    const totalStored = Number(rowsStored[0]?.total ?? 0);

    // 6. Roles
    const rowsRoles: ConteoRow[] = await conn.query(
      `SELECT COUNT(*) AS total FROM rol;`,
    );
    const totalRoles = Number(rowsRoles[0]?.total ?? 0);

    // 7. Permisos
    const rowsPermisos: ConteoRow[] = await conn.query(
      `SELECT COUNT(*) AS total FROM permiso;`,
    );
    const totalPermisos = Number(rowsPermisos[0]?.total ?? 0);

    // 8. Permisos ADMIN (19)
    const rowsAdmin: ConteoRow[] = await conn.query(
      `SELECT COUNT(rp.permisoId) AS total FROM rol r JOIN rol_permiso rp ON rp.rolId = r.id WHERE r.codigo = 'ADMIN';`,
    );
    const totalAdmin = Number(rowsAdmin[0]?.total ?? 0);

    // 9. Permisos CAPTURISTA (4)
    const rowsCapturista: ConteoRow[] = await conn.query(
      `SELECT COUNT(rp.permisoId) AS total FROM rol r JOIN rol_permiso rp ON rp.rolId = r.id WHERE r.codigo = 'CAPTURISTA';`,
    );
    const totalCapturista = Number(rowsCapturista[0]?.total ?? 0);

    // 10. Permisos CONTADOR (8)
    const rowsContador: ConteoRow[] = await conn.query(
      `SELECT COUNT(rp.permisoId) AS total FROM rol r JOIN rol_permiso rp ON rp.rolId = r.id WHERE r.codigo = 'CONTADOR';`,
    );
    const totalContador = Number(rowsContador[0]?.total ?? 0);

    // 11. Planes de suscripción (3)
    const rowsPlanes: ConteoRow[] = await conn.query(
      `SELECT COUNT(*) AS total FROM plan_suscripcion;`,
    );
    const totalPlanes = Number(rowsPlanes[0]?.total ?? 0);

    // Probar las 5 vistas para garantizar que ejecutan sin excepción
    const vistasLista = [
      'v_rentabilidad_ciclo',
      'v_costo_por_categoria',
      'v_costo_por_actividad',
      'v_merma_desglose',
      'v_comparativo_parcela',
    ];
    for (const v of vistasLista) {
      await conn.query(`SELECT COUNT(*) FROM \`${v}\`;`);
    }

    const metricasCapturadas = [
      {
        concepto: 'Tablas Base (sin _prisma_migrations)',
        esperado: 28,
        obtenido: totalTablas,
      },
      { concepto: 'Claves Foráneas (FK)', esperado: 49, obtenido: totalFks },
      {
        concepto: 'Restricciones CHECK (Integridad)',
        esperado: 19,
        obtenido: totalChecks,
      },
      {
        concepto: 'Vistas Analíticas de Indicadores',
        esperado: 5,
        obtenido: totalVistas,
      },
      {
        concepto: 'Columnas Generadas STORED',
        esperado: 2,
        obtenido: totalStored,
      },
      { concepto: 'Roles Predefinidos', esperado: 3, obtenido: totalRoles },
      {
        concepto: 'Permisos Atómicos del Sistema',
        esperado: 19,
        obtenido: totalPermisos,
      },
      {
        concepto: 'Permisos Asignados a Rol ADMIN',
        esperado: 19,
        obtenido: totalAdmin,
      },
      {
        concepto: 'Permisos Asignados a Rol CAPTURISTA',
        esperado: 4,
        obtenido: totalCapturista,
      },
      {
        concepto: 'Permisos Asignados a Rol CONTADOR',
        esperado: 8,
        obtenido: totalContador,
      },
      {
        concepto: 'Planes de Suscripción (Semilla)',
        esperado: 3,
        obtenido: totalPlanes,
      },
    ];

    return evaluarMetricasBd(metricasCapturadas);
  } finally {
    await conn.end();
  }
}

export async function main(): Promise<void> {
  try {
    const targetDb = process.argv[2];
    console.log(
      '\n===============================================================',
    );
    console.log(
      '🔍 VERIFICACIÓN DE BASE DE DATOS (ANEXO D / ESPECIFICACIÓN §3.25)',
    );
    console.log(
      '===============================================================',
    );

    const resumen = await ejecutarVerificacion(targetDb);

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
    console.log(
      '---------------------------------------------------------------\n',
    );

    if (resumen.exitoTotal) {
      console.log(
        `🎉 ÉXITO: Las ${resumen.totalMetricas} métricas estructurales y semánticas coinciden al 100%.\n`,
      );
      process.exit(0);
    } else {
      console.error(
        `❌ FALLA: Se detectaron ${resumen.metricasFallidas} discrepancias en la base de datos.\n`,
      );
      process.exit(1);
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`💥 ERROR CRÍTICO EN VERIFICADOR: ${msg}\n`);
    process.exit(1);
  }
}

if (require.main === module) {
  void main();
}
