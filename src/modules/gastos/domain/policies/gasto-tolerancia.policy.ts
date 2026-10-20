import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DomainError } from '../../../../common/errors/domain.error';
import { CodigoError } from '../../../../common/errors/codigos-error.enum';
import { GASTO_CONSTANTS } from '../../constants/gasto.constants';

export interface ValidarToleranciaParams {
  total: Prisma.Decimal;
  cantidad?: Prisma.Decimal | null;
  costoUnitario?: Prisma.Decimal | null;
  impuesto?: Prisma.Decimal | null;
}

/**
 * Política de dominio pura para validación aritmética de comprobantes de gasto (RN-045).
 * Reglas:
 * 1. cantidad y costoUnitario deben venir ambos o ninguno. Si viene solo uno -> 400 Bad Request.
 * 2. Si vienen ambos: calcula |total - (cantidad * costoUnitario + impuesto)| <= 0.05.
 * 3. Si no viene impuesto, se asume 0.
 * 4. Toda la aritmética se ejecuta con Prisma.Decimal, sin conversión a number ni coma flotante.
 */
@Injectable()
export class GastoToleranciaPolicy {
  private readonly maxDiferencia = new Prisma.Decimal(
    GASTO_CONSTANTS.TOLERANCIA_IMPORTE,
  );

  assertToleranciaValida(params: ValidarToleranciaParams): void {
    const tieneCantidad =
      params.cantidad !== undefined && params.cantidad !== null;
    const tieneCosto =
      params.costoUnitario !== undefined && params.costoUnitario !== null;

    // Regla: cantidad y costoUnitario vienen ambos o ninguno
    if ((tieneCantidad && !tieneCosto) || (!tieneCantidad && tieneCosto)) {
      throw new DomainError(
        CodigoError.PETICION_INVALIDA,
        'La cantidad y el costo unitario deben proporcionarse ambos o ninguno (RN-045)',
        HttpStatus.BAD_REQUEST,
      );
    }

    // Si ninguno viene provisto, no hay desglose que validar contra el total
    if (!tieneCantidad && !tieneCosto) {
      return;
    }

    const cantidad = params.cantidad!;
    const costoUnitario = params.costoUnitario!;
    const impuesto = params.impuesto ?? new Prisma.Decimal(0);

    // subtotal = cantidad * costoUnitario
    const subtotal = cantidad.mul(costoUnitario);

    // calculado = subtotal + impuesto
    const totalCalculado = subtotal.add(impuesto);

    // diferencia = |total - totalCalculado|
    const diferencia = params.total.sub(totalCalculado).abs();

    if (diferencia.gt(this.maxDiferencia)) {
      throw new DomainError(
        CodigoError.TOTAL_NO_COINCIDE,
        `El total del gasto (${params.total.toString()}) no coincide con el cálculo del comprobante (${totalCalculado.toString()}). La diferencia máxima permitida es de ${this.maxDiferencia.toString()} (RN-045)`,
        HttpStatus.BAD_REQUEST,
      );
    }
  }
}
