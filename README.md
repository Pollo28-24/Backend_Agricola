# Backend — Rentabilidad Agrícola

API REST multi-tenant desarrollada con **NestJS 11**, **Prisma 6** y **MySQL 8.0+**.

## Requisitos e Instalación
- **Node.js** >= 22 (probado en Node 24) y **MySQL** >= 8.0 (`backend` y `rentabilidad_agricola_test`).
- Instalar dependencias: `npm ci`
- Configurar variables de entorno copiando `.env.example` a `.env` y `.env.test.example` a `.env.test`.

## Base de Datos (Prisma)
- Aplicar migraciones: `npx prisma migrate deploy` (o `npx prisma migrate dev` en desarrollo)
- Cargar semilla inicial: `npx prisma db seed`
- Verificación estructural e invariantes (Anexo D sobre BD `_test`): `npm run db:verify`

## Pruebas y Contrato OpenAPI
- Pruebas unitarias: `npm test`
- Pruebas E2E (requiere `.env.test` y MySQL activo): `npm run test:e2e`
- Generar snapshot OpenAPI congelado: `npm run contrato:generar`
- Verificar contrato OpenAPI sin deriva: `npm run contrato:verificar`

## Documentación de Arquitectura
Consulta el contexto integral, invariantes de dominio, catálogo de errores y ADRs en [docs/CONTEXTO-PROYECTO.md](docs/CONTEXTO-PROYECTO.md).
