# ADR-010: Módulo de Reportes, Indicadores de Rentabilidad y Alertas (Hito 9)

## Estado
Aceptado e Implementado (9A, 9A.1 y 9B)

## Fecha
2026-10-21

## Contexto y Problema
El sistema de gestión agrícola (`Rentabilidad_Agricola_3.docx v3.2`) requiere calcular, consolidar y presentar indicadores financieros, agronómicos y de eficiencia para ciclos de producción y parcelas.

Los requerimientos y restricciones arquitectónicas clave son:
1. **Bounded Context de Solo Lectura**: Operaciones estrictamente de consulta analítica (RN-034/035/036/057/058/064/066). Las llamadas a reportes no generan registros en `bitacora_auditoria` (RN-036).
2. **Vistas como Única Fuente de Fórmulas**: Las fórmulas de margen, ROI, costo por kg, precio promedio, merma %, costo/ha y rendimiento kg/ha residen exclusivamente en las vistas SQL de base de datos (`v_rentabilidad_ciclo`, `v_costo_por_categoria`, `v_costo_por_actividad`, `v_merma_desglose` y `v_comparativo_parcela`). Ningún ratio o porcentaje financiero se calcula en TypeScript.
3. **Escalabilidad y Diseño en Dos Pasos**: Mitigar el costo de las subconsultas derivadas de las vistas SQL acotando el universo antes de consultar la vista.
4. **Aislamiento Multi-inquilino (Multi-tenant)**: Toda sentencia SQL incluye `empresaId` del token JWT. La verificación de existencia previa de ciclos y parcelas responde `404 RECURSO_NO_ENCONTRADO` ante recursos inexistentes o ajenos.
5. **Política Única de Formato (RN-066)**: Redondeo simétrico `ROUND_HALF_UP` en `Prisma.Decimal`. Importes monetarios y porcentajes a 2 decimales; cantidades en kilogramos a 3 decimales. Cocientes indefinidos (división por cero o denominador nulo) se serializan como `null`.

---

## Decisiones de Arquitectura

### 1. Bounded Context de Solo Lectura y Matriz de Permisos
- El módulo de reportes es de solo lectura. No muta estado ni invoca `AuditService.registrar` (RN-036).
- Control de acceso centralizado con `RequirePermisos('reporte:ver')` en todos los endpoints:
  - Roles autorizados: `ADMIN` y `CONTADOR` (200 OK).
  - Roles no autorizados: `CAPTURISTA` (403 PERMISO_DENEGADO).
  - Validación de ciclo o parcela ajena/borrada: 404 RECURSO_NO_ENCONTRADO antes de consultar cualquier vista.

### 2. Vistas SQL como Única Fuente de Fórmulas
Todas las métricas de negocio son calculadas por las 5 vistas nativas de MySQL:
- `v_rentabilidad_ciclo`: Agregación de costos, mermas, ventas, cobros, margen %, ROI %, costo/kg, precio promedio, etc.
- `v_costo_por_categoria`: Agrupación por categoría raíz (`cg.categoriaPadreId`) con cálculo de porcentaje sobre el gasto total del ciclo.
- `v_costo_por_actividad`: Horas totales y costos imputados por tipo de actividad.
- `v_merma_desglose`: Mermas agrupadas por motivo y diferenciando etapa `CAMPO` vs `POSCOSECHA`.
- `v_comparativo_parcela`: Proyección de rentabilidad con funciones de ventana `LAG(...)` sobre ciclos de la misma parcela.

En TypeScript únicamente se consumen y formatean estas columnas mediante `IndicadoresMapper` y `ReporteFormatoUtil`.

### 3. Patrón de Consulta en Dos Pasos (Two-Step Querying)
Para `GET /reportes/rentabilidad`:
- **Paso 1 (Prisma ORM)**: Consulta paginada sobre `ciclo_produccion` con `{ empresaId, deletedAt: null, estado, parcelaId, rango de fechas }`, aprovechando los índices B-Tree compuestos (`ciclo_produccion_empresaId_estado_idx`), trayendo metadatos contextuales (nombres de parcela, predio, variedad y cultivo).
- **Paso 2 (SQL Nativo sobre Vista)**: Con los IDs obtenidos en el Paso 1, ejecuta `SELECT ... FROM v_rentabilidad_ciclo WHERE empresaId = ? AND cicloId IN (?)`. Si el Paso 1 retorna 0 registros, no se ejecuta ninguna consulta SQL contra la vista.

### 4. Política de Formato y Redondeo (RN-066)
- Centralizada en `src/common/utils/reporte-formato.util.ts`:
  - Importes y porcentajes: 2 decimales (e.g. `'86000.00'`, `'28.93'`).
  - Masas/pesos en kg: 3 decimales (e.g. `'8200.000'`, `'50.000'`).
  - Redondeo: `Prisma.Decimal.ROUND_HALF_UP` explícito (`-0.005` da `-0.01`; `0.005` da `0.01`).
  - Valores nulos o indefinidos se mantienen como `null`.
- **Renombre de Campos en la API**: La columna `kgMerma` de la vista SQL representa la merma poscosecha; se expone en la API como `kgMermaPoscosecha` para diferenciarla formalmente de `kgMermaCampo`.

### 5. Semántica del Ciclo Anterior en el Comparativo Histórico
- En `v_comparativo_parcela`, la función `LAG()` se computa sobre la partición por `parcelaId` ordenada por `fechaInicio, cicloId`, considerando ciclos en estado `ACTIVO`, `SUSPENDIDO` y `FINALIZADO`.
- Al consultar con el filtro por defecto (solo `FINALIZADO`), el ciclo anterior referenciado por el `LAG` puede corresponder a un ciclo que no esté finalizado si existió cronológicamente entre ambos. Esta semántica es aceptada y documentada.

---

## Resultados Reales de Rendimiento (EXPLAIN ANALYZE)

Ejecutado sobre MySQL 8.0.46 mediante `test/e2e/reportes-volumen.e2e-spec.ts` (`E2E_VOLUMEN=1`):

1. **Consulta Acotada con Dos Pasos (`empresaId` y `cicloId IN (ids)`)**:
   - `ciclo_produccion c`: Utiliza `Index lookup on c using ciclo_produccion_empresaId_estado_idx (empresaId=1)`.
   - **Comportamiento del Optimizador**: MySQL **NO empuja** el predicado `empresaId` ni `cicloId IN (...)` hacia el interior de las subconsultas derivadas (`LEFT JOIN (SELECT cicloId, ... FROM gasto GROUP BY cicloId)`). En su lugar, materializa las subconsultas derivadas (`Materialize -> Aggregate using temporary table`) escaneando las tablas base y creando índices temporales automáticos (`<auto_key0> (cicloId=c.id)`), sobre los cuales realiza búsquedas por clave.
   - Tiempo de ejecución observado: 71 ms.
2. **Resolución de Rendimiento Multi-Empresa (Hito 9A.1 / ADR-011)**:
   - Resuelto formalmente en el ADR-011 mediante reescritura de las vistas con `LEFT JOIN LATERAL` (migración `vistas_indicadores_v2`), logrando aislamiento estricto de escaneo por ciclo y reducción de latencia en un 98 % en escalas de 300,000 registros.

---

## Especificación e Implementación de 9B (Alertas y Cuentas por Cobrar)

El Hito 9B se encuentra implementado y verificado bajo la siguiente especificación:

### ALERTAS (`GET /reportes/alertas`, `reporte:ver`)
Evaluadas en tiempo de consulta, no almacenadas en base de datos. Umbrales definidos en un único archivo de constantes (`src/modules/reportes/constants/alertas.constants.ts`). Valor exactamente igual al umbral NO dispara alerta.
- **Alcance**:
  - Ciclos `ACTIVO`, `SUSPENDIDO` y `FINALIZADO` con `cerradoEn` (o `fechaFin`) en los últimos 30 días (constante).
  - Ciclos `PLANIFICADO` y `CANCELADO` nunca generan alertas (RN-058).
  - `COBRO_VENCIDO` aplica a cualquier venta no cancelada con saldo > 0 y `fechaLimitePago < hoy`, sin importar el estado del ciclo.
- **Reglas**:
  1. `CICLO_EN_PERDIDA`: ganancia < 0 y totalFacturado > 0 (Severidad: ALTA).
  2. `COSTO_SUPERA_PRECIO`: costoPorKg > precioPromedioKg, ambos no nulos (Severidad: ALTA).
  3. `COBRO_VENCIDO`: evalúa con `VentaEstadoCobroPolicy` y el reloj de México (Severidad: ALTA).
  4. `MERMA_ELEVADA`: mermaPct > 10 % (Severidad: MEDIA).
  5. `CATEGORIA_DOMINANTE`: categoría raíz con porcentaje > 40 % del costo total (Severidad: MEDIA).
  6. `COSTO_CRECIENTE`: costoPorKg > costoPorKgCicloAnterior × 1.15, ambos no nulos (Severidad: MEDIA).
  7. `RENDIMIENTO_BAJO`: ciclo `FINALIZADO`, con `metaProduccionKg` definida en la parcela, kgCosechados < 80 % de la meta (Severidad: MEDIA).
  8. `CICLO_SIN_CAPTURA`: ciclo `ACTIVO` sin gastos vigentes en los últimos 15 días; si no tiene gastos, medido desde `fechaInicio` (Severidad: BAJA).
  9. `CICLO_LARGO`: días transcurridos hasta hoy en `ACTIVO`/`SUSPENDIDO` (o hasta `fechaFin` en `FINALIZADO`) > `duracionCicloDias × 1.2` de la variedad (Severidad: BAJA).
  10. `LIMITE_PLAN_CERCANO`: parcelas no `INACTIVAS` y no borradas vía `predio.empresaId`, y usuarios activos no borrados, >= 90 % del límite del plan de suscripción (Severidad: INFORMATIVA).
- **Estructura del Resultado**:
  - `{ codigo, severidad, cicloId, ventaId, observado, umbral, mensaje }`, con `observado` y `umbral` formateados como string.
  - Ordenamiento: `ALTA`, `MEDIA`, `BAJA`, `INFORMATIVA`, y desempate por `cicloId`.
  - Filtros opcionales: `severidad`, `cicloId`.
  - Paginación en memoria permitida porque la colección nace de la evaluación de reglas y no de un cursor directo de BD.
- **Consultas con número constante (sin N+1)**:
  - IDs de ciclos relevantes mediante Prisma en una única consulta.
  - Vistas `v_rentabilidad_ciclo`, `v_costo_por_categoria` y `v_comparativo_parcela` acotadas con `empresaId` e `IN (ids)`.
  - `MAX(fecha)` de gastos agrupados por ciclo mediante `groupBy`.
  - Ventas vencidas mediante la consulta unificada de cuentas por cobrar.
  - Conteos de plan y recursos con `count()`.

### CUENTAS POR COBRAR (`GET /reportes/cuentas-por-cobrar`, `reporte:ver`)
- Un único SQL con fragmento parametrizado reutilizable:
  - `ventas JOIN ciclo_produccion` con `empresaId` y `deletedAt IS NULL`.
  - `JOIN cliente`.
  - `LEFT JOIN` a la suma de cobros vigentes (`deletedAt IS NULL`).
- Parámetro de fecha: "hoy" provisto explícitamente en formato `YYYY-MM-DD` con la hora de México (America/Mexico_City), nunca `CURDATE()` del servidor MySQL.
- Sin vistas nuevas ni migraciones de esquema.
- Filtros:
  - `estadoCobro` (`PENDIENTE`, `VENCIDA`, `PARCIAL`, `PAGADA`).
  - `vencida` (booleano): saldo > 0 y `fechaLimitePago < hoy` (incluye `PARCIAL`).
  - Por defecto: ventas no canceladas con saldo > 0.
- Semántica idéntica a `VentaEstadoCobroPolicy`:
  - `PENDIENTE`: cobrado = 0 y (fecha límite nula o fecha límite >= hoy).
  - `VENCIDA`: cobrado = 0 y fecha límite < hoy.
  - `PARCIAL`: 0 < cobrado < total.
  - `PAGADA`: cobrado >= total.
- Orden: `fechaLimitePago ASC` (nulos al final) y `id DESC`.
- Paginación: `COUNT(*)` con el mismo WHERE y cláusula `LIMIT / OFFSET` en SQL nativo.

---

## Deuda Técnica Registrada
1. Permiso `reporte:exportar` y exportación de archivos (CSV / Excel / PDF) diferida formalmente para el Hito 10.
2. Configuración personalizada de umbrales por empresa (`configuracion_alerta`) diferida.
3. Tests e2e adicionales de validación cruzada RN-072 y RN-038.
4. Mantenimiento del catálogo de linting preexistente del proyecto.
