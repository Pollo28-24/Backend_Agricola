import { ClsStore } from 'nestjs-cls';

export interface AppClsStore extends ClsStore {
  usuarioId?: number;
  empresaId?: number;
  rolCodigo?: string;
  permisos?: string[];
  ip?: string;
  correlationId?: string;
}
