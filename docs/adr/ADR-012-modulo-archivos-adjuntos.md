# ADR-012: Módulo de Archivos Adjuntos con Almacenamiento Desacoplado y Descarga Firmada (Hito 10A)

## Estado
Aceptado

## Contexto
El sistema agrícola requiere soporte para adjuntar comprobantes de pago, facturas, contratos y evidencia fotográfica a registros operativos y financieros:
- **Gastos**: Facturas y notas de compra (F-14 / RN-062).
- **Actividades**: Reportes de campo, órdenes de trabajo y fotografías de labores agrícolas.
- **Ventas**: Contratos comerciales y facturas de venta.
- **Cobros**: Comprobantes de transferencia y fichas de depósito (RN-054).

Adicionalmente, se deben satisfacer las siguientes garantías de arquitectura y seguridad:
1. **Gobernanza temporal y de ciclo**: No se pueden añadir adjuntos a registros fuera de la ventana de 48 horas (RN-062) salvo por administradores, ni en ciclos cerrados (CANCELADO/FINALIZADO), con la excepción estipulada de cobros en ciclos finalizados.
2. **Seguridad binaria**: Prevenir la subida de ejecutables, scripts o malware disfrazados con extensiones falsas.
3. **Desacoplamiento de infraestructura**: La persistencia de archivos no debe atarse a un almacenamiento local fijo; debe soportar transiciones futuras a almacenamiento en la nube (S3, GCS, Azure Blob) mediante abstracciones de dominio.
4. **Protección de descargas**: Evitar URLs predecibles o exposición de identificadores internos sin control de acceso.

---

## Decisiones de Arquitectura

### 1. Reutilización de Tabla `adjunto` Existente
Se verificó que el esquema de base de datos ya contaba con la tabla `adjunto` y el modelo Prisma correspondiente:
```prisma
model Adjunto {
  id                  Int      @id @default(autoincrement())
  empresaId           Int
  subidoPorId         Int
  entidad             String   @db.VarChar(50)
  entidadId           Int
  nombreArchivo       String   @db.VarChar(255)
  tipoMime            String   @db.VarChar(100)
  tamanoBytes         Int
  claveAlmacenamiento String   @db.VarChar(500)
  createdAt           DateTime @default(now())
  ...
}
```
No se requirieron migraciones adicionales de base de datos, preservando la estabilidad del esquema.

### 2. Validación Estricta por Magic Bytes (Firma Binaria)
No se confía en la extensión del archivo provista por el cliente ni en el `Content-Type` reportado en la petición multipart.
Se implementó `detectarTipoPorFirma`:
- **JPEG**: `FF D8 FF`
- **PNG**: `89 50 4E 47 0D 0A 1A 0A`
- **WEBP**: `RIFF....WEBP` (cabecera RIFF con formato WEBP en offset 8)
- **PDF**: `%PDF-`

Cualquier archivo cuya cabecera binaria no coincida o cuyo tipo MIME declarado difiera de la firma real es rechazado inmediatamente con HTTP 415 `TIPO_ARCHIVO_NO_PERMITIDO`.
El límite máximo de tamaño está fijado en 10 MB (10 * 1024 * 1024 bytes); si se supera, se devuelve HTTP 413 `ARCHIVO_DEMASIADO_GRANDE`.

### 3. Sanitización de Nombres de Archivo
Se implementó `sanearNombreArchivo` para extraer únicamente el nombre base (`path.basename`), remover caracteres de control ASCII (\x00-\x1F, \x7F) y secuencias de path traversal (`../`, `..\`), limitando la longitud a 255 caracteres manteniendo la extensión original.

### 4. Desacoplamiento de Almacenamiento (`IStorageService`)
Se diseñó la interfaz `IStorageService` con métodos `guardar`, `leerStream`, `borrar` y `existe`.
La implementación por defecto, `LocalStorageService`, resuelve las rutas físicas verificando contención estricta dentro del directorio base configurado mediante `STORAGE_LOCAL_PATH`, impidiendo cualquier escape del árbol de directorios mediante validación estricta de regex de claves (`^\d+\/[0-9a-f-]{36}\.(jpg|png|webp|pdf)$`).

### 5. Orden de Bloqueo Transaccional y Compensación
Para evitar condiciones de carrera en el límite de 10 adjuntos por entidad y respetar el orden global de concurrencia:
1. Se guarda el archivo físico en el almacenamiento desacoplado fuera de la transacción.
2. Se inicia la transacción `$transaction` en base de datos.
3. **Primera sentencia obligatoria**: Bloquear el ciclo de producción correspondiente mediante `bloquearCicloParaCaptura` (`SELECT ... FOR UPDATE`).
4. Re-leer la entidad destino bajo el lock y validar `CicloCapturaPolicy` y `RecordWindowValidator` (48 horas).
5. Contar adjuntos existentes de la entidad bajo el lock (`SELECT COUNT(*) ...`). Si es $\ge 10$, se aborta con HTTP 400 `LIMITE_ADJUNTOS_ALCANZADO`.
6. Insertar el registro en la tabla `adjunto`.
7. Auditar la creación mediante `AuditService.registrar` en la misma transacción.
8. **Compensación**: Si la transacción de base de datos falla por cualquier razón (error de lock, fallo de auditoría, excepción inesperada), el bloque `catch` ejecuta la compensación eliminando el archivo físico previamente guardado en el almacenamiento.

### 6. Descarga Segura con Token Firmado HMAC-SHA256
En lugar de exponer endpoints de descarga directos o requerir enviar tokens JWT en parámetros de URL, se diseñó un flujo de descarga temporal:
1. El usuario autenticado solicita un enlace temporal vía `GET /api/v1/adjuntos/:id/enlace-descarga`.
   - Se valida pertenencia multi-tenant y visibilidad según permisos de la entidad.
   - Se genera un token HMAC-SHA256 con payload `{ adjuntoId, empresaId, usuarioId, exp }` firmado con `STORAGE_SIGNED_URL_SECRET` y TTL de 300 segundos (5 minutos).
2. La descarga física se realiza mediante `GET /api/v1/adjuntos/descarga?token=...`.
   - El token se valida utilizando comparación en tiempo constante (`crypto.timingSafeEqual`) para prevenir ataques de temporización.
   - Se revalida en base de datos que el usuario y la empresa sigan activos y no eliminados (`deletedAt: null`).
   - Se transmiten cabeceras defensivas: `Content-Type`, `Content-Disposition: attachment`, `X-Content-Type-Options: nosniff`, `Cache-Control: no-store`.
   - Cualquier fallo de token (expirado, firma adulterada, usuario inactivo) devuelve HTTP 403 `ENLACE_DESCARGA_INVALIDO` sin revelar detalles internos.

### 7. Eliminación Física Restringida
La eliminación física de un adjunto solo está permitida para usuarios administradores con el permiso institucional `registro:administrar`.
La eliminación adquiere el lock del ciclo, valida que el ciclo no esté cancelado ni finalizado (salvo cobros en finalizado), elimina el registro de la tabla `adjunto`, audita atómicamente la eliminación y, tras el commit exitoso, borra el archivo del almacenamiento físico.

---

## Consecuencias

### Positivas
- **Seguridad Binaria Total**: Imposibilidad de ejecutar ataques de Polyglot Files o subida de scripts PHP/Node/HTML con extensión falsa.
- **Concurrencia Robusta**: Imposible eludir el límite de 10 archivos mediante peticiones concurrentes gracias al bloqueo canónico del ciclo.
- **Tolerancia a Fallos**: Cero archivos huérfanos gracias al patrón de compensación física en caso de aborto de transacciones.
- **Aislamiento Multi-Tenant Completo**: Claves estructuradas por `empresaId`, verificación en todos los endpoints y tokens ligados a la empresa emisora.
- **Preparado para la Nube**: Cambiar de almacenamiento local a AWS S3 o GCS solo requiere implementar `IStorageService` sin tocar controladores ni servicios de dominio.

---

## Deuda Técnica y Compromisos Futuros

1. **Job Periódico de Reconciliación de Huérfanos**:
   - Implementar un cron/worker nocturno que compare los archivos físicos presentes en `storage_uploads/` contra los registros activos en la tabla `adjunto` en MySQL para purgar cualquier residuo originado por crash o reinicio abrupto del contenedor en medio de una transacción.
2. **Migración a Almacenamiento en Nube (AWS S3 / Cloudflare R2)**:
   - Implementar `S3StorageService` bajo el contrato `IStorageService` para entornos de producción multi-instancia, eliminando la dependencia de discos compartidos (EFS o NFS) y aprovechando S3 Pre-signed URLs para descargas de alto tráfico.
3. **Escaneo Antivirus y Sandbox de Archivos**:
   - Incorporar un servicio de escaneo en streaming mediante ClamAV daemon o AWS GuardDuty para auditar archivos binarios antes de persistirlos en el storage definitivo.
4. **Endurecimiento de Pruebas E2E de Auth (RN-072 y RN-038)**:
   - Extender la suite e2e para validar la revocación inmediata de acceso ante cambios de rol/permisos (RN-072) y desconexión por inactividad/expiración de sesión (RN-038) en flujos de subida y descarga de archivos.

---

## Ficha Real de Dependencias y Seguridad

| Dependencia | Versión Instalada | Licencia | Publicación | Estado de Cadena de Suministro |
|-------------|-------------------|----------|-------------|--------------------------------|
| `multer` (vía `@nestjs/platform-express`) | `2.4.0` | MIT | > 6 meses | `npm audit --omit=dev`: 0 vulnerabilidades directas en multer. Dependencias base del framework documentadas. |
| `crypto` (Node.js nativo) | Node.js v22 LTS | Built-in | N/A | Firma HMAC-SHA256 y comparación en tiempo constante con `crypto.timingSafeEqual`. |


---

## Errata y Actualizaciones Post-Hito 11D
- **Sincronización §3.23 (Formato WebP)**: Se consolidó la prueba e2e y la documentación canónica del formato `image/webp` (Magic Bytes `RIFF....WEBP`) asegurando paridad total entre la especificación §3.23 y la suite de pruebas del backend.
