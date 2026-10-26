# ADR-016: Verificación Automatizada de Base de Datos y Política Operativa de Respaldo y Restauración (Hito 11C)

## Estado
Aceptado

## Contexto
El Sistema de Rentabilidad Agrícola opera sobre un esquema relacional complejo en MySQL 8.0/MariaDB con estrictas garantías de integridad física, claves foráneas en cascada y restrictivas, restricciones CHECK a nivel de motor, columnas generadas STORED y vistas analíticas optimizadas (LEFT JOIN LATERAL).

El documento de especificación formal establece dos requisitos operacionales críticos:
1. **Especificación §3.25 y Anexo D**: Verificación formal de base de datos para comprobar la totalidad de tablas, claves foráneas, restricciones CHECK, vistas, roles, permisos y planes de suscripción.
2. **Especificación §3.24**: Mitigación de riesgos operacionales y continuidad del negocio mediante políticas de respaldo periódico (`mysqldump`), configuración de registros binarios (PITR) y simulacros periódicos de restauración.

Adicionalmente, se debía formalizar el **delta legítimo** entre el Anexo D inicial (escrito antes del Hito 11A) y el estado arquitectónico real del sistema tras la incorporación de la rotación de Refresh Tokens.

---

## Decisiones de Arquitectura

### 1. Cuantificación y Justificación Canónica del Esquema (Delta del Anexo D)

Se estableció la matriz comparativa canónica entre el Anexo D original del documento y la arquitectura actual:

| Componente de Base de Datos | Valor Anexo D (Docx) | Valor Esperado Actual (11C) | Justificación Arquitectónica y Referencia |
|---|:---:|:---:|---|
| **Tablas Base** (excluye `_prisma_migrations`) | 27 | **28** | Adición de la tabla `refresh_token` implementada en el Hito 11A (Decisión 12 / ADR-014) para soportar rotación y revocación criptográfica por familia. |
| **Claves Foráneas (FK)** | 48 | **49** | Adición de la relación `refresh_token.usuarioId -> usuario.id` con eliminación en cascada (`ON DELETE CASCADE`). |
| **Restricciones CHECK** | 19 | **19** | 19 restricciones de integridad física aplicadas en migración `20261015172732_restricciones_sql` (montos > 0, porcentajes, fechas lógicas). |
| **Vistas Analíticas de Indicadores** | 5 | **5** | Vistas optimizadas en migración `20261022033837_vistas_indicadores_v2` (`v_rentabilidad_ciclo`, `v_costo_por_categoria`, `v_costo_por_actividad`, `v_merma_desglose`, `v_comparativo_parcela`). |
| **Columnas Generadas STORED** | 2 | **2** | `ciclo_produccion.claveCicloActivo` (RN-009) y `categoria_gasto.claveNombre` (unicidad multinivel). |
| **Roles Predefinidos** | 3 | **3** | `ADMIN`, `CAPTURISTA`, `CONTADOR` (sembrados en `prisma/seed.ts`). |
| **Permisos Atómicos del Sistema** | 19 | **19** | Catálogo exhaustivo de 19 permisos funcionales. |
| **Permisos Asignados a ADMIN** | 19 | **19** | Cobertura total de administración y operación. |
| **Permisos Asignados a CAPTURISTA** | 4 | **4** | `VER_CATALOGOS`, `VER_PREDIOS`, `VER_CICLOS`, `CREAR_ACTIVIDADES`. |
| **Permisos Asignados a CONTADOR** | 8 | **8** | Permisos de consulta y gestión financiera de gastos y ventas. |
| **Planes de Suscripción** | 3 | **3** | `BASICO`, `PRODUCTOR`, `PROFESIONAL`. |

### 2. Runner Automatizado de Verificación (`npm run db:verify`)
Se desarrolló el runner en TypeScript (`scripts/db-verify.ts`) y su correspondiente script en `package.json`:
- **Salvaguarda de Seguridad**: El runner valida estrictamente que la base de datos objetivo posea el sufijo `_test` o pertenezca a entornos no productivos antes de proceder.
- **Evaluación Comparativa Pura**: Se separó la lógica de evaluación en una función pura `evaluarMetricasBd` para permitir pruebas unitarias automatizadas (`src/common/utils/db-verify.spec.ts`) que certifican que cualquier discrepancia concluye con código de salida 1 (`process.exit(1)`).
- **Inspección de Vistas**: Además del conteo en `information_schema`, el runner ejecuta consultas reales `SELECT COUNT(*)` sobre las 5 vistas para garantizar que no existan errores de sintaxis ni divisiones por cero en bases vacías (§3.25.3).

### 3. Procedimiento y Guía Canónica de Respaldo y Restauración (§3.24)
Se redactó la guía técnica `docs/operacion/respaldo-restauracion.md` documentando:
- Uso obligatorio de `--defaults-extra-file` para eliminar credenciales de la línea de comandos y protegerlas contra inspección de procesos (`ps`, `tasklist`).
- Parámetros canónicos de `mysqldump`: `--single-transaction` (consistencia snapshot en InnoDB sin bloqueos), `--routines`, `--triggers`, `--events`.
- Habilitación de Binary Logs en MySQL (`binlog_format = ROW`, retención de 7 días) para habilitar recuperación en punto en el tiempo (PITR).
- Protocolo de simulacro trimestral sobre base aislada `rentabilidad_agricola_restore_test`.

### 4. Certificación Empírica de Restauración
Se ejecutó una prueba de restauración real en el entorno:
- Extracción de volcado completo de `rentabilidad_agricola_test` a `dump_test.sql` (70.27 KB).
- Recreación limpia de base temporal `rentabilidad_agricola_restore_test`.
- Importación del volcado vía cliente MySQL nativo.
- Verificación automática de las 11 métricas sobre la base restaurada: 100% OK.
- Purga segura de la base temporal y credenciales residuales.

---

## Consecuencias

### Positivas
- **Detección Inmediata de Regresiones en BD**: Cualquier migración o cambio accidental que altere claves foráneas, restricciones CHECK o vistas analíticas romperá de inmediato la integración continua.
- **Auditoría Documentada**: El delta de la tabla 28 (`refresh_token`) queda formalmente registrado y justificado frente al Anexo D del documento de diseño.
- **Continuidad Operativa Probada**: La guía operativa y la prueba empírica validan que el sistema puede recuperarse ante desastres sin pérdida de integridad relacional.
