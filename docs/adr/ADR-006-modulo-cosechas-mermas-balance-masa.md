# ADR-006: Módulo de Cosechas y Mermas — Balance de Masa e Invariantes Físicas

## Estado
Aceptado

## Fecha
2026-10-19

## Contexto
El sistema de gestión agrícola requiere registrar la producción obtenida (`Cosecha`) y las pérdidas físicas ocurridas (`Merma`), tanto en campo como poscosecha. A diferencia de las actividades o los gastos, las cosechas y mermas manejan magnitudes físicas (masa) que determinan directamente el inventario vendible y la rentabilidad del ciclo productivo.

Existían riesgos arquitectónicos críticos detectados en la auditoría previa:
1. **Dependencia circular y duplicación de reglas de balance**: Si Cosechas consulta Mermas y Mermas consulta Cosechas, se introduce un acoplamiento cíclico entre módulos y se duplica la lógica de cálculo de kg equivalentes.
2. **Condiciones de carrera en balance de masa**: Concurrencia de múltiples capturistas registrando mermas o cosechas simultáneas que pudieran sobrepasar el inventario cosechado.
3. **Discrepancia en semántica del guard RBAC**: `PermisosGuard` implementa una semántica `AND`. Decorar con `@RequirePermisos('cosecha:crear', 'registro:administrar')` provocaría el bloqueo de usuarios con rol `CAPTURISTA`.
4. **Desviación de Schema Prisma**: El modelo `Cosecha` en `schema.prisma` carece de una columna `fecha` de negocio explícita, disponiendo únicamente de `createdAt`.

## Decisiones

### 1. Bounded Context y Helpers Transversales Puros en `common`
Para evitar dependencias circulares entre `CosechasModule` y `MermasModule`:
- Ningún módulo importa al otro.
- Toda la lógica compartida de balance de masa y concurrencia se ubica en `src/common`:
  - `bloquearCicloParaCaptura`: Ejecuta `SELECT id, estado, fecha_inicio, fecha_fin, empresa_id, deleted_at FROM ciclo_produccion WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL FOR UPDATE` asegurando orden canónico de bloqueo pesimista en MariaDB/MySQL.
  - `calcularBalanceMasaKg`: Agrega cosechas y mermas (`tipoMerma === POSCOSECHA`) convirtiendo cada cantidad a kilogramos mediante `cantidad * factorABase` usando estrictamente `Prisma.Decimal`.
  - `CicloBalanceMasaPolicy`: Política pura de dominio que valida la invariante física `kgMermaPoscosecha <= kgCosechados` (RN-032).
  - `UnidadPesoPolicy`: Valida que las unidades de medida asignadas correspondan a magnitudes de masa (`tipo === 'PESO'`) según RN-069.
  - `CicloCapturaPolicy`: Centralizada en `common/domain/policies/` con soporte para distinguir capturas en estado `PLANIFICADO` (válidas para actividades y gastos preparatorios, pero rechazadas con `CICLO_NO_ACTIVO` 409 para cosechas y mermas).
  - `RecordWindowValidator`: Validador unificado de autoría y ventana de 48 horas (RN-062), con adaptadores delgados en `actividades`, `gastos`, `cosechas` y `mermas`.

### 2. Tratamiento de Tipos de Merma (RN-031 / RN-032)
- **`Merma CAMPO`**: Representa pérdidas previas o durante la labor de recolección en campo (plagas, heladas, granizo). **No descuenta** del inventario cosechado ni está limitada por cosechas previas. Puede capturarse con 0 kg cosechados.
- **`Merma POSCOSECHA`**: Representa mermas en transporte, almacén o empaque. **Resta** directamente del producto disponible y nunca puede superar el total de kg cosechados del ciclo (`kgMermaPoscosecha <= kgCosechados`).

### 3. Aritmética de Masa y Moneda
Prohibido el uso de tipos flotantes IEEE 754 (`number` primitivo de JS o `parseFloat`). Todas las operaciones de conversión de unidades y balances se ejecutan con `Prisma.Decimal`, previniendo errores de redondeo como `0.1 * 3 !== 0.3`.

### 4. Matriz de Permisos y Orquestación de Bypass
- Como `PermisosGuard` evalúa con lógica `AND`, cada endpoint se decora con un único permiso operativo:
  - Cosechas: `POST /`, `GET /`, `GET /:id`, `PATCH /:id` con `@RequirePermisos('cosecha:crear')`. `DELETE /:id` con `@RequirePermisos('registro:administrar')`.
  - Mermas: `POST /`, `GET /`, `GET /:id`, `PATCH /:id` con `@RequirePermisos('merma:crear')`. `DELETE /:id` con `@RequirePermisos('registro:administrar')`.
- Los endpoints de consulta (`GET`) reutilizan los permisos de escritura debido a la inexistencia de un permiso específico `cosecha:leer` o `merma:leer` en el Documento Maestro v3.2.
- El bypass de visibilidad global y la omisión de la ventana de 48 horas por posesión de `registro:administrar` se orquesta **exclusivamente en la capa de servicio**.
- *Nota sobre roles personalizados*: Un rol que posea `registro:administrar` pero carezca de `cosecha:crear` o `merma:crear` no superará el guard para operaciones de creación/edición/lectura; esto es conforme a la especificación de privilegios de dominio.

### 5. Integridad Referencial Cruzada (RN-049 y RN-050)
- Si una merma poscosecha referencia una `cosechaId`, se valida que dicha cosecha pertenezca al mismo ciclo y empresa (`COSECHA_DE_OTRO_CICLO` 400).
- La eliminación de una cosecha verifica que no existan mermas poscosecha activas vinculadas directamente a ella (`COSECHA_CON_MERMAS_VIGENTES` 409).

## Consecuencias
- Desacoplamiento total entre `Cosechas` y `Mermas`.
- Protección estricta contra condiciones de carrera mediante serialización pesimista a nivel de fila de ciclo.
- Coherencia matemática y transaccional garantizada en auditoría y balance de masa.

## Deuda Técnica
1. **Pruebas e2e multiempresa reales**: Ejecutar suite end-to-end con dos empresas concurrentes en base de datos física para validar aislamiento tenant y locks transaccionales.
2. **Desviación de Schema Prisma (`Cosecha.fecha`)**: `Cosecha` no tiene columna `fecha` nativa en la base de datos (a diferencia de `Gasto` y `Merma`). Se utiliza `createdAt` para filtros temporales y auditoría. Deberá evaluarse agregar la columna en una migración futura si el negocio requiere registrar cosechas con fecha retroactiva independiente de la auditoría.
3. **Endpoints de Balance y Reportería**: `calcularBalanceMasaKg` se invoca internamente para validar la invariante física; si el frontend requiere consultar el balance de inventario, se expondrá formalmente en el módulo de Rentabilidad o Dashboard.
4. **Lock Timeout configurable**: Evaluar parametrización de `innodb_lock_wait_timeout` en transacciones de captura bajo alta concurrencia.
5. **Endurecimiento de Gastos y Actividades**: Gastos y Actividades actualmente leen el ciclo sin `FOR UPDATE`. Deben adoptar `bloquearCicloParaCaptura` en el hito de endurecimiento para evitar que se cuelen registros en ciclos en proceso de finalización.
6. **Ciclos.ejecutarTransicion sin bloqueo pesimista**: La transición de estados en `CiclosService` lee el ciclo con `tx.cicloProduccion.findFirst` sin `FOR UPDATE`. Requiere lock pesimista en el hito de endurecimiento (reportado, no tocado en este hito).
