import { PrismaClient } from '@prisma/client';
import mariadb, { Connection } from 'mariadb';
import { assertDatabaseUrlEsValida } from './e2e-env';

export interface LockHolder {
  commit: () => Promise<void>;
  rollback: () => Promise<void>;
}

/**
 * Compuerta de Lock: Retiene un bloqueo exclusivo SELECT ... FOR UPDATE sobre un ciclo
 * usando una conexión nativa directa de MySQL/MariaDB en transacción explícita.
 */
export async function holdCicloLock(
  cicloId: number,
  mutateInsideTx?: (conn: Connection) => Promise<void>,
): Promise<LockHolder> {
  const dbParams = assertDatabaseUrlEsValida();
  const conn = await mariadb.createConnection({
    host: dbParams.host,
    port: dbParams.port,
    user: dbParams.user,
    password: dbParams.password,
    database: dbParams.database,
    allowPublicKeyRetrieval: true,
  });

  await conn.beginTransaction();

  // Tomar el lock exclusivo sobre la fila del ciclo
  await conn.query(
    'SELECT id, estado, fechaInicio, fechaFin, empresaId, deletedAt FROM ciclo_produccion WHERE id = ? FOR UPDATE',
    [cicloId],
  );

  if (mutateInsideTx) {
    await mutateInsideTx(conn);
  }

  return {
    commit: async () => {
      try {
        await conn.commit();
      } finally {
        await conn.end();
      }
    },
    rollback: async () => {
      try {
        await conn.rollback();
      } finally {
        await conn.end();
      }
    },
  };
}

/**
 * Espera activa con tope consultando information_schema.innodb_trx
 * hasta que exactamente 'n' o más transacciones estén en estado 'LOCK WAIT'.
 * Es el ÚNICO lugar donde se permite esperar por condición.
 */
export async function waitUntilBlocked(
  _prisma?: PrismaClient,
  minBlockedCount = 1,
  maxWaitMs = 5000,
): Promise<number> {
  const dbParams = assertDatabaseUrlEsValida();
  const conn = await mariadb.createConnection({
    host: dbParams.host,
    port: dbParams.port,
    user: dbParams.user,
    password: dbParams.password,
    database: dbParams.database,
    allowPublicKeyRetrieval: true,
  });

  const start = Date.now();
  const pollIntervalMs = 50;

  try {
    while (Date.now() - start < maxWaitMs) {
      // En MySQL 8.0, performance_schema.data_locks y information_schema.innodb_trx
      const [locksResult, trxResult] = await Promise.all([
        conn.query<Array<{ count: bigint | number }>>(
          "SELECT count(*) as count FROM performance_schema.data_locks WHERE LOCK_STATUS = 'WAITING'",
        ),
        conn.query<Array<{ count: bigint | number }>>(
          "SELECT count(*) as count FROM information_schema.innodb_trx WHERE trx_state = 'LOCK WAIT' OR trx_wait_started IS NOT NULL",
        ),
      ]);

      const waitingLocks = Number(locksResult[0]?.count ?? 0);
      const waitingTrx = Number(trxResult[0]?.count ?? 0);
      const totalWaiting = Math.max(waitingLocks, waitingTrx);

      if (totalWaiting >= minBlockedCount) {
        return totalWaiting;
      }

      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }

    const locksFinal = await conn.query<Array<{ count: bigint | number }>>(
      "SELECT count(*) as count FROM performance_schema.data_locks WHERE LOCK_STATUS = 'WAITING'",
    );

    return Number(locksFinal[0]?.count ?? 0);
  } finally {
    await conn.end();
  }
}
