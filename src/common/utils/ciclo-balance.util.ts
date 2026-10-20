import { HttpStatus } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DomainError } from '../errors/domain.error';
import { CodigoError } from '../errors/codigos-error.enum';

export interface BloqueoCicloResult {
  id: number;
  empresaId: number;
  estado: string;
  fechaInicio: Date;
}

/**
 * Bloquea la fila del ciclo mediante SELECT ... FOR UPDATE en MySQL / MariaDB (Ajuste B1.a).
 * - Utiliza el nombre de tabla mapeado: 'ciclo_produccion'.
 * - Utiliza los nombres de columna físicos: 'empresa_id', 'deleted_at', 'fecha_inicio'.
 * - Filtra explícitamente por empresaId del token JWT y deletedAt IS NULL.
 * - Si no existe o no pertenece a la empresa, responde 404 RECURSO_NO_ENCONTRADO.
 */
export async function bloquearCicloParaCaptura(
  tx: Prisma.TransactionClient,
  cicloId: number,
  empresaId: number,
): Promise<BloqueoCicloResult> {
  const filas = await tx.$queryRaw<
    Array<{
      id: number;
      empresa_id: number;
      estado: string;
      fecha_inicio: Date;
    }>
  >(
    Prisma.sql`
      SELECT id, empresa_id, estado, fecha_inicio
      FROM ciclo_produccion
      WHERE id = ${cicloId}
        AND empresa_id = ${empresaId}
        AND deleted_at IS NULL
      LIMIT 1
      FOR UPDATE
    `,
  );

  if (!filas || filas.length === 0) {
    throw new DomainError(
      CodigoError.RECURSO_NO_ENCONTRADO,
      'Ciclo de producción no encontrado en su empresa (RN-068)',
      HttpStatus.NOT_FOUND,
    );
  }

  const fila = filas[0];
  return {
    id: fila.id,
    empresaId: fila.empresa_id,
    estado: fila.estado,
    fechaInicio: fila.fecha_inicio,
  };
}

export interface BalanceMasaResult {
  kgCosechados: Prisma.Decimal;
  kgMermaPoscosecha: Prisma.Decimal;
  kgNetosDisponibles: Prisma.Decimal;
  // Preparado para RN-027 cuando exista el módulo de Ventas:
  // kgVendidos: Prisma.Decimal;
}

/**
 * Calcula el balance acumulado de masa física en kilogramos dentro de la transacción (Ajuste B1.b).
 * Toda la aritmética se computa estrictamente en Prisma.Decimal utilizando factorABase.
 * - kgCosechados: sumatoria de cantidad * factorABase de cosechas activas (deletedAt IS NULL).
 * - kgMermaPoscosecha: sumatoria de mermas con etapa != 'CAMPO' y deletedAt IS NULL.
 */
export async function calcularBalanceMasaKg(
  tx: Prisma.TransactionClient,
  cicloId: number,
): Promise<BalanceMasaResult> {
  const [cosechas, mermas] = await Promise.all([
    tx.cosecha.findMany({
      where: { cicloId, deletedAt: null },
      select: {
        cantidad: true,
        unidad: { select: { factorABase: true } },
      },
    }),
    tx.merma.findMany({
      where: {
        cicloId,
        deletedAt: null,
        etapa: { not: 'CAMPO' },
      },
      select: {
        cantidad: true,
        unidad: { select: { factorABase: true } },
      },
    }),
  ]);

  let kgCosechados = new Prisma.Decimal(0);
  for (const c of cosechas) {
    const factor = c.unidad?.factorABase ?? new Prisma.Decimal(1);
    kgCosechados = kgCosechados.add(c.cantidad.mul(factor));
  }

  let kgMermaPoscosecha = new Prisma.Decimal(0);
  for (const m of mermas) {
    const factor = m.unidad?.factorABase ?? new Prisma.Decimal(1);
    kgMermaPoscosecha = kgMermaPoscosecha.add(m.cantidad.mul(factor));
  }

  const kgNetosDisponibles = kgCosechados.sub(kgMermaPoscosecha);

  return {
    kgCosechados,
    kgMermaPoscosecha,
    kgNetosDisponibles,
  };
}
