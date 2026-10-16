# ADR-001: Auditoría Transaccional y Semántica MySQL/InnoDB

- **Estado:** Aceptado
- **Fecha:** 2026-10-16
- **Autor:** Staff Software Architect & Lead Backend Engineer
- **Módulos Afectados:** `AuditService`, `CiclosService`, `UsuariosService`, `EmpresasService`
- **Reglas de Negocio:** RN-043, RN-060, RN-074

---

## Contexto
El sistema implementa un esquema SaaS Multi-Tenant aislado por `empresaId` con requerimientos estrictos de trazabilidad e inmutabilidad de bitácora (RN-043 y RN-060). Cada mutación crítica de negocio debe quedar registrada en la tabla física `bitacora_auditoria` asegurando la exclusión o enmascaramiento de secretos (RN-074: contraseñas, hashes, tokens).

Actualmente, `AuditService.registrar()` (`src/prisma/audit.service.ts`) opera exclusivamente de forma no transaccional:
- Ejecuta la inserción sobre `this.prisma.bitacoraAuditoria.create(...)`.
- Envuelve la llamada en un bloque `try/catch` que silencia fallos escribiendo en `logger.error` o `logger.warn`.
- Retorna prematuramente si no encuentra `empresaId` en los argumentos ni en el contexto CLS (`nestjs-cls`).
- No acepta una instancia transaccional `Prisma.TransactionClient` (`tx`).

Como consecuencia de esta limitación, `CiclosService` implementó un método privado duplicado `registrarAuditoriaTx()`, el cual interactúa directamente con `tx.bitacoraAuditoria.create()`, omitiendo la invocación de `sanitizarValoresAuditoria()` y rompiendo el principio de responsabilidad única (DRY) y RN-074.

---

## Problema y Gotcha Crítico en MySQL/InnoDB
A diferencia de motores como PostgreSQL donde una sentencia errónea aborta de facto el estado transaccional completo (`current transaction is aborted, commands ignored until end of transaction block`), en **MySQL / MariaDB bajo el motor de almacenamiento InnoDB**, una sentencia que falla dentro de una transacción interactiva (`BEGIN ... COMMIT`) **NO aborta automáticamente toda la transacción**:
1. Si un error al insertar en `bitacora_auditoria` (por ejemplo, timeout, deadlock, truncado de campo o discriminador de tenant ausente) es capturado y silenciado (`try/catch` con logueo pasivo) dentro de `$transaction(async (tx) => { ... })`, el motor InnoDB continuará la ejecución de las sentencias previas o posteriores.
2. Al llegar al final de la función, Prisma enviará el `COMMIT`, persistiendo las modificaciones de negocio (ej. cierre de ciclo, creación de entidades, cambio de estados) **sin dejar rastro alguno en la bitácora**.
3. Esto constituye una violación flagrante de las reglas RN-043 y RN-060 de auditoría inmutable en un sistema SaaS financiero-agrícola de misión crítica.

---

## Alternativas Consideradas

### Alternativa A: Auditoría asíncrona desacoplada mediante Event Emitter o Message Broker (Outbox / Queue)
- **Pros:** Desacopla la latencia de la inserción de auditoría del ciclo de vida HTTP. Mayor throughput.
- **Contras:** Introduce complejidad de infraestructura prematura (Redis / RabbitMQ). No garantiza atomicidad estricta transaccional si el proceso colapsa antes de encolar o si se requiere que la operación falle si no se puede auditar.

### Alternativa B: Unificación Bimodal en `AuditService` con Inyección de `Prisma.TransactionClient` (Elegida)
- **Pros:**
  - Permite reutilizar toda la sanitización de secretos de RN-074 de manera centralizada.
  - Elimina código duplicado como `CiclosService.registrarAuditoriaTx()`.
  - Diferencia semánticamente el flujo transaccional atómico (throw on failure) del flujo simple fuera de transacción (fail-safe).
- **Contras:** Asimetría de comportamiento documentada entre llamadas que pasan `tx` y llamadas que no lo pasan.

---

## Decisión Adoptada
Se adopta la **Alternativa B**, refactorizando la firma de `AuditService.registrar`:

```typescript
async registrar(
  options: RegistrarAuditoriaOptions,
  tx?: Prisma.TransactionClient,
): Promise<void>
```

### Comportamiento en Modo Transaccional (`tx` presente):
1. **Validación de Tenant Obligatoria:** Si no se suministra `empresaId` ni se encuentra en el almacén CLS, **lanza inmediatamente una excepción crítica de dominio (`DomainError` o `BadRequestException`)**. Prohibido continuar sin tenant.
2. **Cliente Transaccional:** Se delega la inserción a `tx.bitacoraAuditoria.create({ data: ... })`.
3. **Rollback Forzado:** No se silencia ningún error. Cualquier fallo de base de datos se relanza (`throw error`) para garantizar que la transacción interactiva de Prisma ejecute un `ROLLBACK` total en InnoDB.
4. **Sanitización Inmutable:** Los valores anteriores y nuevos pasan obligatoriamente por `sanitizarValoresAuditoria()` antes de serializarse a JSON.

### Comportamiento en Modo No Transaccional (`tx` ausente):
1. Se delega la inserción a `this.prisma.bitacoraAuditoria.create({ data: ... })`.
2. Si no hay `empresaId`, emite advertencia en el logger y no propaga error a operaciones no críticas.
3. Si la base de datos rechaza la inserción, captura el error en `catch`, lo reporta a `logger.error` y preserva la estabilidad de la respuesta HTTP.

---

## Consecuencias Técnicas
- **Positivas:**
  - Garantía absoluta de consistencia ACID en operaciones multi-tabla complejas (Ciclos, Bajas Lógicas de Usuarios, etc.).
  - Cumplimiento inquebrantable de RN-043, RN-060 y RN-074.
  - Eliminación de deuda técnica y métodos privados duplicados en `CiclosService`.
- **Negativas / Mitigaciones:**
  - Los desarrolladores deben tener presente pasar el parámetro `tx` siempre que se encuentren dentro de un bloque `prisma.$transaction`. Se cubre con pruebas unitarias exhaustivas que verifiquen el rethrow transaccional.
