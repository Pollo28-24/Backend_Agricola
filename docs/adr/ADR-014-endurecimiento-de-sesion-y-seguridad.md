# ADR-014: Endurecimiento de Sesión, Throttling y Seguridad Criptográfica (Hito 11A)

## Estado
Aceptado

## Contexto
El documento maestro (`Rentabilidad_Agricola_3.docx` v3.2, §§2.9, 3.23 y 3.24) establece garantías estrictas de seguridad para la autenticación móvil y web del sistema de Rentabilidad Agrícola:
1. **Rotación Atómica de Refresh Tokens y Detección de Reuso por Familia**: Cada inicio de sesión origina una cadena genealógica de tokens (`familiaId`). Si un refresh token previamente rotado o revocado vuelve a presentarse, debe asumirse compromiso de credenciales y revocarse toda la familia de inmediato en base de datos antes de responder `401 NO_AUTENTICADO`.
2. **Defensa contra Fuerza Bruta sin Denegación de Servicio Cruzada (Throttling)**: La ruta `/auth/login` requiere protección por dirección IP y por cuenta de correo electrónico, evitando que un atacante desde otra red bloquee globalmente la cuenta de una víctima legítima y garantizando que la memoria del limitador jamás almacene correos electrónicos en texto claro.
3. **Parámetros Explícitos de Argon2id y Mitigación de Enumeración de Cuentas**: El cifrado de contraseñas debe fijar `argon2id` con `memoryCost: 19456` (19 MiB), `timeCost: 2` y `parallelism: 1`, rehasheando de forma transparente en login aquellos hashes generados con parámetros heredados y ejecutando una verificación ficticia (`dummy verify`) cuando el correo no existe.
4. **Entropía Mínima de Secretos JWT**: Los secretos `JWT_SECRET` y `JWT_REFRESH_SECRET` deben validarse en arranque con longitud mínima de 64 caracteres en todos los entornos.
5. **Verificación E2E de Reglas Transversales**: Cobertura integral de revalidación de sesión en tiempo real (RN-072), modo de solo lectura ante suscripción `VENCIDA` o `CANCELADA` sobre todas las rutas descubiertas con `DiscoveryService` (RN-038), cuotas comerciales por plan y liberación de cupo de parcelas `INACTIVA` bajo concurrencia (RN-037), higiene de secretos en bitácora (RN-074) y frontera horaria `America/Mexico_City` (RN-073).

---

## Decisiones de Arquitectura

### 1. Rotación Atómica Condicional y Revocación de Familia (`familiaId`)
- Se añadió la columna `familiaId VARCHAR(60) NOT NULL` con índice `refresh_token_familiaId_idx` mediante la migración aditiva `20261025173500_refresh_token_familia_id` (con backfill `UPDATE refresh_token SET familiaId = jti WHERE familiaId IS NULL`).
- En `AuthService.login`, el primer refresh token de la sesión inaugura la familia asignando `familiaId = jti`.
- En `AuthService.refresh`, la rotación ejecuta dentro de `$transaction` una actualización atómica condicional:
  ```ts
  const marcados = await tx.refreshToken.updateMany({
    where: { jti: payload.jti, revocado: false, revocadoEn: null },
    data: { revocado: true, revocadoEn: new Date() },
  });
  ```
- Si `marcados.count !== 1`, la transacción retorna `null` sin lanzar excepción interna (evitando que un `rollback` deshaga la revocación posterior). Acto seguido, **fuera** de la transacción fallida, se ejecuta y confirma `revocarFamilia(tokenRecord.familiaId)` en base de datos **antes** de lanzar `DomainError(CodigoError.NO_AUTENTICADO, ..., 401)`.
- **Política estricta sin ventana de gracia**: No se concede ventana de gracia al reuso de un refresh token rotado.
- **Riesgo operativo en cliente móvil (doble refresh concurrente)**: La aplicación móvil Flutter (Fase 5) **debe** serializar las peticiones de renovación de token mediante un interceptor con mutex/cola en memoria (de modo que múltiples peticiones HTTP que reciban 401 esperen a una única llamada a `POST /api/v1/auth/refresh`), ya que dos llamadas concurrentes con el mismo `refreshToken` dispararán la detección de reuso y cerrarán la sesión activa del dispositivo.

### 2. Limitación de Tasa (`@nestjs/throttler@6.7.1`) con Tracker Compuesto Anonimizado
- Se incorporó `@nestjs/throttler` (`6.7.1`, versión fija exacta) y el código de dominio `CodigoError.DEMASIADAS_PETICIONES` mapeado a `HTTP 429 Too Many Requests` con cabecera estándar `Retry-After` en segundos en `DomainExceptionFilter`.
- Se configuraron tres políticas en `AppThrottlerGuard`:
  - `default`: 300 peticiones / 60 s por IP para toda la API (excluyendo `/api/v1/health`).
  - `login-ip`: 10 peticiones / 60 s por IP en `/api/v1/auth/login` y 30 peticiones / 60 s por IP en `/api/v1/auth/refresh`.
  - `login-correo`: 5 intentos / 60 s con bloqueo (`blockDuration`) de 15 minutos (900,000 ms) exclusivamente en `/api/v1/auth/login`.
- El tracker de `login-correo` se construye como `${ip}:${sha256(correo.toLowerCase().trim())}`:
  - Al combinar IP + correo, un atacante desde otra IP no puede bloquear la cuenta de la víctima para su red legítima.
  - Al aplicar `SHA-256` sobre el correo normalizado, el almacenamiento en memoria del limitador nunca conserva direcciones de correo en claro.

### 3. Validación de Secretos y Argon2id con Rehash Transparente
- `env.validation.ts` exige `JWT_SECRET` y `JWT_REFRESH_SECRET` con `.min(64).required()` en todos los entornos, además de `THROTTLE_ENABLED` (obligatorio `true` cuando `NODE_ENV=production`) y `TRUST_PROXY` (`false` por defecto).
- `PasswordService` fija explícitamente `argon2id` con `memoryCost: 19456`, `timeCost: 2`, `parallelism: 1` e incorpora `needsRehash(hash)`.
- En `AuthService.login`, si el correo no existe en base de datos, se ejecuta `passwordService.verify` contra un hash Argon2id ficticio precalculado en el arranque del servicio y se responde con el mismo error `401 NO_AUTENTICADO` (`Credenciales incorrectas`). Si el login es exitoso y `needsRehash` detecta parámetros distintos, se actualiza `contrasenaHash` de forma transparente.

---

## Ficha de Dependencia Nueva

| Paquete | Versión Exacta | Fecha de Publicación | Licencia | Peer Dependencies | Mantenedores |
|---|---|---|---|---|---|
| `@nestjs/throttler` | `6.7.1` | `2026-09-24T11:17:33.213Z` (> 14 días) | MIT | `@nestjs/common: ^10.0.0 \|\| ^11.0.0`, `@nestjs/core: ^10.0.0 \|\| ^11.0.0` | `nestjscore`, `kamilmysliwiec` |

- **Resultado de `npm audit --omit=dev`**: 0 vulnerabilidades nuevas introducidas por `@nestjs/throttler@6.7.1` (se mantienen las 14 vulnerabilidades heredadas del árbol base reportadas en Hito 10B).

---

## Deuda Técnica Asociada (DT-10)
- **DT-10 — Almacenamiento Distribuido (Redis) para `@nestjs/throttler`**: El almacenamiento por defecto de `@nestjs/throttler` reside en la memoria local del proceso Node.js (`ThrottlerStorageService`). En un despliegue horizontal multi-instancia detrás de un balanceador de carga, los contadores de intentos por IP y por `IP + sha256(correo)` no se comparten entre réplicas. Cuando el backend escale a múltiples contenedores, deberá inyectarse un adaptador `ThrottlerStorageRedisService` respaldado por Redis compartido.
