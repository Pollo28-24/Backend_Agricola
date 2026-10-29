# Manual Operativo del Servicio de Correo Transaccional

**Módulo:** `MailModule` (`src/modules/mail/`)  
**Hito:** Hito 11E.1 (ADR-017)  
**Proveedor Transaccional:** Brevo (anteriormente Sendinblue) API v3  

---

## 1. Variables de Entorno y Configuración

El servicio de correo se gobierna mediante las siguientes variables validadas en arranque con Joi (`src/config/env.validation.ts`):

| Variable | Tipo | Obligatoria en Producción | Default / Valores Permitidos | Descripción |
|---|---|---|---|---|
| `MAIL_TRANSPORT` | String | Sí (`brevo`) | `brevo`, `log`, `memory` (default `log` en dev, `memory` en test) | Driver o estrategia activa de despacho |
| `BREVO_API_KEY` | String | Sí | Mínimo 20 caracteres | Clave de API v3 generada en el panel de Brevo |
| `MAIL_FROM_EMAIL` | String | Sí | `no-reply@rentabilidad-agricola.com` | Dirección remitente verificada en Brevo |
| `MAIL_FROM_NAME` | String | Sí | `Rentabilidad Agrícola` (mínimo 2 chars) | Nombre del remitente mostrado al usuario |
| `PASSWORD_RESET_URL` | String | Sí (`https://` en prod) | `http://localhost:3000/restablecer-contrasena` | URL base para el formulario de recuperación (URI absoluta sin `#` ni `?`) |
| `PASSWORD_RESET_EXPIRES_MINUTES` | Number | No | `15` (rango permitido: 5 a 60 minutos) | Tiempo de vida del token de recuperación |

---

## 2. Estrategias de Transporte (`IMailTransport`)

1. **`BrevoTransport` (`MAIL_TRANSPORT=brevo`):**
   - Utiliza la API REST HTTPS oficial (`POST https://api.brevo.com/v3/smtp/email`).
   - Timeout estricto de 5 segundos gobernado por `AbortSignal.timeout(5000)`.
   - Sanitización contra inyección HTML en el nombre del destinatario.
   - En producción (`NODE_ENV=production`), Joi prohíbe cualquier otro transporte.
2. **`LogTransport` (`MAIL_TRANSPORT=log`):**
   - Diseñado para desarrollo local sin requerir credenciales externas.
   - Imprime el token en crudo y el enlace de recuperación en la consola NestJS únicamente si `NODE_ENV=development`. En producción NUNCA imprime tokens.
3. **`MemoryTransport` (`MAIL_TRANSPORT=memory`):**
   - Utilizado automáticamente durante la ejecución de pruebas (`NODE_ENV=test`).
   - Almacena correos en una cola en memoria accesible para aserciones (`obtenerCorreos()`). No realiza llamadas de red ni imprime en consola.

---

## 3. Límites y Políticas de la Capa Gratuita de Brevo

- **Cuota de envío:** 300 correos electrónicos por día (reseteo a las 00:00 UTC).
- **Límite de tasa:** 10 peticiones por segundo en API SMTP transaccional.
- **Remitente verificado:** La dirección configurada en `MAIL_FROM_EMAIL` debe estar explícitamente verificada mediante DKIM y SPF en el panel de Brevo antes de poder despachar a destinatarios externos; de lo contrario, Brevo responderá con error HTTP 400.
- **Retención:** Los registros de entrega en el dashboard de Brevo permanecen durante 30 días.

---

## 4. Pasos para Verificación Manual en Desarrollo y Pruebas

### 4.1 Verificación Local con `LogTransport`
1. Configurar en `.env`:
   ```bash
   NODE_ENV=development
   MAIL_TRANSPORT=log
   ```
2. Ejecutar una solicitud de recuperación:
   ```bash
   curl -X POST http://localhost:3000/api/v1/auth/contrasena/solicitar-recuperacion \
     -H "Content-Type: application/json" \
     -d "{\"correo\": \"admin@empresa-a.com\"}"
   ```
3. Observar la salida en la consola del backend:
   ```text
   [MailService] [RECUPERACIÓN LOCAL] Destinatario: admin@empresa-a.com | Token: <token_64_hex> | Enlace: http://localhost:3000/restablecer-contrasena#token=<token_64_hex>
   ```

### 4.2 Verificación Real con `BrevoTransport`
1. Obtener la clave de API en: *Brevo Dashboard > SMTP & API > Generate a new API key*.
2. Configurar en `.env`:
   ```bash
   MAIL_TRANSPORT=brevo
   BREVO_API_KEY=xkeysib-tu-api-key-real-de-al-menos-20-caracteres
   MAIL_FROM_EMAIL=remitente-verificado@tu-dominio.com
   MAIL_FROM_NAME="Rentabilidad Agrícola"
   PASSWORD_RESET_URL=https://app.tu-dominio.com/restablecer-contrasena
   ```
3. Ejecutar la petición curl con un correo real de destino.
4. Revisar la bandeja de entrada del correo receptor y confirmar la llegada del correo con plantilla HTML verde corporativa y el enlace con fragmento URI `#token=<token_64_hex>`.
