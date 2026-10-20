import { HttpStatus, Injectable } from '@nestjs/common';
import { TipoUnidad } from '@prisma/client';
import { DomainError } from '../../errors/domain.error';
import { CodigoError } from '../../errors/codigos-error.enum';

export interface ValidarUnidadPesoParams {
  unidad: {
    id: number;
    codigo: string;
    nombre: string;
    tipo: TipoUnidad;
  };
}

/**
 * Política de dominio pura para validación de tipo de unidad en operaciones de volumen/masa física (RN-069).
 * Cosechas y mermas (y posteriormente renglones de venta física) exigen obligatoriamente
 * unidades de medida catalogadas bajo la familia 'PESO'.
 */
@Injectable()
export class UnidadPesoPolicy {
  assertUnidadEsDePeso(params: ValidarUnidadPesoParams): void {
    if (params.unidad.tipo !== TipoUnidad.PESO) {
      throw new DomainError(
        CodigoError.UNIDAD_NO_PESO,
        `La unidad de medida seleccionada (${params.unidad.codigo} - ${params.unidad.nombre}) es de tipo ${params.unidad.tipo}. Debe ser de tipo PESO para este registro (RN-069)`,
        HttpStatus.BAD_REQUEST,
      );
    }
  }
}
