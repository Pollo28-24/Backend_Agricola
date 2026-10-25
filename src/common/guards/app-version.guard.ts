import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpStatus,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { DomainError } from '../errors/domain.error';
import { CodigoError } from '../errors/codigos-error.enum';

export const SEMVER_REGEX =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;

export interface SemVerComponents {
  major: number;
  minor: number;
  patch: number;
  prerelease?: string[];
}

export function parseSemVer(v: string): SemVerComponents | null {
  const match = SEMVER_REGEX.exec(v.trim());
  if (!match) return null;
  const major = parseInt(match[1], 10);
  const minor = parseInt(match[2], 10);
  const patch = parseInt(match[3], 10);
  const prerelease = match[4] ? match[4].split('.') : undefined;
  return { major, minor, patch, prerelease };
}

export function compareSemVer(aStr: string, bStr: string): number {
  const a = parseSemVer(aStr);
  const b = parseSemVer(bStr);
  if (!a || !b) return 0;

  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  if (a.patch !== b.patch) return a.patch - b.patch;

  if (a.prerelease && !b.prerelease) return -1;
  if (!a.prerelease && b.prerelease) return 1;
  if (!a.prerelease && !b.prerelease) return 0;

  const aPre = a.prerelease ?? [];
  const bPre = b.prerelease ?? [];
  const len = Math.max(aPre.length, bPre.length);

  for (let i = 0; i < len; i++) {
    if (aPre[i] === undefined) return -1;
    if (bPre[i] === undefined) return 1;
    if (aPre[i] === bPre[i]) continue;

    const aIsNum = /^\d+$/.test(aPre[i]);
    const bIsNum = /^\d+$/.test(bPre[i]);

    if (aIsNum && bIsNum) {
      return parseInt(aPre[i], 10) - parseInt(bPre[i], 10);
    }
    if (aIsNum && !bIsNum) return -1;
    if (!aIsNum && bIsNum) return 1;
    return aPre[i].localeCompare(bPre[i]);
  }

  return 0;
}

export const HTTP_STATUS_UPGRADE_REQUIRED = 426;

@Injectable()
export class AppVersionGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const rawHeader = request?.headers?.['x-app-version'];

    if (!rawHeader) {
      return true;
    }

    const versionStr = Array.isArray(rawHeader)
      ? String(rawHeader[0] ?? '').trim()
      : String(rawHeader).trim();

    if (!versionStr) {
      return true;
    }

    if (!SEMVER_REGEX.test(versionStr)) {
      throw new DomainError(
        CodigoError.VERSION_APP_INVALIDA,
        `La cabecera X-App-Version '${versionStr}' no cumple con la especificación SemVer (ej. 1.0.0)`,
        HttpStatus.BAD_REQUEST,
        { clientVersion: versionStr },
      );
    }

    const minVersion = this.configService.get<string>(
      'MIN_APP_VERSION',
      '1.0.0',
    );
    const storeUrl = this.configService.get<string>(
      'APP_STORE_URL',
      'https://play.google.com/store/apps/details?id=com.rentabilidad.agricola',
    );

    if (compareSemVer(versionStr, minVersion) < 0) {
      throw new DomainError(
        CodigoError.VERSION_APP_OBSOLETA,
        `La versión de la aplicación (${versionStr}) está obsoleta. La versión mínima requerida es ${minVersion}.`,
        HTTP_STATUS_UPGRADE_REQUIRED,
        {
          minVersion,
          clientVersion: versionStr,
          storeUrl,
        },
      );
    }

    return true;
  }
}
