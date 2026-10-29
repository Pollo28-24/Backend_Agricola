import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import { ErrorResponseDto } from '../common/dto/error-response.dto';
import {
  MensajeResponseDto,
  MessageResponseDto,
} from '../common/dto/mensaje-response.dto';
import { PaginacionMetaDto } from '../common/dto/paginated-response.dto';
import { CodigoError } from '../common/errors/codigos-error.enum';
import { HealthResponseDto } from '../modules/health/dto/health-response.dto';

export const ENDPOINTS_PUBLICOS_OPENAPI = new Set<string>([
  'GET /api/v1/health',
  'POST /api/v1/auth/login',
  'POST /api/v1/auth/refresh',
  'POST /api/v1/empresas/registro',
  'GET /api/v1/adjuntos/descarga',
  'POST /api/v1/auth/contrasena/solicitar-recuperacion',
  'POST /api/v1/auth/contrasena/restablecer',
]);

export const ENDPOINTS_EXCLUIDOS_VERSION_APP = new Set<string>([
  'GET /api/v1/health',
  'GET /api/v1/adjuntos/descarga',
]);

const ERROR_SCHEMA_REF = {
  $ref: '#/components/schemas/ErrorResponseDto',
};

function asegurarRespuestaError(
  responses: Record<string, Record<string, unknown>>,
  status: string,
  defaultDescription: string,
): void {
  const actual = responses[status];
  if (!actual) {
    responses[status] = {
      description: defaultDescription,
      content: {
        'application/json': {
          schema: ERROR_SCHEMA_REF,
        },
      },
    };
    return;
  }

  if (!actual.content) {
    actual.content = {
      'application/json': {
        schema: ERROR_SCHEMA_REF,
      },
    };
  }
}

export function crearDocumentoOpenApi(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('Plataforma de Rentabilidad Agrícola - API')
    .setDescription(
      'API REST modular para gestión y análisis de rentabilidad agrícola, costos, cosechas y ventas',
    )
    .setVersion('1.0.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'Authorization',
        description: 'Ingrese el Access Token JWT',
        in: 'header',
      },
      'JWT-auth',
    )
    .build();

  const document = SwaggerModule.createDocument(app, config, {
    extraModels: [
      ErrorResponseDto,
      MensajeResponseDto,
      MessageResponseDto,
      PaginacionMetaDto,
      HealthResponseDto,
    ],
  });

  document.components = document.components ?? {};
  document.components.schemas = document.components.schemas ?? {};

  // Eliminar PaginatedResponseDto genérico sin tipo de ítem si fue registrado por reflexión
  delete document.components.schemas['PaginatedResponseDto'];

  // Asegurar esquema explícito de CodigoError con todos los valores vigentes
  document.components.schemas['CodigoError'] = {
    type: 'string',
    enum: Object.values(CodigoError),
    description: 'Catálogo canónico de códigos de error de dominio',
  };

  const httpMethods = [
    'get',
    'post',
    'put',
    'patch',
    'delete',
    'options',
    'head',
  ] as const;

  for (const [pathKey, pathItem] of Object.entries(document.paths)) {
    if (!pathItem) continue;
    for (const method of httpMethods) {
      const op = (pathItem as Record<string, unknown>)[method] as
        | {
            summary?: string;
            security?: Array<Record<string, string[]>>;
            parameters?: Array<Record<string, unknown>>;
            responses?: Record<string, Record<string, unknown>>;
            requestBody?: Record<string, unknown>;
          }
        | undefined;
      if (!op) continue;

      const endpointKey = `${method.toUpperCase()} ${pathKey}`;
      const esPublico = ENDPOINTS_PUBLICOS_OPENAPI.has(endpointKey);
      const excluidoVersion = ENDPOINTS_EXCLUIDOS_VERSION_APP.has(endpointKey);

      // 1. Seguridad Bearer estricta según @Public()
      op.security = esPublico ? [] : [{ 'JWT-auth': [] }];

      // 2. Cabecera opcional X-App-Version en endpoints no excluidos
      op.parameters = op.parameters ?? [];
      if (!excluidoVersion) {
        const yaTieneHeader = op.parameters.some(
          (p) =>
            p.in === 'header' &&
            typeof p.name === 'string' &&
            p.name.toLowerCase() === 'x-app-version',
        );
        if (!yaTieneHeader) {
          op.parameters.push({
            name: 'X-App-Version',
            in: 'header',
            required: false,
            description:
              'Versión semántica del cliente móvil (MAYOR.MENOR.PARCHE). Si es menor a MIN_APP_VERSION responde 426 VERSION_APP_OBSOLETA.',
            schema: {
              type: 'string',
              pattern: '^\\d+\\.\\d+\\.\\d+$',
              example: '1.0.0',
            },
          });
        }
      }

      // 3. Tipar todas las respuestas de error con ErrorResponseDto y añadir códigos estándar reales
      op.responses = op.responses ?? {};

      for (const [statusCode, responseObj] of Object.entries(op.responses)) {
        if (/^[45]\d\d$/.test(statusCode) && responseObj) {
          responseObj.content = {
            'application/json': {
              schema: ERROR_SCHEMA_REF,
            },
          };
        }
      }

      if (endpointKey !== 'GET /api/v1/health') {
        asegurarRespuestaError(
          op.responses,
          '400',
          'Petición inválida o error de validación (PETICION_INVALIDA / VERSION_APP_INVALIDA)',
        );
        asegurarRespuestaError(
          op.responses,
          '429',
          'Límite de peticiones excedido (DEMASIADAS_PETICIONES)',
        );
      }

      if (!excluidoVersion) {
        asegurarRespuestaError(
          op.responses,
          '426',
          'Versión de la aplicación cliente obsoleta (VERSION_APP_OBSOLETA)',
        );
      }

      if (!esPublico) {
        asegurarRespuestaError(
          op.responses,
          '401',
          'No autenticado, token expirado o empresa inactiva (NO_AUTENTICADO)',
        );
        asegurarRespuestaError(
          op.responses,
          '403',
          'Permiso denegado o suscripción inactiva en escritura (PERMISO_DENEGADO / SUSCRIPCION_INACTIVA)',
        );
      }

      if (pathKey.includes('{')) {
        asegurarRespuestaError(
          op.responses,
          '404',
          'Recurso no encontrado o perteneciente a otra empresa (RECURSO_NO_ENCONTRADO)',
        );
      }

      if (
        method === 'post' &&
        pathKey.endsWith('/adjuntos') &&
        pathKey.includes('{id}')
      ) {
        asegurarRespuestaError(
          op.responses,
          '409',
          'Ciclo cerrado o límite de adjuntos por entidad alcanzado (CICLO_CERRADO / LIMITE_ADJUNTOS_ALCANZADO)',
        );
        asegurarRespuestaError(
          op.responses,
          '413',
          'Archivo excede el tamaño máximo de 10 MB (ARCHIVO_DEMASIADO_GRANDE)',
        );
        asegurarRespuestaError(
          op.responses,
          '415',
          'Formato o firma Magic Bytes de archivo no permitida (TIPO_ARCHIVO_NO_PERMITIDO)',
        );
      }
    }
  }

  return ordenarObjetoDeterminista(document) as OpenAPIObject;
}

export function ordenarObjetoDeterminista(valor: unknown): unknown {
  if (Array.isArray(valor)) {
    return valor.map((item) => ordenarObjetoDeterminista(item));
  }
  if (valor !== null && typeof valor === 'object') {
    const registro = valor as Record<string, unknown>;
    const claves = Object.keys(registro).sort((a, b) => a.localeCompare(b));
    const resultado: Record<string, unknown> = {};
    for (const clave of claves) {
      const v = registro[clave];
      if (v !== undefined) {
        resultado[clave] = ordenarObjetoDeterminista(v);
      }
    }
    return resultado;
  }
  return valor;
}

export function serializarOpenApiDeterminista(doc: OpenAPIObject): string {
  return JSON.stringify(ordenarObjetoDeterminista(doc), null, 2) + '\n';
}
