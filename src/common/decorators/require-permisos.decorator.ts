import { SetMetadata } from '@nestjs/common';

export const PERMISOS_KEY = 'permisos';

/**
 * Decorador para exigir uno o más permisos de la matriz 2.10.2 (RN-039).
 * Ejemplo: @RequirePermisos('ciclo:crear') o @RequirePermisos('gasto:crear', 'gasto:editar_todos')
 */
export const RequirePermisos = (...permisos: string[]) =>
  SetMetadata(PERMISOS_KEY, permisos);
