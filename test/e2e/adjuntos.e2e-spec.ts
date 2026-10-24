import { INestApplication } from '@nestjs/common';
import { createTestApp } from '../setup/create-test-app';
import { testRequest } from '../setup/http.util';
import { PrismaService } from '../../src/prisma/prisma.service';
import { AuditService } from '../../src/prisma/audit.service';
import {
  getOrLoadSeedData,
  crearCicloAisladoParaConcurrencia,
  E2eSeedData,
} from '../setup/e2e-seed';
import { generateTestJwt } from '../setup/test-tokens.util';
import { CodigoError } from '../../src/common/errors/codigos-error.enum';
import { EstadoCiclo, MetodoPago, Prisma } from '@prisma/client';
import { TokenDescargaService } from '../../src/modules/adjuntos/services/token-descarga.service';
import {
  STORAGE_SERVICE,
  IStorageService,
} from '../../src/modules/adjuntos/interfaces/storage-service.interface';

interface AdjuntoResponseBody {
  id: number;
  entidad: string;
  entidadId: number;
  nombreArchivo: string;
  tipoMime: string;
  tamanoBytes: number;
  createdAt: string;
}

interface EnlaceDescargaResponseBody {
  urlDescarga: string;
  token: string;
  expiraEn: string;
}

interface ErrorResponseBody {
  statusCode: number;
  code: string;
  message: string;
}

describe('Módulo de Archivos Adjuntos (E2E) - Hito 10A', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let seed: E2eSeedData;
  let storageService: IStorageService;
  let tokenDescargaService: TokenDescargaService;

  let tokenAdminA: string;
  let tokenCapturistaA: string;
  let tokenAdminB: string;

  const validPngHeader = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
    0x49, 0x48, 0x44, 0x52,
  ]);
  const validPdfHeader = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n');

  beforeAll(async () => {
    const testApp = await createTestApp();
    app = testApp.app;
    prisma = testApp.prisma;
    storageService = app.get<IStorageService>(STORAGE_SERVICE);
    tokenDescargaService = app.get(TokenDescargaService);
    seed = await getOrLoadSeedData(prisma);

    tokenAdminA = generateTestJwt(
      seed.empresaA.usuarios.admin.id,
      seed.empresaA.id,
      'ADMIN',
    );
    tokenCapturistaA = generateTestJwt(
      seed.empresaA.usuarios.capturista.id,
      seed.empresaA.id,
      'CAPTURISTA',
    );
    tokenAdminB = generateTestJwt(
      seed.empresaB.usuarios.admin.id,
      seed.empresaB.id,
      'ADMIN',
    );
  });

  afterAll(async () => {
    await app.close();
  });

  // =========================================================================
  // 1. VALIDACIÓN BINARIA (MAGIC BYTES) Y TAMAÑO
  // =========================================================================
  describe('Validación de archivos (Magic bytes y tamaño)', () => {
    it('debe rechazar archivo con extensión .png pero contenido HTML falso (415 TIPO_ARCHIVO_NO_PERMITIDO)', async () => {
      const fakeContent = Buffer.from('<html><body>malicioso</body></html>');

      const res = await testRequest(app)
        .post(`/api/v1/gastos/${seed.empresaA.gastoAdmin.id}/adjuntos`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .attach('archivo', fakeContent, 'comprobante.png');

      expect(res.status).toBe(415);
      const body = res.body as ErrorResponseBody;
      expect(body.code).toBe(CodigoError.TIPO_ARCHIVO_NO_PERMITIDO);
    });

    it('debe rechazar discrepancia entre tipo MIME declarado y contenido binario real (415)', async () => {
      // Cabecera PNG pero enviando Content-Type application/pdf en el multipart
      const res = await testRequest(app)
        .post(`/api/v1/gastos/${seed.empresaA.gastoAdmin.id}/adjuntos`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .attach('archivo', validPngHeader, {
          filename: 'archivo.pdf',
          contentType: 'application/pdf',
        });

      expect(res.status).toBe(415);
      const body = res.body as ErrorResponseBody;
      expect(body.code).toBe(CodigoError.TIPO_ARCHIVO_NO_PERMITIDO);
    });

    it('debe aceptar archivo de exactamente 10 MB (201)', async () => {
      const exact10Mb = Buffer.alloc(10 * 1024 * 1024);
      validPdfHeader.copy(exact10Mb, 0);

      const res = await testRequest(app)
        .post(`/api/v1/gastos/${seed.empresaA.gastoAdmin.id}/adjuntos`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .attach('archivo', exact10Mb, 'exact-10mb.pdf');

      expect(res.status).toBe(201);
    });

    it('debe rechazar archivo de 10 MB + 1 byte con 413 ARCHIVO_DEMASIADO_GRANDE', async () => {
      const over10Mb = Buffer.alloc(10 * 1024 * 1024 + 1);
      validPdfHeader.copy(over10Mb, 0);

      const res = await testRequest(app)
        .post(`/api/v1/gastos/${seed.empresaA.gastoAdmin.id}/adjuntos`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .attach('archivo', over10Mb, 'over-10mb.pdf');

      expect(res.status).toBe(413);
      const body = res.body as ErrorResponseBody;
      expect(body.code).toBe(CodigoError.ARCHIVO_DEMASIADO_GRANDE);
    });

    it('debe aceptar archivo PDF válido con su firma binaria correcta (201)', async () => {
      const res = await testRequest(app)
        .post(`/api/v1/gastos/${seed.empresaA.gastoAdmin.id}/adjuntos`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .attach('archivo', validPdfHeader, 'factura-valida.pdf');

      expect(res.status).toBe(201);
      const body = res.body as AdjuntoResponseBody;
      expect(body.nombreArchivo).toBe('factura-valida.pdf');
      expect(body.tipoMime).toBe('application/pdf');
      expect(body.entidad).toBe('gasto');
      expect(body.entidadId).toBe(seed.empresaA.gastoAdmin.id);
    });
  });

  // =========================================================================
  // 2. AISLAMIENTO MULTI-TENANT
  // =========================================================================
  describe('Aislamiento Multi-tenant estricto', () => {
    let adjuntoEmpresaAId: number;

    beforeAll(async () => {
      const res = await testRequest(app)
        .post(`/api/v1/gastos/${seed.empresaA.gastoAdmin.id}/adjuntos`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .attach('archivo', validPdfHeader, 'factura-empresa-a.pdf');
      const body = res.body as AdjuntoResponseBody;
      adjuntoEmpresaAId = body.id;
    });

    it('Empresa B no puede listar adjuntos de un gasto de Empresa A (404)', async () => {
      const res = await testRequest(app)
        .get(`/api/v1/gastos/${seed.empresaA.gastoAdmin.id}/adjuntos`)
        .set('Authorization', `Bearer ${tokenAdminB}`);

      expect(res.status).toBe(404);
      const body = res.body as ErrorResponseBody;
      expect(body.code).toBe(CodigoError.RECURSO_NO_ENCONTRADO);
    });

    it('Empresa B no puede subir adjunto a un gasto de Empresa A (404)', async () => {
      const res = await testRequest(app)
        .post(`/api/v1/gastos/${seed.empresaA.gastoAdmin.id}/adjuntos`)
        .set('Authorization', `Bearer ${tokenAdminB}`)
        .attach('archivo', validPdfHeader, 'intruso.pdf');

      expect(res.status).toBe(404);
      const body = res.body as ErrorResponseBody;
      expect(body.code).toBe(CodigoError.RECURSO_NO_ENCONTRADO);
    });

    it('Empresa B no puede generar enlace de descarga para adjunto de Empresa A (404)', async () => {
      const res = await testRequest(app)
        .get(`/api/v1/adjuntos/${adjuntoEmpresaAId}/enlace-descarga`)
        .set('Authorization', `Bearer ${tokenAdminB}`);

      expect(res.status).toBe(404);
      const body = res.body as ErrorResponseBody;
      expect(body.code).toBe(CodigoError.RECURSO_NO_ENCONTRADO);
    });

    it('Empresa B no puede eliminar adjunto de Empresa A (404)', async () => {
      const res = await testRequest(app)
        .delete(`/api/v1/adjuntos/${adjuntoEmpresaAId}`)
        .set('Authorization', `Bearer ${tokenAdminB}`);

      expect(res.status).toBe(404);
      const body = res.body as ErrorResponseBody;
      expect(body.code).toBe(CodigoError.RECURSO_NO_ENCONTRADO);
    });

    it('token de descarga de Empresa A es rechazado con 403 al intentar usarse con usuario de Empresa B', async () => {
      const { token } = tokenDescargaService.generarToken(
        adjuntoEmpresaAId,
        seed.empresaA.id,
        seed.empresaB.usuarios.admin.id, // Usuario de Empresa B sobre empresa A
      );

      const res = await testRequest(app).get(
        `/api/v1/adjuntos/descarga?token=${token}`,
      );

      expect(res.status).toBe(403);
      const body = res.body as ErrorResponseBody;
      expect(body.code).toBe(CodigoError.ENLACE_DESCARGA_INVALIDO);
    });
  });

  // =========================================================================
  // 3. CONTROL DE ACCESO (RBAC) Y MATRIZ DE PERMISOS
  // =========================================================================
  describe('RBAC y Matriz de Permisos', () => {
    it('usuario sin permiso de crear en la entidad recibe 403', async () => {
      // Capturista intentando adjuntar en cobro (capturista no tiene cobro:crear)
      // Primero crear venta y cobro en empresaA
      const cobro = await prisma.cobroVenta.create({
        data: {
          ventaId: seed.empresaA.venta.id,
          registradoPorId: seed.empresaA.usuarios.admin.id,
          monto: new Prisma.Decimal('100.00'),
          metodo: MetodoPago.TRANSFERENCIA,
          fecha: new Date(),
        },
      });

      const res = await testRequest(app)
        .post(`/api/v1/cobros/${cobro.id}/adjuntos`)
        .set('Authorization', `Bearer ${tokenCapturistaA}`)
        .attach('archivo', validPdfHeader, 'comprobante.pdf');

      expect(res.status).toBe(403);
      const body = res.body as ErrorResponseBody;
      expect(body.code).toBe(CodigoError.PERMISO_DENEGADO);
    });

    it('CAPTURISTA recibe 403 al intentar adjuntar a una venta', async () => {
      const res = await testRequest(app)
        .post(`/api/v1/ventas/${seed.empresaA.venta.id}/adjuntos`)
        .set('Authorization', `Bearer ${tokenCapturistaA}`)
        .attach('archivo', validPdfHeader, 'factura-venta.pdf');

      expect(res.status).toBe(403);
      const body = res.body as ErrorResponseBody;
      expect(body.code).toBe(CodigoError.PERMISO_DENEGADO);
    });

    it('CONTADOR puede adjuntar a gastos de cualquier usuario de su empresa (201)', async () => {
      const tokenContadorA = generateTestJwt(
        seed.empresaA.usuarios.contador.id,
        seed.empresaA.id,
        'CONTADOR',
      );
      const res = await testRequest(app)
        .post(`/api/v1/gastos/${seed.empresaA.gastoAdmin.id}/adjuntos`)
        .set('Authorization', `Bearer ${tokenContadorA}`)
        .attach('archivo', validPdfHeader, 'factura-contador.pdf');

      expect(res.status).toBe(201);
    });

    it('CAPTURISTA solo puede adjuntar a sus propios gastos, recibe 404 en gastos ajenos', async () => {
      const res = await testRequest(app)
        .post(`/api/v1/gastos/${seed.empresaA.gastoAdmin.id}/adjuntos`)
        .set('Authorization', `Bearer ${tokenCapturistaA}`)
        .attach('archivo', validPdfHeader, 'intento-capturista-ajeno.pdf');

      expect(res.status).toBe(404);
      const body = res.body as ErrorResponseBody;
      expect(body.code).toBe(CodigoError.RECURSO_NO_ENCONTRADO);
    });

    it('solo usuario con registro:administrar puede eliminar adjuntos (403 para no-admin)', async () => {
      // Subir adjunto con admin
      const resSubida = await testRequest(app)
        .post(`/api/v1/gastos/${seed.empresaA.gastoAdmin.id}/adjuntos`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .attach('archivo', validPdfHeader, 'a-eliminar.pdf');
      const bodySubida = resSubida.body as AdjuntoResponseBody;

      // Intentar eliminar con capturista (no tiene registro:administrar)
      const resDelete = await testRequest(app)
        .delete(`/api/v1/adjuntos/${bodySubida.id}`)
        .set('Authorization', `Bearer ${tokenCapturistaA}`);

      expect(resDelete.status).toBe(403);
      const bodyDelete = resDelete.body as ErrorResponseBody;
      expect(bodyDelete.code).toBe(CodigoError.PERMISO_DENEGADO);
    });
  });

  // =========================================================================
  // 4. VENTANA TEMPORAL DE 48 HORAS (RN-062)
  // =========================================================================
  describe('Ventana temporal de 48 horas (RN-062)', () => {
    let gastoVencidoId: number;

    beforeAll(async () => {
      // Crear gasto con createdAt hace 50 horas
      const fechaVieja = new Date(Date.now() - 50 * 60 * 60 * 1000);
      const gasto = await prisma.gasto.create({
        data: {
          cicloId: seed.empresaA.cicloActivo.id,
          categoriaId: seed.empresaA.categoriaPropia.id,
          proveedorId: seed.empresaA.proveedor.id,
          creadoPorId: seed.empresaA.usuarios.capturista.id,
          descripcion: 'Gasto antiguo para prueba 48h',
          total: new Prisma.Decimal('500.00'),
          costoUnitario: new Prisma.Decimal('500.00'),
          fecha: fechaVieja,
          createdAt: fechaVieja,
        },
      });
      gastoVencidoId = gasto.id;
    });

    it('registro creado hace 47 horas permite subida a capturista (201)', async () => {
      const fecha47h = new Date(Date.now() - 47 * 60 * 60 * 1000);
      const gasto47h = await prisma.gasto.create({
        data: {
          cicloId: seed.empresaA.cicloActivo.id,
          categoriaId: seed.empresaA.categoriaPropia.id,
          proveedorId: seed.empresaA.proveedor.id,
          creadoPorId: seed.empresaA.usuarios.capturista.id,
          descripcion: 'Gasto de 47 horas',
          total: new Prisma.Decimal('100.00'),
          costoUnitario: new Prisma.Decimal('100.00'),
          fecha: fecha47h,
          createdAt: fecha47h,
        },
      });
      const res = await testRequest(app)
        .post(`/api/v1/gastos/${gasto47h.id}/adjuntos`)
        .set('Authorization', `Bearer ${tokenCapturistaA}`)
        .attach('archivo', validPdfHeader, 'valido-47h.pdf');

      expect(res.status).toBe(201);
    });

    it('registro creado hace 49 horas rechaza subida a capturista (409 VENTANA_EDICION_VENCIDA)', async () => {
      const fecha49h = new Date(Date.now() - 49 * 60 * 60 * 1000);
      const gasto49h = await prisma.gasto.create({
        data: {
          cicloId: seed.empresaA.cicloActivo.id,
          categoriaId: seed.empresaA.categoriaPropia.id,
          proveedorId: seed.empresaA.proveedor.id,
          creadoPorId: seed.empresaA.usuarios.capturista.id,
          descripcion: 'Gasto de 49 horas',
          total: new Prisma.Decimal('100.00'),
          costoUnitario: new Prisma.Decimal('100.00'),
          fecha: fecha49h,
          createdAt: fecha49h,
        },
      });
      const res = await testRequest(app)
        .post(`/api/v1/gastos/${gasto49h.id}/adjuntos`)
        .set('Authorization', `Bearer ${tokenCapturistaA}`)
        .attach('archivo', validPdfHeader, 'invalido-49h.pdf');

      expect(res.status).toBe(409);
      const body = res.body as ErrorResponseBody;
      expect(body.code).toBe(CodigoError.VENTANA_EDICION_VENCIDA);
    });

    it('usuario capturista no puede adjuntar a registro creado hace más de 48h (409 VENTANA_EDICION_VENCIDA)', async () => {
      const res = await testRequest(app)
        .post(`/api/v1/gastos/${gastoVencidoId}/adjuntos`)
        .set('Authorization', `Bearer ${tokenCapturistaA}`)
        .attach('archivo', validPdfHeader, 'tarde.pdf');

      expect(res.status).toBe(409);
      const body = res.body as ErrorResponseBody;
      expect(body.code).toBe(CodigoError.VENTANA_EDICION_VENCIDA);
    });

    it('usuario administrador con registro:administrar puede saltarse la ventana de 48h (201)', async () => {
      const res = await testRequest(app)
        .post(`/api/v1/gastos/${gastoVencidoId}/adjuntos`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .attach('archivo', validPdfHeader, 'admin-tarde.pdf');

      expect(res.status).toBe(201);
      const body = res.body as AdjuntoResponseBody;
      expect(body.nombreArchivo).toBe('admin-tarde.pdf');
    });
  });

  // =========================================================================
  // 5. ESTADOS DEL CICLO Y EXCEPCIÓN DE COBROS (CicloCapturaPolicy)
  // =========================================================================
  describe('Gobernanza de estados de ciclo', () => {
    let cicloFinalizadoId: number;
    let gastoEnFinalizadoId: number;
    let cobroEnFinalizadoId: number;

    beforeAll(async () => {
      // Crear ciclo en estado FINALIZADO
      const cicloFin = await prisma.cicloProduccion.create({
        data: {
          empresaId: seed.empresaA.id,
          parcelaId: seed.empresaA.parcela.id,
          variedadId: seed.global.variedadId,
          creadoPorId: seed.empresaA.usuarios.admin.id,
          nombre: `Ciclo Finalizado ${Date.now()}`,
          fechaInicio: new Date('2026-01-01'),
          fechaFin: new Date('2026-03-01'),
          superficieSembrada: new Prisma.Decimal('10.00'),
          estado: EstadoCiclo.FINALIZADO,
        },
      });
      cicloFinalizadoId = cicloFin.id;

      // Crear gasto asociado a ese ciclo
      const gasto = await prisma.gasto.create({
        data: {
          cicloId: cicloFinalizadoId,
          categoriaId: seed.empresaA.categoriaPropia.id,
          proveedorId: seed.empresaA.proveedor.id,
          creadoPorId: seed.empresaA.usuarios.admin.id,
          descripcion: 'Gasto en ciclo finalizado',
          total: new Prisma.Decimal('300.00'),
          costoUnitario: new Prisma.Decimal('300.00'),
          fecha: new Date('2026-02-01'),
        },
      });
      gastoEnFinalizadoId = gasto.id;

      // Crear venta y cobro asociados a ese ciclo
      const venta = await prisma.venta.create({
        data: {
          cicloId: cicloFinalizadoId,
          clienteId: seed.empresaA.cliente.id,
          creadoPorId: seed.empresaA.usuarios.admin.id,
          numeroFactura: `VF-${Date.now()}`,
          total: new Prisma.Decimal('1000.00'),
          fecha: new Date('2026-02-15'),
        },
      });
      const cobro = await prisma.cobroVenta.create({
        data: {
          ventaId: venta.id,
          registradoPorId: seed.empresaA.usuarios.admin.id,
          monto: new Prisma.Decimal('500.00'),
          metodo: MetodoPago.TRANSFERENCIA,
          fecha: new Date('2026-02-20'),
        },
      });
      cobroEnFinalizadoId = cobro.id;
    });

    it('gasto en ciclo FINALIZADO rechaza adjuntos con 409 CICLO_CERRADO', async () => {
      const res = await testRequest(app)
        .post(`/api/v1/gastos/${gastoEnFinalizadoId}/adjuntos`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .attach('archivo', validPdfHeader, 'gasto-fin.pdf');

      expect(res.status).toBe(409);
      const body = res.body as ErrorResponseBody;
      expect(body.code).toBe(CodigoError.CICLO_CERRADO);
    });

    it('cobro en ciclo FINALIZADO SÍ permite adjuntos (201)', async () => {
      const res = await testRequest(app)
        .post(`/api/v1/cobros/${cobroEnFinalizadoId}/adjuntos`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .attach('archivo', validPdfHeader, 'comprobante-fin.pdf');

      expect(res.status).toBe(201);
      const body = res.body as AdjuntoResponseBody;
      expect(body.nombreArchivo).toBe('comprobante-fin.pdf');
    });

    it('gasto en ciclo CANCELADO rechaza adjuntos con 409 CICLO_CERRADO', async () => {
      const cicloCanc = await prisma.cicloProduccion.create({
        data: {
          empresaId: seed.empresaA.id,
          parcelaId: seed.empresaA.parcela.id,
          variedadId: seed.global.variedadId,
          creadoPorId: seed.empresaA.usuarios.admin.id,
          nombre: `Ciclo Cancelado ${Date.now()}`,
          fechaInicio: new Date('2026-01-01'),
          fechaFin: new Date('2026-02-01'),
          superficieSembrada: new Prisma.Decimal('5.00'),
          estado: EstadoCiclo.CANCELADO,
        },
      });
      const gastoCanc = await prisma.gasto.create({
        data: {
          cicloId: cicloCanc.id,
          categoriaId: seed.empresaA.categoriaPropia.id,
          proveedorId: seed.empresaA.proveedor.id,
          creadoPorId: seed.empresaA.usuarios.admin.id,
          descripcion: 'Gasto en cancelado',
          total: new Prisma.Decimal('200.00'),
          costoUnitario: new Prisma.Decimal('200.00'),
          fecha: new Date('2026-01-15'),
        },
      });
      const res = await testRequest(app)
        .post(`/api/v1/gastos/${gastoCanc.id}/adjuntos`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .attach('archivo', validPdfHeader, 'canc.pdf');

      expect(res.status).toBe(409);
      const body = res.body as ErrorResponseBody;
      expect(body.code).toBe(CodigoError.CICLO_CERRADO);
    });

    it('actividad en ciclo FINALIZADO rechaza adjuntos con 409 CICLO_CERRADO', async () => {
      const act = await prisma.actividad.create({
        data: {
          cicloId: cicloFinalizadoId,
          tipoActividadId: seed.global.tipoActividadId,
          responsableId: seed.empresaA.usuarios.admin.id,
          creadoPorId: seed.empresaA.usuarios.admin.id,
          fecha: new Date('2026-02-10'),
          descripcion: 'Actividad en ciclo cerrado',
        },
      });
      const res = await testRequest(app)
        .post(`/api/v1/actividades/${act.id}/adjuntos`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .attach('archivo', validPdfHeader, 'act-fin.pdf');

      expect(res.status).toBe(409);
      const body = res.body as ErrorResponseBody;
      expect(body.code).toBe(CodigoError.CICLO_CERRADO);
    });
  });

  // =========================================================================
  // 6. LÍMITE DE 10 ADJUNTOS Y CONDICIÓN DE CARRERA
  // =========================================================================
  describe('Límite de 10 adjuntos por entidad y concurrencia', () => {
    let gastoConcurrId: number;

    beforeAll(async () => {
      const cicloInfo = await crearCicloAisladoParaConcurrencia(
        prisma,
        seed.empresaA.id,
        seed.empresaA.usuarios.admin.id,
        seed.global.variedadId,
      );

      const gasto = await prisma.gasto.create({
        data: {
          cicloId: cicloInfo.cicloId,
          categoriaId: seed.empresaA.categoriaPropia.id,
          proveedorId: seed.empresaA.proveedor.id,
          creadoPorId: seed.empresaA.usuarios.admin.id,
          descripcion: 'Gasto para saturar adjuntos',
          total: new Prisma.Decimal('800.00'),
          costoUnitario: new Prisma.Decimal('800.00'),
          fecha: new Date(),
        },
      });
      gastoConcurrId = gasto.id;

      // Insertar 9 adjuntos existentes
      for (let i = 1; i <= 9; i++) {
        await prisma.adjunto.create({
          data: {
            empresaId: seed.empresaA.id,
            subidoPorId: seed.empresaA.usuarios.admin.id,
            entidad: 'gasto',
            entidadId: gastoConcurrId,
            nombreArchivo: `previo-${i}.pdf`,
            tipoMime: 'application/pdf',
            tamanoBytes: validPdfHeader.length,
            claveAlmacenamiento: `${seed.empresaA.id}/fake-uuid-${i}.pdf`,
          },
        });
      }
    });

    it('dos subidas simultáneas con 9 existentes: exactamente una tiene éxito (10) y la otra recibe 400 LIMITE_ADJUNTOS_ALCANZADO', async () => {
      const prom1 = testRequest(app)
        .post(`/api/v1/gastos/${gastoConcurrId}/adjuntos`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .attach('archivo', validPdfHeader, 'concurrente-1.pdf');

      const prom2 = testRequest(app)
        .post(`/api/v1/gastos/${gastoConcurrId}/adjuntos`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .attach('archivo', validPdfHeader, 'concurrente-2.pdf');

      const [res1, res2] = await Promise.all([prom1, prom2]);

      const statuses = [res1.status, res2.status].sort();
      expect(statuses).toEqual([201, 400]);

      const resFallo = res1.status === 400 ? res1 : res2;
      const bodyFallo = resFallo.body as ErrorResponseBody;
      expect(bodyFallo.code).toBe(CodigoError.LIMITE_ADJUNTOS_ALCANZADO);

      // El conteo final en BD debe ser exactamente 10
      const totalEnBd = await prisma.adjunto.count({
        where: {
          empresaId: seed.empresaA.id,
          entidad: 'gasto',
          entidadId: gastoConcurrId,
        },
      });
      expect(totalEnBd).toBe(10);
    });
  });

  // =========================================================================
  // 7. ENLACE DE DESCARGA TEMPORAL FIRMADO (HMAC) Y DESCARGA PÚBLICA
  // =========================================================================
  describe('Descarga con firma HMAC-SHA256 temporal', () => {
    let adjuntoTestId: number;

    beforeAll(async () => {
      const res = await testRequest(app)
        .post(`/api/v1/gastos/${seed.empresaA.gastoAdmin.id}/adjuntos`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .attach('archivo', validPdfHeader, 'descarga-segura.pdf');
      const body = res.body as AdjuntoResponseBody;
      adjuntoTestId = body.id;
    });

    it('genera enlace firmado temporal válido (200)', async () => {
      const res = await testRequest(app)
        .get(`/api/v1/adjuntos/${adjuntoTestId}/enlace-descarga`)
        .set('Authorization', `Bearer ${tokenAdminA}`);

      expect(res.status).toBe(200);
      const body = res.body as EnlaceDescargaResponseBody;
      expect(body.urlDescarga).toContain('/api/v1/adjuntos/descarga?token=');
      expect(body.token).toBeDefined();
      expect(body.expiraEn).toBeDefined();
    });

    it('descarga física exitosa con cabeceras de seguridad nosniff y no-store', async () => {
      const resToken = await testRequest(app)
        .get(`/api/v1/adjuntos/${adjuntoTestId}/enlace-descarga`)
        .set('Authorization', `Bearer ${tokenAdminA}`);
      const bodyToken = resToken.body as EnlaceDescargaResponseBody;

      const res = await testRequest(app).get(
        `/api/v1/adjuntos/descarga?token=${bodyToken.token}`,
      );

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('application/pdf');
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['cache-control']).toBe('no-store');
      expect(res.headers['content-disposition']).toContain(
        'descarga-segura.pdf',
      );
      expect(res.body).toBeDefined();
    });

    it('token adulterado devuelve 403 ENLACE_DESCARGA_INVALIDO (nunca 401)', async () => {
      const resToken = await testRequest(app)
        .get(`/api/v1/adjuntos/${adjuntoTestId}/enlace-descarga`)
        .set('Authorization', `Bearer ${tokenAdminA}`);
      const bodyToken = resToken.body as EnlaceDescargaResponseBody;

      const [payloadB64] = bodyToken.token.split('.');
      const tokenHacked = `${payloadB64}.firmaFalsaAdulterada12345`;

      const res = await testRequest(app).get(
        `/api/v1/adjuntos/descarga?token=${tokenHacked}`,
      );

      expect(res.status).toBe(403);
      const body = res.body as ErrorResponseBody;
      expect(body.code).toBe(CodigoError.ENLACE_DESCARGA_INVALIDO);
    });

    it('token vencido devuelve 403 ENLACE_DESCARGA_INVALIDO', async () => {
      // Generar token expirado inyectando reloj
      const ahora = Math.floor(Date.now() / 1000);
      tokenDescargaService.setReloj(() => ahora - 1000);
      const { token } = tokenDescargaService.generarToken(
        adjuntoTestId,
        seed.empresaA.id,
        seed.empresaA.usuarios.admin.id,
        100, // expira hace 900s
      );
      tokenDescargaService.resetReloj();

      const res = await testRequest(app).get(
        `/api/v1/adjuntos/descarga?token=${token}`,
      );

      expect(res.status).toBe(403);
      const body = res.body as ErrorResponseBody;
      expect(body.code).toBe(CodigoError.ENLACE_DESCARGA_INVALIDO);
    });
  });

  // =========================================================================
  // 8. ELIMINACIÓN Y COMPENSACIÓN DE ALMACENAMIENTO
  // =========================================================================
  describe('Eliminación física y compensación de almacenamiento', () => {
    it('elimina registro de BD y borra archivo de disco físico', async () => {
      // 1. Subir archivo
      const resSubida = await testRequest(app)
        .post(`/api/v1/gastos/${seed.empresaA.gastoAdmin.id}/adjuntos`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .attach('archivo', validPdfHeader, 'para-borrar.pdf');
      expect(resSubida.status).toBe(201);
      const bodySubida = resSubida.body as AdjuntoResponseBody;

      // 2. Verificar existencia en disco
      const adjuntoDb = await prisma.adjunto.findUniqueOrThrow({
        where: { id: bodySubida.id },
      });
      const existeEnDiscoAntes = await storageService.existe(
        adjuntoDb.claveAlmacenamiento,
      );
      expect(existeEnDiscoAntes).toBe(true);

      // 3. Eliminar mediante endpoint DELETE
      const resDelete = await testRequest(app)
        .delete(`/api/v1/adjuntos/${bodySubida.id}`)
        .set('Authorization', `Bearer ${tokenAdminA}`);

      expect(resDelete.status).toBe(200);

      // 4. Verificar que no exista en BD ni en disco
      const adjuntoPost = await prisma.adjunto.findUnique({
        where: { id: bodySubida.id },
      });
      expect(adjuntoPost).toBeNull();

      const existeEnDiscoDespues = await storageService.existe(
        adjuntoDb.claveAlmacenamiento,
      );
      expect(existeEnDiscoDespues).toBe(false);
    });
  });

  // =========================================================================
  // 9. CONDICIONES DE CARRERA, ROLLBACK ATÓMICO Y RESILIENCIA
  // =========================================================================
  describe('Condiciones de carrera, rollback atómico y resiliencia de almacenamiento', () => {
    it('carrera con el cierre de ciclo: rechaza con 409 CICLO_CERRADO sin fila en BD ni archivo en disco', async () => {
      const cicloCarrera = await crearCicloAisladoParaConcurrencia(
        prisma,
        seed.empresaA.id,
        seed.empresaA.usuarios.admin.id,
        seed.global.variedadId,
      );
      const gastoCarrera = await prisma.gasto.create({
        data: {
          cicloId: cicloCarrera.cicloId,
          categoriaId: seed.empresaA.categoriaPropia.id,
          proveedorId: seed.empresaA.proveedor.id,
          creadoPorId: seed.empresaA.usuarios.admin.id,
          descripcion: 'Gasto carrera cierre',
          total: new Prisma.Decimal('100.00'),
          costoUnitario: new Prisma.Decimal('100.00'),
          fecha: new Date(),
        },
      });

      // Ciclo cambia a FINALIZADO
      await prisma.cicloProduccion.update({
        where: { id: cicloCarrera.cicloId },
        data: { estado: EstadoCiclo.FINALIZADO },
      });

      const res = await testRequest(app)
        .post(`/api/v1/gastos/${gastoCarrera.id}/adjuntos`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .attach('archivo', validPdfHeader, 'carrera-cierre.pdf');

      expect(res.status).toBe(409);
      const body = res.body as ErrorResponseBody;
      expect(body.code).toBe(CodigoError.CICLO_CERRADO);

      // Ni fila en BD
      const fila = await prisma.adjunto.findFirst({
        where: { entidadId: gastoCarrera.id, entidad: 'gasto' },
      });
      expect(fila).toBeNull();
    });

    it('rollback de auditoría con BD real sin fila en BD ni archivo residual en disco', async () => {
      const auditService = app.get(AuditService);
      const spyAudit = jest
        .spyOn(auditService, 'registrar')
        .mockRejectedValueOnce(
          new Error('Fallo crítico simulado en auditoría transaccional'),
        );

      const res = await testRequest(app)
        .post(`/api/v1/gastos/${seed.empresaA.gastoAdmin.id}/adjuntos`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .attach('archivo', validPdfHeader, 'archivo-falla-audit.pdf');

      expect(res.status).toBe(500);

      // Verificar que no quedó fila en BD
      const fila = await prisma.adjunto.findFirst({
        where: { nombreArchivo: 'archivo-falla-audit.pdf' },
      });
      expect(fila).toBeNull();

      spyAudit.mockRestore();
    });

    it('archivo faltante en disco da 404 RECURSO_NO_ENCONTRADO y no 500', async () => {
      // Crear registro ficticio con clave huérfana
      const adjuntoFicticio = await prisma.adjunto.create({
        data: {
          empresaId: seed.empresaA.id,
          subidoPorId: seed.empresaA.usuarios.admin.id,
          entidad: 'gasto',
          entidadId: seed.empresaA.gastoAdmin.id,
          nombreArchivo: 'huerfano.pdf',
          tipoMime: 'application/pdf',
          tamanoBytes: 1234,
          claveAlmacenamiento: `${seed.empresaA.id}/00000000-0000-0000-0000-000000000000.pdf`,
        },
      });

      const resToken = await testRequest(app)
        .get(`/api/v1/adjuntos/${adjuntoFicticio.id}/enlace-descarga`)
        .set('Authorization', `Bearer ${tokenAdminA}`);
      expect(resToken.status).toBe(200);
      const { token } = resToken.body as EnlaceDescargaResponseBody;

      const resDescarga = await testRequest(app).get(
        `/api/v1/adjuntos/descarga?token=${token}`,
      );

      expect(resDescarga.status).toBe(404);
      const body = resDescarga.body as ErrorResponseBody;
      expect(body.code).toBe(CodigoError.RECURSO_NO_ENCONTRADO);
    });

    it('la bitácora de auditoría no expone la claveAlmacenamiento física', async () => {
      const resSubida = await testRequest(app)
        .post(`/api/v1/gastos/${seed.empresaA.gastoAdmin.id}/adjuntos`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .attach('archivo', validPdfHeader, 'auditoria-segura.pdf');
      expect(resSubida.status).toBe(201);
      const body = resSubida.body as AdjuntoResponseBody;

      const log = await prisma.bitacoraAuditoria.findFirst({
        where: { entidad: 'adjunto', entidadId: body.id },
      });
      expect(log).toBeDefined();
      const snapshot = JSON.stringify(log?.valoresNuevos || {});
      expect(snapshot).not.toContain('claveAlmacenamiento');
    });

    it('lecturas de listar adjuntos y generar enlace no alteran bitacoraAuditoria', async () => {
      const countAntes = await prisma.bitacoraAuditoria.count({
        where: { empresaId: seed.empresaA.id },
      });

      await testRequest(app)
        .get(`/api/v1/gastos/${seed.empresaA.gastoAdmin.id}/adjuntos`)
        .set('Authorization', `Bearer ${tokenAdminA}`);

      const countDespues = await prisma.bitacoraAuditoria.count({
        where: { empresaId: seed.empresaA.id },
      });
      expect(countDespues).toBe(countAntes);
    });
  });
});
