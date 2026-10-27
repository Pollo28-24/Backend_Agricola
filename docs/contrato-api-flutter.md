# Guía Canónica de Integración API Backend para Flutter (Hito 11D - ADR-015)

Este documento es el manual técnico de referencia para el equipo de desarrollo móvil Flutter. Define las reglas de comunicación HTTP, manejo de ciclo de vida de sesión, serialización de datos y convivencia con el contrato OpenAPI congelado.

---

## 1. El Contrato OpenAPI Congelado

La interfaz entre el Backend y la aplicación Flutter está formalmente especificada y congelada en:
- **Especificación canónica**: `docs/contrato/openapi.json` (OpenAPI 3.0, estrictamente determinista).
- **Rutas catalogadas**: 106 endpoints registrados y validados contra el árbol de controladores de NestJS.
- **Catálogo de Errores**: `docs/contrato/errores.md`.
- **Matriz de Permisos por Ruta**: `docs/contrato/matriz-permisos.md`.
- **Script de Verificación en CI**: `npm run contrato:verificar`.

Cualquier cambio de contrato no retrocompatible en el backend generará fallo inmediato en la integración continua.

---

## 2. REGLA CRÍTICA: Single-Flight Mutex en Refresco de Tokens

> [!CAUTION]
> **PELIGRO DE REVOCACIÓN DE FAMILIA DE SESIÓN (Hito 11A - Decisión 12)**
> El backend implementa **detección de reuso de Refresh Tokens por familia criptográfica**. Cuando un refresh token es utilizado, es revocado y se emite uno nuevo. Si un refresh token ya revocado vuelve a presentarse (por ejemplo, si dos peticiones en paralelo intentan refrescar sesión con el mismo token), **el backend asume un ataque de robo de token y revoca de inmediato TODA la familia de tokens del usuario**, cerrando la sesión de golpe.

### Requisito Obligatorio para Flutter
El cliente Flutter **NUNCA debe disparar dos peticiones simultáneas a `POST /api/v1/auth/refresh`**. Todas las peticiones HTTP que detecten un `401 NO_AUTENTICADO` deben esperar a que una única petición de refresco en vuelo complete y actualice el token en el almacenamiento seguro (`flutter_secure_storage`).

### Patrón Recomendado con Dio Interceptor (Single-Flight con Completer):

```dart
import 'dart:async';
import 'package:dio/dio.dart';

class AuthInterceptor extends QueuedInterceptor {
  final Dio dio;
  final SecureTokenStorage tokenStorage;
  Completer<String?>? _refreshCompleter;

  AuthInterceptor({required this.dio, required this.tokenStorage});

  @override
  void onRequest(RequestOptions options, RequestInterceptorHandler handler) async {
    final token = await tokenStorage.getAccessToken();
    if (token != null) {
      options.headers['Authorization'] = 'Bearer $token';
    }
    // Incluir cabecera de versión de app (ver sección 6)
    options.headers['X-App-Version'] = await AppInfo.getSemverVersion();
    return handler.next(options);
  }

  @override
  void onError(DioException err, ErrorInterceptorHandler handler) async {
    if (err.response?.statusCode == 401) {
      final errorCode = err.response?.data?['code'];
      if (errorCode == 'NO_AUTENTICADO') {
        try {
          // Mutex / Single-Flight: Si ya hay un refresco en progreso, esperar su resultado
          if (_refreshCompleter != null) {
            final newToken = await _refreshCompleter!.future;
            if (newToken != null) {
              err.requestOptions.headers['Authorization'] = 'Bearer $newToken';
              final retryResponse = await dio.fetch(err.requestOptions);
              return handler.resolve(retryResponse);
            }
          } else {
            _refreshCompleter = Completer<String?>();
            final refreshToken = await tokenStorage.getRefreshToken();
            if (refreshToken == null) {
              _refreshCompleter!.complete(null);
              _refreshCompleter = null;
              return handler.next(err);
            }

            final refreshRes = await dio.post(
              '/api/v1/auth/refresh',
              data: {'refreshToken': refreshToken},
            );

            final newAccessToken = refreshRes.data['accessToken'];
            final newRefreshToken = refreshRes.data['refreshToken'];

            await tokenStorage.saveTokens(
              accessToken: newAccessToken,
              refreshToken: newRefreshToken,
            );

            _refreshCompleter!.complete(newAccessToken);
            _refreshCompleter = null;

            // Reintentar la petición original con el nuevo token
            err.requestOptions.headers['Authorization'] = 'Bearer $newAccessToken';
            final retryResponse = await dio.fetch(err.requestOptions);
            return handler.resolve(retryResponse);
          }
        } catch (refreshErr) {
          _refreshCompleter?.complete(null);
          _refreshCompleter = null;
          await tokenStorage.clearTokens();
          // Redirigir a login
          return handler.next(err);
        }
      }
    }
    return handler.next(err);
  }
}
```

---

## 3. Manejo de Errores Específicos del Backend

| HTTP Status | Código de Error | Causa | Conducta Requerida en Flutter |
|:---:|---|---|---|
| **401** | `NO_AUTENTICADO` | Access token expirado (15 min) o ausente. | **Único error que dispara refresco de sesión**. Intentar refresco mediante Mutex. Si falla, borrar credenciales y navegar a Login. |
| **403** | `SUSCRIPCION_INACTIVA` | La suscripción está vencida o suspendida (RN-038). | **NUNCA reintentar ni refrescar**. Pasar la app a modo solo lectura (permitir consultas GET, deshabilitar formularios de escritura) y desplegar banner de renovación. |
| **403** | `PERMISO_DENEGADO` | El usuario carece del permiso atómico para la acción. | **NUNCA reintentar ni refrescar**. Mostrar alerta "Acción no permitida por su perfil de usuario". |
| **403** | `LIMITE_PLAN_EXCEDIDO` | Se alcanzó el cupo de parcelas o recursos del plan. | Mostrar pantalla de upgrade de plan de suscripción. |

---

## 4. Convenciones de Tipos de Datos y Serialización

### 4.1 Montos de Dinero, Cantidades y Superficies: `String`
Para prevenir los conocidos errores de redondeo de punto flotante IEEE 754 de `double` en Dart (e.g., `0.1 + 0.2 = 0.30000000000000004`), todos los importes monetarios, cantidades y superficies se serializan como **`String`** en las respuestas del Backend:
- Dinero / Costos / Precios: Cadena decimal fija con 2 decimales (ej. `"12500.50"`).
- Cantidades / Pesos / Mermas: Cadena decimal con hasta 4 decimales (ej. `"1450.2500"`).
- Superficie / Hectáreas: Cadena decimal con hasta 4 decimales (ej. `"12.5000"`).

> [!TIP]
> En Flutter, procese estos campos con el paquete [`decimal`](https://pub.dev/packages/decimal) o use `Decimal.parse(json['monto'])` para toda la aritmética de negocio.

### 4.2 Identificadores Numéricos de 64 bits (`BigInt` / `String`)
Todos los identificadores de registros (`id`, `empresaId`, `cicloId`, `usuarioId`) corresponden a enteros de 64 bits y se serializan como cadenas numéricas en JSON (ej. `"id": "184920485729103845"`). En Dart, mapee estos identificadores a `String` o `BigInt.parse(...)` para no desbordar el entero de JavaScript en plataformas web o compilaciones de 32 bits.

### 4.3 Fechas y Tiempos
- Todas las marcas de tiempo (`createdAt`, `updatedAt`, `fechaRegistro`) se serializan en **formato ISO 8601 UTC** (`yyyy-MM-ddTHH:mm:ss.sssZ`).
- Las fechas de calendario sin hora (`fechaInicio`, `fechaFin`, `fecha`) se representan como cadenas `YYYY-MM-DD`.
- En Flutter, parsee con `DateTime.parse(jsonDate).toLocal()` para presentar al usuario en su zona horaria local.

### 4.4 Paginación Canónica
Los endpoints de listado implementan el patrón canónico mediante `PaginationQueryDto` y retornan el envoltorio estándar:
- **Parámetros de entrada**:
  - `page`: Número de página solicitado (entero $\ge 1$, por defecto `1`).
  - `limit`: Cantidad de registros por página (entero $\ge 1$, por defecto `50` según docx §3.23, tope máximo `@Max(100)`). Cualquier valor superior a 100 es rechazado con `400 PETICION_INVALIDA`.
- **Estructura de respuesta**:
```json
{
  "data": [ ... ],
  "meta": {
    "total": 150,
    "page": 1,
    "limit": 50,
    "totalPages": 3
  }
}
```

---

## 5. Carga y Descarga de Archivos Adjuntos

### 5.1 Subida de Archivos (`POST /api/v1/:entidad/:id/adjuntos`)
- Enviar como petición `multipart/form-data`.
- Tipos de archivo permitidos: `application/pdf`, `image/png`, `image/jpeg`, `image/webp`. El servidor valida tanto la extensión como los Magic Bytes reales del archivo.
- Tamaño máximo permitido: **10 MB**. Compruebe `file.lengthSync() <= 10 * 1024 * 1024` antes de enviar.

### 5.2 Descarga Segura con Enlaces Firmados (HMAC)
El backend utiliza un esquema desacoplado de descarga segura:
1. El cliente solicita el enlace firmado mediante:
   `GET /api/v1/adjuntos/:id/enlace-descarga`
2. El servidor retorna:
   ```json
   {
     "urlDescarga": "/api/v1/adjuntos/descarga?token=eyJhbGciOi...",
     "token": "eyJhbGciOi...",
     "expiraEn": "2026-10-26T04:45:00.000Z"
   }
   ```
3. Flutter descarga el archivo directamente desde la URL firmada:
   `GET /api/v1/adjuntos/descarga?token=...`
   El token tiene una vida útil de **300 segundos (5 minutos)**. Si expira o es adulterado, responde `403 ENLACE_DESCARGA_INVALIDO`.

---

## 6. Control de Versiones del Cliente (`X-App-Version` y 426)

Para garantizar la compatibilidad con el backend, Flutter debe incluir la cabecera `X-App-Version` en todas las peticiones HTTP que ejecute la aplicación:
- **Formato obligatorio**: SemVer 2.0.0 (ej. `1.0.0`, `1.2.3`).
- **Política de cabecera ausente**: Si la cabecera `X-App-Version` está ausente, el servidor **NUNCA rechaza la petición**. Esto permite el funcionamiento transparente de visores de adjuntos del sistema operativo, navegadores web, sondas de infraestructura y herramientas de desarrollo.
- **Rutas exentas por diseño**: `/health`, `/api/docs` y `GET /api/v1/adjuntos/descarga?token=...` están explícitamente exentas de validación de versión.
- **Manejo del error HTTP 426**:
  ```json
  {
    "statusCode": 426,
    "code": "VERSION_APP_OBSOLETA",
    "message": "La versión de la aplicación (0.9.9) está obsoleta. La versión mínima requerida es 1.0.0.",
    "details": {
      "minVersion": "1.0.0",
      "clientVersion": "0.9.9",
      "storeUrl": "https://play.google.com/store/apps/details?id=com.rentabilidad.agricola"
    }
  }
  ```
- **Conducta requerida en Flutter**:
  Al recibir un status `426` con código `VERSION_APP_OBSOLETA`, desplegar un diálogo modal **no cancelable** (bloqueante) indicando que es obligatorio actualizar la aplicación para continuar, con un botón "Actualizar ahora" que invoque `url_launcher` hacia la URL provista en `details.storeUrl`.
- **Manejo del error HTTP 400 (`VERSION_APP_INVALIDA`)**:
  Si la cabecera se envía pero no cumple con la especificación SemVer (ej. `v1`, `beta`), el backend responde `400 VERSION_APP_INVALIDA`. Asegurar que Flutter envíe el valor limpio devuelto por `package_info_plus`.

---

## 7. Generación de Modelos y Clientes Dart (D7)

### 7.1 Estado de Herramientas en el Entorno
Durante la inspección de herramientas en la máquina:
- **Java**: `OpenJDK 21.0.5 LTS` (Instalado y verificado con `java -version`).
- **Docker**: `Docker CLI` (Instalado y disponible).
- **Dart / Flutter SDK**: Dart SDK 3.7.2 (stable) verificado directamente en `C:\flutter\bin\cache\dart-sdk\bin\dart.exe`. (Nota: el script por lotes `C:\flutter\bin\dart.bat` invoca un wrapper PowerShell interactivo que puede colgarse en subshells desatendidas de Windows; use siempre el binario nativo directo o configure el PATH al subdirectorio `dart-sdk/bin`).

### 7.2 Comandos Recomendados para Generación de Código

#### Opción A: Vía NPX (Sin instalación global)
```bash
npx @openapitools/openapi-generator-cli generate \
  -i docs/contrato/openapi.json \
  -g dart-dio \
  -o ../frontend_flutter/lib/core/api/generated \
  --additional-properties=pubName=rentabilidad_api,nullableFields=true
```

#### Opción B: Vía Docker
```bash
docker run --rm \
  -v "${PWD}:/local" openapitools/openapi-generator-cli generate \
  -i /local/docs/contrato/openapi.json \
  -g dart-dio \
  -o /local/generated-flutter-client \
  --additional-properties=pubName=rentabilidad_api,nullableFields=true
```


---

## 8. Gestión de Contraseñas y Recuperación por Correo (Hito 11E - ADR-017)

El Hito 11E incorpora tres endpoints para la gestión de credenciales, con rate limiting granular y protección anti-enumeración.

### 8.1 Cambio Autenticado de Contraseña
- **Ruta**: `PATCH /api/v1/auth/contrasena/cambiar`
- **Autenticación**: Obligatoria (`Authorization: Bearer <accessToken>`).
- **Rate Limiting**: Throttler `cambiar-usuario` (máximo 5 peticiones cada 15 minutos por usuario).
- **Body**: `{ "contrasenaActual": "...", "nuevaContrasena": "..." }`
- **Respuesta 200 OK**: `{ "mensaje": "Contraseña actualizada exitosamente. Todas las sesiones activas han sido invalidadas." }`
- **Efecto de Seguridad**: Invalida inmediatamente el Access Token actual y revoca todos los Refresh Tokens vigentes. El cliente Flutter debe purgar sus tokens en memoria y redigir al usuario al login con la nueva contraseña.
- **Errores**: `400 CONTRASENA_ACTUAL_INCORRECTA`, `429 DEMASIADAS_PETICIONES` (con cabecera `Retry-After`).

### 8.2 Solicitar Recuperación por Correo
- **Ruta**: `POST /api/v1/auth/contrasena/solicitar-recuperacion`
- **Autenticación**: Pública (`@Public()`).
- **Rate Limiting**: Throttler `recuperar-ip` (5 peticiones / 15 min) y `recuperar-correo` (3 peticiones / 15 min).
- **Body**: `{ "correo": "usuario@correo.com" }`
- **Respuesta 200 OK (Anti-enumeración)**:
  ```json
  {
    "mensaje": "Si el correo electrónico está registrado, recibirá las instrucciones para restablecer su contraseña."
  }
  ```
  *Nota Flutter*: Esta respuesta es idéntica si el correo existe o no, o si el servicio de correo experimentó fallas temporales. No intente inferir la existencia del usuario.
- **Errores**: `400 VALIDACION_FALLIDA`, `429 DEMASIADAS_PETICIONES`.

### 8.3 Restablecer Contraseña con Token Uniuso
- **Ruta**: `POST /api/v1/auth/contrasena/restablecer`
- **Autenticación**: Pública (`@Public()`).
- **Rate Limiting**: Throttler `restablecer-ip` (10 peticiones / 15 min por IP).
- **Body**: `{ "token": "<hex-64>", "nuevaContrasena": "NuevaClaveSegura123!" }`
- **Respuesta 200 OK**: `{ "mensaje": "Contraseña restablecida exitosamente. Puede iniciar sesión con sus nuevas credenciales." }`
- **Errores**:
  - `400 TOKEN_RECUPERACION_INVALIDO`: Si el token no existe, ya fue consumido o transcurrieron más de 15 minutos de su emisión.
  - `429 DEMASIADAS_PETICIONES`: Si se exceden las 10 peticiones por IP en 15 minutos.
