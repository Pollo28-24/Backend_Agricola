# ADR-019: Almacenamiento de Archivos Adjuntos en Cloudflare R2

- **Estado:** Aceptado
- **Fecha:** 2026-10-31
- **Hito:** R2 (Resolución de DT-07)

## Contexto

En el Hito 10A se diseñó el módulo de archivos adjuntos (`AdjuntosModule`) bajo una interfaz desacoplada `IStorageService` (`STORAGE_SERVICE`), implementando inicialmente solo `LocalStorageService` sobre el sistema de archivos local y registrando como deuda técnica **DT-07** la provisión del adaptador de almacenamiento de objetos en nube compatible con S3 (Cloudflare R2) para entornos de producción sin estado en disco local.

Los requerimientos de seguridad y arquitectura del proyecto exigen:
- No alterar el contrato OpenAPI congelado (`docs/contrato/openapi.json`) ni la lógica de dominio de `AdjuntosService`.
- Mantener el bucket de almacenamiento estrictamente privado (sin acceso público directo ni exposición de URLs o credenciales del proveedor).
- Conservar la validación previa de firmas binarias (magic bytes) para JPEG, PNG, WEBP y PDF con límite de 10 MB, el aislamiento multi-empresa en la clave de objeto y la descarga autenticada mediante token HMAC de corta duración (300 s) servida en streaming por el backend.

## Decisión

1. ** Selección de adaptador por driver (`STORAGE_DRIVER`):**
   - Se introduce la variable de entorno `STORAGE_DRIVER` con valores permitidos `'local'` (por defecto para desarrollo y pruebas automatizadas e2e) y `'r2'`.
   - `AdjuntosModule` resuelve `STORAGE_SERVICE` mediante una factoría inyectando `ConfigService`: provee `R2StorageService` cuando `STORAGE_DRIVER='r2'` y `LocalStorageService` en cualquier otro caso.
   - Las variables `R2_BUCKET_NAME`, `R2_ENDPOINT`, `R2_ACCESS_KEY_ID` y `R2_SECRET_ACCESS_KEY` se validan con Joi como obligatorias únicamente cuando `STORAGE_DRIVER='r2'`, mientras que `R2_ACCOUNT_ID` se mantiene opcional.

2. **Adaptador `R2StorageService` con `@aws-sdk/client-s3`:**
   - Se utiliza `@aws-sdk/client-s3` (versión exacta fijada `3.1152.0`) configurado con `region: 'auto'`, `endpoint: R2_ENDPOINT` y políticas de checksum `requestChecksumCalculation: 'WHEN_REQUIRED'` y `responseChecksumValidation: 'WHEN_REQUIRED'` para compatibilidad con Cloudflare R2.
   - Implementa íntegramente `IStorageService` (`guardar` con `PutObjectCommand`, `leerStream` con `GetObjectCommand`, `borrar` idempotente con `DeleteObjectCommand` y `existe` con `HeadObjectCommand`).
   - Los errores del SDK nunca exponen credenciales ni endpoints en logs o respuestas (RN-074) y se traducen a `DomainError` (`CodigoError.RECURSO_NO_ENCONTRADO` para 404/`NoSuchKey`/`NotFound`, `CodigoError.PETICION_INVALIDA` para claves inválidas y `CodigoError.ERROR_INTERNO` para fallos de infraestructura).

3. **Bucket privado, clave aislada y descarga por streaming:**
   - El bucket en Cloudflare R2 permanece privado sin dominio público habilitado.
   - Se preserva el formato estricto de clave `<empresaId>/<uuid>.<ext>` validado contra path traversal (`CLAVE_ALMACENAMIENTO_REGEX`, sin `..` ni barras iniciales).
   - La descarga continúa realizándose exclusivamente a través del endpoint del backend validado con token HMAC de 300 segundos de vigencia (`TokenDescargaService`), revalidando usuario y empresa activos en base de datos antes de hacer `pipe` del stream de R2 hacia la respuesta HTTP.

## Alternativas Consideradas

1. **Firmar peticiones HTTP manualmente con `aws4fetch` o implementación propia SigV4:**
   - *Ventaja:* Menor peso en `node_modules`.
   - *Descarte:* Mayor superficie de mantenimiento manual para manejo de streams en Node.js, reintentos y mapeo de códigos de estado S3 frente al cliente oficial `@aws-sdk/client-s3`.

2. **Postergar la implementación de R2 (esperar a despliegue final):**
   - *Ventaja:* Cero dependencias nuevas en el corto plazo.
   - *Descarte:* Mantiene abierta DT-07 e impide validar la conmutación limpia por configuración antes del despliegue productivo.

## Consecuencias

- **Positivas:**
  - Cierre de **DT-07** sin modificar una sola línea de `AdjuntosService`, `AdjuntosController`, `TokenDescargaService` ni el contrato OpenAPI.
  - Los tests unitarios y e2e siguen ejecutándose sin llamadas de red reales (`STORAGE_DRIVER=local` en `.env.test` y mocks del cliente S3 en pruebas unitarias).
- **Negativas / Compromisos:**
  - Se incorpora `@aws-sdk/client-s3@3.1152.0` como dependencia de producción (0 vulnerabilidades nuevas introducidas; el árbol `@aws-sdk/*` no tiene relación con `joi` ni `minimatch`, cuyos avisos recientes corresponden a dependencias preexistentes registradas para el hito DT-18).
  - Se mantiene abierta **DT-06** (tarea programada de reconciliación de archivos huérfanos), la cual aplica igualmente a objetos en R2 si llegara a fallar la compensación post-rollback.
  - Queda registrada como tarea pendiente la verificación manual contra el bucket real de Cloudflare R2 con credenciales del entorno del usuario (DT-23).
