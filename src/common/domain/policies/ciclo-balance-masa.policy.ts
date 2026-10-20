import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DomainError } from '../../errors/domain.error';
import { CodigoError } from '../../errors/codigos-error.enum';

export interface ValidarBalanceMasaParams {
  kgCosechados: Prisma.Decimal;
  kgMermaPoscosecha: Prisma.Decimal;
}

/**
 * Política de dominio pura para validar el balance de masa física de un ciclo (RN-031 / RN-032).
 * Regla: La sumatoria acumulada de mermas poscosecha (kg) no puede ser estrictamente mayor
 * a la sumatoria acumulada de cosechas (kg).
 * Las mermas en etapa CAMPO no descuentan de lo cosechado ni se limitan por esta política.
 */
@Injectable()
export class CicloBalanceMasaPolicy {
  assertBalanceValido(params: ValidarBalanceMasaParams): void {
    if (params.kgMermaPoscosecha.gt(params.kgCosechados)) {
      throw new DomainError(
        CodigoError.MERMA_EXCEDE_COSECHA,
        `La merma poscosecha acumulada (${params.kgMermaPoscosecha.toFixed(3)} kg) excede la producción cosechada total (${params.kgCosechados.toFixed(3)} kg) en el ciclo (RN-032)`,
        HttpStatus.CONFLICT,
      );
    }
  }
}
