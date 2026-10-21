# ADR-007: Infraestructura de Pruebas E2E Transversales y Endurecimiento de Concurrencia (Hito 6B)

## Estado
Aceptado

## Fecha
2026-10-19

## Contexto
Previo a la construcción del módulo de **Ventas** (el componente con mayor exposición al riesgo de concurrencia y fuga multiempresa: RN-027, RN-052, RN-054, RN-071), el sistema de rentabilidad agrícola había validado sus políticas de dominio y transacciones casi exclusivamente mediante pruebas unitarias con mocks (`PrismaService` mockeado). 

Un mock en memoria no valida:
1. El aislamiento multi-tenant estricto (RN-003 / RN-068) frente a peticiones HTTP reales.
2. La serialización pesimista real de MySQL (`SELECT ... FOR UPDATE`) sobre el balance de masa (RN-032 / RN-070).
3. La carrera entre el cierre/finalización de un ciclo y la captura concurrente de gastos, actividades o cosechas (RN-010 / RN-012).
4. El rollback atómico de la transacción interactiva de Prisma cuando el registro de auditoría (`AuditService.registrar`) falla (RN-043 / ADR-001).
5. Las restricciones físicas del motor RDBMS (CHECK constraints de montos/cantidades mayores a cero y Foreign Keys con `ON DELETE RESTRICT`).

Por tanto, se definió el **Hito 6B** como un hito de endurecimiento técnico e infraestructura E2E transversal contra una base de datos MySQL 8.0.46 real dedicada.

---

## Decisiones

### 1. Infraestructura de Pruebas E2E y Guard de Tres Capas
Para blindar el entorno de desarrollo y evitar cualquier alteración accidental sobre la base de datos principal (`backend`), se implementó un guard de tres capas en `test/setup/e2e-env.ts`:
- **Capa 1 (Parseo de URL)**: Valida que la variable `DATABASE_URL` contenga exactamente el nombre de la base de pruebas `rentabilidad_agricola_test`.
- **Capa 2 (Consulta en Vivo)**: Ejecuta `SELECT DATABASE() AS db` al conectarse a MySQL y aborta inmediatamente si el resultado no es `rentabilidad_agricola_test`.
- **Capa 3 (Aborto Inmediato)**: Cualquier discrepancia interrumpe el proceso (`process.exit(1)`) sin emitir queries de modificación.

El archivo de configuración `test/jest-e2e.json` orquesta un `globalSetup` (`test/setup/global-setup.ts`) que limpia la base, ejecuta las migraciones oficiales de Prisma desde cero (`prisma migrate deploy`), siembra el catálogo base (`prisma/seed.ts`) y carga una semilla multiempresa con dos empresas completas (`Empresa A` y `Empresa B`), sus predios, parcelas, ciclos (ACTIVO y PLANIFICADO), usuarios (ADMIN, CAPTURISTA, CONTADOR) y registros asociados.

Las pruebas E2E se ejecutan mediante el script aislado `npm run test:e2e` con la bandera `--runInBand` para evitar colisiones de estado entre suites.

### 2. Compuerta de Lock Determinista (`waitUntilBlocked`)
Para verificar condiciones de carrera sin recurrir a esperas arbitrarias (`setTimeout` / `sleep`), se implementó una compuerta de sincronización basada en el motor de bloqueos de MySQL 8.0:
- Utiliza una conexión directa e independiente con el driver `mariadb` (para no consumir ni interferir con las conexiones del pool de Prisma).
- Consulta `performance_schema.data_locks WHERE LOCK_STATUS = 'WAITING'` y `information_schema.innodb_trx WHERE trx_state = 'LOCK WAIT'`.
- Permite a la prueba retener intencionalmente un bloqueo sobre un registro (`SELECT ... FOR UPDATE`), despachar N peticiones HTTP concurrentes vía supertest, verificar que las peticiones queden efectivamente encoladas esperando el lock en MySQL, y finalmente liberar el lock (`COMMIT`) para recolectar y validar las respuestas.

### 3. Orden Canónico de Bloqueo Pesimista
Para prevenir interbloqueos (*deadlocks*, MySQL errno 1213) entre transacciones de ciclo y transacciones de captura:
- Se estableció el orden canónico estricto: **Ciclo primero, luego Parcela**.
- La función centralizada `bloquearCicloParaCaptura` (en `src/common/utils/ciclo-balance.util.ts`) se ejecuta al inicio de la transacción interactiva de Prisma mediante SQL crudo:
  ```sql
  SELECT id, estado, fechaInicio, fechaFin, empresaId, deletedAt
  FROM ciclo_produccion
  WHERE id = ? AND empresaId = ? AND deletedAt IS NULL
  FOR UPDATE
  ```

### 4. Endurecimiento de Producción: Carrera de Cierre y Capturas
El análisis de carrera expuso que `GastosService` y `ActividadesService` no bloqueaban el ciclo en las operaciones de `actualizar` y `eliminar`, y que `CiclosService.ejecutarTransicion` leía el ciclo sin lock pesimista:
- **Gastos**: `crearGasto`, `actualizarGasto` y `eliminarGasto` ahora invocan `bloquearCicloParaCaptura` dentro de la transacción, releen el gasto bajo el lock (retornando 404 si fue eliminado concomitantemente) y validan `CicloCapturaPolicy`.
- **Actividades**: `crear`, `actualizar` y `eliminar` replican el mismo patrón de bloqueo y relectura.
- **Ciclos**: `ejecutarTransicion` bloquea el ciclo al inicio de la transacción (`bloquearCicloParaCaptura`) y respeta el orden canónico bloqueando la parcela posteriormente.

### 5. Corrección de Semántica en Permisos de Gastos
`PermisosGuard` implementa una semántica `AND`. En `GastosController`, los endpoints de lectura (`GET /` y `GET /:id`) estaban decorados con `@RequirePermisos('gasto:crear')`, impidiendo el acceso al rol `CAPTURISTA`. Se corrigió el decorador a un único permiso de lectura (`gasto:consultar` o equivalente del módulo), permitiendo la visibilidad acotada (scoped visibility) requerida por el negocio.

### 6. Regla de Aislamiento de Snapshot en Transacciones REPEATABLE READ (MySQL InnoDB)
En el nivel de aislamiento por defecto de MySQL InnoDB (`REPEATABLE READ`), la primera lectura no bloqueante (`SELECT` ordinario de Prisma) dentro de una transacción inicializa y fija de forma inmutable el snapshot MVCC (Read View) para toda la duración de dicha transacción.

Si un servicio realiza una lectura preliminar dentro de `$transaction` para obtener el `cicloId` antes de invocar `bloquearCicloParaCaptura`, y la transacción entra en espera de lock pesimista (`FOR UPDATE`), cualquier mutación confirmada por la transacción que sostenía el lock quedará invisible para las consultas posteriores de la transacción en espera.

**Regla Canónica Institucional:**
1. **Lectura preliminar externa**: Toda lectura requerida para resolver `cicloId` o pre-validar pertenencia DEBE ejecutarse FUERA de la transacción utilizando `this.prisma` (conexión fuera de `tx`).
2. **Primera sentencia en `tx`**: Dentro del callback `prisma.$transaction(async (tx) => { ... })`, la PRIMERA sentencia ejecutable DEBE ser el bloqueo pesimista `bloquearCicloParaCaptura(tx, cicloId, empresaId)`.
3. **Orden jerárquico de locks**: Si la operación involucra una entidad secundaria con lock pesimista (ej. `bloquearVentaParaModificacion`), dicho lock se adquiere inmediatamente después del ciclo (orden institucional: Ciclo -> Venta).
4. **Relectura bajo el lock**: La entidad se relee completamente bajo el lock pesimista para operar siempre sobre datos frescos confirmados.

Esta regla elimina condiciones de carrera donde operaciones concurrentes (como dobles cancelaciones de venta o cobros contra cancelación) leían estados no actualizados y violaban la exclusividad de estados finales.

---

## Tabla de Garantías: Esperadas vs. Reales (MySQL 8.0.46)

| Invariante / Objeto | Garantía Esperada (Maestro) | Estado Real en `information_schema` | Explicación / Concordancia |
| :--- | :--- | :--- | :--- |
| **Tablas Base** | 27 tablas de negocio + `_prisma_migrations` (28) | 29 tablas base | La tabla adicional es `refresh_token` (decisión 12 del Anexo B para autenticación JWT segura con rotación). |
| **Vistas Analíticas** | 5 vistas (`v_comparativo_parcela`, `v_costo_por_actividad`, `v_costo_por_categoria`, `v_merma_desglose`, `v_rentabilidad_ciclo`) | 5 vistas | 100% concordante con migración 3 (`vistas_indicadores`). |
| **Foreign Keys (FK)** | 48 claves foráneas | 49 claves foráneas | La FK adicional es `refresh_token_usuarioId_fkey` (`usuarioId` -> `usuario.id`, RESTRICT/CASCADE) asociada a la tabla 29. 41 RESTRICT/CASCADE, 3 RESTRICT/RESTRICT, 1 SET NULL/CASCADE, 4 CASCADE/CASCADE. |
| **Un solo ciclo activo por parcela (RN-009)** | Índice único condicional por parcela en ciclos activos | `ciclo_produccion_claveCicloActivo_key` UNIQUE | Implementado sobre columna STORED GENERATED `claveCicloActivo` (`case when estado='ACTIVO' and deletedAt is null then parcelaId end`). Rechaza concurrencia con errno 1062 / P2002. |
| **CHECK Constraints Físicos** | 19 restricciones de integridad física | 19 CHECK constraints activos | Incluye `chk_gasto_total`, `chk_cosecha_cantidad`, `chk_merma_cantidad`, `chk_predio_superficie`, etc. Validado rechazo con MySQL errno 3819. |
| **Aislamiento Multi-tenant (RN-003 / RN-068)** | Empresa A nunca ve ni muta recursos de Empresa B (404 estricto) | Filtros de tenant y políticas de dominio en servicios | Verificado en 21 pruebas E2E (`multiempresa-isolation.e2e-spec.ts`). Cero fugas. |
| **Balance de Masa Concurrente (RN-032 / RN-070)** | Dos mermas poscosecha concurrentes no superan la cosecha disponible | `SELECT ... FOR UPDATE` sobre el ciclo + `CicloBalanceMasaPolicy` | Verificado en `concurrencia-balance-masa.e2e-spec.ts`. Exactamente 1 pasa (201) y 1 falla con 409 `MERMA_EXCEDE_COSECHA`. Cero deadlocks (1213). |
| **Carrera de Cierre vs Captura (RN-010 / RN-012)** | Captura no se guarda si el ciclo se cerró concurrentemente | `bloquearCicloParaCaptura` serializa cierre y capturas | Verificado en `carrera-cierre-ciclo.e2e-spec.ts`: peticiones concurrentes se encolan y dan 409 `CICLO_CERRADO`. |
| **Rollback de Auditoría (ADR-001 / RN-043)** | Falla en bitácora revierte toda la transacción | Transacción interactiva de Prisma `tx` | Verificado en 5 operaciones mutantes en `rollback-auditoria.e2e-spec.ts`. Cero registros huérfanos. |

---

## Deuda Técnica Documentada

1. **Serialización de Transiciones de Ciclos**: La concurrencia entre capturas y transiciones de ciclo queda serializada mediante el bloqueo del ciclo. Si a futuro se requiere alta concurrencia de lectura analítica sobre ciclos cerrados, se recomienda desacoplar la vista analítica del ciclo transaccional.
2. **Cobertura E2E de Actividades en Carrera**: La suite `carrera-cierre-ciclo.e2e-spec.ts` probó exhaustivamente la carrera contra Gastos y Cosechas; los cambios en `ActividadesService` aplican el mismo patrón verificado, pero convendría agregar una prueba E2E específica en el siguiente refactor.
3. **Ejecución Serializada de Pruebas E2E (`--runInBand`)**: Las pruebas E2E comparten el estado de `rentabilidad_agricola_test`. Ejecutar pruebas en paralelo requeriría bases de datos efímeras por worker (ej. `rentabilidad_agricola_test_1`, `_2`), lo cual queda documentado como optimización futura para CI/CD.
4. **Privilegios de `performance_schema`**: La compuerta `waitUntilBlocked` consulta `performance_schema.data_locks`, lo que requiere que el usuario de pruebas en CI tenga permisos de lectura sobre dicho esquema.
5. **Mapeo de Fechas en Cosechas**: El modelo `Cosecha` de Prisma utiliza `createdAt` como fecha de timestamp; la validación de coherencia temporal (RN-044) se apoya en el DTO y en `createdAt` de la entidad.
