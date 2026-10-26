import { execSync } from 'child_process';
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
  n?: number;
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

export function ejecutarVerificacion(
  dbNameOverride?: string,
): VerificacionResumen {
  const connParams = parsearDatabaseUrl();
  const dbName = dbNameOverride || connParams.database;

  // Safeguard de seguridad: la verificación se ejecuta sobre bases de prueba
  if (!dbName.endsWith('_test') && !dbName.includes('test')) {
    throw new Error(
      `[SEGURIDAD] La verificación completa de base de datos solo está permitida sobre bases '_test'. Base objetivo: '${dbName}'`,
    );
  }

  const scriptSqlPath = path.resolve(__dirname, 'verificacion_db.sql');
  if (!fs.existsSync(scriptSqlPath)) {
    throw new Error(`No se encontró el script SQL en: ${scriptSqlPath}`);
  }

  const cmd = `mysql -u "${connParams.user}" ${connParams.password ? `-p"${connParams.password}"` : ''} -h "${connParams.host}" -P ${connParams.port} --default-character-set=utf8mb4 "${dbName}" -e "source ${scriptSqlPath.replace(/\\/g, '/')}"`;

  let stdout = '';
  try {
    stdout = execSync(cmd, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch (error: unknown) {
    const err = error as { stdout?: string; stderr?: string; message?: string };
    stdout = (err.stdout || '') + (err.stderr || '');
    if (!stdout.includes('Prueba\tEsperado\tObtenido\tResultado')) {
      throw new Error(`Fallo al ejecutar el script de verificación: ${err.message || String(error)}\n${stdout}`);
    }
  }

  // Parsear la salida de mysql
  const lineas = stdout.split('\n');
  const resultados: MetricaResultado[] = [];
  let capturando = false;

  for (const rawLinea of lineas) {
    const linea = rawLinea.trim();
    if (linea.startsWith('#\tPrueba\tEsperado\tObtenido\tResultado')) {
      capturando = true;
      continue;
    }
    if (capturando) {
      if (linea.startsWith('pruebas\tpruebas_fallidas') || linea === '') {
        capturando = false;
        continue;
      }
      const partes = linea.split('\t');
      if (partes.length >= 5) {
        const n = parseInt(partes[0], 10);
        const concepto = partes[1].trim();
        const esperado = parseFloat(partes[2]);
        const obtenido = parseFloat(partes[3]);
        const estado = partes[4].trim() === 'OK' ? 'OK' : 'FALLA';
        resultados.push({ n, concepto, esperado, obtenido, estado });
      }
    }
  }

  const fallidas = resultados.filter((r) => r.estado === 'FALLA').length;
  const exitosas = resultados.filter((r) => r.estado === 'OK').length;

  return {
    exitoTotal: fallidas === 0 && resultados.length > 0,
    totalMetricas: resultados.length,
    metricasExitosas: exitosas,
    metricasFallidas: fallidas,
    resultados,
  };
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

    const resumen = ejecutarVerificacion(targetDb);

    console.log(
      '\n| #  | Prueba / Concepto del Anexo D          | Esperado | Obtenido | Estado |',
    );
    console.log(
      '|----|----------------------------------------|:--------:|:--------:|:------:|',
    );
    resumen.resultados.forEach((r, idx) => {
      const num = String(idx + 1).padStart(2, '0');
      const concepto = r.concepto.length > 38 ? r.concepto.substring(0, 35) + '...' : r.concepto.padEnd(38, ' ');
      const esp = String(Math.round(r.esperado * 10000) / 10000).padStart(8, ' ');
      const obt = String(Math.round(r.obtenido * 10000) / 10000).padStart(8, ' ');
      const est = r.estado === 'OK' ? '  ✅ OK  ' : ' ❌ FALLA ';
      console.log(`| ${num} | ${concepto} | ${esp} | ${obt} |${est}|`);
    });
    console.log(
      '---------------------------------------------------------------\n',
    );

    if (resumen.exitoTotal) {
      console.log(
        `🎉 ÉXITO: Las ${resumen.totalMetricas} pruebas del Anexo D coinciden al 100% (cero fallas).\n`,
      );
      process.exit(0);
    } else {
      console.error(
        `❌ FALLA: Se detectaron ${resumen.metricasFallidas} discrepancias en el Anexo D.\n`,
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
