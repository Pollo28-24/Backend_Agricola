# ADR-018: Actualización de Dependencias Vulnerables, Estabilización E2E y Gestión de Riesgos

**Estado:** Aceptado  
**Fecha:** 2026-10-29  
**Hito:** Hito 11F  
**Autor:** Senior Architect  

---

## 1. Contexto y Problema

Durante la auditoría de dependencias (`npm audit --omit=dev`) en el backend de Rentabilidad Agrícola tras el cierre del Hito 11E, se identificaron vulnerabilidades de seguridad en librerías de producción y dependencias transitivas:
1. **Denegación de servicio (DoS) y bypass en analizadores HTTP:** `body-parser` y `multer`.
2. **Vulnerabilidades en conectores de base de datos:** `mysql2` y `deepmerge-ts` en la cadena de conexión de Prisma.
3. **Denegación de servicio en parsers de documentos:** `js-yaml` y `uuid` utilizado por `exceljs`.
4. **Validación de esquemas y URIs:** `fast-uri` en validadores JSON.
5. **Inestabilidad del entorno de pruebas E2E en Windows (DT-16):** Abortos prematuros durante la inicialización global en pruebas de larga duración.

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
  - `body-parser` (https://github.com/advisories/GHSA-27r3-jxmh-p828): En `src/config/body-parser.config.ts`, `src/main.ts` y el helper de pruebas `test/setup/create-test-app.ts`, se desactiva el body-parser por defecto de NestJS (`bodyParser: false` en `NestFactory.create`) y se configuran explícitamente `json({ limit: '1mb', inflate: false })` y `urlencoded({ extended: true, limit: '1mb', inflate: false })`. Con `inflate: false`, body-parser rechaza inmediatamente cualquier petición con cabecera `Content-Encoding: gzip` o `deflate` con código HTTP 415 (Unsupported Media Type), mapeado a `CodigoError.PETICION_INVALIDA` en `DomainExceptionFilter`, sin intentar descompresión zlib en memoria.
  - `multer` (https://github.com/advisories/GHSA-q7qp-rjg7-q26m): En `AdjuntosController` (`POST /api/v1/gastos/:id/adjuntos`), el interceptor `FileInterceptor('archivo', { limits: { fileSize: 10 * 1024 * 1024, files: 1 } })` delega en Multer / Busboy el control de flujo en el stream de red sin definir `fileFilter` (evitando condiciones de carrera y dobles invocaciones del callback). Aborta inmediatamente con código HTTP 413 (`LIMIT_FILE_SIZE` / `ARCHIVO_DEMASIADO_GRANDE`) antes de que el archivo se almacene en memoria si supera los 10 MB. La validación de tipos y magic bytes se realiza de forma estricta y síncrona en `AdjuntosService.subirAdjunto` tras la carga controlada.

### Grupo G2: Pila de Persistencia Prisma y MariaDB
- **Decisión:**
  - Actualizar `@prisma/client`, `prisma` y `@prisma/adapter-mariadb` a la versión fija `7.10.0`.
  - Actualizar `mariadb` a la versión `3.5.4` y fijar overrides en `package.json`:
    - `"mariadb": "3.5.4"` (publicada `2026-09-01`).
    - `"mysql2": "3.24.6"` (publicada `2026-10-13`).
    - `"deepmerge-ts": "8.0.2"` (publicada `2026-08-21`).
  - Regenerar el cliente Prisma (`npx prisma generate`) y verificar paridad de migraciones (`prisma migrate status` y `prisma migrate diff`).
  - Configurar `DB_ALLOW_PUBLIC_KEY_RETRIEVAL`: Se encapsula en `src/config/database-security.config.ts` (`permitirRecuperacionClavePublica()`) permitiéndose únicamente cuando `DB_ALLOW_PUBLIC_KEY_RETRIEVAL=true` y `NODE_ENV !== 'production'`. En producción permanece estrictamente desactivado (fail-closed).
- **Mitigación y Análisis de Riesgo:**
  - Cero diferencias estructurales de base de datos; integridad referencial de 29 tablas y 50 llaves foráneas intacta (74/74 comprobaciones de `db:verify` exitosas).

### Grupo G3: Documentación OpenAPI y Parsers YAML
- **Decisión:**
  - Actualizar `@nestjs/swagger` a `11.4.7`.
  - Configurar override de npm para `"js-yaml": "5.4.3"` (publicada `2026-10-05`).
  - Desactivar Swagger en producción: En `src/config/openapi.config.ts`, la función `configurarSwagger(app)` evalúa `process.env.NODE_ENV === 'production'` y retorna `null` inmediatamente sin montar endpoints ni procesar documentos OpenAPI. Tampoco se configura `yamlDocumentUrl`, garantizando que `js-yaml` no se ejecute en el runtime de producción.
- **Mitigación y Análisis de Riesgo:**
  - Se eliminan vectores de denegación de servicio en producción. Verificado con `npm run contrato:verificar` sin discrepancias contra `docs/contrato/openapi.json`.

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
  - El override fuerza el uso de `uuid@11.1.1` dentro de `exceljs` sin romper la generación de libros Excel, validado con 17 pruebas E2E de exportación (`exportacion.e2e-spec.ts`).

### Grupo G5: Normalización de URIs y Estabilidad Concurrente (DT-17)
- **Decisión:**
  - Configurar override de npm para `"fast-uri": "4.2.2"` (publicada `2026-10-10`).
  - **Aceptación de riesgo residual en `fast-uri@4.2.2`:** La versión `4.2.3` que mitiga el 4.º advisory fue publicada el `2026-10-19` (< 14 días respecto al corte del hito). Se acepta el riesgo residual dado que dicho advisory afecta a `ajv` dentro del entorno de desarrollo de Prisma (`@prisma/dev`), sin impacto en el flujo de ejecución en producción ni en los endpoints de la API.
  - **Estabilización de Deadlocks y Event Loop (DT-17):** Implementación de reintento acotado (máximo 2 intentos) con turno diferido del bucle de eventos (`setImmediate`, sin sleeps síncronos) en `AuthService.solicitarRecuperacion` ante códigos `1213` (`ER_LOCK_DEADLOCK`).

---

## 3. Matriz de Vulnerabilidades Reportadas por Auditoría

<!-- Fuente: salida de npm audit del 2026-10-30 -->
| Paquete | Severidad | Rango Afectado | Fix Disponible | Via / Advisory URL |
|---|---|---|---|---|
| `@nestjs/platform-express` | high | `10.4.18 - 10.4.22 || 11.1.2 - 12.2.0` | `@nestjs/platform-express@12.3.2` | multer |
| `ajv` | moderate | `N/A` | `true` | fast-uri |
| `body-parser` | high | `2.0.0 - 2.3.0` | `true` | https://github.com/advisories/GHSA-27r3-jxmh-p828 |
| `fast-uri` | moderate | `4.0.0 - 4.2.2` | `true` | https://github.com/advisories/GHSA-w74x-v6f9-j3xg<br>https://github.com/advisories/GHSA-xhq7-xmqj-769h<br>https://github.com/advisories/GHSA-wjr9-j795-jxcr<br>https://github.com/advisories/GHSA-333x-w4r6-6crp |
| `multer` | high | `2.0.0 - 2.4.0` | `@nestjs/platform-express@12.3.2` | https://github.com/advisories/GHSA-q7qp-rjg7-q26m |

### Estado y Ventana de Elegibilidad de Paquetes Clave

| Paquete | Versión Instalada | Fecha Instalada | Fix Disponible | Fecha Fix | ¿Cumple ventana? (<= 2026-10-14) | Estado / Decisión |
|---|---|---|---|---|---|---|
| `body-parser` | 2.3.0 | 2026-06-15 | 2.4.0 | 2026-10-22 | **NO** (Elegible: 2026-11-05) | Mitigado (`inflate: false`, `limit: 1mb`, HTTP 415 con `PETICION_INVALIDA`). DT-18. |
| `multer` | 2.4.0 | 2026-09-14 | 2.5.0 | 2026-10-22 | **NO** (Elegible: 2026-11-05) | Mitigado (`limits: { fileSize: 10MB, files: 1 }`, sin `fileFilter`). DT-18. |
| `qs` | 6.16.1 | 2026-10-14 | 6.16.1 | 2026-10-14 | **SÍ** | Remediado con override npm. |
| `mysql2` | 3.24.6 | 2026-10-13 | 3.24.6 | 2026-10-13 | **SÍ** | Remediado con override npm. |
| `js-yaml` | 5.4.3 | 2026-10-05 | 5.4.3 | 2026-10-05 | **SÍ** | Remediado con override npm y Swagger omitido en prod. |
| `uuid` (exceljs) | 11.1.1 | 2026-04-29 | 11.1.1 | 2026-04-29 | **SÍ** | Remediado con override anidado en exceljs. |
| `fast-uri` | 4.2.2 | 2026-10-10 | 4.2.3 | 2026-10-19 | **SÍ (4.2.2)** / **NO (4.2.3)** | 3 advisories remediados; 4.º aceptado en `@prisma/dev` (elegible 2026-11-02). |
| `deepmerge-ts` | 8.0.2 | 2026-08-21 | 8.0.2 | 2026-08-21 | **SÍ** | Remediado con override npm. |

---

## 4. Plan de Reversión

En caso de detectarse anomalías o incompatibilidades imprevistas en producción:
1. Revertir los overrides específicos en `package.json` mediante `git revert <commit-hash>`.
2. Ejecutar `npm install` para restaurar el árbol canónico de dependencias anterior.
3. Ejecutar la suite integral de verificación: `npm run lint`, `npm test`, `npm run test:e2e`, `npm run contrato:verificar` y `npm run db:verify`.

---

## 5. Registro de Deuda Técnica Asociada

### DT-16: Estabilidad E2E en Windows/Node 24 (Causa raíz no probada)
- **Estado:** Causa raíz no probada.
- **Descripción:** Durante ejecuciones E2E prolongadas bajo Node.js v24 en Windows, se observaron abortos prematuros durante la etapa de inicialización global o teardown de suites.
- **Evidencia 1: Primeras 15 líneas de `g5_e2e_run2_fallida.log`:**
```text
> backend@0.0.1 test:e2e
> node --experimental-vm-modules ./node_modules/jest/bin/jest.js --config ./test/jest-e2e.json --runInBand


======================================================
🚀 INICIANDO GLOBAL SETUP E2E (HITO 6B)
🎯 Base de pruebas objetivo: rentabilidad_agricola_test
🖥️  Host: localhost:3306
======================================================

✅ Guard de 3 capas verificado con éxito sobre 'rentabilidad_agricola_test'
📦 Motor de base de datos detectado: MySQL nativo (Versión: 8.0.46)
🔄 Aplicando migraciones desde cero sobre la base limpia...
node.exe : Loaded Prisma config from prisma.config.ts.
```
- **Evidencia 2: Primeras 15 líneas de `b5_e2e_run5_prematura.log`:**
```text
> backend@0.0.1 test:e2e
> node --experimental-vm-modules ./node_modules/jest/bin/jest.js --config ./test/jest-e2e.json --runInBand


======================================================
🚀 INICIANDO GLOBAL SETUP E2E (HITO 6B)
🎯 Base de pruebas objetivo: rentabilidad_agricola_test
🖥️  Host: localhost:3306
======================================================

✅ Guard de 3 capas verificado con éxito sobre 'rentabilidad_agricola_test'
📦 Motor de base de datos detectado: MySQL nativo (Versión: 8.0.46)
🔄 Aplicando migraciones desde cero sobre la base limpia...
Loaded Prisma config from prisma.config.ts.
```

### DT-17: Reintento acotado ante deadlock transaccional
- Implementación de reintento acotado (máx. 2 intentos) con `setImmediate` ante códigos P2034 / 1213 en la transacción de solicitud de restablecimiento de contraseña en `AuthService`.

### DT-18: Actualización pendiente de `body-parser` y `multer`
- **Paquetes:** `body-parser@2.4.0` y `multer@2.5.0` publicados el `2026-10-22`.
- **Condición:** Cumplimiento de la ventana de cuarentena de 14 días a partir del **2026-11-05**.
- **Acción:** Actualizar las dependencias en `package.json` en un mantenimiento programado posterior a esa fecha.
