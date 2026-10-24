# ADR-013: Módulo de Exportación de Reportes a Excel, PDF y CSV (Hito 10B)

## Estado
Aceptado

## Contexto
El sistema de Rentabilidad Agrícola requiere capacidades de exportación de sus reportes analíticos y financieros para la toma de decisiones gerenciales, auditoría contable y conciliación de cobranza:
1. **Reporte General de Rentabilidad de Ciclos**: Visión consolidada de ingresos, costos, márgenes, ROI y métricas unitarias por hectárea y kilogramo.
2. **Reporte Integral de Detalle de Ciclo**: Desglose exhaustivo en 4 dimensiones (Rentabilidad global, Costos por categoría de gasto, Costos por tipo de actividad operativa y Desglose de mermas por etapa).
3. **Reporte Comparativo Cronológico por Parcela**: Análisis histórico de evolución de rendimiento y rentabilidad entre ciclos agrícolas de un mismo predio.
4. **Reporte de Cuentas por Cobrar**: Antigüedad de saldos, facturación, montos cobrados y cartera vencida por cliente.

Para garantizar la integridad técnica y arquitectónica, el diseño debe satisfacer:
- **Consistencia Matemática y Reutilización de Dominio**: Cero duplicación de lógica contable o fórmulas SQL. La exportación debe consumir exactamente los mismos datos calculados por `IndicadoresService` y `CuentasPorCobrarService`.
- **Tipado Fuerte en Hojas de Cálculo**: En Excel (XLSX), las cifras monetarias y volumétricas deben emitirse como celdas de tipo numérico con formato contable (`#,##0.00` y `#,##0.000`), no como cadenas de texto, para permitir agregaciones y fórmulas nativas en el cliente.
- **Interoperabilidad y Estándares**: CSV bajo especificación estricta RFC 4180 con BOM UTF-8 (`\uFEFF`) para compatibilidad directa con Microsoft Excel en español; PDF estructurado en memoria con paginación automática y firma `%PDF`.
- **Defensa contra Formula Injection (CSV / Excel Injection)**: Neutralización de vectores maliciosos (`=`, `+`, `-`, `@`, `\t`, `\r`) exclusivamente en campos de texto introducidos por humanos (nombres de ciclos, clientes, parcelas, motivos), sin corromper valores numéricos ni importes negativos legítimos.
- **Protección contra Agotamiento de Recursos**: Límite estricto de 5000 filas por consulta evaluado antes de iniciar la generación en memoria (`EXPORTACION_EXCEDE_LIMITE` 400).
- **Aislamiento Multi-tenant y RBAC**: Permiso granular `reporte:exportar` exigido; aislamiento estricto por `empresaId`.
- **Neutralidad de Auditoría**: Las operaciones de exportación son lecturas analíticas que no deben registrar eventos de mutación en la bitácora transaccional (RN-036).

---

## Decisiones de Arquitectura

### 1. Bounded Context de Presentación y Reutilización de Servicios
El módulo `ExportacionModule` se diseñó como un adaptador de salida (puerto de presentación/exportación) desacoplado de la persistencia directa. No inyecta `PrismaService` para re-ejecutar consultas SQL sobre ventas, gastos o actividades:
- Reutiliza `IndicadoresService.obtenerRentabilidadCiclos`, `IndicadoresService.obtenerDetalleRentabilidadCiclo` e `IndicadoresService.obtenerComparativoParcela`.
- Reutiliza `CuentasPorCobrarService.obtenerCuentasPorCobrar`.

Para desgloses del ciclo (categorías, actividades, mermas), realiza exactamente 4 consultas directas optimizadas (`Promise.all`), eliminando el problema de consultas $N+1$.

### 2. Selección de Dependencias y Análisis de Seguridad
Se evaluaron e incorporaron bibliotecas maduras con versiones exactas:
- **`exceljs@4.4.0`**: Generador integral de hojas de cálculo OpenXML. Permite fijar tipos de celda (`type: CellValueType.Number`), formatos de visualización `numFmt`, estilos de encabezado con relleno corporativo y congelamiento de paneles.
- **`pdfkit@0.17.2`** y **`@types/pdfkit@0.17.2`**: Motor ligero de renderizado vectorial en memoria, sin dependencias nativas complejas ni navegadores headless pesados.
- **Auditoría de Vulnerabilidades**: La ejecución de `npm audit --omit=dev` constató **0 vulnerabilidades de severidad alta o crítica** asociadas a estas dependencias.

### 3. Especificación de Formatos de Exportación

#### 3.1. Formato Excel (`xlsx`)
- **MIME**: `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`.
- Encabezados estilizados en verde agrícola (`#2E7D32`), tipografía en negrita blanca y cuadrículas visibles.
- Celdas con valores nulos o indefinidos emitidas explícitamente como celdas vacías (`null`), evitando cadenas `'N/A'` o ceros engañosos en métricas donde el dato no existe.
- En el detalle de ciclo, genera 4 hojas independientes: `Rentabilidad`, `Costos por Categoría`, `Costos por Actividad` y `Desglose de Mermas`.

#### 3.2. Formato CSV (`csv`)
- **MIME**: `text/csv; charset=utf-8`.
- Cumplimiento estricto de RFC 4180: delimitador coma (`,`), saltos de línea CRLF (`\r\n`), campos con caracteres especiales envueltos en comillas dobles y comillas internas escapadas duplicándolas (`""`).
- Inclusión del byte order mark UTF-8 (`\uFEFF`) al inicio del flujo para forzar la correcta decodificación de acentos y caracteres del español en Microsoft Excel.

#### 3.3. Formato PDF (`pdf`)
- **MIME**: `application/pdf`.
- Generación de flujo binario continuo en memoria mediante eventos `data` y `end`, validando la firma inicial `%PDF`.
- Encabezado institucional con timestamp en huso horario operativo `America/Mexico_City`.
- Numeración dinámica de páginas en pie de página (`Página X de Y`).

### 4. Mitigación de Inyección de Fórmulas (CSV / Formula Injection)
Se implementó la utilidad `escaparTextoFormula`:
- Solo aplica a variables de tipo `string` provenientes de entrada de usuario o datos descriptivos del negocio.
- Detecta si tras eliminar espacios iniciales el primer caracter es `=`, `+`, `-`, `@`, `\t` o `\r`.
- Si coincide, antepone una comilla simple (`'`) que neutraliza la ejecución dinámica de macros o fórmulas en Excel, Calc y Google Sheets.
- Las variables numéricas (incluso números negativos como márgenes o balances de pérdida `-1500.50`) **nunca** son procesadas por este sanitizador, preservando su naturaleza matemática en todas las salidas.

### 5. Control de Sobrecarga y Paginación en Exportación
Antes de generar en memoria conjuntos de datos potencialmente gigantescos:
- Se evalúa la primera página con `limite: 1` para obtener el metadato `total` de registros coincidentes.
- Si `total > EXPORTACION_MAX_FILAS` (por defecto 5,000 filas), se interrumpe inmediatamente lanzando `HttpException` 400 con código `EXPORTACION_EXCEDE_LIMITE`.
- Para volúmenes dentro del límite, la consulta solicita `limite: 5000`, evitando paginaciones en bucle y mitigando la latencia de red.
- **Supuesto de prueba en suites E2E**: Para no sobrecargar los tiempos del pipeline sembrando más de 5,000 filas reales en cada corrida de pruebas, el rechazo por `EXPORTACION_EXCEDE_LIMITE` se verifica configurando un umbral reducido controlado mediante configuración/mock en la suite de pruebas e2e.

### 6. Streaming Idiomático en NestJS y Cabeceras de Seguridad
Los controladores retornan instancias de `StreamableFile` con opciones declarativas (`type`, `disposition`, `length`).
Se ajustó `SerializacionInterceptor` para preservar instancias de `StreamableFile` y `Buffer` sin transformarlas en objetos planos, garantizando:
- `Content-Disposition: attachment; filename="<nombre>"`
- `X-Content-Type-Options: nosniff` (previene MIME sniffing del navegador)
- `Cache-Control: no-store` (evita almacenamiento intermedio de reportes confidenciales)

---

## Deuda Técnica y Mejoras Futuras
1. **Cola Asíncrona para Exportaciones Masivas**: Para conjuntos de datos que superen las 5,000 filas, diseñar un subsistema de colas en segundo plano (e.g. BullMQ / Redis) con almacenamiento temporal en `IStorageService` y notificación al usuario cuando el archivo esté listo para descarga.
2. **Registro de Auditoría de Exportación**: Aunque las consultas no alteran el estado del negocio (RN-036), futuras normativas de privacidad o compliance empresarial podrían requerir una bitácora especializada de exportación de datos sensibles.
3. **Endurecimiento de Pruebas E2E de Auth (RN-072 y RN-038)**: Extender suites e2e para verificar expiración de sesión y revocación en tiempo real durante descargas masivas.

---

## Ficha Real de Dependencias y Seguridad

| Dependencia | Versión Instalada | Licencia | Publicación | Estado de Cadena de Suministro |
|-------------|-------------------|----------|-------------|--------------------------------|
| `exceljs` | `4.4.0` | MIT | 2023-10-19 (> 3 años) | `npm audit --omit=dev`: 0 vulnerabilidades directas en exceljs. Dependencias transitivas: `tmp`, `uuid`, `jszip`, `fast-csv`. |
| `pdfkit` | `0.17.2` | MIT | 2025-08-30 (> 1 año) | `npm audit --omit=dev`: 0 vulnerabilidades directas en pdfkit. Dependencias transitivas: `fontkit`, `linebreak`, `crypto-js`, `png-js`. |

*Nota de Seguridad*: La auditoría global de producción (`npm audit --omit=dev`) arroja 14 vulnerabilidades previas heredadas de la base del framework (`@nestjs/platform-express`, `body-parser`, `mysql2`, `mariadb`, `js-yaml`). Ninguna es introducida por `exceljs` o `pdfkit`. Su saneamiento está programado en la fase de endurecimiento del Hito 11.

