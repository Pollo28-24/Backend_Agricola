# ADR-005: Módulo de Gastos y Costos Operativos

## Estado
Aceptado

## Contexto
El sistema de **Rentabilidad Agrícola** (v3.2) requiere registrar la imputación de costos económicos directos e indirectos a los ciclos productivos. El módulo de **Gastos**:
1. No administra compras, inventario, almacenes ni cuentas por pagar (pertenecen a otro bounded context). Su propósito exclusivo es alimentar el costeo de producción para el cálculo de rentabilidad por ciclo, hectárea y cultivo.
2. Imputa costos económicos directamente a un `cicloId` (RN-010) y de forma opcional a una labor agrícola `actividadId` (RN-046). La relación de dependencia es unidireccional: `Gasto -> Actividad` y `Gasto -> Ciclo`.
3. Requiere gobernanza de ciclo de vida (RN-015 / RN-023: prohibido crear, editar o eliminar gastos en ciclos `FINALIZADO` o `CANCELADO`; admitidos en `PLANIFICADO`, `ACTIVO` y `SUSPENDIDO`).
4. Exige coherencia temporal agronómica (RN-044: `fecha` no puede ser anterior a `fechaInicio` del ciclo).
5. Exige validación aritmética estricta de comprobantes (RN-045): si se especifican `cantidad` y `costoUnitario`, debe validarse contra el `total` con tolerancia máxima de $\pm 0.05$ (5 centavos), computado exclusivamente con `Prisma.Decimal` sin conversiones intermedias a números flotantes IEEE 754.
6. Aplica gobernanza temporal de campo (RN-062) y separación de privilegios (2.12):
   - `CAPTURISTA`: Registra gastos, edita solo los propios (`creadoPorId === usuarioId`) dentro de las 48 horas desde `createdAt`, y no tiene permiso de eliminación. En lecturas (listados y detalle), solo ve sus propios gastos (los ajenos responden 404 Not Found, regla 2.10.4).
   - `CONTADOR`: Con permiso `gasto:editar_todos`, puede editar gastos de cualquier usuario en cualquier momento mientras el ciclo admita captura. No elimina gastos. En lecturas, ve todos los gastos de la empresa.
   - `ADMIN`: Con permiso `registro:administrar`, posee facultad de edición irrestricta y es el **único** rol facultado para realizar la baja lógica (`soft delete`) de gastos.
7. Requiere aislamiento multi-tenant estricto (RN-068): `cicloId`, `categoriaId`, `proveedorId` y `actividadId` deben pertenecer a la empresa del usuario. Una categoría es válida si `empresaId` coincide con el del token JWT o si `empresaId IS NULL` (categoría institucional del sistema). Cualquier entidad ajena o borrada responde `404 Not Found`.

---

## Decisiones Arquitectónicas

### 1. Bounded Context y Modelo de Dominio
El agregado raíz es `Gasto`. Un gasto representa un costo consumido en un ciclo.
No genera pasivos ni movimientos de almacén en este módulo.

### 2. Políticas Puras de Dominio
Se implementan como clases puras (`domain/policies/` y `domain/validators/`) sin dependencias de base de datos ni I/O:
- **`GastoToleranciaPolicy` (RN-045)**:
  - Valida que `cantidad` y `costoUnitario` vengan ambos o ninguno (si viene uno solo $\to$ 400 Bad Request).
  - Si vienen ambos: calcula $\text{subtotal} = \text{cantidad} \times \text{costoUnitario}$, $\text{calculado} = \text{subtotal} + (\text{impuesto} \lor 0)$, $\text{diferencia} = |\text{total} - \text{calculado}|$.
  - Si $\text{diferencia} \le 0.05 \implies$ aprueba. Si $\text{diferencia} > 0.05 \implies$ lanza `DomainError(CodigoError.TOTAL_NO_COINCIDE, HttpStatus.BAD_REQUEST)`.
  - Operaciones ejecutadas íntegramente con la API de `Prisma.Decimal` (`.mul()`, `.add()`, `.sub()`, `.abs()`).
- **`GastoActividadPolicy` (RN-046)**:
  - Si se asocia a una actividad, valida que `actividad.cicloId === gasto.cicloId`. Si difiere $\to$ lanza `DomainError(CodigoError.ACTIVIDAD_DE_OTRO_CICLO, HttpStatus.BAD_REQUEST)`.
- **`GastoWindowValidator` (RN-062 / Matriz 2.12)**:
  - Para edición:
    1. Si el usuario posee `registro:administrar` (ADMIN) o `gasto:editar_todos` (CONTADOR) $\to$ aprueba.
    2. Si no los posee (CAPTURISTA), exige `creadoPorId === usuarioId` y $(\text{ahora} - \text{createdAt}) \le 48\text{ horas}$. Si vence $\to$ `DomainError(CodigoError.VENTANA_EDICION_VENCIDA, HttpStatus.CONFLICT)`. Si no es el autor $\to$ `DomainError(CodigoError.PERMISO_DENEGADO, HttpStatus.FORBIDDEN)`.
  - Para eliminación:
    1. Exige estrictamente `registro:administrar`. Si no lo posee $\to$ `DomainError(CodigoError.PERMISO_DENEGADO, HttpStatus.FORBIDDEN)`.

### 3. Resolución de Pertenencia Multi-Tenant (RN-068 / A5)
Siguiendo el principio YAGNI y la arquitectura institucional, no se crea un validador artificial para ownership. Se utiliza el patrón de consulta directa con filtro `where: { id, empresaId }` (y para categorías: `{ id, OR: [{ empresaId }, { empresaId: null }], activo: true }`). Si no se encuentra el registro o está borrado, se responde `404 Not Found` (`RECURSO_NO_ENCONTRADO`).

### 4. Revalidación en Actualizaciones (Update Fusión)
En `actualizarGasto`:
- Los campos estructurales (`cicloId`, `empresaId`, `creadoPorId`, `createdAt`) son inmutables y no existen en `UpdateGastoDto`.
- Las reglas de negocio se revalidan con los **valores fusionados**:
  - `fecha`: Si se actualiza, se revalida contra `fechaInicio` del ciclo (RN-044).
  - `actividadId`: Si se actualiza, se valida pertenencia a la empresa y coherencia de ciclo (RN-046).
  - `proveedorId`: Si se actualiza, se valida pertenencia y estado activo en la empresa (RN-068).
  - `categoriaId`: Si se actualiza, se valida pertenencia y estado activo (empresa o sistema) (RN-068).
  - `unidadId`: Si se actualiza, se valida existencia.
  - `cantidad`, `costoUnitario`, `impuesto`, `total`: Se fusionan con los valores persistidos del gasto y se revalida RN-045 (`GastoToleranciaPolicy`).

### 5. Desviaciones Identificadas (Schema vs Documento Maestro v3.2)
1. **Tipos de Identificadores**: El schema real de producción utiliza `Int` autoincremental con nombres camelCase en TypeScript (`id`, `empresaId`, `cicloId`), mapeados a columnas snake_case en MySQL (`empresa_id`, etc.). Se respeta el schema real.
2. **Concepto vs Descripción**: El schema real de producción define `descripcion String? @db.VarChar(500)`. El Documento Maestro mencionaba `concepto`. Se adopta `descripcion` del schema como campo de texto principal y opcional según schema.
3. **Comprobante**: El schema define `numeroComprobante String? @db.VarChar(60)`. El maestro mencionaba `comprobanteTipo` y `comprobanteFolio`. Se respeta el schema real exponiendo `numeroComprobante`.
4. **Campo `unidadId` y RN-024**: El schema ya incluye `unidadId Int?` y existe el modelo `UnidadMedida`. Si el DTO recibe `cantidad`, `unidadId` es obligatorio. No aplica la restricción de unidad de peso (RN-069 es exclusiva de cosechas).
5. **Visibilidad Scoped**: Según regla 2.10.4, usuarios sin `gasto:editar_todos` ni `registro:administrar` solo ven sus propios gastos (`creadoPorId: usuarioId`) tanto en el listado como en la consulta individual por ID.

### 6. Matriz de Permisos por Rol

| Operación | CAPTURISTA | CONTADOR | ADMIN |
|---|---|---|---|
| **Crear Gasto** | ✅ Permitido (`gasto:crear`) | ✅ Permitido (`gasto:crear`) | ✅ Permitido (`registro:administrar`) |
| **Listar / Detalle** | ⚠️ Solo registros propios | ✅ Todos los registros (`gasto:editar_todos`) | ✅ Todos los registros (`registro:administrar`) |
| **Editar Gasto** | ⚠️ Solo propios $\le 48\text{h}$ | ✅ Todos, sin límite de 48h (`gasto:editar_todos`) | ✅ Todos, bypass total (`registro:administrar`) |
| **Eliminar Gasto** | ❌ Prohibido (403) | ❌ Prohibido (403) | ✅ Permitido (`registro:administrar`) |

### 7. Códigos de Error
- `TOTAL_NO_COINCIDE` (400): Diferencia aritmética $> 0.05$ entre total y desglose (RN-045).
- `FECHA_ANTERIOR_AL_INICIO` (400): Fecha del gasto anterior al inicio del ciclo (RN-044).
- `ACTIVIDAD_DE_OTRO_CICLO` (400): La labor asignada pertenece a un ciclo productivo distinto (RN-046).
- `PERMISO_DENEGADO` (403): Usuario no autorizado o intento de eliminación sin rol ADMIN (2.12).
- `RECURSO_NO_ENCONTRADO` (404): Ciclo, categoría, proveedor, actividad o gasto no encontrado en el tenant (RN-068 / 2.10.4).
- `CICLO_CERRADO` (409): Ciclo en estado `FINALIZADO` o `CANCELADO` (RN-015 / RN-023).
- `VENTANA_EDICION_VENCIDA` (409): Expiró el plazo de 48 horas desde `createdAt` (RN-062).

---

## Consecuencias
- Operaciones monetarias blindadas contra errores de coma flotante.
- Garantía de inmutabilidad en la asignación de ciclos para evitar desajustes en el costeo histórico.
- Auditoría transaccional atómica con `AuditService`: si la auditoría falla, la mutación hace rollback.
