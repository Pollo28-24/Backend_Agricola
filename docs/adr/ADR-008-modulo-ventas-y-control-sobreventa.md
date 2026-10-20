# ADR-008: Módulo de Ventas, Control de Sobreventa y Revalidación Cruzada (Hito 7)

## Estado
Aceptado

## Contexto
El Documento Maestro v3.2 (*Rentabilidad Agrícola*, secciones 2.10, 3.14, 3.16, 3.24) define el proceso de comercialización de la producción agrícola como una de las áreas críticas del sistema debido a su impacto financiero directo y al riesgo de condiciones de carrera sobre el inventario físico disponible.
Las ventas representan la salida física de masa cosechada del ciclo de producción (RN-027). A diferencia de los registros operativos de campo (Gastos, Actividades, Cosechas), las Ventas no poseen una columna directa `empresaId` en el esquema relacional físico, por lo que el aislamiento multiempresa debe resolverse indefectiblemente a través de la relación jerárquica con el `CicloProduccion` (`ciclo.empresaId`).
Adicionalmente, el ciclo de vida de una venta exige control estricto de sobreventa (`kgVendidos <= kgNetos`), cuadratura de totales (RN-052), reemplazo atómico de renglones en edición, auditoría completa por bitácora (dado que `detalle_venta` no implementa soft delete) y cancelación no destructiva (RN-055), sin provisión de endpoint de eliminación física (`DELETE`).

## Decisiones de Diseño y Arquitectura

### 1. Bounded Context y Modelo de Dominio
- **Entidades**: `Venta` (cabecera) y `DetalleVenta` (renglones físicos).
- **Aislamiento Multiempresa**: La tabla `venta` no contiene `empresaId`. Todo acceso (lectura, mutación, bloqueo o cancelación) se filtra estrictamente mediante `ciclo: { empresaId, deletedAt: null }`. Los accesos a recursos de otras empresas retornan `404 Not Found` (`RECURSO_NO_ENCONTRADO`), impidiendo enumeración no autorizada.
- **Acceso y Visibilidad**: De acuerdo con la sección 2.10.3, las Ventas **no tienen ventana de edición de 48 horas ni visibilidad acotada por creador**. Todo usuario con permiso `venta:crear` puede listar, consultar y editar ventas de la empresa (sin `RecordWindowValidator`).

### 2. Orden Transaccional Pesimista Estricto (Ciclo Primero, Venta Después)
Para serializar concurrentemente con el cierre del ciclo (RN-015), con mutaciones de masa (Cosechas/Mermas) y preparar la integración transaccional con Cobros en el Hito 8 (RN-071), se establece una única `$transaction` por operación con orden inmutable:
1. **Bloqueo del Ciclo**: `bloquearCicloParaCaptura(tx, cicloId, empresaId)` ejecutando `SELECT ... FOR UPDATE` sobre `ciclo_produccion`.
2. **Bloqueo de la Venta (en actualización y cancelación)**: `SELECT v.id FROM venta v INNER JOIN ciclo_produccion c ON v.cicloId = c.id WHERE v.id = ? AND c.empresaId = ? AND v.deletedAt IS NULL FOR UPDATE`.
3. **Relectura y Validación bajo lock**: Verificación de ciclo activo y de que la venta no esté previamente cancelada (`VENTA_YA_CANCELADA` 409).

### 3. Balance de Masa y Control de Sobreventa (RN-027 / RN-070)
- **Fórmula de Masa**:
  $$\text{kgCosechados} = \sum (\text{cantidad} \times \text{factorABase}) \quad [\text{cosechas activas}]$$
  $$\text{kgMermaPoscosecha} = \sum (\text{cantidad} \times \text{factorABase}) \quad [\text{mermas } \ne \text{'CAMPO'}]$$
  $$\text{kgVendidos} = \sum (\text{cantidad} \times \text{factorABase}) \quad [\text{renglones ventas } \ne \text{'CANCELADA'}]$$
  $$\text{kgNetos} = \text{kgCosechados} - \text{kgMermaPoscosecha}$$
  $$\text{kgDisponibles} = \text{kgNetos} - \text{kgVendidos}$$
- **Patrón Escribir, Recalcular y Revertir**: Se escribe la venta dentro de la transacción, se ejecuta `calcularBalanceMasaKg(tx, cicloId)` y la política pura `CicloBalanceMasaPolicy.assertVendidoNoExcedeNetos(balance)` valida `kgVendidos <= kgNetos`. Si excede, lanza `DomainError(VENTA_EXCEDE_DISPONIBLE, 409)` y la transacción se revierte por completo (rollback). No se resta lo vendido dos veces ni se hace aritmética frágil antes de escribir.
- **Validación contra el Ciclo, no contra Cosecha**: La disponibilidad física se valida contra la masa neta total del ciclo de producción (como especifica el Documento Maestro). La cosecha indicada en el renglón actúa como trazabilidad de lote de origen (RN-053), pero no como silo aislado de masa.
- **Calidad de Renglón Desacoplada**: La calidad asignada al renglón de venta no se restringe por la calidad de la cosecha referenciada, permitiendo reclasificaciones comerciales de empaque.

### 4. Reemplazo Atómico de Renglones y Trazabilidad de Auditoría
- En `actualizarVenta`, si se proporcionan nuevos renglones, se ejecuta un reemplazo total atómico (`deleteMany` y `createMany` dentro de la transacción).
- Dado que `detalle_venta` se elimina físicamente (carece de `deletedAt`), la bitácora de auditoría es su único registro histórico. Por tanto, `valoresAnteriores` y `valoresNuevos` de la acción `ACTUALIZAR` capturan el snapshot íntegro de la cabecera y el arreglo completo de renglones con sus atributos (`unidadId`, `calidad`, `cantidad`, `precioUnitario`, `cosechaId`).

### 5. Supuestos de Negocio Adoptados
1. **Cliente Inactivo**: Un cliente con `activo: false` no puede recibir nuevas ventas ni ser asignado en ediciones (`CLIENTE_NO_ACTIVO` 400).
2. **Impuesto vs Total**: Se impone la salvaguarda de que `impuesto <= total`, impidiendo que el ingreso neto facturado resulte negativo (`TOTAL_NO_COINCIDE` 400).
3. **Límite de Renglones**: Mínimo 1 y máximo 50 renglones por venta.
4. **Ausencia de DELETE**: No existe endpoint DELETE en Ventas. La anulación comercial se realiza exclusivamente vía `PATCH /ventas/:id/cancelar` pasando el estado a `CANCELADA` (RN-055), liberando automáticamente la masa comprometida.

### 6. Matriz de Permisos (RBAC RN-064)
| Endpoint | Método | Permiso Requerido | Comportamiento CAPTURISTA | Comportamiento ADMIN / CONTADOR |
| :--- | :--- | :--- | :--- | :--- |
| `/ventas` | `POST` | `venta:crear` | 403 `PERMISO_DENEGADO` | 201 Created |
| `/ventas` | `GET` | `venta:crear` | 403 `PERMISO_DENEGADO` | 200 OK |
| `/ventas/:id` | `GET` | `venta:crear` | 403 `PERMISO_DENEGADO` | 200 OK |
| `/ventas/:id` | `PATCH` | `venta:crear` | 403 `PERMISO_DENEGADO` | 200 OK |
| `/ventas/:id/cancelar` | `PATCH` | `venta:cancelar` | 403 `PERMISO_DENEGADO` | 200 OK |

### 7. Taxonomía de Códigos de Error
- **Reutilizados**:
  - `TOTAL_NO_COINCIDE` (400 Bad Request) - Error en cuadratura RN-052 o impuesto > total.
  - `COSECHA_DE_OTRO_CICLO` (400 Bad Request) - Renglón referencia cosecha de ciclo ajeno (RN-053).
  - `CICLO_CERRADO` (409 Conflict) - Ciclo en FINALIZADO o CANCELADO (RN-015).
  - `CICLO_NO_ACTIVO` (409 Conflict) - Ciclo en PLANIFICADO.
  - `FECHA_ANTERIOR_AL_INICIO` (400 Bad Request) - Fecha de venta anterior a inicio del ciclo (RN-044).
  - `UNIDAD_NO_PESO` (400 Bad Request) - Unidad del renglón no pertenece a la familia PESO (RN-069).
  - `PERMISO_DENEGADO` (403 Forbidden) - Usuario sin permiso en JWT (RN-064).
  - `RECURSO_NO_ENCONTRADO` (404 Not Found) - Ciclo, cliente, cosecha o venta ajena o inexistente.
- **Nuevos Aditivos**:
  - `VENTA_EXCEDE_DISPONIBLE` (409 Conflict) - Masa vendida excede la masa neta disponible del ciclo (RN-027).
  - `VENTA_YA_CANCELADA` (409 Conflict) - Intento de editar o volver a cancelar una venta en estado CANCELADA.
  - `CLIENTE_NO_ACTIVO` (400 Bad Request) - Cliente dado de baja o inactivo.
  - `COSECHA_CON_VENTAS_VINCULADAS` (409 Conflict) - Rechazo de eliminación de cosecha con renglones de venta no cancelados (RN-050).
  - `KG_VENDIDOS_EXCEDEN_NETOS` (409 Conflict) - Revalidación al reducir cosecha o incrementar merma poscosecha que dejaría lo vendido por encima de lo neto (RN-070).

## Deuda Técnica Pagada en este Hito
- **RN-027**: Validación de balance de masa de ventas integrada en `CicloBalanceMasaPolicy` bajo lock del ciclo.
- **RN-050**: Cosechas no pueden eliminarse si tienen renglones vinculados a ventas vigentes.
- **RN-070**: Mutaciones en Cosechas (actualizar/eliminar) y Mermas (crear/actualizar) revalidan que los kg netos no queden por debajo de los kg vendidos acumulados.

## Deuda Técnica Remanente
1. **Cobros de Ventas (Hito 8)**: Reglas RN-054, RN-063, RN-071 y el cálculo de estado de cobro derivado (`PENDIENTE`, `PARCIAL`, `COBRADO`, `VENCIDO`). La edición de ventas deberá validar `nuevo total >= sum(cobros vigentes)`. La cancelación de ventas no destruirá cobros, dejándolos para conciliación (RN-055).
2. **Paridad TS vs SQL View**: La paridad exacta entre el cálculo aritmético en TypeScript (`calcularBalanceMasaKg`) y la vista SQL (`v_rentabilidad_ciclo`) quedó cubierta y garantizada mediante pruebas end-to-end (`ventas.e2e-spec.ts`).
3. **Consistencia de Entidades Inactivas**: Proveedores y categorías en Gastos deberán alinearse con la política estricta de validación de entidades activas adoptada para Clientes en Ventas.
4. **Idempotencia de Reintentos**: Uso de `uuidCliente` (Decisión 13) para peticiones de red repetidas bajo inestabilidad.
5. **Pruebas E2E de RN-072 y RN-038**: Cobertura end-to-end para transferencias y mermas de almacén.
6. **Avisos de Lint Preexistentes**: Se preservan los avisos históricos en tests sin introducir nuevos avisos en código de producción.
