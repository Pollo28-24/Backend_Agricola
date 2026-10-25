import { Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';

export const ARGON2_MEMORY_COST = 19456; // 19 MiB (OWASP Password Storage Cheat Sheet)
export const ARGON2_TIME_COST = 2;
export const ARGON2_PARALLELISM = 1;

@Injectable()
export class PasswordService {
  private readonly memoryCost: number;
  private readonly timeCost: number;
  private readonly parallelism: number;

  constructor(@Optional() configService?: ConfigService) {
    this.memoryCost =
      configService?.get<number>('ARGON2_MEMORY_COST') ??
      (Number(process.env.ARGON2_MEMORY_COST) || ARGON2_MEMORY_COST);
    this.timeCost =
      configService?.get<number>('ARGON2_TIME_COST') ??
      (Number(process.env.ARGON2_TIME_COST) || ARGON2_TIME_COST);
    this.parallelism =
      configService?.get<number>('ARGON2_PARALLELISM') ??
      (Number(process.env.ARGON2_PARALLELISM) || ARGON2_PARALLELISM);
  }

  /**
   * Genera un hash seguro para la contraseña plana utilizando Argon2id (RN-040)
   */
  async hash(password: string): Promise<string> {
    return argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: this.memoryCost,
      timeCost: this.timeCost,
      parallelism: this.parallelism,
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
   * Determina si un hash almacenado requiere recálculo transparente en login.
   * Solo retorna true cuando el algoritmo no es argon2id o los parámetros del hash
   * son MÁS DÉBILES que los configurados actualmente (nunca degrada un hash más fuerte).
   */
  needsRehash(hash: string): boolean {
    if (!hash || !hash.startsWith('$argon2id$')) {
      return true;
    }
    const memMatch = /\bm=(\d+)\b/.exec(hash);
    const timeMatch = /\bt=(\d+)\b/.exec(hash);
    const parMatch = /\bp=(\d+)\b/.exec(hash);
    if (!memMatch || !timeMatch || !parMatch) {
      return true;
    }
    const m = Number(memMatch[1]);
    const t = Number(timeMatch[1]);
    const p = Number(parMatch[1]);
    if (!Number.isFinite(m) || !Number.isFinite(t) || !Number.isFinite(p)) {
      return true;
    }
    return m < this.memoryCost || t < this.timeCost || p < this.parallelism;
  }
}
