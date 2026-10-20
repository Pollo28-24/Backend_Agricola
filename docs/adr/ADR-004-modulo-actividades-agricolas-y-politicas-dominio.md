# ADR-004: Módulo de Actividades Agrícolas, Políticas de Dominio y Gobernanza Temporal

## Estado
Aceptado

## Contexto
El sistema de **Rentabilidad Agrícola** (v3.1) requiere modelar las labores operativas de campo (siembra, riego, fertilización, deshierbe, podas, etc.) que estructuran los costos de cada ciclo productivo.
A diferencia de los catálogos estáticos o estructuras físicas, las **Actividades**:
1. Pertenecen estrictamente a un ciclo de producción (`cicloId`) (RN-010).
2. Tienen restricciones de captura ligadas al ciclo de vida del ciclo (RN-015: prohibido capturar en ciclos `FINALIZADO` o `CANCELADO`).
3. Tienen restricción temporal agronómica (RN-044: `fecha` no puede ser anterior a `fechaInicio` del ciclo).
4. Introducen la gobernanza temporal de campo (RN-062): los capturistas únicamente editan registros propios dentro de una ventana de 48 horas desde su creación (`createdAt`), mientras que el rol `ADMIN` con `registro:administrar` tiene facultad de bypass total.
5. Sirven como ancla referencial para la posterior asignación de egresos en el módulo de Gastos (RN-046).

Para evitar que los servicios se conviertan en monolitos acoplados de 900+ líneas, se adopta formalmente la arquitectura institucional de cuatro capas.

---

## Decisiones Arquitectónicas

### 1. Arquitectura de Cuatro Capas
Todo módulo de dominio operativo se estructura en cuatro capas unidireccionales:
```
Controller (HTTP / Swagger / DTOs / Guards)
     ↓
Application Service (Orquestador Estricto: Leer -> Transaccionar -> Validar -> Persistir)
     ↓
Domain (Policies y Validators 100% Puros: Cero I/O, Cero dependencias de Prisma)
     ↓
Infrastructure (PrismaService, AuditService centralizado, MySQL 8)
```

### 2. Distinción entre `Policies` y `Validators`
- **Policies (`domain/policies/`)**: Encapsulan reglas y políticas de negocio intrínsecas del dominio agronómico reutilizables a través de múltiples módulos.
  - Ejemplo: `CicloCapturaPolicy` encapsula **RN-015** (si el estado del ciclo admite captura) y **RN-044** (coherencia de fechas). Esta misma política será reutilizada por Gastos, Cosechas y Mermas sin duplicar lógica.
- **Validators (`domain/validators/`)**: Validan restricciones de autorización temporal, ownership contextual y consistencia relacional.
  - `ActividadWindowValidator`: Encapsula **RN-062** (48 horas sobre `createdAt` y autoría `creadoPorId === usuarioId`).
  - `ActividadOwnershipValidator`: Encapsula **RN-068** (aislamiento multi-tenant del ciclo y del usuario responsable).

### 3. Pureza de Dominio (Sin dependencias de Infraestructura)
Los componentes de `domain/` no importan `@prisma/client`, `PrismaService` ni `TransactionClient`. Operan exclusivamente sobre tipos/objetos en memoria y lanzan `DomainError` fuertemente tipados. Esto permite pruebas unitarias instantáneas con cero mocks de base de datos.

### 4. Application Service como Orquestador de 4 Pasos
El `ActividadesService` se limita estrictamente a:
1. **Leer** los registros necesarios mediante queries optimizadas.
2. **Abrir `$transaction`**.
3. **Invocar** las políticas y validadores de dominio.
4. **Persistir** mutaciones y asentar la bitácora mediante `AuditService.registrar(..., tx)`.
Queda terminantemente prohibido escribir lógica de negocio, cálculo de fechas o helpers privados de auditoría dentro de los servicios.

### 5. DTOs Explícitos e Inmutables
Se prohíbe el uso de `PartialType`, `OmitType` o `PickType` en DTOs que representen entidades mutables de dominio.
- `CreateActividadDto`: Declara explícitamente todos los campos de entrada.
- `UpdateActividadDto`: Declara explícitamente solo los campos mutables permitidos (`tipoActividadId`, `responsableId`, `fecha`, `descripcion`, `horasTrabajadas`). Los campos estructurales (`cicloId`, `empresaId`, `creadoPorId`, `createdAt`) no forman parte del DTO.

### 6. Integridad Referencial con Soft Delete en Gastos
Para la baja lógica de una actividad, no se utiliza `_count` ciego de Prisma (que contaría filas borradas lógicamente), sino un conteo explícito de gastos vigentes:
`tx.gasto.count({ where: { actividadId: id, deletedAt: null } })`. Si existen gastos activos vinculados, la baja se rechaza con `409 Conflict` (RN-046).

---

## Consecuencias
- **Positivas**:
  - Código altamente desacoplado, mantenible y legible.
  - Reutilización directa de `CicloCapturaPolicy` y `ActividadWindowValidator` en los módulos siguientes (Gastos, Cosechas, Mermas).
  - Auditoría 100% transaccional garantizada por `AuditService`.
  - Cobertura de pruebas unitarias pura y exhaustiva.
- **Trade-offs**:
  - Mayor cantidad de archivos pequeños y enfocados en lugar de un único archivo grande. Este costo inicial de diseño se amortiza completamente al evitar refactorizaciones futuras.
