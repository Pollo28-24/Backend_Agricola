import * as fs from 'fs';
import * as path from 'path';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  crearDocumentoOpenApi,
  serializarOpenApiDeterminista,
} from '../src/config/openapi.config';

export async function generarContratoOpenApi(): Promise<string> {
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL =
    process.env.DATABASE_URL ||
    'mysql://root:pass@localhost:3306/rentabilidad_agricola_test';
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'a'.repeat(64);
  process.env.JWT_REFRESH_SECRET =
    process.env.JWT_REFRESH_SECRET || 'b'.repeat(64);
  process.env.THROTTLE_ENABLED = 'false';

  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(PrismaService)
    .useValue({
      onModuleInit: () => {},
      onModuleDestroy: () => {},
      $queryRaw: () => Promise.resolve([{ 1: 1 }]),
    })
    .compile();

  const app = moduleRef.createNestApplication({ logger: false });
  app.setGlobalPrefix('api/v1');
  await app.init();

  const doc = crearDocumentoOpenApi(app);
  const json = serializarOpenApiDeterminista(doc);

  await app.close();
  return json;
}

export async function ejecutarComando(
  modo: 'generar' | 'verificar',
): Promise<void> {
  const rutaDestino = path.resolve(process.cwd(), 'docs/contrato/openapi.json');
  const jsonGenerado = await generarContratoOpenApi();

  if (modo === 'generar') {
    fs.mkdirSync(path.dirname(rutaDestino), { recursive: true });
    fs.writeFileSync(rutaDestino, jsonGenerado, 'utf8');
    console.log(`[CONTRATO] Documento OpenAPI generado en: ${rutaDestino}`);
    process.exit(0);
  }

  if (modo === 'verificar') {
    if (!fs.existsSync(rutaDestino)) {
      console.error(
        `[CONTRATO] Error: No existe el archivo de contrato congelado en: ${rutaDestino}`,
      );
      process.exit(1);
    }
    const jsonCongelado = fs.readFileSync(rutaDestino, 'utf8');
    if (jsonGenerado !== jsonCongelado) {
      console.error(
        '[CONTRATO] Error: El documento OpenAPI generado difiere de docs/contrato/openapi.json.',
      );
      const lineasGenerado = jsonGenerado.split('\n');
      const lineasCongelado = jsonCongelado.split('\n');
      for (
        let i = 0;
        i < Math.max(lineasGenerado.length, lineasCongelado.length);
        i++
      ) {
        if (lineasGenerado[i] !== lineasCongelado[i]) {
          console.error(
            `Diferencia en línea ${i + 1}:\n- Congelado: ${lineasCongelado[i]}\n+ Generado:  ${lineasGenerado[i]}`,
          );
          break;
        }
      }
      process.exit(1);
    }
    console.log(
      '[CONTRATO] Verificación exitosa: OpenAPI coincide exactamente con docs/contrato/openapi.json',
    );
    process.exit(0);
  }
}

if (require.main === module) {
  const arg = process.argv[2] === 'verificar' ? 'verificar' : 'generar';
  ejecutarComando(arg).catch((err) => {
    console.error('[CONTRATO] Error inesperado:', err);
    process.exit(1);
  });
}
