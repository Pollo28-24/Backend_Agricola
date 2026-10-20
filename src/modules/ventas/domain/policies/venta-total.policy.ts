import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CodigoError } from '../../../../common/errors/codigos-error.enum';
import { DomainError } from '../../../../common/errors/domain.error';
import { VENTA_CONSTANTS } from '../../constants/venta.constants';

export interface RenglonValidacionTotal {
  cantidad: Prisma.Decimal;
  precioUnitario: Prisma.Decimal;
}

export interface ValidarTotalVentaParams {
  total: Prisma.Decimal;
  descuento: Prisma.Decimal;
  impuesto: Prisma.Decimal;
  renglones: RenglonValidacionTotal[];
}

/**
 * Política de dominio pura para la cuadratura y validación del total de venta (RN-052 / RN-029 / RN-026).
 * Reglas:
 * 1. El total debe ser >= 0 (chk_venta_total).
 * 2. El descuento debe ser >= 0 (chk_venta_descuento).
 * 3. El impuesto debe ser >= 0 y <= total (chk_venta_impuesto y salvaguarda de ingreso no negativo).
 * 4. Cada renglón debe tener cantidad > 0 y precioUnitario > 0 (chk_detalle_cantidad y chk_detalle_precio).
 * 5. Cuadratura aritmética estricta en Prisma.Decimal:
 *    |total - (Σ (cantidad * precioUnitario) - descuento + impuesto)| <= 0.05
 */
@Injectable()
export class VentaTotalPolicy {
  assertTotalValido(params: ValidarTotalVentaParams): void {
    const total = params.total;
    const descuento = params.descuento ?? new Prisma.Decimal('0');
    const impuesto = params.impuesto ?? new Prisma.Decimal('0');
    const renglones = params.renglones;

    if (renglones.length === 0) {
      throw new DomainError(
        CodigoError.PETICION_INVALIDA,
        'La venta debe incluir al menos un renglón (RN-051)',
        HttpStatus.BAD_REQUEST,
      );
    }

    if (renglones.length > VENTA_CONSTANTS.MAX_RENGLONES) {
      throw new DomainError(
        CodigoError.PETICION_INVALIDA,
        `La venta no puede superar los ${VENTA_CONSTANTS.MAX_RENGLONES} renglones`,
        HttpStatus.BAD_REQUEST,
      );
    }

    if (total.isNegative()) {
      throw new DomainError(
        CodigoError.TOTAL_NO_COINCIDE,
        'El total de la venta no puede ser negativo (RN-052)',
        HttpStatus.BAD_REQUEST,
      );
    }

    if (descuento.isNegative()) {
      throw new DomainError(
        CodigoError.TOTAL_NO_COINCIDE,
        'El descuento de la venta no puede ser negativo (RN-052)',
        HttpStatus.BAD_REQUEST,
      );
    }

    if (impuesto.isNegative()) {
      throw new DomainError(
        CodigoError.TOTAL_NO_COINCIDE,
        'El impuesto de la venta no puede ser negativo (RN-052)',
        HttpStatus.BAD_REQUEST,
      );
    }

    if (impuesto.gt(total)) {
      throw new DomainError(
        CodigoError.TOTAL_NO_COINCIDE,
        'El impuesto no puede ser mayor al total facturado (el ingreso neto no puede ser negativo)',
        HttpStatus.BAD_REQUEST,
      );
    }

    let sumaRenglones = new Prisma.Decimal(0);
    for (const r of renglones) {
      if (r.cantidad.lte(0)) {
        throw new DomainError(
          CodigoError.PETICION_INVALIDA,
          'La cantidad de cada renglón debe ser estrictamente mayor a cero (RN-026)',
          HttpStatus.BAD_REQUEST,
        );
      }
      if (r.precioUnitario.lte(0)) {
        throw new DomainError(
          CodigoError.PETICION_INVALIDA,
          'El precio unitario de cada renglón debe ser estrictamente mayor a cero (RN-029)',
          HttpStatus.BAD_REQUEST,
        );
      }
      sumaRenglones = sumaRenglones.add(r.cantidad.mul(r.precioUnitario));
    }

    // Calculado = sumaRenglones - descuento + impuesto
    const totalCalculado = sumaRenglones.sub(descuento).add(impuesto);
    const diferencia = total.sub(totalCalculado).abs();
    const tolerancia = new Prisma.Decimal(VENTA_CONSTANTS.TOLERANCIA_TOTAL);

    if (diferencia.gt(tolerancia)) {
      throw new DomainError(
        CodigoError.TOTAL_NO_COINCIDE,
        `El total capturado ($${total.toFixed(2)}) difiere del total calculado ($${totalCalculado.toFixed(2)}) por más de la tolerancia permitida ($${tolerancia.toFixed(2)}) (RN-052)`,
        HttpStatus.BAD_REQUEST,
      );
    }
  }
}
