# ADR-002: Control de Concurrencia en Cuotas Comerciales (RN-037)

- **Estado:** Aceptado
- **Fecha:** 2026-10-16
- **Autor:** Staff Software Architect & Lead Backend Engineer
- **Módulos Afectados:** `EstructuraService` (futuro `ParcelasService`), `UsuariosService`
- **Reglas de Negocio:** RN-037

---

## Contexto
El modelo de negocio SaaS establece planes de suscripción (`plan_suscripcion`) que imponen cuotas máximas de recursos por empresa (`empresa`):
- `maxParcelas`: Cantidad máxima de parcelas activas permitidas.
- `maxUsuarios`: Cantidad máxima de cuentas de usuario activas permitidas.

La verificación de estas cuotas en el código actual se ejecuta típicamente en dos pasos asíncronos desacoplados:
1. `prisma.parcela.count({ where: { predio: { empresaId }, deletedAt: null } })` (o `usuario.count`).
2. Evaluación `if (conteo >= limite) throw new DomainError(...)`.
3. Inserción `prisma.parcela.create(...)` o reactivación de usuario.

---

## Problema
En entornos con solicitudes HTTP concurrentes (ej. dos administradores creando parcelas o invitando usuarios al mismo tiempo, o un frontend enviando peticiones duplicadas por debounce deficiente):
1. La Petición A y la Petición B leen simultáneamente un conteo de 4 parcelas (con un límite plan de 5).
2. Ambas evalúan que `4 < 5` y consideran la validación exitosa.
3. Ambas proceden al `INSERT`.
4. El conteo final de parcelas activas asciende a 6, vulnerando el límite comercial del plan contratado (RN-037) y habilitando el abuso de consumo sin actualización de plan.

---

## Alternativas Consideradas

### Alternativa A: Contador desnormalizado en la tabla `empresa` con constraint CHECK
- Agregar columnas como `parcelasActuales INT` y `usuariosActuales INT` en la tabla `empresa`, actualizándolas con triggers o transacciones e imponiendo un constraint `CHECK (parcelasActuales <= maxParcelas)`.
- **Descartada:** Viola explícitamente el **Blindaje 1** del proyecto ("Prohibido agregar columnas de contadores rápidos para eludir el control transaccional de cuotas; prohibido modificar schema.prisma sin justificación insalvable"). Desnormaliza el estado y crea problemas de sincronización frente a borrados lógicos o restauraciones.

### Alternativa B: Nivel de Aislamiento Transaccional `SERIALIZABLE` en Prisma
- Ejecutar la transacción interactiva bajo `isolationLevel: Prisma.TransactionIsolationLevel.Serializable`.
- **Descartada:** En MySQL/InnoDB, `SERIALIZABLE` convierte todos los `SELECT` ordinarios en `SELECT ... LOCK IN SHARE MODE`, provocando bloqueos de rango excesivos y una alta tasa de deadlocks (código de error 1213) que degrada el rendimiento de la aplicación entera y requiere reintentos exponenciales complejos.

### Alternativa C: Bloqueo Pesimista de Fila (`SELECT ... FOR UPDATE`) sobre la Empresa Padre (Elegida)
- Utilizar una transacción interactiva de Prisma (`prisma.$transaction`) donde se adquiere un lock exclusivo sobre el registro de la empresa en la tabla `empresa` antes de verificar el conteo.
- **Pros:**
  - Garantiza serialización estricta por empresa (tenant) sin impactar a otras empresas.
  - Elimina las condiciones de carrera al 100%.
  - No altera el schema de base de datos ni requiere migraciones (respeta Blindaje 1).
- **Contras:** Pequeña espera en cola para mutaciones concurrentes de la misma empresa (comportamiento esperado y deseado para forzar consistencia de cuota).

---

## Decisión Adoptada
Se adopta la **Alternativa C** para todas las mutaciones que impacten cuotas de planes (creación de parcelas, creación de usuarios y reactivación de usuarios inactivos).

### Protocolo de Implementación Obligatorio:
1. Toda verificación y mutación debe residir dentro de un bloque interactivo `prisma.$transaction(async (tx) => { ... })`.
2. **Adquisición del Bloqueo:** Ejecutar un lock pesimista sobre la fila de la empresa:
   ```typescript
   await tx.$queryRaw`SELECT id FROM empresa WHERE id = ${empresaId} FOR UPDATE`;
   ```
   - **Regla estricta:** Solo se permite `$queryRaw` mediante tagged template literals con escape automático de parámetros para evitar inyecciones SQL. **Prohibido el uso de `$queryRawUnsafe`**.
   - **Mapeo físico:** La tabla se llama `empresa` (confirmado en `prisma/schema.prisma` línea 140 `@@map("empresa")`).
3. **Flujo de Ejecución Atómico:**
   ```text
   Lock Empresa (FOR UPDATE)
     ↳ Obtener plan y límites (maxParcelas / maxUsuarios)
     ↳ Count actual de registros activos del tenant con tx
     ↳ Validación estricta contra el límite del plan (throw DomainError 409 o 400 si supera)
     ↳ Insert / Update de la entidad con tx
     ↳ Registro de Bitácora de Auditoría (AuditService con tx)
   Commit
   ```

---

## Consecuencias Técnicas y Limitaciones de Pruebas
- **Consistencia Garantizada:** Se previene de forma determinista la superación inadvertida de los límites comerciales de suscripción (RN-037).
- **Aislamiento Multi-Tenant:** El lock es a nivel de fila individual de la empresa afectada; otras empresas del SaaS no experimentan contención.
- **Nota Crítica sobre Pruebas:**
  Los mocks unitarios de Jest (`jest.fn()`) simulan llamadas secuenciales pero **no prueban concurrencia real de hilos ni mecanismos de lock de base de datos**. La verificación de concurrencia real bajo hilos simultáneos debe planificarse y ejecutarse sobre una instancia real de MariaDB/MySQL (Dockerizada) en la Fase 4.
