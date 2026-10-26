# Guía Operativa de Respaldo y Restauración de Base de Datos (Hito 11C - §3.24)

Este documento establece el estándar operativo y de continuidad del negocio para la gestión de copias de seguridad, políticas de recuperación ante desastres y simulacros periódicos del Sistema de Rentabilidad Agrícola.

---

## 1. Política General de Respaldos (§3.24)

| Tipo de Respaldo | Frecuencia | Retención | Ventana Operativa | Almacenamiento Objetivo |
|---|---|---|---|---|
| **Respaldo Lógico Completo (Full Dump)** | Diario (02:00 UTC) | 30 días | Fuera de horario pico | Almacenamiento en frío / bucket S3 inmutable con cifrado AES-256 |
| **Registros Binarios (Binary Logs / PITR)** | Continuo | 7 días | Tiempo real | Almacenamiento desacoplado con replicación |
| **Simulacro de Restauración** | Trimestral | Registro de auditoría | Entorno de pruebas | Base aislada `*_restore_test` con `npm run db:verify` |

---

## 2. Generación Canónica del Respaldo (`mysqldump`)

### 2.1 Salvaguarda Crítica de Credenciales
> [!CAUTION]
> **PROHIBICIÓN ESTRICTA DE CREDENCIALES EN LÍNEA DE COMANDOS**
> Nunca pase `-p<password>` o `--password=<password>` directamente como argumento de terminal. Dichos valores quedan expuestos en el historial del shell, en la tabla de procesos del sistema operativo (`ps aux`, `tasklist`) y en los registros del agente.
> Se debe utilizar siempre un archivo de opciones temporal protegido con permisos restrictivos (`0600` / solo lectura del propietario) vía `--defaults-extra-file`.

### 2.2 Archivo de Opciones Seguro (`.my_backup.cnf`)
```ini
[client]
user=backup_user
password=SuperSecretPassword123!
```

### 2.3 Comando Canónico de Extracción
```bash
mysqldump \
  --defaults-extra-file=/path/to/.my_backup.cnf \
  --host=localhost \
  --port=3306 \
  --single-transaction \
  --quick \
  --routines \
  --triggers \
  --events \
  --default-character-set=utf8mb4 \
  rentabilidad_agricola > backup_$(date +%Y%m%d_%H%M%S).sql
```

### 2.4 Justificación Técnica de Parámetros
- `--single-transaction`: Inicia una transacción con nivel de aislamiento `REPEATABLE READ` antes de ejecutar el volcado. Garantiza un snapshot ACID consistente de todas las tablas InnoDB sin bloquear lecturas ni escrituras de la aplicación en producción.
- `--quick`: Fuerza a `mysqldump` a recuperar las filas fila por fila desde el servidor en lugar de almacenar en búfer todo el conjunto en memoria RAM, previniendo fallos de OOM en tablas voluminosas.
- `--routines --triggers --events`: Preserva la totalidad de los procedimientos almacenados, disparadores y eventos programados de la base de datos.
- `--default-character-set=utf8mb4`: Asegura la preservación integral de caracteres multilingües, acentos y emojis en nombres de parcelas y notas de campo.

---

## 3. Configuración de Binary Logging y Recuperación en Punto en el Tiempo (PITR)

Para minimizar el RPO (Recovery Point Objective) a menos de 5 minutos ante corrupción de datos o fallo catastrófico, se habilitan los registros binarios en la configuración del servidor MySQL (`my.cnf` o `my.ini`):

```ini
[mysqld]
server_id = 1
log_bin = /var/log/mysql/mysql-bin.log
binlog_format = ROW
binlog_row_image = FULL
binlog_expire_logs_seconds = 604800  # 7 días de retención
sync_binlog = 1                      # Durabilidad ACID completa
```

### Procedimiento de Recuperación Point-In-Time (PITR):
1. Restaurar el volcado completo previo más reciente (ver sección 4).
2. Aplicar los registros binarios generados entre la hora del dump y el momento exacto del incidente:
   ```bash
   mysqlbinlog \
     --start-datetime="2026-10-26 02:00:00" \
     --stop-datetime="2026-10-26 14:35:10" \
     /var/log/mysql/mysql-bin.000042 /var/log/mysql/mysql-bin.000043 | \
     mysql --defaults-extra-file=/path/to/.my_backup.cnf rentabilidad_agricola
   ```

---

## 4. Procedimiento Canónico de Restauración

### Paso 1: Preparación del Entorno
Crear o recrear la base de datos destino con el conjunto de caracteres canónico del sistema:
```sql
DROP DATABASE IF EXISTS `rentabilidad_agricola`;
CREATE DATABASE `rentabilidad_agricola` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

### Paso 2: Importación del Volcado
```bash
mysql \
  --defaults-extra-file=/path/to/.my_backup.cnf \
  --host=localhost \
  --port=3306 \
  rentabilidad_agricola < backup_20261026_020000.sql
```

### Paso 3: Verificación Automática de Integridad
Inmediatamente tras la importación, ejecutar el script de verificación automatizado para validar que la base de datos restaurada posea la totalidad de sus objetos y catálogos:
```bash
npm run db:verify rentabilidad_agricola_test
```
El verificador evaluará las 11 dimensiones estructurales y semánticas, retornando `exit 0` si la base es consistente o `exit 1` ante cualquier discrepancia.

---

## 5. Protocolo de Simulacro Trimestral de Restauración (§3.24)

Cada 90 días naturales, el equipo de operaciones e infraestructura debe ejecutar un simulacro de recuperación sobre un entorno aislado:

1. **Selección del artefacto**: Seleccionar un dump aleatorio de los últimos 30 días en el almacenamiento de respaldo.
2. **Validación de Checksum**: Comprobar la integridad criptográfica del archivo mediante SHA-256 (`sha256sum -c backup.sql.sha256`).
3. **Restauración en Sandbox**: Restaurar sobre una base de datos temporal con sufijo `_restore_test` (e.g., `rentabilidad_agricola_restore_test`).
4. **Ejecución del Verificador**: Ejecutar `scripts/db-verify.ts` contra la base restaurada.
5. **Criterios de Aceptación Obligatorios**:
   - `exitoTotal === true` (11 métricas en estado `OK`):
     - 28 Tablas Base (sin `_prisma_migrations`).
     - 49 Claves Foráneas (FK).
     - 19 Restricciones CHECK.
     - 5 Vistas Analíticas de Indicadores.
     - 2 Columnas Generadas STORED.
     - 3 Roles predefinidos y 19 Permisos atómicos (ADMIN: 19, CAPTURISTA: 4, CONTADOR: 8).
     - 3 Planes de suscripción.
   - Las 5 vistas analíticas deben responder a consultas `SELECT COUNT(*)` con cero errores.
6. **Destrucción Segura**: Destruir la base de datos de pruebas (`DROP DATABASE ...`) y registrar el informe de la auditoría en la bitácora operativa.
