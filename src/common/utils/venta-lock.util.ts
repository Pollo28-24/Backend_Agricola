import { HttpStatus } from '@nestjs/common';
import { EstadoVenta, Prisma } from '@prisma/client';
import { DomainError } from '../errors/domain.error';
import { CodigoError } from '../errors/codigos-error.enum';

export interface VentaBloqueada {
  id: number;
  cicloId: number;
  clienteId: number;
  total: Prisma.Decimal;
  estado: EstadoVenta;
  fechaLimitePago: Date | null;
  fecha: Date;
}

interface RawVentaLockRow {
  id: number | string;
  cicloId: number | string;
  clienteId: number | string;
  total: string | number | Prisma.Decimal;
  estado: string;
  fechaLimitePago: string | Date | null;
  fecha: string | Date;
}

/**
 * Bloquea pesimistamente la fila de la venta con FOR UPDATE (RN-071),
 * validando aislamiento multiempresa por ciclo y borrado lógico de venta y ciclo.
 */
export async function bloquearVentaParaModificacion(
  tx: Prisma.TransactionClient,
  ventaId: number,
  empresaId: number,
): Promise<VentaBloqueada> {
  const rows = await tx.$queryRaw<RawVentaLockRow[]>(
    Prisma.sql`
      SELECT v.id, v.cicloId, v.clienteId, v.total, v.estado, v.fechaLimitePago, v.fecha
      FROM venta v
      INNER JOIN ciclo_produccion c ON v.cicloId = c.id
      WHERE v.id = ${ventaId}
        AND c.empresaId = ${empresaId}
        AND v.deletedAt IS NULL
        AND c.deletedAt IS NULL
      FOR UPDATE
    `,
  );

  if (!rows || rows.length === 0) {
    throw new DomainError(
      CodigoError.RECURSO_NO_ENCONTRADO,
      'Venta no encontrada',
      HttpStatus.NOT_FOUND,
    );
  }

  const r = rows[0];
  return {
    id: Number(r.id),
    cicloId: r.cicloId !== undefined ? Number(r.cicloId) : 0,
    clienteId: r.clienteId !== undefined ? Number(r.clienteId) : 0,
    total:
      r.total !== undefined && r.total !== null
        ? new Prisma.Decimal(r.total.toString())
        : new Prisma.Decimal('0.00'),
    estado: (r.estado as EstadoVenta) ?? EstadoVenta.REGISTRADA,
    fechaLimitePago: r.fechaLimitePago ? new Date(r.fechaLimitePago) : null,
    fecha: r.fecha ? new Date(r.fecha) : new Date(),
  };
}
