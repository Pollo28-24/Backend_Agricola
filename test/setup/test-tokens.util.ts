import { JwtService } from '@nestjs/jwt';
import { JwtPayload } from '../../src/modules/auth/interfaces/jwt-payload.interface';

const jwtService = new JwtService({
  secret:
    process.env.JWT_SECRET ||
    'e2e_testing_jwt_secret_key_minimum_32_characters_long',
  signOptions: { expiresIn: '1h' },
});

export function generateTestJwt(
  usuarioId: number,
  empresaId: number,
  rol: string,
): string {
  const payload: JwtPayload = {
    sub: usuarioId,
    empresaId,
    rol,
  };
  return jwtService.sign(payload);
}
