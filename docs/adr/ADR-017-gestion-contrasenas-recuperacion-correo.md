# ADR-017: Gestión de Contraseñas, Recuperación por Correo y Sesiones

**Estado:** Aceptado  
**Fecha:** 2026-10-27  
**Hito:** Hito 11E.1  
**Autor:** Senior Architect  

---

## 1. Contexto y Problema

El sistema de Rentabilidad Agrícola requiere un flujo integral, resiliente y criptográficamente seguro para la gestión de credenciales de acceso:
1. **Cambio autenticado de contraseña:** Permite a usuarios con sesión activa cambiar su contraseña, invalidando inmediatamente sesiones y tokens previos (RN-076).
2. **Recuperación de contraseña vía correo electrónico:** Permite a usuarios que olvidaron su clave solicitar un enlace uniuso con expiración estricta de 15 minutos, sin comprometer la privacidad ni permitir enumeración de usuarios (RN-040, RN-078 y §3.23.1).
3. **Restablecimiento atómico con token uniuso:** Previene condiciones de carrera y reuso de tokens mediante bloqueo transaccional.
4. **Protección contra ataques de fuerza bruta y denegación de servicio:** Requiere rate limiting granular por IP, por correo electrónico y por usuario autenticado.

---

## 2. Decisiones Arquitectónicas (R1 a R7)

### R1. Anti-enumeración Estricta y Desacoplamiento de Fallos de Transporte (Desviación Consciente de RN-078)
- **Decisión:** `POST /api/v1/auth/contrasena/solicitar-recuperacion` responde SIEMPRE HTTP 200 OK con el mismo mensaje genérico:  
  `"Si el correo electrónico está registrado, recibirá las instrucciones para restablecer su contraseña."`  
  Si el servicio de correo (Brevo) falla, el error es capturado internamente por el servicio de autenticación; el token recién generado se revoca en base de datos (`revocadoEn = new Date()`), el incidente se registra en el logger sin fugar el correo electrónico ni el token crudo, y el endpoint retorna la respuesta 200 OK idéntica.
- **Justificación:** Propagar HTTP 500 o 503 ante fallos del proveedor de correo fugaría a un atacante que el correo efectivamente existe en la base de datos (ataque de oráculo de enumeración).
- **Alternativas descartadas:** Propagar HTTP 500/503 al cliente (descartada por vulnerabilidad de seguridad).
- **Límite de generación:** Máximo 3 tokens en ventana rodante de 15 minutos por usuario. Al 4.º intento se responde 200 OK idéntico sin persistir nuevo token ni enviar correo.

### R2. Parametrización de URL de Recuperación (`PASSWORD_RESET_URL`)
- **Decisión:** La URL para el enlace de recuperación se construye mediante la variable `PASSWORD_RESET_URL`. En entorno de producción (`NODE_ENV=production`), Joi exige estrictamente que sea una URI válida con esquema `https://`.
- **Justificación:** Garantiza que los tokens de un solo uso viajen exclusivamente cifrados bajo TLS en producción, permitiendo URLs locales en desarrollo.

### R3. Hash Criptográfico SHA-256 en Almacenamiento de Tokens
- **Decisión:** El token uniuso se genera criptográficamente con 32 bytes aleatorios (`crypto.randomBytes(32).toString('hex')`, 64 caracteres hex). En base de datos (tabla `password_reset_token`) NUNCA se almacena el token crudo, sino su digest SHA-256 (`tokenHash VARCHAR(64)` con índice único).
- **Justificación:** Si la base de datos sufriera una exfiltración o lectura no autorizada, los tokens de recuperación no pueden ser utilizados sin conocer el valor crudo en posesión del usuario.

### R4. Arquitectura de Transporte de Correo Desacoplada (`IMailTransport`)
- **Decisión:** Implementación del patrón Strategy con tres transportes:
  - `BrevoTransport`: Envío real vía API REST transaccional de Brevo (HTTPS), con timeout de 5 segundos (`AbortSignal.timeout(5000)`) y sanitización HTML de nombres de destinatarios.
  - `LogTransport`: Transporte por defecto en desarrollo local. Imprime datos de recuperación SOLO si `NODE_ENV=development` y `MAIL_TRANSPORT=log`. En `production` y `test` está estrictamente prohibido imprimir tokens o enlaces.
  - `MemoryTransport`: Transporte en memoria para pruebas automáticas (`test/`). Permite inspeccionar correos despachados (`obtenerCorreos()`), simular fallos de red (`simularFalloProximoEnvio()`) y no emite logs ni realiza llamadas de red.

### R5. Throttlers Nombrados en `AppThrottlerGuard`
- **Decisión:** Configuración de 4 limitadores de tasa nombrados sobre `@nestjs/throttler` (v6, con TTL medido en MILISEGUNDOS):
  - `recuperar-ip`: 5 peticiones / 15 min (`900_000` ms) sobre `/auth/contrasena/solicitar-recuperacion` (tracker: IP del cliente).
  - `recuperar-correo`: 3 peticiones / 15 min (`900_000` ms) sobre `/auth/contrasena/solicitar-recuperacion` (tracker: `ip:sha256(correo)`).
  - `restablecer-ip`: 10 peticiones / 15 min (`900_000` ms) sobre `/auth/contrasena/restablecer` (tracker: IP del cliente).
  - `cambiar-usuario`: 5 peticiones / 15 min (`900_000` ms) sobre `/auth/contrasena/cambiar` (tracker: `ip:user:usuarioId`).
  Todos retornan HTTP 429 con código de dominio `DEMASIADAS_PETICIONES` y cabecera estándar `Retry-After`.

### R6. Invalidación Inmediata de Sesiones y Compatibilidad de Modelo
- **Decisión:** La columna en base de datos es `cambioContrasenaEn` (camelCase en MySQL e idéntica en Prisma). En `JwtStrategy`, la comparación se trunca a segundos enteros (`Math.floor(usuario.cambioContrasenaEn.getTime() / 1000)`) contra `payload.iat` (segundos UNIX del estándar JWT) para evitar falsos positivos por resolución de milisegundos.
- **Efecto:** Cualquier Access Token emitido con anterioridad al cambio de contraseña es rechazado con 401 `NO_AUTENTICADO`. Asimismo, se revocan todos los Refresh Tokens vigentes de la cuenta.

### R7. Retiro del Archivo Binario Docx Maestro del Control de Versiones
- **Decisión:** El documento `Rentabilidad_Agricola_v3.3_Completa.docx` se desacopla del historial de git mediante `git rm --cached` y se agrega a `.gitignore`. El archivo permanece físicamente en el disco de trabajo como especificación de referencia solo-lectura.
- **Justificación:** Evita la inflación desmedida del repositorio `.git` por binarios propietarios que no generan diffs textuales y previene conflictos de merge accidentales.

---

## 3. Matriz de Divergencias con el Documento Maestro v3.3 (R1 a R7)

| Regla / Decisión | Referencia en Docx v3.3 | Requisito en Documento v3.3 | Comportamiento Implementado en Código | Justificación y Sincronización |
|---|---|---|---|---|
| **R1. Anti-enumeración y falla Brevo** | RN-078 (§3.23.1) | "Si falla el envío con Brevo, responder 500/503 indicando fallo de entrega" | Responde HTTP 200 OK idéntico, revoca token en BD (`revocadoEn = now()`) y registra en logger sin fugar correo ni token | Anti-enumeración estricta (OWASP ASVS 4.0). Propagar 500/503 confirma la existencia del correo al atacante. Cuota de 3 tokens/15 min. |
| **R2. URL de recuperación** | §3.23.1 (Rutas de Recuperación) | URL base configurable en entorno | Valida `PASSWORD_RESET_URL` en Joi exigiendo obligatoriamente `https://` en entorno de producción | Cifrado mandatorio en tránsito de tokens uniuso en producción para prevenir intercepción de credenciales. |
| **R3. Hash de token en BD** | RN-077 (§3.23.1) | Almacenamiento seguro del token de recuperación | Se genera token criptográfico de 32 bytes (64 hex); en BD solo se guarda su digest SHA-256 (`tokenHash`) | Si la base de datos se filtra, los tokens almacenados no pueden usarse sin conocer el valor crudo original. |
| **R4. Transportes, log local y remitente** | §3.23.1 / Tecnologías | Envío por Brevo / log en desarrollo con remitente institucional | Patrón Strategy desacoplado (`BrevoTransport`, `LogTransport`, `MemoryTransport`). Remitente configurable por ENV; prohibido Gmail personal no autenticado en prod; log en consola solo con `NODE_ENV=development` y `MAIL_TRANSPORT=log` | Aislamiento modular, seguridad de credenciales y testing determinista sin llamadas de red externas. |
| **R5. Throttling y código de error** | RN-079 (§3.23 y §3.23.1) | "Mapea HTTP 429 al código DEMASIADAS_SOLICITUDES" y límites en minutos | Mapea HTTP 429 al código canónico `DEMASIADAS_PETICIONES`; TTLs configurados en milisegundos (`900_000` ms) en `@nestjs/throttler` v6 | Coherencia con el enum `CodigoError` y contrato OpenAPI sincronizado en 11A/11D. `@nestjs/throttler` v6 opera exclusivamente en ms. |
| **R6. Invalidación de sesiones** | RN-076 (§3.23.1) | Invalidación inmediata de tokens y actualización de cambio de contraseña | Columna canónica `cambioContrasenaEn` en MySQL/Prisma; `JwtStrategy` trunca a segundos enteros (`Math.floor`) contra `payload.iat`; revocación atómica de todos los refresh tokens | Evita desajustes por resolución subsegundo entre MySQL y el estándar JWT; revoca sesiones activas de inmediato. |
| **R7. Exclusión de binario docx** | Anexo / Gestión documental | Control del archivo de especificación maestro | Archivo `Rentabilidad_Agricola_v3.3_Completa.docx` desversionado de git e ignorado en `.gitignore`; permanece en disco local como solo-lectura | Previene hinchamiento del historial `.git` por binarios sin diff textual y evita conflictos de merge accidentales. |

---

## 4. Registro de Deuda Técnica

### DT-12: Job Periódico de Purga de Tokens de Recuperación Expirados
- **Descripción:** La tabla `password_reset_token` acumula registros de tokens consumidos, revocados o expirados. Aunque cada token uniuso queda invalidado, una tabla sin purga programada crecerá indefinidamente en el largo plazo.
- **Acción requerida:** Implementar un cron job en NestJS (`@nestjs/schedule`) o evento MySQL programado que elimine físicamente tokens con más de 30 días de antigüedad.

### DT-13: Cola Persistente Asíncrona para Despacho de Correo Masivo
- **Descripción:** Actualmente, `MailService` despacha las peticiones hacia la API HTTP de Brevo de forma directa con timeout de 5 segundos.
- **Acción requerida:** En escenarios de alto volumen transaccional, implementar una cola respaldada por Redis (`BullMQ`) con reintentos exponenciales y dead-letter queue para desacoplar totalmente la latencia de red de Brevo del ciclo de vida HTTP.
