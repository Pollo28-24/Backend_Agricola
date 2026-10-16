# ADR-003: Taxonomía y Manejo de Errores Prisma en DomainExceptionFilter

- **Estado:** Aceptado
- **Fecha:** 2026-10-16
- **Autor:** Staff Software Architect & Lead Backend Engineer
- **Módulos Afectados:** `src/common/filters/domain-exception.filter.ts`
- **Reglas de Negocio:** RN-043, Contratos HTTP hacia Flutter / Web

---

## Contexto
En NestJS, los errores no capturados lanzados por Prisma (`PrismaClientKnownRequestError`) son absorbidos por el filtro global genérico o se escapan como errores `500 Internal Server Error`. En algunos casos, si no se filtran adecuadamente, pueden exponer al cliente detalles internos de la base de datos (nombres de tablas físicas, columnas, índices únicos o sentencias SQL fallidas), lo que representa un riesgo de seguridad y rompe la consistencia del contrato de respuesta JSON del backend.

---

## El Problema de Foreign Keys y Multi-Tenancy (P2003)
En un sistema SaaS Multi-Tenant aislado lógicamente:
- Una clave foránea física en MariaDB/MySQL solo garantiza que el `ID` referenciado exista en la tabla foránea; **no garantiza que pertenezca a la misma `empresaId`**.
- Si un usuario malintencionado o desincronizado envía un ID que existe pero pertenece a otra empresa:
  - Si la base de datos ejecutara la inserción sin validación previa a nivel aplicación, ocurriría una **fuga de tenant** (Tenant Leak).
  - Si el ID no existe en absoluto en toda la base de datos, Prisma arroja el código `P2003` (Foreign key constraint violation).
- Si el filtro de excepciones mapeara a ciegas cualquier error `P2003` a `HTTP 409 Conflict`, estaría ocultando un error semántico de solicitud inválida (400 / 404 / 422).

---

## Alternativas Consideradas

### Alternativa A: Mapeo Automático Ciego en Exception Filter
- Interceptar `P2002`, `P2003`, `P2025` directamente en el filtro y mapear cada uno a un código HTTP fijo (409 para P2002/P2003, 404 para P2025) sin requerir validación previa en los servicios.
- **Descartada:** Peligro de fuga multi-tenant y respuestas semánticamente incorrectas (409 cuando en realidad el cliente mandó una relación que no existe).

### Alternativa B: Enfoque de Doble Línea de Defensa (Elegida)
- **Primera línea de defensa (Servicios de Dominio):** Todo servicio valida explícitamente la existencia de las entidades foráneas dentro del tenant antes de escribir (`where: { id, empresaId }`).
  - Si el registro padre o referencia no existe en el tenant, se lanza un `DomainError` específico (404 si la entidad principal no existe; 422 o 400 si la clave foránea no pertenece al tenant).
- **Segunda línea de defensa (DomainExceptionFilter):** El filtro actúa como red de seguridad residual para capturar errores de base de datos no controlados y sanitizarlos.

---

## Decisión Adoptada
Se adopta la **Alternativa B**, extendiendo `DomainExceptionFilter` para interceptar `PrismaClientKnownRequestError` bajo la siguiente taxonomía y política estricta de sanitización:

### Taxonomía de Mapeo de Códigos de Prisma:

1. **`P2002` (Unique constraint failed):**
   - **Código HTTP:** `409 Conflict`
   - **Mensaje al cliente:** `"Ya existe un registro con los datos proporcionados"`
   - **Justificación:** Ocurre ante colisiones de unicidad compuestas (ej. RFC de empresa, correo de usuario, o `[empresaId, nombre]` en predios).

2. **`P2003` (Foreign key constraint failed - Residual):**
   - **Código HTTP:** `409 Conflict`
   - **Mensaje al cliente:** `"No es posible completar la operación debido a dependencias con otros registros"`
   - **Justificación:** Dado que los servicios validan la existencia de dependencias entrantes, el error residual en base de datos ocurre principalmente al intentar eliminar entidades que poseen registros hijos dependientes activos (Restricción referencial `ON DELETE RESTRICT`).

3. **`P2025` (Record not found):**
   - **Código HTTP:** `404 Not Found`
   - **Mensaje al cliente:** `"El registro solicitado no existe o no se encuentra disponible"`
   - **Justificación:** Operaciones directas de `update` o `delete` sobre un registro que ya fue eliminado o cuyo ID no existe.

4. **Otros códigos `PrismaClientKnownRequestError` o errores genéricos:**
   - **Código HTTP:** `500 Internal Server Error`
   - **Mensaje al cliente:** `"Ocurrió un error interno en el servidor"`
   - **Log:** Se registra el error con stack trace completo internamente para diagnóstico.

### Regla Inmutable de Sanitización:
**Prohibido terminantemente exponer `error.meta`, nombres de constraints físicos, nombres de tablas/columnas internas o fragmentos de sentencias SQL al cliente en las respuestas JSON.**

---

## Consecuencias Técnicas
- **Contratos HTTP Blindados:** Las aplicaciones cliente (Flutter / Web) reciben respuestas de error limpias, estandarizadas y semánticamente correctas bajo el envelope JSON del backend.
- **Seguridad Robusta:** Se previene la fuga de información estructural del esquema de base de datos.
- **Claridad de Responsabilidades:** Los servicios se mantienen obligados a validar aislamiento de tenant (`empresaId`) y no delegar la seguridad en restricciones de base de datos.
