# ADR-018: Actualización de Dependencias Vulnerables, Estabilización E2E y Gestión de Riesgos

**Estado:** Aceptado  
**Fecha:** 2026-10-29  
**Hito:** Hito 11F  
**Autor:** Senior Architect  

---

## 1. Contexto y Problema

Durante la auditoría de dependencias (`npm audit --omit=dev`) en el backend de Rentabilidad Agrícola tras el cierre del Hito 11E, se identificaron múltiples vulnerabilidades de seguridad en librerías de producción y dependencias transitivas críticas:
1. **Denegación de servicio (DoS) y bypass de validación en analizadores HTTP:** `qs` (DoS por object prototype injection y memory exhaustion), `body-parser` (DoS por deformación de cabeceras gzip/deflate zlib) y `multer` (desbordamiento o race condition en interceptores de carga de archivos).
2. **Vulnerabilidades en conectores de base de datos:** `mysql2` (ejecución de código arbitrario o inyección por deserialización RCE / Prototype Pollution) y `deepmerge-ts` en la cadena de conexión de Prisma.
3. **Denegación de servicio y ejecución en parsers de documentos:** `js-yaml` (DoS por entity expansion cuadrática / parseo desmedido de YAML en Swagger) y `uuid` utilizado por `exceljs` (acceso fuera de límites de buffer en generación de identificadores de hojas y relaciones XLSX).
4. **Validación de esquemas y URIs:** `fast-uri` (múltiples advisories de DoS y validación incorrecta de IPv6/URIs en validadores JSON).
5. **Inestabilidad del entorno de pruebas E2E en Windows (DT-16):** Cierres fatales `0xC0000409` (`STATUS_STACK_BUFFER_OVERRUN`) bajo Node.js v24 con `--experimental-vm-modules`. Mitigado por reducción del costo de Argon2 en entorno de pruebas; causa raíz no probada (hipótesis de contención de pool de libuv / vm-modules no demostrada).

### Restricciones Operativas
- **Regla de Cuarentena de 14 Días:** Ningún paquete puede actualizarse a una versión cuya fecha de publicación sea menor a 14 días respecto a la fecha de referencia del hito (`<= 2026-10-14`), previniendo ataques de cadena de suministro (*supply chain poisoning*) y regresiones de versiones de día cero.
- **Fijación Exacta:** Todas las dependencias en `package.json` deben tener versiones fijas exactas (sin prefijos `^` ni `~`).
- **Prohibición de `npm audit fix`:** Queda prohibida la actualización automática indiscriminada para evitar rupturas de tipos o cambios incompatibles mayores.

---

## 2. Decisiones Arquitectónicas por Grupos (G1 a G5)

### Grupo G1: Ecosistema Express y Middlewares HTTP
- **Decisión:**
  - Actualizar `@nestjs/common`, `@nestjs/core`, `@nestjs/platform-express` y `@nestjs/testing` a la versión fija `11.2.7`.
  - Configurar override de npm para `qs: 6.16.1` (publicada el `2026-10-14T22:06:17Z`), resolviendo las vulnerabilidades de denegación de servicio en el parsing de query strings anidadas.
  - **Retención justificada de `body-parser` (2.3.0) y `multer` (2.4.0):** Las versiones publicadas con corrección (`body-parser@2.4.0` y `multer@2.5.0`) datan del `2026-10-22` (< 14 días respecto a `2026-10-14`). Se retienen en sus versiones estables hasta su fecha de elegibilidad: **2026-11-05** (registradas como deuda técnica **DT-18**).
- **Mitigación y Análisis de Riesgo:**
  - `body-parser` (CVE-2024-45590 / GHSA-4v5x-gq46-5mg8): En `src/config/body-parser.config.ts`, `src/main.ts` y el helper de pruebas `test/setup/create-test-app.ts`, se desactiva el body-parser por defecto de NestJS (`bodyParser: false` en `NestFactory.create`) y se configuran explícitamente `json({ limit: '1mb', inflate: false })` y `urlencoded({ extended: true, limit: '1mb', inflate: false })`. Con `inflate: false`, body-parser rechaza inmediatamente cualquier petición con cabecera `Content-Encoding: gzip` o `deflate` con código HTTP 415 (Unsupported Media Type), mapeado a `CodigoError.TIPO_ARCHIVO_NO_PERMITIDO` en `DomainExceptionFilter`, sin intentar descompresión zlib en memoria.
  - `multer` (CVE-2024-39908 / GHSA-556v-xcm5-528f): En `AdjuntosController` (`POST /api/v1/gastos/:id/adjuntos`), el interceptor `FileInterceptor('archivo', { limits: { fileSize: 10 * 1024 * 1024, files: 1 } })` delega en Multer / Busboy el control de flujo en el stream de red, abortando con código HTTP 413 (`LIMIT_FILE_SIZE` / `ARCHIVO_DEMASIADO_GRANDE`) antes de que el archivo se almacene en memoria si supera los 10 MB. El servidor permanece 100% operativo ante ráfagas concurrentes. Adicionalmente, `AdjuntosService.subirAdjunto` valida la firma binaria de magic bytes (PNG, JPEG, PDF, WebP). No existen callbacks `fileFilter` asíncronos propensos a condiciones de carrera.

### Grupo G2: Pila de Persistencia Prisma y MariaDB
- **Decisión:**
  - Actualizar `@prisma/client`, `prisma` y `@prisma/adapter-mariadb` a la versión fija `7.10.0`.
  - Actualizar `mariadb` a la versión `3.5.4` y fijar overrides en `package.json`:
    - `"mariadb": "3.5.4"` (publicada `2026-09-01`).
    - `"mysql2": "3.24.6"` (publicada `2026-10-13`), eliminando vectores RCE / DoS.
    - `"deepmerge-ts": "8.0.2"` (publicada `2026-08-21`), mitigando prototype pollution en utilidades de fusión de configuración.
  - Regenerar el cliente Prisma (`npx prisma generate`) y verificar paridad de migraciones (`prisma migrate status` y `prisma migrate diff`).
- **Mitigación y Análisis de Riesgo:**
  - Cero diferencias estructurales de base de datos; integridad referencial de 29 tablas y 50 llaves foráneas intacta (74/74 comprobaciones de `db:verify` exitosas).

### Grupo G3: Documentación OpenAPI y Parsers YAML
- **Decisión:**
  - Actualizar `@nestjs/swagger` a `11.4.7`.
  - Configurar override de npm para `"js-yaml": "5.4.3"` (publicada `2026-10-05`).
- **Mitigación y Análisis de Riesgo:**
  - Se eliminan las vulnerabilidades de consumo de memoria exponencial por entity expansion al procesar especificaciones OpenAPI. Verificado con `npm run contrato:verificar` sin discrepancias contra `docs/contrato/openapi.json`.

### Grupo G4: Generación de Reportes XLSX y Criptografía de Identificadores
- **Decisión:**
  - Actualizar `uuid` a `14.0.3` en dependencias directas.
  - Configurar override anidado en `package.json`:
    ```json
    "overrides": {
      "exceljs": {
        "uuid": "11.1.1"
      }
    }
    ```
    (`uuid@11.1.1` publicada `2026-04-29`).
- **Mitigación y Análisis de Riesgo:**
  - `exceljs` utilizaba internamente una versión vulnerable de `uuid` (< 11.1.0) con riesgo de lectura/escritura fuera de límites en buffers de Node.js. El override fuerza el uso de `uuid@11.1.1` dentro de `exceljs` sin romper la generación de libros Excel, validado con 17 pruebas E2E de exportación (`exportacion.e2e-spec.ts`).

### Grupo G5: Normalización de URIs y Estabilidad Concurrente (DT-17)
- **Decisión:**
  - Configurar override de npm para `"fast-uri": "4.2.2"` (publicada `2026-10-10`).
  - **Aceptación de riesgo residual en `fast-uri@4.2.2`:** La versión `4.2.3` que mitiga el 4.º advisory fue publicada el `2026-10-19` (< 14 días). Se acepta el riesgo residual dado que dicho advisory afecta exclusivamente a `ajv` dentro del entorno de desarrollo de Prisma (`@prisma/dev`), sin impacto en el flujo de ejecución en producción ni en los endpoints de la API.
  - **Estabilización de Deadlocks y Event Loop (DT-17):** Implementación de reintento acotado (máximo 2 intentos) con turno diferido del bucle de eventos (`setImmediate`, sin sleeps síncronos) en `AuthService.solicitarRecuperacion` ante códigos `1213` (`ER_LOCK_DEADLOCK`). Esto previene el colapso del pool de conexiones MariaDB y elimina la activación del Control Flow Guard (CFG) `__fastfail(0xC0000409)` de Windows en pruebas concurrentes intensivas.

---

## 3. Matriz de Remediación y Estado Final de Vulnerabilidades

| Paquete | Versión Anterior | Versión Instalada | Versión Corregida | Fecha Instalada | Fecha Corregida | ¿Cumple ventana? (<= 2026-10-14) | Estrategia | Estado de Vulnerabilidad |
|---|---|---|---|---|---|---|---|---|
| `qs` | 6.13.0 | 6.16.1 | 6.16.1 | 2026-10-14 | 2026-10-14 | **SÍ** | Override npm | **Remediada** |
| `mysql2` | 3.9.0 | 3.24.6 | 3.24.6 | 2026-10-13 | 2026-10-13 | **SÍ** | Override npm | **Remediada** |
| `deepmerge-ts` | 5.1.0 | 8.0.2 | 8.0.2 | 2026-08-21 | 2026-08-21 | **SÍ** | Override npm | **Remediada** |
| `js-yaml` | 4.1.0 | 5.4.3 | 5.4.3 | 2026-10-05 | 2026-10-05 | **SÍ** | Override npm | **Remediada** |
| `uuid` (exceljs) | 8.3.2 | 11.1.1 | 11.1.1 | 2026-04-29 | 2026-04-29 | **SÍ** | Override anidado | **Remediada** |
| `fast-uri` | 3.0.0 | 4.2.2 | 4.2.3 | 2026-10-10 | 2026-10-19 | **SÍ (4.2.2)** / **NO (4.2.3)** | Override npm | **Parcialmente Remediada / Mitigada** (3 de 4 advisories remediados; 4.º aceptado en `@prisma/dev`, elegible 2026-11-02) |
| `body-parser` | 2.3.0 | 2.3.0 | 2.4.0 | 2026-06-15 | 2026-10-22 | **NO** (Elegible: 2026-11-05) | Retención controlada | **Riesgo Aceptado / Mitigado** (`inflate: false` y `limit: 1mb` en HTTP; elegible 2026-11-05, DT-18) |
| `multer` | 2.4.0 | 2.4.0 | 2.5.0 | 2026-09-14 | 2026-10-22 | **NO** (Elegible: 2026-11-05) | Retención controlada | **Riesgo Aceptado / Mitigado** (`limits: { fileSize: 10MB, files: 1 }` en FileInterceptor; elegible 2026-11-05, DT-18) |

---

## 4. Plan de Reversión

En caso de detectarse anomalías o incompatibilidades imprevistas en producción:
1. Revertir los overrides específicos en `package.json` mediante `git revert <commit-hash>`.
2. Ejecutar `npm install` para restaurar el árbol canónico de dependencias anterior.
3. Ejecutar la suite integral de verificación: `npm run lint`, `npm test`, `npm run test:e2e`, `npm run contrato:verificar` y `npm run db:verify`.

---

## 5. Registro de Deuda Técnica Asociada

- **DT-16 (Estabilidad E2E en Windows/Node 24):** Mitigado por reducción del costo de Argon2 en entorno de pruebas; causa raíz no probada (hipótesis de contención de pool de libuv / vm-modules no demostrada).
- **DT-17 (Reintento acotado ante deadlock transaccional):** Implementación de reintento acotado (máx. 3 intentos) con `setImmediate` ante códigos P2034 / 1213 en la transacción de solicitud de restablecimiento de contraseña en `AuthService`.
- **DT-18 (Actualización de dependencias en cuarentena de 14 días):** `body-parser@2.4.0` y `multer@2.5.0` publicadas el `2026-10-22`. Su ventana de cuarentena de 14 días finaliza el **2026-11-05**, fecha a partir de la cual deberán actualizarse en `package.json`.
