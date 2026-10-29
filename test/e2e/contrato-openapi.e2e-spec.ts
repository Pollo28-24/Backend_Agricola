import * as fs from 'fs';
import * as path from 'path';
import { INestApplication, RequestMethod } from '@nestjs/common';
import { PATH_METADATA, METHOD_METADATA } from '@nestjs/common/constants';
import { DiscoveryService, MetadataScanner, Reflector } from '@nestjs/core';
import request from 'supertest';
import { createTestApp } from '../setup/create-test-app';
import { getOrLoadSeedData, E2eSeedData } from '../setup/e2e-seed';
import { IS_PUBLIC_KEY } from '../../src/modules/auth/decorators/public.decorator';
import { PERMISOS_KEY } from '../../src/common/decorators/require-permisos.decorator';
import {
  crearDocumentoOpenApi,
  serializarOpenApiDeterminista,
} from '../../src/config/openapi.config';
import { CodigoError } from '../../src/common/errors/codigos-error.enum';

interface RouteMeta {
  method: string;
  path: string;
  isPublic: boolean;
  permisos: string[];
  controller: string;
  handler: string;
}

const NOMBRES_CAMPOS_FINANCIEROS_Y_DECIMALES = new Set<string>([
  'costototal',
  'ganancia',
  'monto',
  'subtotal',
  'descuento',
  'impuesto',
  'importe',
  'saldopendiente',
  'totalfacturado',
  'cobrado',
  'porcobrar',
  'ingresos',
  'preciounitario',
  'costounitario',
  'superficie',
  'superficietotal',
  'superficiesembrada',
  'cantidad',
  'kgcosechados',
  'kgmermaposcosecha',
  'kgmermacampo',
  'kgnetos',
  'kgvendidos',
  'kgdisponibles',
  'metaproduccionkg',
  'margenpct',
  'roipct',
  'costoporkg',
  'preciopromediokg',
  'mermapct',
  'costoporhectarea',
  'rendimientokgha',
  'horastrabajadas',
  'factorabase',
  'latitud',
  'longitud',
  'margenpctcicloanterior',
  'costoporkgcicloanterior',
  'gananciacicloanterior',
  'totalporcobrar',
  'totalvencido',
  'totalvigente',
  'montototal',
  'montocobrado',
  'montopendiente',
]);

describe('Contrato OpenAPI y Control de Versión (Hito 11D - D2 y D3)', () => {
  let app: INestApplication;
  let seed: E2eSeedData;
  let rutasDiscovery: RouteMeta[];
  let openApiDoc: ReturnType<typeof crearDocumentoOpenApi>;
  let openApiJsonSerializado: string;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.THROTTLE_ENABLED = 'false';

    const testApp = await createTestApp();
    app = testApp.app;
    await app.listen(0);
    seed = await getOrLoadSeedData(testApp.prisma);

    const discovery = app.get(DiscoveryService);
    const scanner = app.get(MetadataScanner);
    const reflector = app.get(Reflector);

    const methodMap: Record<number, string> = {
      [RequestMethod.GET]: 'GET',
      [RequestMethod.POST]: 'POST',
      [RequestMethod.PUT]: 'PUT',
      [RequestMethod.DELETE]: 'DELETE',
      [RequestMethod.PATCH]: 'PATCH',
      [RequestMethod.OPTIONS]: 'OPTIONS',
      [RequestMethod.HEAD]: 'HEAD',
    };

    rutasDiscovery = [];
    for (const wrapper of discovery.getControllers()) {
      const instance = wrapper.instance as Record<string, unknown> | null;
      const metatype = wrapper.metatype;
      if (!instance || !metatype) continue;
      const ctrlPathRaw = reflector.get<string | string[] | undefined>(
        PATH_METADATA,
        metatype,
      );
      const ctrlPath = Array.isArray(ctrlPathRaw)
        ? ctrlPathRaw[0]
        : (ctrlPathRaw ?? '');
      const proto = Object.getPrototypeOf(instance) as Record<string, unknown>;
      for (const name of scanner.getAllMethodNames(proto)) {
        const handler = instance[name] as (...args: unknown[]) => unknown;
        if (typeof handler !== 'function') continue;
        const reqMethod = reflector.get<number | undefined>(
          METHOD_METADATA,
          handler,
        );
        const routePathRaw = reflector.get<string | string[] | undefined>(
          PATH_METADATA,
          handler,
        );
        if (reqMethod === undefined || routePathRaw === undefined) continue;
        const method = methodMap[reqMethod] || 'GET';
        const subPath = Array.isArray(routePathRaw)
          ? routePathRaw[0]
          : routePathRaw;
        const segments = ['api/v1', ctrlPath, subPath]
          .map((s) => String(s).replace(/^\/+|\/+$/g, ''))
          .filter(Boolean);
        const fullPath = '/' + segments.join('/');
        const isPublic = Boolean(
          reflector.getAllAndOverride(IS_PUBLIC_KEY, [handler, metatype]),
        );
        const permisos =
          reflector.getAllAndOverride<string[]>(PERMISOS_KEY, [
            handler,
            metatype,
          ]) || [];

        rutasDiscovery.push({
          controller: metatype.name,
          handler: name,
          method,
          path: fullPath,
          isPublic,
          permisos,
        });
      }
    }

    openApiDoc = crearDocumentoOpenApi(app);
    openApiJsonSerializado = serializarOpenApiDeterminista(openApiDoc);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('D2: Snapshot y Congelación de Contrato', () => {
    it('el documento OpenAPI generado coincide byte a byte con docs/contrato/openapi.json', () => {
      const rutaContrato = path.resolve(
        process.cwd(),
        'docs/contrato/openapi.json',
      );
      expect(fs.existsSync(rutaContrato)).toBe(true);

      const contratoCongelado = fs.readFileSync(rutaContrato, 'utf8');
      expect(openApiJsonSerializado).toBe(contratoCongelado);
    });

    it('la serialización del contrato es estrictamente determinista (claves ordenadas alfabéticamente)', () => {
      const docClonado = JSON.parse(openApiJsonSerializado) as Record<
        string,
        unknown
      >;
      const clavesPrincipales = Object.keys(docClonado);
      const clavesOrdenadas = [...clavesPrincipales].sort((a, b) =>
        a.localeCompare(b),
      );
      expect(clavesPrincipales).toEqual(clavesOrdenadas);
    });
  });

  describe('D3: Validaciones Automáticas del Contrato', () => {
    it('1. el total de rutas registradas en DiscoveryService coincide exactamente con las 109 del catálogo', () => {
      expect(rutasDiscovery).toHaveLength(109);
    });

    it('2. cada una de las 109 rutas de DiscoveryService existe en OpenAPI paths con su método correspondiente', () => {
      for (const r of rutasDiscovery) {
        const openApiPath = r.path.replace(/:([a-zA-Z0-9_]+)/g, '{$1}');
        const pathItem = openApiDoc.paths[openApiPath];
        expect(pathItem).toBeDefined();

        const methodKey = r.method.toLowerCase();
        const op = (pathItem as Record<string, unknown>)[methodKey];
        expect(op).toBeDefined();
      }
    });

    it('3. todo endpoint no público declara seguridad bearer y los públicos no la requieren', () => {
      for (const r of rutasDiscovery) {
        const openApiPath = r.path.replace(/:([a-zA-Z0-9_]+)/g, '{$1}');
        const methodKey = r.method.toLowerCase();
        const op = (openApiDoc.paths[openApiPath] as Record<string, unknown>)[
          methodKey
        ] as { security?: unknown[] };

        if (r.isPublic) {
          expect(op.security).toEqual([]);
        } else {
          expect(op.security).toEqual([{ 'JWT-auth': [] }]);
        }
      }
    });

    it('4. todo endpoint posee summary no vacío y al menos una respuesta 2xx tipada', () => {
      for (const [, pathItem] of Object.entries(openApiDoc.paths)) {
        if (!pathItem) continue;
        for (const [, opRaw] of Object.entries(pathItem)) {
          const op = opRaw as {
            summary?: string;
            responses?: Record<string, Record<string, unknown>>;
          };
          expect(op.summary).toBeDefined();
          expect(op.summary?.trim().length).toBeGreaterThan(0);

          const responses = op.responses || {};
          const successKeys = Object.keys(responses).filter((k) =>
            k.startsWith('2'),
          );
          expect(successKeys.length).toBeGreaterThan(0);

          const tieneRespuestaTipada = successKeys.some((k) => {
            const resp = responses[k];
            const content = resp?.content as
              Record<string, Record<string, unknown>> | undefined;
            if (!content) return false;
            return Object.values(content).some((c) => Boolean(c.schema));
          });
          expect(tieneRespuestaTipada).toBe(true);
        }
      }
    });

    it('5. cero esquemas vacíos y cero propiedades type: object sin properties/additionalProperties/$ref', () => {
      const schemas = openApiDoc.components?.schemas || {};
      expect(Object.keys(schemas).length).toBeGreaterThan(0);

      for (const [schemaName, sRaw] of Object.entries(schemas)) {
        const s = sRaw as {
          enum?: unknown[];
          properties?: Record<string, Record<string, unknown>>;
        };
        if (!s.enum) {
          const propNames = Object.keys(s.properties || {});
          expect(propNames.length).toBeGreaterThan(0);
        }

        const props = s.properties || {};
        for (const [propName, propVal] of Object.entries(props)) {
          if (propVal.type === 'object') {
            const tieneDefinicionValida = Boolean(
              propVal.properties ||
              propVal.$ref ||
              propVal.additionalProperties !== undefined ||
              propVal.allOf,
            );
            expect(tieneDefinicionValida).toBe(true);
            if (!tieneDefinicionValida) {
              throw new Error(
                `Propiedad ${schemaName}.${propName} es un object sin properties, $ref ni additionalProperties`,
              );
            }
          }
        }
      }
    });

    it('6. cero campos de importe, cantidad, porcentaje, superficie, coordenadas o BigInt tipados como number en respuestas', () => {
      const schemas = openApiDoc.components?.schemas || {};

      for (const [schemaName, sRaw] of Object.entries(schemas)) {
        if (
          !schemaName.endsWith('Dto') ||
          schemaName.startsWith('Create') ||
          schemaName.startsWith('Update') ||
          schemaName.startsWith('Filtro')
        ) {
          continue;
        }

        const s = sRaw as {
          properties?: Record<string, Record<string, unknown>>;
        };
        const props = s.properties || {};

        for (const [propName, propVal] of Object.entries(props)) {
          const nombreLower = propName.toLowerCase();
          if (NOMBRES_CAMPOS_FINANCIEROS_Y_DECIMALES.has(nombreLower)) {
            expect(propVal.type).toBe('string');
          }
        }

        if (schemaName === 'AuditoriaResponseDto') {
          expect(props['id']?.type).toBe('string');
        }
      }
    });

    it('7. todo valor del enum CodigoError está presente en el esquema OpenAPI', () => {
      const codigoErrorSchema = openApiDoc.components?.schemas?.[
        'CodigoError'
      ] as { enum?: string[] } | undefined;
      expect(codigoErrorSchema).toBeDefined();
      expect(codigoErrorSchema?.enum).toBeDefined();

      const valoresEsperados = Object.values(CodigoError);
      expect(codigoErrorSchema?.enum).toEqual(
        expect.arrayContaining(valoresEsperados),
      );
      expect(codigoErrorSchema?.enum?.length).toBe(valoresEsperados.length);
    });
  });

  describe('Verificación E2E de Claves Reales en Respuestas Documentarias', () => {
    it('GET /api/v1/health retorna exactamente las claves declaradas en HealthResponseDto', async () => {
      const server = app.getHttpServer() as Parameters<typeof request>[0];
      const res = await request(server).get('/api/v1/health').expect(200);

      const body = res.body as {
        status?: unknown;
        timestamp?: unknown;
        database?: unknown;
        version?: unknown;
      };
      const keysRespuesta = Object.keys(body).sort();
      const keysEsperadas = [
        'database',
        'status',
        'timestamp',
        'version',
      ].sort();
      expect(keysRespuesta).toEqual(keysEsperadas);
      expect(body.status).toBe('ok');
      expect(body.version).toBe('1.0.0');
    });

    it('POST /api/v1/auth/logout retorna la clave { mensaje } declarada en MensajeResponseDto', async () => {
      const server = app.getHttpServer() as Parameters<typeof request>[0];
      const loginRes = await request(server)
        .post('/api/v1/auth/login')
        .send({
          correo: seed.empresaA.usuarios.admin.correo,
          contrasena: 'Password123!',
        })
        .expect(200);

      const loginBody = loginRes.body as {
        accessToken: string;
        refreshToken: string;
      };

      const res = await request(server)
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${loginBody.accessToken}`)
        .send({ refreshToken: loginBody.refreshToken })
        .expect(200);

      const logoutBody = res.body as { mensaje: string };
      const keysRespuesta = Object.keys(logoutBody);
      expect(keysRespuesta).toEqual(['mensaje']);
      expect(typeof logoutBody.mensaje).toBe('string');
      expect(logoutBody.mensaje.length).toBeGreaterThan(0);
    });
  });

  describe('Guardias Anti-Deriva de Documentación y Contrato Vivo (Paso 0 - 11D)', () => {
    it('cada código en CodigoError debe estar documentado en docs/contrato/errores.md con su status HTTP', () => {
      const erroresMdPath = path.resolve(
        __dirname,
        '../../docs/contrato/errores.md',
      );
      const contenidoMd = fs.readFileSync(erroresMdPath, 'utf-8');

      const codigosEnum = Object.values(CodigoError);
      const regexFila = /\|\s*`([A-Z0-9_]+)`\s*\|\s*(\d{3})\s*\|/g;
      const codigosEncontrados = new Map<string, number>();

      let match: RegExpExecArray | null;
      while ((match = regexFila.exec(contenidoMd)) !== null) {
        codigosEncontrados.set(match[1], parseInt(match[2], 10));
      }

      expect(codigosEncontrados.size).toBe(codigosEnum.length);
      for (const codigo of codigosEnum) {
        expect(codigosEncontrados.has(codigo)).toBe(true);
        const status = codigosEncontrados.get(codigo);
        expect(status).toBeGreaterThanOrEqual(400);
        expect(status).toBeLessThan(600);
      }
    });

    it('las 109 rutas de DiscoveryService deben estar documentadas en docs/contrato/matriz-permisos.md', () => {
      const matrizMdPath = path.resolve(
        __dirname,
        '../../docs/contrato/matriz-permisos.md',
      );
      const contenidoMd = fs.readFileSync(matrizMdPath, 'utf-8');

      expect(rutasDiscovery.length).toBe(109);
      for (const r of rutasDiscovery) {
        const filaConBackticks = '| `' + r.method + '` | `' + r.path + '` |';
        const filaSinBackticks = '| ' + r.method + ' | ' + r.path + ' |';
        const encontrada =
          contenidoMd.includes(filaConBackticks) ||
          contenidoMd.includes(filaSinBackticks);
        if (!encontrada) {
          throw new Error(
            'Ruta no documentada en matriz-permisos.md: [' +
              r.method +
              '] ' +
              r.path,
          );
        }
        expect(encontrada).toBe(true);
      }
    });

    it('paginación: debe admitir limit=100 (200) y rechazar limit=101 (400 PETICION_INVALIDA)', async () => {
      const server = app.getHttpServer() as Parameters<typeof request>[0];
      const loginRes = await request(server)
        .post('/api/v1/auth/login')
        .send({
          correo: seed.empresaA.usuarios.admin.correo,
          contrasena: 'Password123!',
        })
        .expect(200);

      const token = (loginRes.body as { accessToken: string }).accessToken;

      // Límite máximo permitido: 100
      const res100 = await request(server)
        .get('/api/v1/actividades?limit=100')
        .set('Authorization', 'Bearer ' + token)
        .expect(200);

      const body100 = res100.body as {
        data: unknown[];
        meta: { limit: number };
      };
      expect(Array.isArray(body100.data)).toBe(true);
      expect(body100.meta.limit).toBe(100);

      // Límite excedido: 101 -> 400 PETICION_INVALIDA
      const res101 = await request(server)
        .get('/api/v1/actividades?limit=101')
        .set('Authorization', 'Bearer ' + token)
        .expect(400);

      const body101 = res101.body as { code: string; message: string };
      expect(body101.code).toBe(CodigoError.PETICION_INVALIDA);
    });
  });
});
