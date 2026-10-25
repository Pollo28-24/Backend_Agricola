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
            final newAccessToken = await _refreshCompleter!.future;
            if (newAccessToken != null) {
              err.requestOptions.headers['Authorization'] = 'Bearer $newAccessToken';
              final retryRes = await dio.fetch(err.requestOptions);
              return handler.resolve(retryRes);
            }
          } else {
            _refreshCompleter = Completer<String?>();
            final refreshToken = await tokenStorage.getRefreshToken();
            if (refreshToken == null) {
              _refreshCompleter!.complete(null);
              _refreshCompleter = null;
              await tokenStorage.clear();
              return handler.next(err);
            }

            final refreshResponse = await dio.post(
              '/api/v1/auth/refresh',
              data: {'refreshToken': refreshToken},
              options: Options(headers: {'Authorization': null}),
            );

            final newAccessToken = refreshResponse.data['accessToken'];
            final newRefreshToken = refreshResponse.data['refreshToken'];

            await tokenStorage.saveTokens(
              accessToken: newAccessToken,
              refreshToken: newRefreshToken,
            );

            _refreshCompleter!.complete(newAccessToken);
            _refreshCompleter = null;

            err.requestOptions.headers['Authorization'] = 'Bearer $newAccessToken';
            final retryRes = await dio.fetch(err.requestOptions);
            return handler.resolve(retryRes);
          }
        } catch (refreshErr) {
          _refreshCompleter?.complete(null);
          _refreshCompleter = null;
          await tokenStorage.clear();
          // Redirigir inmediatamente a pantalla de Login
          NavigationService.navigateToLogin();
          return handler.next(err);
        }
      }
    }
    return handler.next(err);
  }
}
```

---

## 3. Distinción Semántica: 401 NO_AUTENTICADO vs 403

| Código HTTP | Código Dominio | Significado | Acción en Flutter |
|---|---|---|---|
| **401** | `NO_AUTENTICADO` | El token expiró (TTL 15 min) o es inválido. | **Disparar flujo de refresco de sesión** mediante el interceptor con mutex. |
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
Los endpoints de listado implementan el patrón unificado de paginación:
```json
{
  "data": [ ... ],
  "meta": {
    "total": 150,
    "pagina": 1,
    "limite": 20,
    "totalPaginas": 8,
    "tieneSiguiente": true,
    "tieneAnterior": false
  }
}
```

---

## 5. Carga y Descarga de Archivos Adjuntos

### 5.1 Subida de Archivos (`POST /api/v1/adjuntos`)
- Enviar como petición `multipart/form-data`.
- Tipos de archivo permitidos: `application/pdf`, `image/png`, `image/jpeg`, `image/webp`. El servidor valida tanto la extensión como los Magic Bytes reales del archivo.
- Tamaño máximo permitido: **10 MB**. Compruebe `file.lengthSync() <= 10 * 1024 * 1024` antes de enviar.

### 5.2 Descarga Segura con Enlaces Firmados (HMAC)
El backend utiliza un esquema desacoplado de descarga segura:
1. El cliente solicita el enlace firmado mediante `GET /api/v1/adjuntos/:id/enlace-descarga`.
2. El servidor retorna `{ "enlace": "/api/v1/adjuntos/descargar/TOKEN_HMAC", "expiraEn": 300 }`.
3. Flutter descarga el archivo directamente desde la URL firmada. El token tiene una vida útil de **300 segundos (5 minutos)**. Si expira, debe solicitarse un nuevo enlace.

---

## 6. Control de Versiones del Cliente (`X-App-Version` y 426)

Para garantizar la compatibilidad con el backend, Flutter debe incluir la cabecera `X-App-Version` en todas las peticiones HTTP:
- **Formato obligatorio**: SemVer 2.0.0 (ej. `1.0.0`, `1.2.3`).
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

---

## 7. Generación de Modelos y Clientes Dart (D7)

### 7.1 Estado de Herramientas en el Entorno
Durante la inspección del Hito 11D, se detectaron las siguientes herramientas disponibles en la máquina:
- **Java**: `OpenJDK 21.0.5 LTS` (Instalado).
- **Docker**: `Docker CLI` (Instalado).
- **Dart / Flutter**: `Dart SDK` (Instalado en `C:\flutter\bin`).

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
