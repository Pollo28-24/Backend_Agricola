# Contexto Global del Proyecto — Backend Rentabilidad Agrícola

Documento de verdad técnica y arquitectura viva para el sistema backend de Rentabilidad Agrícola. Todos los datos, versiones, nombres de tablas, columnas, rutas y códigos de error aquí documentados provienen de la inspección directa del código fuente y de la base de datos física del repositorio en tiempo real.

---

## A. Stack y Versiones Exactas

### Runtime y Framework
- **Runtime**: Node.js v24.15.0 (64-bit Windows)
- **Framework Web**: NestJS v11.2.7
  - `@nestjs/common`: `11.2.7` (declarado: `^11.0.1`)
  - `@nestjs/core`: `11.2.7` (declarado: `^11.0.1`)
  - `@nestjs/platform-express`: `11.2.7` (declarado: `^11.0.1`)
  - `@nestjs/config`: `12.0.1` (declarado: `^12.0.1`)
  - `@nestjs/jwt`: `12.0.3` (declarado: `^12.0.3`)
  - `@nestjs/passport`: `12.0.0` (declarado: `^12.0.0`)
  - `@nestjs/swagger`: `11.4.7` (declarado: `^11.4.7`)
  - `@nestjs/throttler`: `6.7.1` (versión fija exacta)
  - `@nestjs/testing`: `11.2.7` (declarado: `^11.0.1`)
  - `@nestjs/cli`: `11.0.6` (declarado: `^11.0.0`)

### Servidor HTTP y Middleware
- `express`: `5.2.1`
- `body-parser`: `2.3.0`
- `multer`: `2.4.0`
- `helmet`: `8.3.0` (declarado: `^8.3.0`)
- `swagger-ui-express`: `5.0.1` (declarado: `^5.0.1`)

### Base de Datos y Persistencia
- **Motor de Base de Datos**: MySQL / MariaDB compatible server
- **Versión del Motor (`SELECT VERSION()`)**: `8.0.46`
- **ORM / Query Engine**: Prisma ORM `7.10.0` (declarado: `^7.10.0`)
- **Driver Adapter**: `@prisma/adapter-mariadb` `7.10.0`
- **Driver Nativo MariaDB**: `mariadb` `3.5.4` (directo) y `3.4.5` (subdependencia en adapter)
- **Driver MySQL2 (CLI desarrollo/introspección)**: `mysql2` `3.15.3` (subdependencia de `prisma@7.10.0`)

### Seguridad, Criptografía y Utilidades
- `argon2`: `0.45.1` (declarado: `^0.45.1`)
- `passport`: `0.7.0` (declarado: `^0.7.0`)
- `passport-jwt`: `4.0.1` (declarado: `^4.0.1`)
- `joi`: `18.2.9` (declarado: `^18.2.9`)
- `class-validator`: `0.15.1` (declarado: `^0.15.1`)
- `class-transformer`: `0.5.1` (declarado: `^0.5.1`)
- `nestjs-cls`: `7.0.1` (declarado: `^7.0.1`)
- `dayjs`: `1.11.23` (declarado: `^1.11.23`)
- `rxjs`: `7.8.1` (declarado: `^7.8.1`)
- `uuid`: `14.0.3` (directo) y `8.3.2` (subdependencia de `exceljs`)

### Motores de Exportación de Reportes
- `exceljs`: `4.4.0` (versión fija exacta)
- `pdfkit`: `0.17.2` (versión fija exacta)

### Calidad de Código y Pruebas
- `typescript`: `5.7.3` (declarado: `^5.7.3`)
- `eslint`: `9.18.0` (declarado: `^9.18.0`)
- `typescript-eslint`: `8.20.0` (declarado: `^8.20.0`)
- `jest`: `30.0.0` (declarado: `^30.0.0`)
- `ts-jest`: `29.2.5` (declarado: `^29.2.5`)
- `supertest`: `7.0.0` (declarado: `^7.0.0`)
- `prettier`: `3.4.2` (declarado: `^3.4.2`)

---

## B. Estado por Hito

| Hito | Nombre del Hito | Commit Hash Completo | Mensaje de Git | Estado de Calidad / Pruebas |
|---|---|---|---|---|
| **Hito 1** | Configuración Inicial y Modelo Relacional | `2ad1c8c32ac9552ec85bda4a6ee6bb9f07d6bb70`<br>*(precedido por `cf06342a8bd6550dd2e2ee470b78665ae4d44e2c`)* | `feat: completar Fase 1 con modelo relacional, migraciones y arquitectura base NestJS` | Modelo de 29 tablas y 4 migraciones iniciales. |
| **Hito 2** | Autenticación JWT y Refresh Tokens | `411a5041a0d8ff114ea622c594759fe0f5ec4326`<br>*(guards en `e77b45f6a91a85a2db993ab9c8650ade01dbc261`)* | `feat: implementar módulo de autenticación con JWT y refresh token rotatorio (Hito 2)` | 71 tests unitarios pasando. |
| **Hito 3** | Empresas, Usuarios, Flujo F0 y Auditoría | `b6a83f5048a12049ebaaa4c0acf0fe198e1945f0`<br>`e28423827f724402d4c92935aedc69bea81922a2`<br>`c3735ac6c08eb8fb7f1dbb462ca7b05981e71d18` | `feat: módulo de empresas, usuarios y flujo F0 atómico`<br>`feat: módulo de bitácora de auditoría inmutable`<br>`feat(arquitectura): consolidar auditoria transaccional, RBAC` | Auditoría inmutable, guards globales y aislamiento 404. |
| **Hito 4** | Catálogos, Predios/Parcelas, Terceros y Ciclos | `9f1fbbf75a78ad455f3f671aec1777a30e294d13`<br>`b8cc848ac907c35133d373f01072ff9e637ed55f`<br>`b8a8d80b4df1cb8140d91885279b72a99211c752`<br>`9469f79b24b0159eb455bb73022998156aad6ad3` | `feat: módulo de catálogos maestros`<br>`feat(estructura): módulo de predios y parcelas`<br>`feat(terceros): módulo de proveedores y clientes`<br>`feat(ciclos): núcleo productivo y máquina de estados` | Máquina de estados formal y regla RN-009 de ciclo activo único. |
| **Hito 5A** | Actividades Agrícolas | `a9becefcfa9421f21277fdc31d424e078fc3038b` | `feat(actividades): implementar módulo de actividades agrícolas` | Gobernanza temporal RN-044 y registro atómico F-08. |
| **Hito 5B** | Gastos y Costos Operativos | `feb5e8b025da3d61e2f5cdbbdaec89217b419bdf` | `feat(gastos): módulo de gastos y costos operativos (hito 5B)` | Control de ventana de edición RN-062. |
| **Hito 6** | Cosechas, Mermas y Balance de Masa | `51e6f1cd25e331e2f1a82f38f37100c90596a6f8` | `feat(cosechas,mermas): cosechas, mermas y balance de masa del ciclo (hito 6)` | Invariantes de masa $\Sigma\text{mermas}\le\Sigma\text{cosechas}$. |
| **Hito 6B** | Infraestructura E2E y Concurrencia | `0a5bed0fcf457f1beffd3fd47a9302c6a667be70`<br>`fbb639c6586c827a13db9ce7b16a98959817957d` | `test(e2e): infraestructura e2e y endurecimiento de concurrencia (hito 6B)` | Bloqueo pesimista `SELECT ... FOR UPDATE` sobre ciclo. |
| **Hito 7** | Ventas y Control de Sobreventa | `7eff923bcd80a8fcbfcb66b9749fe644394617c1`<br>`3d9c793bb6c94ade0de70102081062e4cd4d31fa`<br>`e18c620604e2b1456ba70b312d3c0dc99fdd2707` | `feat(ventas): ventas con control de sobreventa`<br>`test(e2e,ventas): rollback de auditoría de ventas`<br>`fix(ventas): corregir lectura de snapshot MVCC` | Revalidación cruzada bajo bloqueo pesimista. |
| **Hito 8** | Cobros y Cuentas por Cobrar | `8560074d7d45f2af17d7d4982b4dadb6967255d5`<br>`b415e35b2fb6fa2c0cd7bb4c1637688fa0406eb3`<br>`42434ea99245c26f7cccb6a5eb5d716963921b8f`<br>`482f75d7b2d16bf10be1e4d0f8b932931d9bdbaa` | `feat(cobros): cobros con anulación lógica`<br>`fix(ciclos): anteponer bloqueo pesimista`<br>`test(cobros): endurecer aserciones cobro vs cancelacion` | Anulación lógica de cobros (RN-063) y estado derivado. |
| **Hito 9A / 9A.1 / 9B** | Indicadores, Vistas LATERAL y Alertas | `e209d9ccda339b4a53c804dd99a3e7c9a7eea5e9`<br>`60b29f741459b8ab0a31673bdd9e4bf3bd49ac41`<br>`c05f71e2abab2adc5ec76b3ec5950f7f468bebcd`<br>`466d813cf24fc45f8b8b475d0a509a097d9813ad` | `feat(reportes): indicadores de rentabilidad`<br>`perf(reportes): vistas de indicadores con LEFT JOIN LATERAL`<br>`feat(reportes): alertas de rentabilidad y cuentas por cobrar` | Vistas SQL analíticas optimizadas (5.6 ms) y alertas por caso. |
| **Hito 10A** | Archivos Adjuntos Desacoplados | `fa42bcc40696e1147e36fa1e4191047b547c940f`<br>`bbaf7997d8d9cf1ce2e3694859b6fedbee359709` | `feat(adjuntos): adjuntos con almacenamiento desacoplado y descarga firmada`<br>`fix(adjuntos): usar import type para Response e IStorageService` | Almacenamiento local desacoplado, Magic Bytes, token temporal. |
| **Hito 10B** | Exportación a Excel, PDF y CSV | `d7cef4940ca8baa91c619fb3ca035d8a05db32b9`<br>`bcb990a9a690e31855afc11503d56fdd0f885011`<br>`c0795a00ad3ce3945566b38c5ce4617ec86aae7b` | `feat(exportacion): exportación de reportes a Excel, PDF y CSV`<br>`test(calidad): completar cobertura e2e y pruebas unitarias`<br>`test(adjuntos): token de otro usuario, usuario desactivado y capturista` | Línea base cierre Fase 4: Build exit 0, Lint 393 errores / 85 warnings, 581 tests unitarios, 178 tests e2e. |
| **Hito 11A** | Seguridad, Sesiones por Familia y Throttling | `f8c703016a8614cdb398fcdae691f1861144303e`<br>`c01f33729ede18e1793b3f9f498d4b15988c5587`<br>`e287ad6a4f8457d81550553cbf26e6752843f6fe` | `fix(auth): rotación atómica de refresh tokens con detección de reuso por familia`<br>`feat(seguridad): throttling de login, validación de secretos y Argon2id (hito 11A)`<br>`test(seguridad): e2e de RN-072, RN-038, RN-037 y RN-074` | Cobertura integral de sesiones, throttling y Argon2id. |
| **Hito 11D** | Congelación de Contrato API Flutter | `c1c9ff661c94443ef19dcfaf04c7dfb914aa7477`<br>`1c81efc023d8c1ee87f12ebfcb70f3801f9b3ec7`<br>`b3c95973be368541a74d284a1a364175b5b29f79`<br>`ca9bb87ccebba792bc4a5f36e84d4764839cf9a3`<br>`d515a6ba4357bc8cb969634d0b168670a8309c07`<br>`1dcba237303f269baea4d95bdaec8b2098670e30` | `test(contrato): suite e2e de openapi y guardias anti-deriva`<br>`docs(contrato): snapshot openapi 3.0, catalogo de errores y matriz de permisos`<br>`feat(app-version): AppVersionGuard, headers y politicas de versionado`<br>`feat(contrato): estandarizacion de paginacion {data, meta} con default 20`<br>`feat(contrato): decoracion openapi exhaustiva en dtos y controladores`<br>`docs(contrato): guia de integracion frontend flutter para hito 11D` | Contrato congelado (106 rutas, 36 errores, 14 tests anti-deriva). Lint baja colateralmente a 325 errores / 84 avisos por tipado estricto. |
| **Hito 11C / 11C.1** | Verificación de BD y Respaldo (Anexo D) | `96c6b8c1ca2ec74f67c34b6b6c0e5a8bc391f7a0`<br>`3f4b6667554f6f1c4e7232e0e0ab7c0e5d95cf10`<br>`7e9e69e968a13c42d56ca7a25093116048bcaf22` | `feat(bd): verificacion automatizada del anexo d y politica de respaldo`<br>`feat(contrato): armonizar paginacion por defecto a 50 (docx s3.23)`<br>`docs(contexto): cierre del Hito 11C` | **Línea base canónica**: Build exit 0, Lint 325 errores / 84 avisos (0/0 nuevos), 615 tests unitarios (90 suites), 225 e2e (14 suites, 1 skipped condicional `E2E_VOLUMEN=1`), contrato:verificar 0, db:verify 0 fallas (74 comprobaciones Anexo D: 19 estructura + 38 indicadores vistas + 17 restricciones con `tmp_esperar_error`). |

---

## C. Mapa del Sistema

### 1. Módulos de `src/modules` y Responsabilidad
1. `actividades`: Registro y control de labores agrícolas en ciclos de producción (F-08, RN-010, RN-015, RN-044).
2. `adjuntos`: Almacenamiento desacoplado (disco local/S3) de comprobantes y evidencias para gastos y cobros, con URL firmada temporal de descarga.
3. `auditoria`: Bitácora inmutable de eventos transaccionales para auditoría de cambios y accesos multi-tenant (RN-043, RN-060).
4. `auth`: Autenticación con JWT, emisión y rotación de Refresh Tokens, control de sesiones y extracción de contexto del usuario (RN-040, RN-072).
5. `catalogos`: Administración de catálogos maestros y categorías híbridas (árbol de gastos del sistema y por empresa, cultivos, variedades, tipos de suelo, unidades).
6. `ciclos`: Ciclo productivo agrícola y máquina de estados (PLANIFICADO, ACTIVO, SUSPENDIDO, FINALIZADO, CANCELADO) con control de ciclo activo por parcela (RN-009).
7. `cobros`: Registro, listado y anulación lógica de cobros contra ventas, derivando el estado financiero de cobro (PENDIENTE, PARCIAL, LIQUIDADO, ANULADO) (RN-063).
8. `cosechas`: Registro de cosechas por calidad y lote, validación de unidades de peso y base para balance de masa productiva (RN-024, RN-026, RN-069).
9. `empresas`: Administración de tenants, registro atómico de empresa con usuario administrador y control de suscripción/límites de plan (F-01, RN-003, RN-068).
10. `estructura`: Modelado físico del campo agrícola (predios y parcelas) con control de superficies y estados de uso (DISPONIBLE, EN_USO, DESCANSO, INACTIVA).
11. `exportacion`: Generación y descarga síncrona de reportes tabulares y ejecutivos en formatos Excel (.xlsx), PDF y CSV (.csv) con límites de seguridad *(Errata Hito 11A: la regla de plan para exportación corresponde a `plan_suscripcion.incluyeReportes` sin número de RN en el docx; la verdadera RN-073 del docx §2.9 regula comparaciones de "hoy" en `America/Mexico_City`)*.
12. `gastos`: Costos operativos directos e indirectos vinculados al ciclo o actividades, control de proveedores y ventanas de edición temporal (RN-062).
13. `health`: Verificación de salud y liveness del servicio HTTP para orquestadores y monitoreo.
14. `mermas`: Registro de pérdidas de cosecha (campo, poscosecha, transporte, almacén) con aplicación de balance de masa estricto (RN-031, RN-032, RN-049).
15. `reportes`: Indicadores analíticos consolidados de rentabilidad por ciclo, costos por categoría/actividad, comparativo entre ciclos y alertas preventivas.
16. `terceros`: Gestión de entidades externas comerciales: proveedores de insumos/servicios y clientes clasificados por canal de distribución.
17. `usuarios`: Gestión del personal de la empresa, asignación de roles RBAC, activación/desactivación lógica y control de cuotas por plan (RN-037).
18. `ventas`: Comercialización de cosechas con control de sobreventa, bloqueo pesimista contra balance de masa disponible y cálculo de totales (RN-027, RN-070).

---

### 2. Las 29 Tablas Físicas de la Base de Datos
1. `_prisma_migrations`: Historial de control de versiones de migraciones de Prisma.
2. `plan_suscripcion`: Catálogo de planes comerciales (Básico, Productor, Profesional) con límites de parcelas y usuarios.
3. `empresa`: Tenants o empresas productoras con moneda, RFC y estado de suscripción.
4. `rol`: Roles del sistema RBAC (`ADMIN`, `CAPTURISTA`, `CONTADOR`).
5. `permiso`: Catálogo inmutable de los 19 permisos funcionales granulares.
6. `rol_permiso`: Tabla intermedia de asignación de permisos a roles.
7. `usuario`: Cuentas de acceso asociadas a una empresa y un rol, con hash de contraseña Argon2.
8. `refresh_token`: Tokens de refresco rotatorios con familia (`familiaId`), UUID (`jti`), hash y estado de revocación.
9. `predio`: Extensiones o ranchos pertenecientes a una empresa.
10. `tipo_suelo`: Catálogo maestro de tipos de suelo agrícola.
11. `parcela`: Divisiones productivas de un predio con superficie, coordenadas y estado.
12. `cultivo`: Catálogo maestro de especies agrícolas cultivables.
13. `variedad`: Variedades comerciales asociadas a un cultivo con días estimados de ciclo.
14. `unidad_medida`: Unidades de medida con tipo (`PESO`, `VOLUMEN`, `AREA`, `TIEMPO`, `CONTEO`) y `factorABase`.
15. `tipo_actividad`: Catálogo de labores culturales (riego, poda, cosecha, etc.).
16. `categoria_gasto`: Estructura jerárquica de categorías de costo (maestras y propias por empresa con columna generada `claveNombre`).
17. `motivo_merma`: Catálogo de causas de merma (plaga, sequía, granizo, etc.).
18. `proveedor`: Proveedores comerciales de insumos y servicios vinculados a la empresa.
19. `cliente`: Compradores y comercializadores clasificados por tipo.
20. `ciclo_produccion`: Registro central del ciclo de cultivo con columna generada `claveCicloActivo` (RN-009).
21. `actividad`: Labores realizadas en un ciclo con horas trabajadas y responsable.
22. `gasto`: Erogaciones operativas con comprobante, desglose de impuestos y total.
23. `cosecha`: Entradas físicas recolectadas de producto en peso con asignación de calidad.
24. `merma`: Registros de pérdida de producto por etapa con motivo y cantidad.
25. `venta`: Transacciones comerciales de venta con estado, fechas límite de pago e importes.
26. `detalle_venta`: Renglones de venta asociados a una cosecha, unidad, cantidad y precio unitario.
27. `cobro_venta`: Cobros parciales o totales aplicados a una venta con soporte de anulación lógica (`deletedAt`).
28. `bitacora_auditoria`: Registro inmutable transaccional de auditoría con valores anteriores y nuevos en JSON.
29. `adjunto`: Metadatos de archivos físicos almacenados (clave, MIME, tamaño) asociados polimórficamente a una entidad.

---

### 3. Las 5 Vistas Analíticas de Base de Datos y sus Columnas Reales
1. **`v_rentabilidad_ciclo`** (26 columnas):
   - `cicloId` (int), `empresaId` (int), `parcelaId` (int), `variedadId` (int), `estado` (enum: PLANIFICADO, ACTIVO, SUSPENDIDO, FINALIZADO, CANCELADO), `fechaInicio` (date), `superficieSembrada` (decimal).
   - `costoTotal` (decimal), `kgCosechados` (decimal), `kgMerma` (decimal), `kgMermaCampo` (decimal), `kgNetos` (decimal), `kgVendidos` (decimal), `kgDisponibles` (decimal).
   - `ingresos` (decimal), `totalFacturado` (decimal), `cobrado` (decimal), `ganancia` (decimal), `margenPct` (decimal), `roiPct` (decimal), `costoPorKg` (decimal), `precioPromedioKg` (decimal), `mermaPct` (decimal), `costoPorHectarea` (decimal), `rendimientoKgHa` (decimal), `porCobrar` (decimal).
2. **`v_costo_por_actividad`** (7 columnas):
   - `cicloId` (int), `empresaId` (int), `tipoActividadId` (int), `tipoActividad` (varchar), `numeroActividades` (bigint), `horasTotales` (decimal), `costoTotal` (decimal).
3. **`v_costo_por_categoria`** (6 columnas):
   - `cicloId` (int), `empresaId` (int), `categoriaRaizId` (bigint), `categoriaRaiz` (varchar), `monto` (decimal), `porcentaje` (decimal).
4. **`v_merma_desglose`** (5 columnas):
   - `cicloId` (int), `empresaId` (int), `motivo` (varchar), `etapa` (enum: CAMPO, POSCOSECHA, TRANSPORTE, ALMACEN), `kgMerma` (decimal).
5. **`v_comparativo_parcela`** (29 columnas):
   - Las 26 columnas de `v_rentabilidad_ciclo` más:
   - `margenPctCicloAnterior` (decimal): función de ventana `LAG(margenPct) OVER (PARTITION BY parcelaId ORDER BY fechaInicio, cicloId)`.
   - `costoPorKgCicloAnterior` (decimal): función de ventana `LAG(costoPorKg) OVER (PARTITION BY parcelaId ORDER BY fechaInicio, cicloId)`.
   - `gananciaCicloAnterior` (decimal): función de ventana `LAG(ganancia) OVER (PARTITION BY parcelaId ORDER BY fechaInicio, cicloId)`.

---

### 4. Los 3 Roles Reales (`prisma/seed.ts`)
- **`ADMIN`** (Administrador): Dueño o productor con acceso total al sistema (los 19 permisos).
- **`CAPTURISTA`** (Capturista de campo): Encargado de capturar actividades, gastos, cosechas y mermas en campo (`actividad:crear`, `gasto:crear`, `cosecha:crear`, `merma:crear`).
- **`CONTADOR`** (Contador): Gestión de finanzas, ventas, cobros y reportes (`tercero:administrar`, `gasto:crear`, `gasto:editar_todos`, `venta:crear`, `venta:cancelar`, `cobro:crear`, `reporte:ver`, `reporte:exportar`).

---

### 5. Los 19 Permisos Reales (`prisma/seed.ts`)
1. `empresa:administrar`: Datos de la empresa, plan y bitácora.
2. `usuario:administrar`: Crear y desactivar usuarios, asignar rol.
3. `estructura:administrar`: Predios y parcelas.
4. `tercero:administrar`: Proveedores y clientes.
5. `catalogo:administrar`: Categorías de gasto propias.
6. `ciclo:crear`: Crear, editar, iniciar, suspender y reanudar ciclos.
7. `ciclo:cerrar`: Finalizar y cancelar ciclos.
8. `ciclo:reabrir`: Reabrir ciclos finalizados o cancelados.
9. `actividad:crear`: Registrar actividades.
10. `gasto:crear`: Registrar gastos.
11. `gasto:editar_todos`: Editar gastos de cualquier usuario.
12. `cosecha:crear`: Registrar cosechas.
13. `merma:crear`: Registrar mermas.
14. `venta:crear`: Crear y editar ventas.
15. `venta:cancelar`: Cancelar ventas.
16. `cobro:crear`: Registrar y anular cobros.
17. `registro:administrar`: Editar y eliminar cualquier actividad, gasto, cosecha o merma.
18. `reporte:ver`: Tablero, indicadores y alertas.
19. `reporte:exportar`: Exportar reportes a Excel, PDF y CSV.

---

### 6. Rutas de la API por Módulo

#### Autenticación (`/auth`)
- `POST /auth/login` (Público)
- `POST /auth/refresh` (Público)
- `POST /auth/logout` (Autenticado)
- `GET /auth/me` (Autenticado)

#### Empresas (`/empresas`)
- `POST /empresas/registro` (Público / Flujo F-01)
- `GET /empresas/mi-empresa` (Permiso: `empresa:administrar`)
- `PATCH /empresas/mi-empresa` (Permiso: `empresa:administrar`)

#### Usuarios (`/usuarios`)
- `POST /usuarios` (Permiso: `usuario:administrar`)
- `GET /usuarios` (Permiso: `usuario:administrar`)
- `GET /usuarios/:id` (Permiso: `usuario:administrar`)
- `PATCH /usuarios/:id` (Permiso: `usuario:administrar`)
- `DELETE /usuarios/:id` (Permiso: `usuario:administrar`)

#### Auditoría (`/auditoria`)
- `GET /auditoria` (Permiso: `empresa:administrar`)
- `GET /auditoria/:id` (Permiso: `empresa:administrar`)

#### Estructura Física: Predios y Parcelas (`/predios`, `/parcelas`)
- `POST /predios` (Permiso: `estructura:administrar`)
- `GET /predios` (Autenticado)
- `GET /predios/:id` (Autenticado)
- `PATCH /predios/:id` (Permiso: `estructura:administrar`)
- `DELETE /predios/:id` (Permiso: `estructura:administrar`)
- `POST /parcelas` (Permiso: `estructura:administrar`)
- `GET /parcelas` (Autenticado)
- `GET /parcelas/:id` (Autenticado)
- `PATCH /parcelas/:id` (Permiso: `estructura:administrar`)
- `DELETE /parcelas/:id` (Permiso: `estructura:administrar`)

#### Terceros: Clientes y Proveedores (`/clientes`, `/proveedores`)
- `POST /clientes` (Permiso: `tercero:administrar`)
- `GET /clientes` (Autenticado)
- `GET /clientes/:id` (Autenticado)
- `PATCH /clientes/:id` (Permiso: `tercero:administrar`)
- `DELETE /clientes/:id` (Permiso: `tercero:administrar`)
- `POST /proveedores` (Permiso: `tercero:administrar`)
- `GET /proveedores` (Autenticado)
- `GET /proveedores/:id` (Autenticado)
- `PATCH /proveedores/:id` (Permiso: `tercero:administrar`)
- `DELETE /proveedores/:id` (Permiso: `tercero:administrar`)

#### Catálogos (`/catalogos`)
- `GET /catalogos/cultivos` (Autenticado)
- `GET /catalogos/cultivos/:id/variedades` (Autenticado)
- `GET /catalogos/tipos-suelo` (Autenticado)
- `GET /catalogos/unidades-medida` (Autenticado)
- `GET /catalogos/tipos-actividad` (Autenticado)
- `GET /catalogos/motivos-merma` (Autenticado)
- `GET /catalogos/categorias-gasto` (Autenticado)
- `POST /catalogos/categorias-gasto` (Permiso: `catalogo:administrar`)

#### Ciclos de Producción (`/ciclos`)
- `POST /ciclos` (Permiso: `ciclo:crear`)
- `GET /ciclos` (Autenticado)
- `GET /ciclos/:id` (Autenticado)
- `PATCH /ciclos/:id` (Permiso: `ciclo:crear`)
- `PATCH /ciclos/:id/iniciar` (Permiso: `ciclo:crear`)
- `PATCH /ciclos/:id/suspender` (Permiso: `ciclo:crear`)
- `PATCH /ciclos/:id/reanudar` (Permiso: `ciclo:crear`)
- `PATCH /ciclos/:id/finalizar` (Permiso: `ciclo:cerrar`)
- `PATCH /ciclos/:id/cancelar` (Permiso: `ciclo:cerrar`)
- `PATCH /ciclos/:id/reabrir` (Permiso: `ciclo:reabrir`)
- `DELETE /ciclos/:id` (Permiso: `ciclo:cerrar`)

#### Actividades Agrícolas (`/actividades`)
- `POST /actividades` (Permiso: `actividad:crear`)
- `GET /actividades` (Permiso: `actividad:crear`)
- `GET /actividades/:id` (Permiso: `actividad:crear`)
- `PATCH /actividades/:id` (Permiso: `actividad:crear`)
- `DELETE /actividades/:id` (Permiso: `registro:administrar`)

#### Gastos Operativos (`/gastos`)
- `POST /gastos` (Permiso: `gasto:crear`)
- `GET /gastos` (Permiso: `gasto:crear`)
- `GET /gastos/:id` (Permiso: `gasto:crear`)
- `PATCH /gastos/:id` (Permiso: `gasto:crear` o `gasto:editar_todos`)
- `DELETE /gastos/:id` (Permiso: `registro:administrar`)

#### Cosechas (`/cosechas`)
- `POST /cosechas` (Permiso: `cosecha:crear`)
- `GET /cosechas` (Permiso: `cosecha:crear`)
- `GET /cosechas/:id` (Permiso: `cosecha:crear`)
- `PATCH /cosechas/:id` (Permiso: `cosecha:crear`)
- `DELETE /cosechas/:id` (Permiso: `registro:administrar`)

#### Mermas (`/mermas`)
- `POST /mermas` (Permiso: `merma:crear`)
- `GET /mermas` (Permiso: `merma:crear`)
- `GET /mermas/:id` (Permiso: `merma:crear`)
- `PATCH /mermas/:id` (Permiso: `merma:crear`)
- `DELETE /mermas/:id` (Permiso: `registro:administrar`)

#### Ventas (`/ventas`)
- `POST /ventas` (Permiso: `venta:crear`)
- `GET /ventas` (Permiso: `venta:crear`)
- `GET /ventas/:id` (Permiso: `venta:crear`)
- `PATCH /ventas/:id` (Permiso: `venta:crear`)
- `PATCH /ventas/:id/cancelar` (Permiso: `venta:cancelar`)

#### Cobros (`/ventas/:ventaId/cobros`, `/cobros/:id`)
- `POST /ventas/:ventaId/cobros` (Permiso: `cobro:crear`)
- `GET /ventas/:ventaId/cobros` (Permiso: `cobro:crear`)
- `GET /cobros/:id` (Permiso: `cobro:crear`)
- `PATCH /cobros/:id/anular` (Permiso: `cobro:crear`)

#### Reportes y Alertas (`/reportes`)
- `GET /reportes/cuentas-por-cobrar` (Permiso: `reporte:ver`)
- `GET /reportes/alertas` (Permiso: `reporte:ver`)
- `GET /reportes/rentabilidad` (Permiso: `reporte:ver`)
- `GET /reportes/ciclos/:cicloId/rentabilidad` (Permiso: `reporte:ver`)
- `GET /reportes/ciclos/:cicloId/costos-por-categoria` (Permiso: `reporte:ver`)
- `GET /reportes/ciclos/:cicloId/costos-por-actividad` (Permiso: `reporte:ver`)
- `GET /reportes/ciclos/:cicloId/mermas` (Permiso: `reporte:ver`)
- `GET /reportes/parcelas/:parcelaId/comparativo` (Permiso: `reporte:ver`)

#### Exportación de Reportes (`/reportes/exportaciones`)
- `GET /reportes/exportaciones/rentabilidad` (Permiso: `reporte:exportar`)
- `GET /reportes/exportaciones/ciclos/:cicloId` (Permiso: `reporte:exportar`)
- `GET /reportes/exportaciones/parcelas/:parcelaId/comparativo` (Permiso: `reporte:exportar`)
- `GET /reportes/exportaciones/cuentas-por-cobrar` (Permiso: `reporte:exportar`)

#### Archivos Adjuntos (`/actividades/:id/adjuntos`, `/gastos/:id/adjuntos`, `/ventas/:id/adjuntos`, `/cobros/:id/adjuntos`, `/adjuntos/...`)
- `POST /actividades/:id/adjuntos` (Permiso: `actividad:crear`)
- `GET /actividades/:id/adjuntos` (Permiso: `actividad:crear`)
- `POST /gastos/:id/adjuntos` (Permiso: `gasto:crear`)
- `GET /gastos/:id/adjuntos` (Permiso: `gasto:crear`)
- `POST /ventas/:id/adjuntos` (Permiso: `venta:crear`)
- `GET /ventas/:id/adjuntos` (Permiso: `venta:crear`)
- `POST /cobros/:id/adjuntos` (Permiso: `cobro:crear`)
- `GET /cobros/:id/adjuntos` (Permiso: `cobro:crear`)
- `GET /adjuntos/:id/enlace-descarga` (Autenticado con acceso a la entidad)
- `GET /adjuntos/descarga` (`?token=`, Público con token criptográfico temporal firmado)
- `DELETE /adjuntos/:id` (Autenticado con propiedad o `registro:administrar`)

#### Health Check (`/health`)
- `GET /health` (Público)

---

## D. Códigos de Error

Tabla exhaustiva del enum `CodigoError` (`src/common/errors/codigos-error.enum.ts`) y su mapeo HTTP en `DomainExceptionFilter`:

| Código del Enumerador | Código HTTP | Nombre HTTP | Significado en el Dominio |
|---|---|---|---|
| `CICLO_CERRADO` | 409 | Conflict | Se intentó registrar actividad, gasto, cosecha o merma en un ciclo finalizado o cancelado. |
| `CICLO_YA_ACTIVO` | 409 | Conflict | La parcela ya tiene un ciclo activo (violación de RN-009). |
| `VENTA_EXCEDE_DISPONIBLE` | 400 | Bad Request | La cantidad de venta excede los kg netos disponibles de la cosecha o ciclo (sobreventa). |
| `MERMA_EXCEDE_COSECHA` | 409 | Conflict | La sumatoria de mermas poscosecha excede el total de cosechas del ciclo (balance de masa). |
| `TOTAL_NO_COINCIDE` | 400 | Bad Request | El importe total de la venta no coincide con la suma de los detalles menos descuentos más impuestos. |
| `COBRO_EXCEDE_TOTAL` | 409 | Conflict | La sumatoria de cobros activos excede el importe total facturado de la venta. |
| `VENTANA_EDICION_VENCIDA` | 409 | Conflict | Se intentó modificar o eliminar un gasto fuera de la ventana permitida (RN-062). |
| `LIMITE_PLAN_EXCEDIDO` | 409 | Conflict | Se alcanzó el límite de usuarios o parcelas permitido por el plan de suscripción (RN-037). |
| `SUSCRIPCION_INACTIVA` | 403 | Forbidden | La empresa tiene su suscripción vencida o cancelada. |
| `PERMISO_DENEGADO` | 403 | Forbidden | El usuario autenticado carece del permiso RBAC requerido para ejecutar la operación. |
| `FECHA_ANTERIOR_AL_INICIO` | 400 | Bad Request | La fecha de una actividad, gasto o cosecha es anterior a la fecha de inicio del ciclo. |
| `UNIDAD_NO_PESO` | 400 | Bad Request | Se intentó registrar una cosecha o merma con una unidad que no es de tipo PESO (RN-024). |
| `ACTIVIDAD_DE_OTRO_CICLO` | 400 | Bad Request | La actividad vinculada a un gasto pertenece a un ciclo diferente. |
| `CICLO_NO_ACTIVO` | 409 | Conflict | La operación exige que el ciclo esté en estado ACTIVO y se encuentra en otro estado. |
| `COSECHA_DE_OTRO_CICLO` | 400 | Bad Request | La cosecha especificada no pertenece al ciclo de producción indicado. |
| `COSECHA_CON_MERMAS_VIGENTES` | 409 | Conflict | No se puede eliminar una cosecha que tiene registros de merma activos vinculados. |
| `VENTA_YA_CANCELADA` | 409 | Conflict | Se intentó cobrar, modificar o cancelar una venta que ya se encuentra cancelada. |
| `CLIENTE_NO_ACTIVO` | 400 | Bad Request | El cliente seleccionado está dado de baja o inactivo. |
| `COSECHA_CON_VENTAS_VINCULADAS` | 409 | Conflict | No se puede eliminar una cosecha que tiene detalles de venta activos asociados. |
| `KG_VENDIDOS_EXCEDEN_NETOS` | 400 | Bad Request | La reducción de cosecha o incremento de merma dejaría los kg vendidos por encima de los netos. |
| `RECURSO_NO_ENCONTRADO` | 404 | Not Found | El registro no existe o pertenece a otra empresa (aislamiento multi-tenant estricto). |
| `PETICION_INVALIDA` | 400 | Bad Request | Error de validación de sintaxis, formato o parámetros en el payload de entrada. |
| `NO_AUTENTICADO` | 401 | Unauthorized | Token JWT ausente, inválido, corrupto o con firma expirada. |
| `COBRO_YA_ANULADO` | 409 | Conflict | Se intentó anular un cobro que ya había sido anulado previamente. |
| `FECHA_COBRO_INVALIDA` | 400 | Bad Request | La fecha del cobro es anterior a la fecha de emisión de la venta. |
| `ARCHIVO_DEMASIADO_GRANDE` | 413 | Payload Too Large | El archivo adjunto supera el tamaño máximo permitido de 10 MB (10,485,760 bytes). |
| `TIPO_ARCHIVO_NO_PERMITIDO` | 415 | Unsupported Media Type | El formato o firma binaria (Magic Bytes) del archivo no corresponde a JPEG, PNG o PDF. |
| `ADJUNTO_ENTIDAD_NO_SOPORTADA` | 400 | Bad Request | Se intentó adjuntar un archivo a una entidad no soportada (solo GASTO y COBRO). |
| `ENLACE_DESCARGA_INVALIDO` | 403 | Forbidden | El token de descarga es inválido, expiró, pertenece a otro usuario o el emisor fue desactivado. |
| `LIMITE_ADJUNTOS_ALCANZADO` | 400 | Bad Request | Se alcanzó el límite máximo de 5 adjuntos por entidad. |
| `EXPORTACION_EXCEDE_LIMITE` | 400 | Bad Request | El conjunto de datos a exportar síncronamente supera el límite de seguridad de 5,000 filas. |
| `DEMASIADAS_PETICIONES` | 429 | Too Many Requests | Se excedió el límite de peticiones permitido por ventana de tiempo o bloqueo de fuerza bruta (incluye cabecera `Retry-After`). |
| `CONFLICTO` | 409 | Conflict | Conflicto de unicidad o clave foránea capturado por Prisma (códigos P2002 / P2003). |
| `ERROR_INTERNO` | 500 | Internal Server Error | Falla no controlada en el servidor o error no mapeado en base de datos. |

---

## E. Invariantes de Arquitectura

- empresaId siempre del JWT; recurso ajeno = 404.
- Orden de bloqueo: ciclo primero, venta después. Dentro de toda $transaction, la PRIMERA sentencia es bloquearCicloParaCaptura; las lecturas previas van FUERA de la transacción y el registro se RELEE bajo el lock (regla REPEATABLE READ, ADR-007).
- Escribir, recalcular y revertir con error de dominio, en lugar de validar antes con aritmética de deltas.
- Auditoría en la misma transacción; la bitácora nunca guarda secretos ni claves de almacenamiento.
- Errores solo de dominio, centralizados en codigos-error.enum.ts; nunca throw new Error en producción.
- @RequirePermisos tiene semántica AND: un permiso por endpoint; el bypass de registro:administrar va en el servicio.
- Dinero y kg solo con Prisma.Decimal; en la API como string (importes y porcentajes 2 decimales, kg 3, HALF_UP vía reporte-formato.util).
- Fórmulas de indicadores solo en las vistas; no se recalculan en TypeScript.
- SQL crudo solo con Prisma.sql parametrizado, columnas explícitas y empresaId en el WHERE.
- Cambios de contrato JSON solo aditivos. Estados de ciclo según tabla 2.6.
- Los nombres reales de BD son camelCase; el documento maestro es referencia de reglas, no de nombres.

---

## F. Reglas de Trabajo con Antigravity

- Un prompt de ejecución por hito, con criterios de aceptación y commit incluidos.
- Prueba ROJA antes de cada arreglo de concurrencia o seguridad (compuerta de lock, sin sleeps).
- Nunca modificar valores esperados del Anexo D para hacer pasar un test.
- git add selectivo, nunca git add .; sin scratch/, .env ni logs.
- Informes: máximo de líneas indicado, hashes COMPLETOS, salidas CRUDAS de comandos; si no se ejecutó algo, decirlo.
- Dependencias: versión exacta, más de 14 días, ficha y npm audit.
- Línea base de calidad: lint 325 errores y 84 avisos (solo puede bajar; 0 y 0 en archivos nuevos y modificados; reducción desde 393 explicada en 11D por tipado de DTOs y erradicación de `any`), 630 tests unitarios (91 suites), 235 e2e (15 suites, más 1 suite de volumen condicional omitida con `E2E_VOLUMEN=1`), contrato:verificar 0 (109 rutas, 38 códigos), db:verify 0 fallas (74 comprobaciones del Anexo D: 19 de estructura + 38 de indicadores de vistas + 17 de restricciones con `tmp_esperar_error`), 6 migraciones aplicadas limpiamente en `backend` y `rentabilidad_agricola_test`.

---

## G. Deuda Técnica Consolidada (de todos los ADR) con su Origen

| ID | Deuda Técnica Consolidada | Origen Arquitectónico | Impacto / Mitigación Actual |
|---|---|---|---|
| **DT-01** | Propagación explícita del parámetro transaccional `tx` en servicios | ADR-001 (Auditoría transaccional) | Si se omite `tx`, la auditoría o la mutación se ejecutan fuera de la transacción atómica. Mitigado con tests unitarios que simulan fallas y comprueban el rollback en cascada. |
| **DT-02** | Serialización pesimista estricta en transiciones de ciclo | ADR-007 (Concurrencia) | Alta contención si múltiples capturistas escriben mientras se cierra un ciclo. Recomendación: desacoplar réplica de solo lectura para reportes históricos. |
| **DT-03** | Filtrado avanzado en memoria vs SQL para `estadoCobro` en ventas | ADR-009 (Cobros y Cuentas por Cobrar) | `estadoCobro` es un estado derivado en runtime. Al paginar grandes volúmenes de ventas, requerirá subconsultas indexadas o columna materializada en BD. |
| **DT-04** | Alertas push en tiempo real ante cuentas por cobrar vencidas | ADR-009 (Cobros) | Actualmente solo se evalúa pull vía API (`GET /reportes/cuentas-por-cobrar`). Pendiente worker de notificaciones push para la app móvil. |
| **DT-05** | Configuración personalizada de umbrales de alerta por empresa | ADR-010 (Indicadores y Tablero) | Los umbrales de margen y merma están fijos en código/vistas. Se difirió la tabla `configuracion_alerta` por tenant. |
| **DT-06** | Job periódico de reconciliación de huérfanos en almacenamiento | ADR-012 (Archivos Adjuntos) | Si el servidor se apaga abruptamente tras escribir en disco y antes del commit de BD, queda un archivo huérfano. Requiere un cron nocturno de reconciliación. |
| **DT-07** | Driver de almacenamiento para nube (S3 / Google Cloud Storage) | ADR-012 (Archivos Adjuntos) | La interfaz `IStorageService` está desacoplada pero solo cuenta con `LocalStorageService`. Para despliegues elásticos multi-instancia se requiere el adaptador S3. |
| **DT-08** | Cola asíncrona (BullMQ / Redis) para exportaciones masivas (>5,000 filas) | ADR-013 (Exportación de Reportes) | Exportaciones síncronas están acotadas a 5,000 registros para proteger la memoria del proceso Node.js. Volúmenes mayores requieren procesamiento background con streaming. |
| **DT-09** | Gating por `incluyeReportes` del plan de suscripción (sin número de RN, pendiente decisión de producto) | ADR-013 (Exportación de Reportes — Errata 11A) | Pendiente definición de producto sobre si `plan_suscripcion.incluyeReportes` restringe solo `/reportes/exportaciones/*` o todo `/reportes/*` para planes BASICO y PRODUCTOR. |
| **DT-10** | Almacenamiento distribuido (Redis) para `@nestjs/throttler` en despliegues multi-instancia | ADR-014 (Seguridad y Throttling) | El limitador de tasa opera en memoria local del proceso Node.js. Al escalar horizontalmente a múltiples instancias se debe inyectar storage Redis compartido. |
| **DT-11** | Validación formal de OpenAPI en pipeline CI/CD con generador Dart | Hito 11D / 11C.1 | Validador OpenAPI vía red (`npx @stoplight/spectral-cli`) restringido en sandbox sin red externa. Se delega la validación formal al pipeline de generación del cliente Dart en Flutter (`openapi-generator-cli`). |
| **DT-12** | Job periódico de purga de tokens de recuperación expirados | ADR-017 (Gestión de Contraseñas) | La tabla `password_reset_token` acumula registros consumidos, revocados o expirados. Requiere un cron job nocturno (`@nestjs/schedule`) para eliminar físicamente tokens con más de 30 días. |
| **DT-13** | Cola asíncrona (BullMQ / Redis) para despacho de correos masivos | ADR-017 (Gestión de Contraseñas) | `BrevoTransport` despacha vía HTTP nativo con timeout de 5s. Al escalar la concurrencia se recomienda migrar a un worker en cola persistente con reintentos exponenciales. |

---

## H. Siguiente Paso: Hito 11 (En curso)

Estado de ejecución de los sub-hitos del **Hito 11**:
- **11A: Seguridad y Auth (Completado)**: Rotación atómica condicional de refresh tokens con detección de reuso y revocación por familia (`familiaId`), rate limiting con `@nestjs/throttler@6.7.1` (`default`, `login-ip`, `login-correo` con tracker `IP + sha256(correo)` y `DEMASIADAS_PETICIONES` 429 + `Retry-After`), Argon2id (`m=19456, t=2, p=1`) con rehash transparente y `dummy verify`, secretos JWT $\ge 64$ caracteres y suite e2e integral de RN-072, RN-038 (con `DiscoveryService`), RN-037, RN-074 y prueba de frontera horaria RN-073 (`America/Mexico_City`).
- **11D: Congelación del Contrato API para Flutter y Cierre de Reservas (Completado - ADR-015)**: Decoración exhaustiva de DTOs y controladores para OpenAPI 3.0 determinista sobre las 106 rutas, snapshot congelado en `docs/contrato/openapi.json`, scripts `contrato:generar` y `contrato:verificar`, suite E2E `test/e2e/contrato-openapi.e2e-spec.ts` (14 pruebas) con guardias anti-deriva automáticas sobre el catálogo de 36 errores (`docs/contrato/errores.md`) y la matriz de 106 rutas (`docs/contrato/matriz-permisos.md`), paginación canónica `{ data, meta }` con default 20 y límite máximo de 100 (`limit=101` -> 400 `PETICION_INVALIDA`), guía canónica Flutter (`docs/contrato-api-flutter.md`) con advertencia crítica de Single-Flight Mutex para refresh tokens y política de ausencia de `X-App-Version`, `AppVersionGuard` con matriz E2E de 20 casos (`test/e2e/app-version.e2e-spec.ts`), soporte E2E de `image/webp` (Magic Bytes `RIFF....WEBP`) sincronizado con §3.23 y ADR-012, y cotas mínimas en `env.validation.ts` para Argon2id (m=19456, t=2, p=1).
- **11C / 11C.1: Verificación de Base de Datos y Respaldo (Completado - ADR-016)**: Anexo D completo implementado y verificado (74 comprobaciones estructurales, semánticas, de vistas e integridad transaccional al 100% OK con cero fallas sobre `rentabilidad_agricola_test`: 19 de estructura/semilla, 38 de indicadores/vistas analíticas y 17 de restricciones negativas con `tmp_esperar_error`); runner automatizado `npm run db:verify` con safeguard estricto para bases `_test` y suite unitaria pura `src/common/utils/db-verify.spec.ts`; control negativo real verificado con eliminación de vista y salida en `exit 1`; aclaración del alcance de la prueba en `docs/operacion/respaldo-restauracion.md` (valida estructura y semilla, no volumen histórico); armonización de paginación por defecto a 50 (docx §3.23); guía operativa de respaldo y restauración con `mysqldump` sin credenciales en línea de comandos (`--defaults-extra-file`) y configuración de binlogs para PITR.
- **11E / 11E.1: Gestión de Contraseñas y Recuperación por Correo (Completado - ADR-017)**: Implementación integral de cambio autenticado de contraseña (`PATCH /api/v1/auth/contrasena/cambiar` con validación de clave actual, verificación Argon2id y revocación atómica de sesiones activas en `refresh_token`), solicitud anti-enumeración de restablecimiento (`POST /api/v1/auth/contrasena/solicitar-recuperacion` con token criptográfico de 32 bytes en claro enviado por correo y persistido como digest SHA-256 de 64 caracteres en BD), consumo atómico de token uniuso con `updateMany` condicional (`POST /api/v1/auth/contrasena/restablecer`), 6.ª migración canónica (`password_reset_token` y columna `cambioContrasenaEn` en `usuario`), módulo desacoplado `MailModule` con transportes `BrevoTransport` (HTTP nativo con timeout 5s y sanitización HTML), `LogTransport` y `MemoryTransport` para pruebas (con `esperarEnviosPendientes` y `simularFalloProximoEnvio`), invalidación inmediata en `JwtStrategy` para tokens con `payload.iat < Math.floor(cambioContrasenaEn / 1000)`, inclusión de `/auth/contrasena/cambiar` en la allowlist de `AccesoVigenteGuard` (RN-038) para suscripciones vencidas, throttlers dedicados (`recuperar-ip`, `recuperar-correo`, `restablecer-ip`, `cambiar-usuario`) con TTL en milisegundos (`900_000` ms) y Retry-After, catálogo ampliado a 38 códigos de error (+`TOKEN_RECUPERACION_INVALIDO`, +`CONTRASENA_ACTUAL_INCORRECTA`), contrato OpenAPI actualizado a 109 rutas verificadas sin deriva, 24/24 pruebas unitarias en `auth.service.spec.ts`, 15/15 en `env.validation.spec.ts`, suite E2E `test/e2e/contrasenas.e2e-spec.ts` (18/18 pruebas passing incluyendo mutación, cuota y concurrencia) y desversionado del `.docx` binario maestro (`.gitignore`).
- **11B: Saneamiento de Deuda de Lint (Siguiente)**: Plan sistemático de resolución de los errores restantes de `@typescript-eslint` por lotes sin alterar la lógica de negocio, protegido por el snapshot congelado del contrato OpenAPI.
