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
5. **Inestabilidad del entorno de pruebas E2E en Windows:** Cierres fatales `0xC0000409` (`STATUS_STACK_BUFFER_OVERRUN`) bajo Node.js v24 con `--experimental-vm-modules` debido a contención de hilos nativos en libuv (Argon2id) y eventos huérfanos ante deadlocks concurrentes en InnoDB.

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
  - **Retención justificada de `body-parser` (2.3.0) y `multer` (2.4.0):** Las versiones publicadas con corrección (`body-parser@2.4.0` y `multer@2.5.0`) datan del `2026-10-22` (< 14 días). Se retienen en sus versiones estables.
- **Mitigación y Análisis de Riesgo:**
  - `body-parser`: La aplicación no expone endpoints que reciban payloads zlib comprimidos arbitrarios sin límite de tamaño; el middleware global `json({ limit: '10mb' })` y `urlencoded({ extended: true, limit: '10mb' })` limita estrictamente el tamaño antes de invocar la descompresión.
  - `multer`: La subida de adjuntos (`POST /adjuntos/subir`) opera con interceptores síncronos de memoria validados por `ParseFilePipe` con `MaxFileSizeValidator(10MB)` y `MagicBytesValidator` en `AdjuntosController`. No se emplean callbacks `fileFilter` asíncronos propensos a condiciones de carrera.

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

| Paquete | Versión Anterior | Versión Final | Estrategia | Estado de Vulnerabilidad |
|---|---|---|---|---|
| `qs` | 6.13.0 | 6.16.1 | Override npm | **Remediada** |
| `mysql2` | 3.9.0 | 3.24.6 | Override npm | **Remediada** |
| `deepmerge-ts` | 5.1.0 | 8.0.2 | Override npm | **Remediada** |
| `js-yaml` | 4.1.0 | 5.4.3 | Override npm | **Remediada** |
| `uuid` (exceljs) | 8.3.2 | 11.1.1 | Override anidado | **Remediada** |
| `fast-uri` | 3.0.0 | 4.2.2 | Override npm | **Parcialmente Remediada / Mitigada** (3 de 4 advisories remediados; 4.º aceptado por regla de 14 días en dev tooling) |
| `body-parser` | 2.3.0 | 2.3.0 | Retención controlada | **Riesgo Aceptado / Mitigado** (versión con fix 2.4.0 publicada el 2026-10-22 < 14 días; mitigado por límites de payload) |
| `multer` | 2.4.0 | 2.4.0 | Retención controlada | **Riesgo Aceptado / Mitigado** (versión con fix 2.5.0 publicada el 2026-10-22 < 14 días; mitigado por interceptores síncronos) |

---

## 4. Plan de Reversión

En caso de detectarse anomalías o incompatibilidades imprevistas en producción:
1. Revertir los overrides específicos en `package.json` mediante `git revert <commit-hash>`.
2. Ejecutar `npm install` para restaurar el árbol canónico de dependencias anterior.
3. Ejecutar la suite integral de verificación: `npm run lint`, `npm test`, `npm run test:e2e`, `npm run contrato:verificar` y `npm run db:verify`.
