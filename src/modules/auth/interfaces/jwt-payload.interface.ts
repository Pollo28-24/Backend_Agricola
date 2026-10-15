export interface JwtPayload {
  sub: number;
  empresaId: number;
  rol: string;
}

export interface UsuarioAutenticado {
  id: number;
  empresaId: number;
  nombre: string;
  apellido: string;
  correo: string;
  rol: string;
  permisos: string[];
  estadoSuscripcion: string;
}
