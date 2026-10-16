import { HttpStatus } from '@nestjs/common';
import { EntityValidationUtil } from './entity-validation.util';
import { DomainError } from '../errors/domain.error';
import { CodigoError } from '../errors/codigos-error.enum';

describe('EntityValidationUtil', () => {
  it('no debe lanzar excepción si la entidad es un objeto válido', () => {
    const entidad: { id: number; nombre: string } | null = {
      id: 1,
      nombre: 'Predio A',
    };
    expect(() =>
      EntityValidationUtil.assertExists(entidad, 'Predio no encontrado'),
    ).not.toThrow();
    // Verificación de inferencia TypeScript
    expect(entidad.nombre).toBe('Predio A');
  });

  it('no debe lanzar excepción con primitivos verídicos o arrays', () => {
    expect(() => EntityValidationUtil.assertExists(123)).not.toThrow();
    expect(() => EntityValidationUtil.assertExists('texto')).not.toThrow();
    expect(() => EntityValidationUtil.assertExists([])).not.toThrow();
  });

  it('debe lanzar DomainError con 404 si la entidad es null', () => {
    expect(() =>
      EntityValidationUtil.assertExists(null, 'Registro no encontrado'),
    ).toThrow(DomainError);

    try {
      EntityValidationUtil.assertExists(null, 'Registro no encontrado');
    } catch (error: any) {
      expect(error).toBeInstanceOf(DomainError);
      expect(error.code).toBe(CodigoError.RECURSO_NO_ENCONTRADO);
      expect(error.getStatus()).toBe(HttpStatus.NOT_FOUND);
      expect(error.message).toBe('Registro no encontrado');
    }
  });

  it('debe lanzar DomainError con 404 si la entidad es undefined', () => {
    expect(() =>
      EntityValidationUtil.assertExists(undefined, 'Usuario no encontrado'),
    ).toThrow(DomainError);

    try {
      EntityValidationUtil.assertExists(undefined, 'Usuario no encontrado');
    } catch (error: any) {
      expect(error).toBeInstanceOf(DomainError);
      expect(error.code).toBe(CodigoError.RECURSO_NO_ENCONTRADO);
      expect(error.getStatus()).toBe(HttpStatus.NOT_FOUND);
      expect(error.message).toBe('Usuario no encontrado');
    }
  });

  it('debe usar el mensaje por defecto si no se especifica uno personalizado', () => {
    try {
      EntityValidationUtil.assertExists(null);
    } catch (error: any) {
      expect(error.message).toBe('Recurso no encontrado');
      expect(error.code).toBe(CodigoError.RECURSO_NO_ENCONTRADO);
      expect(error.getStatus()).toBe(HttpStatus.NOT_FOUND);
    }
  });
});
