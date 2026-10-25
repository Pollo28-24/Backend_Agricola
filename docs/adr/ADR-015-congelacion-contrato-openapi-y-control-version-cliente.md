# ADR-015: Congelación del Contrato OpenAPI y Control de Versión de Cliente Móvil

## Estado
Aceptado

## Fecha
2026-10-25 (Hito 11D)

## Contexto
El Backend del Sistema de Rentabilidad Agrícola ha completado sus hitos fundamentales de seguridad y autenticación (Hito 11A) y se prepara para el consumo por parte de la aplicación móvil desarrollada en Flutter. 

Históricamente, los contratos HTTP entre backend y frontend sufren de desincronización silenciosa ("drift"), lo que ocasiona caídas en producción debido a:
1. Cambios inadvertidos en los nombres o tipos de propiedades en los DTOs.
2. Inconsistencia entre esquemas de éxito y de error.
3. Desbordamiento de enteros o pérdida de precisión decimal al parsear montos monetarios o superficies en clientes móviles con aritmética de coma flotante estándar IEEE 754.
4. Desincronización en la rotación de sesiones criptográficas: el esquema de detección de reuso de Refresh Tokens por familia (Hito 11A, Decisión 12) revoca toda la sesión si dos peticiones en vuelo refrescan con el mismo token simultáneamente.
5. Imposibilidad de forzar actualizaciones obligatorias cuando un cliente móvil obsoleto intenta operar contra endpoints con cambios de contrato.

## Decisiones

### 1. Congelación Formal de Especificación OpenAPI 3.0 Determinista (D1 y D2)
- Se enriquecieron los metadatos Swagger (`@nestjs/swagger`) en los controladores y DTOs de las **106 rutas registradas** en NestJS, sin añadir nuevas dependencias en tiempo de ejecución.
- Se implementó un algoritmo de ordenamiento y serialización estrictamente determinista (`serializarOpenApiDeterminista` en `src/config/openapi.config.ts`) que garantiza que las claves de objetos y rutas se ordenen alfabéticamente de manera recursiva.
- Se congeló el documento canónico en `docs/contrato/openapi.json`.
- Se crearon los scripts en `package.json`:
  - `npm run contrato:generar`: Genera y serializa deterministamente el snapshot congelado.
  - `npm run contrato:verificar`: Compara byte a byte el documento OpenAPI generado contra el congelado, fallando con código de salida 1 e imprimiendo el diff exacto en caso de discrepancia.

### 2. Suite de Validación E2E Automatizada del Contrato (D3)
Se creó la suite `test/e2e/contrato-openapi.e2e-spec.ts` que valida automáticamente:
1. Correspondencia exacta 1:1 entre las rutas del árbol de controladores (`DiscoveryService`) y las rutas declaradas en OpenAPI (106 rutas exactas).
2. Todo endpoint no público declara explícitamente seguridad tipo `bearer`.
3. Todo endpoint declara `summary` descriptivo no vacío y al menos una respuesta 2xx tipada con DTO concreto.
4. Cero esquemas vacíos y cero propiedades `type: object` sin esquema estructurado o diccionario explícito (`additionalProperties: true`).
5. Cero campos de importe monetario, cantidad, porcentaje, superficie, coordenadas o BigInt tipados como `number` en respuestas (todos obligatoriamente `string`).
6. Totalidad de los 37 valores del enum `CodigoError` presentes en los componentes del esquema.
7. Verificación E2E de claves reales en respuestas documentarias (`GET /api/v1/health` retornando `status`, `timestamp`, `ambiente`, `servicios` y `POST /api/v1/auth/logout` retornando `mensaje`).

### 3. Catálogo Canónico de Errores y Matriz de Permisos (D4 y D5)
- `docs/contrato/errores.md`: Documenta el sobre unificado de error `{ statusCode, code, message, details? }`, cabeceras `x-correlation-id` y `Retry-After`, y la totalidad de los 37 códigos de `CodigoError` con su reacción requerida en Flutter.
- `docs/contrato/matriz-permisos.md`: Documenta los 19 permisos del sistema, los roles predefinidos (ADMIN: 19, CONTADOR: 8, CAPTURISTA: 4), y el mapeo exhaustivo de permisos requeridos por cada una de las 106 rutas HTTP.

### 4. Control de Versiones del Cliente Móvil (`X-App-Version` y HTTP 426) (D6)
- Se implementó el guard global `AppVersionGuard` (`src/common/guards/app-version.guard.ts`) como primer guard en la cadena de ejecución de NestJS (`src/app.module.ts`).
- Evalúa la cabecera opcional `X-App-Version` contra la variable de entorno `MIN_APP_VERSION` (por defecto `'1.0.0'`).
- Si la cabecera no se envía o está vacía: la petición se permite normalmente (modo no intrusivo para Swagger, web o clientes legados).
- Si la cabecera no cumple con la especificación SemVer 2.0.0: retorna `400 Bad Request` con código `VERSION_APP_INVALIDA`.
- Si la versión del cliente es menor que `MIN_APP_VERSION`: retorna `426 Upgrade Required` con código `VERSION_APP_OBSOLETA` y estructura de detalles `{ minVersion, clientVersion, storeUrl }`.
- Flutter debe mostrar un diálogo modal bloqueante no cancelable que redirija a `storeUrl`.

### 5. Protocolo de Integración y Single-Flight Mutex para Flutter (D8)
En `docs/contrato-api-flutter.md` se estableció como regla crítica que el cliente móvil debe implementar un interceptor de refresco de tokens con mutex / single-flight (`Completer` en Dart), garantizando que jamás se ejecuten dos llamadas simultáneas a `POST /api/v1/auth/refresh`. Refrescos concurrentes dispararían la detección de reuso de la familia criptográfica y cerrarían la sesión del usuario.

## Consecuencias

### Positivas
- Cero drift entre la API del backend y las expectativas del equipo de desarrollo móvil Flutter.
- Verificación determinista en el pipeline de CI/CD: cualquier cambio de contrato sin snapshot detiene la construcción.
- Protección estricta contra errores de cálculo decimal en Flutter al forzar `String` en importes y cantidades.
- Capacidad operativa de forzar actualizaciones de la app en caso de cambios incompatibles futuros vía HTTP 426.

### Negativas / Deuda Técnica
- Todo nuevo endpoint o modificación a un DTO de respuesta requiere ejecutar `npm run contrato:generar` para actualizar el snapshot antes de hacer commit.
- La generación de clientes Dart en CI requiere `npx @openapitools/openapi-generator-cli` o Docker (documentado en D7).
