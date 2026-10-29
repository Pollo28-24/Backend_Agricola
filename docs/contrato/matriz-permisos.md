# Matriz de Permisos y Control de Acceso por Ruta

Este documento define la matriz exhaustiva de permisos requeridos por cada una de las **109 rutas registradas** en la API del Sistema de Rentabilidad Agrícola (Hito 11D - ADR-015).

## Roles Predefinidos del Sistema

El sistema cuenta con 19 permisos atómicos organizados por dominio funcional, asignados a los siguientes roles:

- **ADMIN**: Posee los 19 permisos (acceso operativo y de administración total).
- **CONTADOR**: Posee 8 permisos (`VER_CATALOGOS`, `VER_PREDIOS`, `VER_CICLOS`, `VER_GASTOS`, `CREAR_GASTOS`, `EDITAR_GASTOS`, `VER_VENTAS`, `VER_REPORTES`).
- **CAPTURISTA**: Posee 4 permisos (`VER_CATALOGOS`, `VER_PREDIOS`, `VER_CICLOS`, `CREAR_ACTIVIDADES`).

## Catálogo de los 19 Permisos del Sistema

| # | Clave del Permiso | Módulo | ADMIN | CONTADOR | CAPTURISTA |
|---|---|---|:---:|:---:|:---:|
| 1 | `ADMINISTRAR_EMPRESA` | Empresas / Config | Sí | No | No |
| 2 | `ADMINISTRAR_USUARIOS` | Usuarios / Roles | Sí | No | No |
| 3 | `VER_AUDITORIA` | Auditoría | Sí | No | No |
| 4 | `VER_CATALOGOS` | Catálogos | Sí | Sí | Sí |
| 5 | `ADMINISTRAR_CATALOGOS` | Catálogos | Sí | No | No |
| 6 | `VER_PREDIOS` | Estructura (Predios/Parcelas) | Sí | Sí | Sí |
| 7 | `ADMINISTRAR_PREDIOS` | Estructura (Predios/Parcelas) | Sí | No | No |
| 8 | `VER_CICLOS` | Ciclos Agrícolas | Sí | Sí | Sí |
| 9 | `ADMINISTRAR_CICLOS` | Ciclos Agrícolas | Sí | No | No |
| 10 | `CREAR_ACTIVIDADES` | Actividades de Campo | Sí | No | Sí |
| 11 | `EDITAR_ACTIVIDADES` | Actividades de Campo | Sí | No | No |
| 12 | `VER_GASTOS` | Costos y Gastos | Sí | Sí | No |
| 13 | `CREAR_GASTOS` | Costos y Gastos | Sí | Sí | No |
| 14 | `EDITAR_GASTOS` | Costos y Gastos | Sí | Sí | No |
| 15 | `ADMINISTRAR_COSECHAS` | Cosechas y Mermas | Sí | No | No |
| 16 | `VER_VENTAS` | Comercialización (Ventas/Cobros) | Sí | Sí | No |
| 17 | `ADMINISTRAR_VENTAS` | Comercialización (Ventas/Cobros) | Sí | No | No |
| 18 | `VER_REPORTES` | Inteligencia y Analítica | Sí | Sí | No |
| 19 | `EXPORTAR_DATOS` | Exportación de Datos | Sí | No | No |

## Mapeo Exhaustivo de Endpoints (109 Rutas)

| Método | Endpoint | Acceso / Permisos Requeridos | Controlador | Handler |
|---|---|---|---|---|
| `GET` | `/api/v1/actividades` | `actividad:crear`, `registro:administrar` | `ActividadesController` | `listarActividades` |
| `POST` | `/api/v1/actividades` | `actividad:crear` | `ActividadesController` | `crearActividad` |
| `DELETE` | `/api/v1/actividades/:id` | `actividad:crear`, `registro:administrar` | `ActividadesController` | `eliminarActividad` |
| `GET` | `/api/v1/actividades/:id` | `actividad:crear`, `registro:administrar` | `ActividadesController` | `obtenerActividadPorId` |
| `PATCH` | `/api/v1/actividades/:id` | `actividad:crear`, `registro:administrar` | `ActividadesController` | `actualizarActividad` |
| `GET` | `/api/v1/actividades/:id/adjuntos` | `actividad:crear` | `AdjuntosController` | `listarAdjuntosActividad` |
| `POST` | `/api/v1/actividades/:id/adjuntos` | `actividad:crear` | `AdjuntosController` | `subirAdjuntoActividad` |
| `DELETE` | `/api/v1/adjuntos/:id` | `registro:administrar` | `AdjuntosController` | `eliminarAdjunto` |
| `GET` | `/api/v1/adjuntos/:id/enlace-descarga` | 🔵 Autenticado (Cualquier rol activo) | `AdjuntosController` | `obtenerEnlaceDescarga` |
| `GET` | `/api/v1/adjuntos/descarga` | 🟢 **Público** (Sin auth) | `AdjuntosController` | `descargarArchivo` |
| `GET` | `/api/v1/auditoria` | `empresa:administrar` | `AuditoriaController` | `listar` |
| `GET` | `/api/v1/auditoria/:id` | `empresa:administrar` | `AuditoriaController` | `obtenerPorId` |
| `POST` | `/api/v1/auth/login` | 🟢 **Público** (Sin auth) | `AuthController` | `login` |
| `POST` | `/api/v1/auth/logout` | 🔵 Autenticado (Cualquier rol activo) | `AuthController` | `logout` |
| `GET` | `/api/v1/auth/me` | 🔵 Autenticado (Cualquier rol activo) | `AuthController` | `me` |
| `POST` | `/api/v1/auth/refresh` | 🟢 **Público** (Sin auth) | `AuthController` | `refresh` |
| `PATCH` | `/api/v1/auth/contrasena/cambiar` | 🔵 Autenticado (Cualquier rol activo) | `AuthController` | `cambiarContrasena` |
| `POST` | `/api/v1/auth/contrasena/solicitar-recuperacion` | 🟢 **Público** (Sin auth) | `AuthController` | `solicitarRecuperacion` |
| `POST` | `/api/v1/auth/contrasena/restablecer` | 🟢 **Público** (Sin auth) | `AuthController` | `restablecerContrasena` |
| `GET` | `/api/v1/catalogos/categorias-gasto` | 🔵 Autenticado (Cualquier rol activo) | `CatalogosController` | `obtenerCategoriasGasto` |
| `POST` | `/api/v1/catalogos/categorias-gasto` | `catalogo:administrar` | `CatalogosController` | `crearCategoriaGasto` |
| `GET` | `/api/v1/catalogos/cultivos` | 🔵 Autenticado (Cualquier rol activo) | `CatalogosController` | `obtenerCultivos` |
| `GET` | `/api/v1/catalogos/cultivos/:id/variedades` | 🔵 Autenticado (Cualquier rol activo) | `CatalogosController` | `obtenerVariedadesPorCultivo` |
| `GET` | `/api/v1/catalogos/motivos-merma` | 🔵 Autenticado (Cualquier rol activo) | `CatalogosController` | `obtenerMotivosMerma` |
| `GET` | `/api/v1/catalogos/tipos-actividad` | 🔵 Autenticado (Cualquier rol activo) | `CatalogosController` | `obtenerTiposActividad` |
| `GET` | `/api/v1/catalogos/tipos-suelo` | 🔵 Autenticado (Cualquier rol activo) | `CatalogosController` | `obtenerTiposSuelo` |
| `GET` | `/api/v1/catalogos/unidades-medida` | 🔵 Autenticado (Cualquier rol activo) | `CatalogosController` | `obtenerUnidadesMedida` |
| `GET` | `/api/v1/ciclos` | 🔵 Autenticado (Cualquier rol activo) | `CiclosController` | `listar` |
| `POST` | `/api/v1/ciclos` | `ciclo:crear` | `CiclosController` | `crear` |
| `DELETE` | `/api/v1/ciclos/:id` | `ciclo:cerrar` | `CiclosController` | `eliminar` |
| `GET` | `/api/v1/ciclos/:id` | 🔵 Autenticado (Cualquier rol activo) | `CiclosController` | `obtenerPorId` |
| `PATCH` | `/api/v1/ciclos/:id` | `ciclo:crear` | `CiclosController` | `actualizar` |
| `PATCH` | `/api/v1/ciclos/:id/cancelar` | `ciclo:cerrar` | `CiclosController` | `cancelar` |
| `PATCH` | `/api/v1/ciclos/:id/finalizar` | `ciclo:cerrar` | `CiclosController` | `finalizar` |
| `PATCH` | `/api/v1/ciclos/:id/iniciar` | `ciclo:crear` | `CiclosController` | `iniciar` |
| `PATCH` | `/api/v1/ciclos/:id/reabrir` | `ciclo:reabrir` | `CiclosController` | `reabrir` |
| `PATCH` | `/api/v1/ciclos/:id/reanudar` | `ciclo:crear` | `CiclosController` | `reanudar` |
| `PATCH` | `/api/v1/ciclos/:id/suspender` | `ciclo:crear` | `CiclosController` | `suspender` |
| `GET` | `/api/v1/clientes` | `tercero:administrar` | `ClientesController` | `listar` |
| `POST` | `/api/v1/clientes` | `tercero:administrar` | `ClientesController` | `crear` |
| `DELETE` | `/api/v1/clientes/:id` | `tercero:administrar` | `ClientesController` | `eliminar` |
| `GET` | `/api/v1/clientes/:id` | `tercero:administrar` | `ClientesController` | `obtenerPorId` |
| `PATCH` | `/api/v1/clientes/:id` | `tercero:administrar` | `ClientesController` | `actualizar` |
| `GET` | `/api/v1/cobros/:id` | `cobro:crear` | `CobrosController` | `obtenerCobroPorId` |
| `GET` | `/api/v1/cobros/:id/adjuntos` | `cobro:crear` | `AdjuntosController` | `listarAdjuntosCobro` |
| `POST` | `/api/v1/cobros/:id/adjuntos` | `cobro:crear` | `AdjuntosController` | `subirAdjuntoCobro` |
| `PATCH` | `/api/v1/cobros/:id/anular` | `cobro:crear` | `CobrosController` | `anularCobro` |
| `GET` | `/api/v1/cosechas` | `cosecha:crear` | `CosechasController` | `listarCosechas` |
| `POST` | `/api/v1/cosechas` | `cosecha:crear` | `CosechasController` | `crearCosecha` |
| `DELETE` | `/api/v1/cosechas/:id` | `registro:administrar` | `CosechasController` | `eliminarCosecha` |
| `GET` | `/api/v1/cosechas/:id` | `cosecha:crear` | `CosechasController` | `obtenerCosechaPorId` |
| `PATCH` | `/api/v1/cosechas/:id` | `cosecha:crear` | `CosechasController` | `actualizarCosecha` |
| `GET` | `/api/v1/empresas/mi-empresa` | `empresa:administrar` | `EmpresasController` | `obtenerMiEmpresa` |
| `PATCH` | `/api/v1/empresas/mi-empresa` | `empresa:administrar` | `EmpresasController` | `actualizarMiEmpresa` |
| `POST` | `/api/v1/empresas/registro` | 🟢 **Público** (Sin auth) | `EmpresasController` | `registrar` |
| `GET` | `/api/v1/gastos` | `gasto:crear` | `GastosController` | `listarGastos` |
| `POST` | `/api/v1/gastos` | `gasto:crear`, `registro:administrar` | `GastosController` | `crearGasto` |
| `DELETE` | `/api/v1/gastos/:id` | `registro:administrar` | `GastosController` | `eliminarGasto` |
| `GET` | `/api/v1/gastos/:id` | `gasto:crear` | `GastosController` | `obtenerGastoPorId` |
| `PATCH` | `/api/v1/gastos/:id` | `gasto:crear`, `gasto:editar_todos`, `registro:administrar` | `GastosController` | `actualizarGasto` |
| `GET` | `/api/v1/gastos/:id/adjuntos` | `gasto:crear` | `AdjuntosController` | `listarAdjuntosGasto` |
| `POST` | `/api/v1/gastos/:id/adjuntos` | `gasto:crear` | `AdjuntosController` | `subirAdjuntoGasto` |
| `GET` | `/api/v1/health` | 🟢 **Público** (Sin auth) | `HealthController` | `check` |
| `GET` | `/api/v1/mermas` | `merma:crear` | `MermasController` | `listarMermas` |
| `POST` | `/api/v1/mermas` | `merma:crear` | `MermasController` | `crearMerma` |
| `DELETE` | `/api/v1/mermas/:id` | `registro:administrar` | `MermasController` | `eliminarMerma` |
| `GET` | `/api/v1/mermas/:id` | `merma:crear` | `MermasController` | `obtenerMermaPorId` |
| `PATCH` | `/api/v1/mermas/:id` | `merma:crear` | `MermasController` | `actualizarMerma` |
| `GET` | `/api/v1/parcelas` | 🔵 Autenticado (Cualquier rol activo) | `ParcelasController` | `listar` |
| `POST` | `/api/v1/parcelas` | `estructura:administrar` | `ParcelasController` | `crear` |
| `DELETE` | `/api/v1/parcelas/:id` | `estructura:administrar` | `ParcelasController` | `eliminar` |
| `GET` | `/api/v1/parcelas/:id` | 🔵 Autenticado (Cualquier rol activo) | `ParcelasController` | `obtenerPorId` |
| `PATCH` | `/api/v1/parcelas/:id` | `estructura:administrar` | `ParcelasController` | `actualizar` |
| `GET` | `/api/v1/predios` | 🔵 Autenticado (Cualquier rol activo) | `PrediosController` | `listar` |
| `POST` | `/api/v1/predios` | `estructura:administrar` | `PrediosController` | `crear` |
| `DELETE` | `/api/v1/predios/:id` | `estructura:administrar` | `PrediosController` | `eliminar` |
| `GET` | `/api/v1/predios/:id` | 🔵 Autenticado (Cualquier rol activo) | `PrediosController` | `obtenerPorId` |
| `PATCH` | `/api/v1/predios/:id` | `estructura:administrar` | `PrediosController` | `actualizar` |
| `GET` | `/api/v1/proveedores` | 🔵 Autenticado (Cualquier rol activo) | `ProveedoresController` | `listar` |
| `POST` | `/api/v1/proveedores` | `tercero:administrar` | `ProveedoresController` | `crear` |
| `DELETE` | `/api/v1/proveedores/:id` | `tercero:administrar` | `ProveedoresController` | `eliminar` |
| `GET` | `/api/v1/proveedores/:id` | 🔵 Autenticado (Cualquier rol activo) | `ProveedoresController` | `obtenerPorId` |
| `PATCH` | `/api/v1/proveedores/:id` | `tercero:administrar` | `ProveedoresController` | `actualizar` |
| `GET` | `/api/v1/reportes/alertas` | `reporte:ver` | `ReportesController` | `obtenerAlertas` |
| `GET` | `/api/v1/reportes/ciclos/:cicloId/costos-por-actividad` | `reporte:ver` | `ReportesController` | `obtenerCostosPorActividad` |
| `GET` | `/api/v1/reportes/ciclos/:cicloId/costos-por-categoria` | `reporte:ver` | `ReportesController` | `obtenerCostosPorCategoria` |
| `GET` | `/api/v1/reportes/ciclos/:cicloId/mermas` | `reporte:ver` | `ReportesController` | `obtenerMermas` |
| `GET` | `/api/v1/reportes/ciclos/:cicloId/rentabilidad` | `reporte:ver` | `ReportesController` | `obtenerRentabilidadCiclo` |
| `GET` | `/api/v1/reportes/cuentas-por-cobrar` | `reporte:ver` | `ReportesController` | `obtenerCuentasPorCobrar` |
| `GET` | `/api/v1/reportes/exportaciones/ciclos/:cicloId` | `reporte:exportar` | `ExportacionController` | `exportarCicloDetalle` |
| `GET` | `/api/v1/reportes/exportaciones/cuentas-por-cobrar` | `reporte:exportar` | `ExportacionController` | `exportarCuentasPorCobrar` |
| `GET` | `/api/v1/reportes/exportaciones/parcelas/:parcelaId/comparativo` | `reporte:exportar` | `ExportacionController` | `exportarComparativo` |
| `GET` | `/api/v1/reportes/exportaciones/rentabilidad` | `reporte:exportar` | `ExportacionController` | `exportarRentabilidad` |
| `GET` | `/api/v1/reportes/parcelas/:parcelaId/comparativo` | `reporte:ver` | `ReportesController` | `obtenerComparativoParcela` |
| `GET` | `/api/v1/reportes/rentabilidad` | `reporte:ver` | `ReportesController` | `obtenerRentabilidad` |
| `GET` | `/api/v1/usuarios` | `usuario:administrar` | `UsuariosController` | `listar` |
| `POST` | `/api/v1/usuarios` | `usuario:administrar` | `UsuariosController` | `crear` |
| `DELETE` | `/api/v1/usuarios/:id` | `usuario:administrar` | `UsuariosController` | `eliminar` |
| `GET` | `/api/v1/usuarios/:id` | `usuario:administrar` | `UsuariosController` | `obtenerPorId` |
| `PATCH` | `/api/v1/usuarios/:id` | `usuario:administrar` | `UsuariosController` | `actualizar` |
| `GET` | `/api/v1/ventas` | `venta:crear` | `VentasController` | `listarVentas` |
| `POST` | `/api/v1/ventas` | `venta:crear` | `VentasController` | `crearVenta` |
| `GET` | `/api/v1/ventas/:id` | `venta:crear` | `VentasController` | `obtenerVenta` |
| `PATCH` | `/api/v1/ventas/:id` | `venta:crear` | `VentasController` | `actualizarVenta` |
| `GET` | `/api/v1/ventas/:id/adjuntos` | `venta:crear` | `AdjuntosController` | `listarAdjuntosVenta` |
| `POST` | `/api/v1/ventas/:id/adjuntos` | `venta:crear` | `AdjuntosController` | `subirAdjuntoVenta` |
| `PATCH` | `/api/v1/ventas/:id/cancelar` | `venta:cancelar` | `VentasController` | `cancelarVenta` |
| `GET` | `/api/v1/ventas/:ventaId/cobros` | `cobro:crear` | `CobrosController` | `listarCobrosDeVenta` |
| `POST` | `/api/v1/ventas/:ventaId/cobros` | `cobro:crear` | `CobrosController` | `registrarCobro` |
