import { HttpStatus, Injectable } from '@nestjs/common';
import { DomainError } from '../../../../common/errors/domain.error';
import { CodigoError } from '../../../../common/errors/codigos-error.enum';

export interface ValidarOwnershipActividadParams {
  empresaIdToken: number;
  ciclo: { id: number; empresaId: number } | null | undefined;
  tipoActividad: { id: number; activo: boolean } | null | undefined;
  responsable?: { id: number; empresaId: number; activo: boolean } | null;
}

/**
 * Validador de pertenencia y aislamiento multi-tenant para Actividades (RN-068).
 */
@Injectable()
export class ActividadOwnershipValidator {
  assertPertenenciaEmpresa(params: ValidarOwnershipActividadParams): void {
    // 1. Validar ciclo de producción
    if (!params.ciclo || params.ciclo.empresaId !== params.empresaIdToken) {
      throw new DomainError(
        CodigoError.RECURSO_NO_ENCONTRADO,
        'El ciclo de producción especificado no existe en su empresa (RN-068)',
        HttpStatus.NOT_FOUND,
      );
    }

    // 2. Validar tipo de actividad
    if (!params.tipoActividad) {
      throw new DomainError(
        CodigoError.RECURSO_NO_ENCONTRADO,
        'El tipo de actividad especificado no existe',
        HttpStatus.NOT_FOUND,
      );
    }
    if (!params.tipoActividad.activo) {
      throw new DomainError(
        CodigoError.CONFLICTO,
        'El tipo de actividad especificado se encuentra inactivo',
        HttpStatus.CONFLICT,
      );
    }

    // 3. Validar responsable opcional
    if (params.responsable !== undefined && params.responsable !== null) {
      if (params.responsable.empresaId !== params.empresaIdToken) {
        throw new DomainError(
          CodigoError.RECURSO_NO_ENCONTRADO,
          'El usuario responsable asignado no pertenece a su empresa (RN-068)',
          HttpStatus.NOT_FOUND,
        );
      }
      if (!params.responsable.activo) {
        throw new DomainError(
          CodigoError.CONFLICTO,
          'El usuario responsable asignado se encuentra inactivo',
          HttpStatus.CONFLICT,
        );
      }
    }
  }
}
