# ADR-009: Módulo de Cobros, Cuentas por Cobrar y Estado Derivado de Ventas

## Estado
Aceptado

## Fecha
2026-10-20

## Contexto y Problema
En el modelo de dominio agrícola (`Rentabilidad_Agricola_3.docx v3.2`), la venta representa el compromiso comercial y el devengo contable del ingreso por la cosecha producida. Sin embargo, el cobro representa la realización monetaria (flujo de efectivo o tesorería) y ocurre típicamente de forma diferida, fraccionada o al contado (a crédito, transferencia, efectivo, cheque).

Era necesario diseñar el Módulo de Cobros resolviendo las siguientes problemáticas críticas:
1. **Separación de Responsabilidades y Bounded Contexts**: Un cobro no altera el costo de producción, ni el ingreso devengado de la venta, ni el margen ni la utilidad del ciclo reportados en la vista oficial `v_rentabilidad_ciclo`.
2. **Inmutabilidad Contable**: Los movimientos de caja no deben poder editarse arbitrariamente ni eliminarse físicamente (RN-057, RN-064).
3. **Control de Concurrencia y Sobre-cobro (RN-054, RN-071)**: Evitar carreras de abonos concurrentes que excedan el total de la venta, y carreras de anulación simultánea.
4. **Cálculo de Saldos y Estados Derivados (RN-055, RN-056, RN-073)**: Evitar persistir estados desnormalizados y garantizar la regla institucional de que un abono parcial **nunca** se clasifica como `VENCIDA` en el estado principal, manteniendo un campo aditivo booleano `vencida` para alertas y filtros.
5. **Alineación con el Ciclo de Vida (RN-059, RN-060, RN-068)**: Permitir cobros y anulaciones en ciclos `FINALIZADO` (gestión poscosecha de cartera), pero bloquearlos en `CANCELADO` o `PLANIFICADO`.

---

## Decisiones de Arquitectura

### 1. Bounded Context: Cobro como Evento de Tesorería
- La entidad `CobroVenta` pertenece al subdominio de tesorería/cartera.
- `totalCobrado` es la sumatoria de cobros vigentes (`deletedAt IS NULL`).
- La vista de base de datos `v_rentabilidad_ciclo` totaliza las ventas no canceladas (`totalFacturado`) y los cobros vigentes (`cobrado`), verificando paridad matemática exacta con la API.

### 2. Inmutabilidad y Anulación Lógica (Soft Delete)
- No existen endpoints `PATCH` de modificación de montos/fechas ni endpoints `DELETE` físico.
- La corrección de un cobro se realiza exclusivamente mediante anulación lógica: `PATCH /api/v1/cobros/:id/anular`.
- La anulación marca `deletedAt = NOW()`, registra opcionalmente `motivoAnulacion`, y genera un registro de auditoría atómico con acción `ELIMINAR` sobre la entidad `CobroVenta`.
- Un cobro ya anulado no puede volver a anularse (`COBRO_YA_ANULADO` - 409 Conflict).

### 3. Orden Canónico de Bloqueos (Anti-Deadlock)
Para cumplir RN-071 y evitar abrazos mortales entre transacciones concurrentes:
1. **Paso 1**: Bloqueo o verificación del Ciclo de Producción (`tx.ciclo.findFirstOrThrow`). Se ejecuta la política `CicloCapturaPolicy.assertCaptureAllowed(ciclo, 'cobro')`.
2. **Paso 2**: Bloqueo pesimista de la Venta mediante `bloquearVentaParaModificacion(tx, empresaId, ventaId)` con `SELECT ... FROM venta v JOIN ciclo c ... WHERE v.id = ? AND c.empresa_id = ? FOR UPDATE`.
3. **Paso 3**: Relectura de datos volátiles bajo el lock (validación de `deletedAt` en anulación, y suma agregada de cobros vigentes en registro).
4. **Paso 4**: Validación de saldo disponible `(totalVenta - cobrosPrevios >= nuevoCobro)` arrojando `COBRO_EXCEDE_TOTAL` (409) si se sobrepasa.

### 4. Estado de Cobro Derivado y Campo Aditivo `vencida` (RN-055, RN-056, RN-073)
El estado de cobro de una venta **nunca se persiste** en la tabla `venta`. Se calcula dinámicamente mediante la política pura `VentaEstadoCobroPolicy`:
- Si la venta tiene `estado === 'CANCELADA'`: `estadoCobro = CANCELADA`, `saldoPendiente = "0.00"`, `vencida = false` (RN-055).
- Si `totalCobrado >= total`: `estadoCobro = PAGADA`, `saldoPendiente = "0.00"`, `vencida = false`.
- Si `0 < totalCobrado < total`: `estadoCobro = PARCIAL`, `saldoPendiente = (total - totalCobrado)`. **Nunca es `VENCIDA` en el enum**.
- Si `totalCobrado === 0`:
  - Si `hoy > fechaLimitePago`: `estadoCobro = VENCIDA`.
  - Si `hoy <= fechaLimitePago` (o `fechaLimitePago` es null): `estadoCobro = PENDIENTE`.
- **Bandera aditiva `vencida: boolean`**:
  `vencida = (estado !== 'CANCELADA' && saldo > 0 && fechaLimitePago !== null && hoy > fechaLimitePago)`.
  Permite identificar y alertar ventas con abono parcial pero cuyo plazo de pago ya expiró.
- **Reloj Institucional**: Cálculo de fecha en zona horaria `America/Mexico_City` usando `Intl.DateTimeFormat('en-CA', ...)` sin librerías externas pesadas.

### 5. Ubicación Compartida en `common`
- `VentaEstadoCobroPolicy` y `bloquearVentaParaModificacion` residen en `src/common/domain/policies/` y `src/common/utils/`.
- Justificación: Son consumidos de forma simétrica por el módulo `Ventas` (al consultar ventas, actualizar totales o listar) y por el módulo `Cobros` (al registrar y anular abonos), eliminando dependencias circulares entre ambos módulos.

### 6. Supuestos y Criterios Operativos
1. **Fecha del Cobro**: Si el cliente no la envía en el payload, se asume la fecha actual de México (`YYYY-MM-DD`). No se permiten fechas futuras respecto a hoy (`FECHA_COBRO_INVALIDA` - 400).
2. **Anulación sobre Venta Cancelada**: Se permite anular un cobro asociado a una venta previamente cancelada, considerándose un ajuste o conciliación contable de caja. El saldo de la venta permanece en `0.00`.
3. **Ciclo en `FINALIZADO` vs `CANCELADO`**: Se permiten cobros y anulaciones sobre ciclos finalizados (liquidaciones de cuentas por cobrar poscosecha). Se rechaza cualquier operación sobre ciclos cancelados con `CICLO_CERRADO` (409).
4. **Edición del Total de la Venta**: Si una venta es editada (`PATCH /api/v1/ventas/:id`), el nuevo total no puede ser inferior a la suma de cobros vigentes ya registrados (`COBRO_EXCEDE_TOTAL` - 409).

### 7. Matriz de Permisos (RBAC)
- Permiso granular: `cobro:crear` (utilizado tanto para registro como para anulación).
- Roles autorizados: `ADMINISTRADOR` y `CONTADOR`.
- Rol `CAPTURISTA`: Prohibido (403 Forbidden).

---

## Consecuencias y Garantías

### Positivas
- **Cero Sobreventa/Sobrecobro**: El bloqueo pesimista en orden estricto `ciclo -> venta` previene deadlocks y colisiones de saldo bajo concurrencia.
- **Consistencia Garantizada**: Auditoría atómica obligatoria con rollback en caso de fallo.
- **Transparencia en Listados**: `GET /api/v1/ventas` incluye `totalCobrado`, `saldoPendiente`, `estadoCobro` y `vencida` sin costo de consulta N+1 mediante agregaciones agrupadas por página.

### Deuda Técnica y Pasos Futuros (Diferidos a Hito 9)
1. Filtrado avanzado por `estadoCobro` en `GET /api/v1/ventas` (evaluación en memoria vs subconsultas SQL indexadas).
2. Alerta visual/notificación push cuando `vencida === true`.
