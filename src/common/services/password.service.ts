import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';

export const ARGON2_MEMORY_COST = 19456; // 19 MiB (OWASP)
export const ARGON2_TIME_COST = 2;
export const ARGON2_PARALLELISM = 1;

@Injectable()
export class PasswordService {
  /**
   * Genera un hash seguro para la contraseña plana utilizando Argon2id (RN-040)
   */
  async hash(password: string): Promise<string> {
    return argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: ARGON2_MEMORY_COST,
      timeCost: ARGON2_TIME_COST,
      parallelism: ARGON2_PARALLELISM,
    });
  }

  /**
   * Verifica si la contraseña plana coincide con el hash almacenado
   */
  async verify(hash: string, plain: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, plain);
    } catch {
      return false;
    }
  }

  /**
   * Determina si un hash almacenado requiere recálculo transparente en login
   * por utilizar parámetros distintos a los vigentes (argon2id, m=19456, t=2, p=1).
   */
  needsRehash(hash: string): boolean {
    if (!hash || !hash.startsWith('$argon2id$')) {
      return true;
    }
    const hasMemory = /\bm=19456\b/.test(hash);
    const hasTime = /\bt=2\b/.test(hash);
    const hasParallelism = /\bp=1\b/.test(hash);
    if (!hasMemory || !hasTime || !hasParallelism) {
      return true;
    }
    if (typeof argon2.needsRehash === 'function') {
      try {
        return argon2.needsRehash(hash, {
          memoryCost: ARGON2_MEMORY_COST,
          timeCost: ARGON2_TIME_COST,
          parallelism: ARGON2_PARALLELISM,
        });
      } catch {
        return false;
      }
    }
    return false;
  }
}
