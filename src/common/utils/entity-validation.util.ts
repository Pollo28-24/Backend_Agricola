import { HttpStatus } from '@nestjs/common';
import { CodigoError } from '../errors/codigos-error.enum';
import { DomainError } from '../errors/domain.error';

export class EntityValidationUtil {
  /**
   * Valida la existencia de una entidad en el contexto de negocio y multi-tenant.
   * Si la entidad es null o undefined, lanza un DomainError con código RECURSO_NO_ENCONTRADO (404).
   *
   * Utiliza la firma de aserción de TypeScript (`asserts entity is NonNullable<T>`)
   * para estrechar el tipo estáticamente sin requerir operadores no-nulos (!) o casteos manuales.
   *
   * @param entity Registro o entidad a evaluar
   * @param mensaje Mensaje descriptivo del error de negocio (opcional)
   */
  public static assertExists<T>(
    entity: T | null | undefined,
    mensaje: string = 'Recurso no encontrado',
  ): asserts entity is NonNullable<T> {
    if (!entity) {
      throw new DomainError(
        CodigoError.RECURSO_NO_ENCONTRADO,
        mensaje,
        HttpStatus.NOT_FOUND,
      );
    }
  }
}
