import { INestApplication } from '@nestjs/common';
import { Workbook } from 'exceljs';
import { createTestApp } from '../setup/create-test-app';
import { testRequest } from '../setup/http.util';
import { PrismaService } from '../../src/prisma/prisma.service';
import {
  getOrLoadSeedData,
  crearCicloAisladoParaConcurrencia,
  E2eSeedData,
} from '../setup/e2e-seed';
import { generateTestJwt } from '../setup/test-tokens.util';
import { CodigoError } from '../../src/common/errors/codigos-error.enum';
import {
  EstadoCiclo,
  EstadoVenta,
  EtapaMerma,
  CalidadCosecha,
  MetodoPago,
  Prisma,
} from '@prisma/client';

describe('Módulo de Exportación de Reportes (E2E) - Hito 10B', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let seed: E2eSeedData;

  let tokenAdminA: string;
  let tokenContadorA: string;
  let tokenCapturistaA: string;
  let tokenAdminB: string;

  let cicloCanvasId: number;
  let cicloBId: number;
  let parcelaAId: number;
  let cicloB2Id: number; // Para comparativo

  const binaryParser = (
    res: {
      setEncoding: (encoding: string) => void;
      on: (event: string, callback: (chunk?: string) => void) => void;
    },
    callback: (err: null, buf: Buffer) => void,
  ) => {
    res.setEncoding('binary');
    let data = '';
    res.on('data', (chunk?: string) => {
      if (chunk) {
        data += chunk;
      }
    });
    res.on('end', () => {
      callback(null, Buffer.from(data, 'binary'));
    });
  };

  beforeAll(async () => {
    const testApp = await createTestApp();
    app = testApp.app;
    prisma = testApp.prisma;
    seed = await getOrLoadSeedData(prisma);

    tokenAdminA = generateTestJwt(
      seed.empresaA.usuarios.admin.id,
      seed.empresaA.id,
      'ADMIN',
    );
    tokenContadorA = generateTestJwt(
      seed.empresaA.usuarios.contador.id,
      seed.empresaA.id,
      'CONTADOR',
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

    // =========================================================================
    // SEED DE DATOS ANEXO D PARA EXPORTACIÓN
    // =========================================================================

    // 1. CICLO CANVAS (Costo 86,000 / Ingresos 121,000 / Ganancia 35,000)
    const dedCanvas = await crearCicloAisladoParaConcurrencia(
      prisma,
      seed.empresaA.id,
      seed.empresaA.usuarios.admin.id,
      seed.global.variedadId,
      2.5,
    );
    cicloCanvasId = dedCanvas.cicloId;
    parcelaAId = dedCanvas.parcelaId;

    await prisma.cicloProduccion.update({
      where: { id: cicloCanvasId },
      data: {
        nombre: 'Ciclo Canvas Piloto',
        estado: EstadoCiclo.FINALIZADO,
        fechaInicio: new Date('2026-01-15T00:00:00.000Z'),
        fechaFin: new Date('2026-06-30T00:00:00.000Z'),
      },
    });

    await prisma.gasto.create({
      data: {
        cicloId: cicloCanvasId,
        categoriaId: seed.global.categoriaSistemaId,
        proveedorId: seed.empresaA.proveedor.id,
        creadoPorId: seed.empresaA.usuarios.admin.id,
        fecha: new Date('2026-02-01'),
        descripcion: 'Costos totales Canvas Anexo D',
        cantidad: new Prisma.Decimal('1.000'),
        costoUnitario: new Prisma.Decimal('86000.00'),
        impuesto: new Prisma.Decimal('0.00'),
        total: new Prisma.Decimal('86000.00'),
      },
    });

    const cosechaCanvas = await prisma.cosecha.create({
      data: {
        cicloId: cicloCanvasId,
        unidadId: seed.global.unidadKgId,
        creadoPorId: seed.empresaA.usuarios.admin.id,
        fecha: new Date('2026-04-01'),
        cantidad: new Prisma.Decimal('8200.000'),
        calidad: CalidadCosecha.PRIMERA,
      },
    });

    const ventaCanvas = await prisma.venta.create({
      data: {
        cicloId: cicloCanvasId,
        clienteId: seed.empresaA.cliente.id,
        creadoPorId: seed.empresaA.usuarios.admin.id,
        fecha: new Date('2026-05-01'),
        impuesto: new Prisma.Decimal('0.00'),
        total: new Prisma.Decimal('121000.00'),
        estado: EstadoVenta.REGISTRADA,
        numeroFactura: 'FAC-CANVAS-01',
      },
    });

    await prisma.detalleVenta.create({
      data: {
        ventaId: ventaCanvas.id,
        cosechaId: cosechaCanvas.id,
        unidadId: seed.global.unidadKgId,
        calidad: CalidadCosecha.PRIMERA,
        cantidad: new Prisma.Decimal('8200.000'),
        precioUnitario: new Prisma.Decimal('14.756097'),
      },
    });

    // 2. CICLO B (Con IVA, mermas poscosecha y campo, venta cancelada, cobro parcial)
    const dedB = await crearCicloAisladoParaConcurrencia(
      prisma,
      seed.empresaA.id,
      seed.empresaA.usuarios.admin.id,
      seed.global.variedadId,
      1.0,
    );
    cicloBId = dedB.cicloId;

    await prisma.cicloProduccion.update({
      where: { id: cicloBId },
      data: {
        nombre: 'Ciclo B Escenario Completo',
        estado: EstadoCiclo.FINALIZADO,
        fechaInicio: new Date('2026-02-01T00:00:00.000Z'),
        fechaFin: new Date('2026-07-01T00:00:00.000Z'),
      },
    });

    await prisma.gasto.create({
      data: {
        cicloId: cicloBId,
        categoriaId: seed.global.categoriaSistemaId,
        proveedorId: seed.empresaA.proveedor.id,
        creadoPorId: seed.empresaA.usuarios.admin.id,
        fecha: new Date('2026-02-10'),
        descripcion: 'Gasto operativo Ciclo B',
        cantidad: new Prisma.Decimal('1.000'),
        costoUnitario: new Prisma.Decimal('10000.00'),
        impuesto: new Prisma.Decimal('0.00'),
        total: new Prisma.Decimal('10000.00'),
      },
    });

    const cosechaB1 = await prisma.cosecha.create({
      data: {
        cicloId: cicloBId,
        unidadId: seed.global.unidadKgId,
        creadoPorId: seed.empresaA.usuarios.admin.id,
        fecha: new Date('2026-03-01'),
        cantidad: new Prisma.Decimal('1000.000'),
        calidad: CalidadCosecha.PRIMERA,
      },
    });

    await prisma.merma.create({
      data: {
        cicloId: cicloBId,
        unidadId: seed.global.unidadKgId,
        motivoId: seed.global.motivoMermaId,
        creadoPorId: seed.empresaA.usuarios.admin.id,
        fecha: new Date('2026-03-02'),
        cantidad: new Prisma.Decimal('50.000'),
        etapa: EtapaMerma.POSCOSECHA,
      },
    });

    await prisma.merma.create({
      data: {
        cicloId: cicloBId,
        unidadId: seed.global.unidadKgId,
        motivoId: seed.global.motivoMermaId,
        creadoPorId: seed.empresaA.usuarios.admin.id,
        fecha: new Date('2026-02-28'),
        cantidad: new Prisma.Decimal('300.000'),
        etapa: EtapaMerma.CAMPO,
      },
    });

    const ventaB1 = await prisma.venta.create({
      data: {
        cicloId: cicloBId,
        clienteId: seed.empresaA.cliente.id,
        creadoPorId: seed.empresaA.usuarios.admin.id,
        fecha: new Date('2026-03-20'),
        impuesto: new Prisma.Decimal('2000.00'),
        total: new Prisma.Decimal('14000.00'),
        estado: EstadoVenta.REGISTRADA,
        numeroFactura: 'FAC-B-01',
      },
    });

    await prisma.detalleVenta.create({
      data: {
        ventaId: ventaB1.id,
        cosechaId: cosechaB1.id,
        unidadId: seed.global.unidadKgId,
        calidad: CalidadCosecha.PRIMERA,
        cantidad: new Prisma.Decimal('600.000'),
        precioUnitario: new Prisma.Decimal('20.00'),
      },
    });

    await prisma.cobroVenta.create({
      data: {
        ventaId: ventaB1.id,
        registradoPorId: seed.empresaA.usuarios.admin.id,
        fecha: new Date('2026-03-25'),
        monto: new Prisma.Decimal('8000.00'),
        metodo: MetodoPago.TRANSFERENCIA,
      },
    });

    // 3. SEGUNDO CICLO EN PARCELA A (Para comparativo de parcelas)
    cicloB2Id = (
      await prisma.cicloProduccion.create({
        data: {
          empresaId: seed.empresaA.id,
          parcelaId: parcelaAId,
          variedadId: seed.global.variedadId,
          creadoPorId: seed.empresaA.usuarios.admin.id,
          nombre: 'Ciclo Canvas Secundario Comparativo',
          estado: EstadoCiclo.FINALIZADO,
          fechaInicio: new Date('2026-07-01T00:00:00.000Z'),
          fechaFin: new Date('2026-11-01T00:00:00.000Z'),
          superficieSembrada: new Prisma.Decimal('2.50'),
        },
      })
    ).id;

    await prisma.gasto.create({
      data: {
        cicloId: cicloB2Id,
        categoriaId: seed.global.categoriaSistemaId,
        proveedorId: seed.empresaA.proveedor.id,
        creadoPorId: seed.empresaA.usuarios.admin.id,
        fecha: new Date('2026-08-01'),
        descripcion: 'Gasto ciclo comparativo',
        cantidad: new Prisma.Decimal('1.000'),
        costoUnitario: new Prisma.Decimal('40000.00'),
        impuesto: new Prisma.Decimal('0.00'),
        total: new Prisma.Decimal('40000.00'),
      },
    });

    // 4. CLIENTE CON CARÁCTER DE FÓRMULA (Para prueba de saneamiento de fórmulas)
    const clienteFormula = await prisma.cliente.create({
      data: {
        empresaId: seed.empresaA.id,
        nombre: '=HYPERLINK("http://evil.site","ClickMe")',
        rfc: 'MAL123456789',
        telefono: '5551234567',
        correo: 'formula@evil.com',
        activo: true,
      },
    });

    await prisma.venta.create({
      data: {
        cicloId: cicloB2Id,
        clienteId: clienteFormula.id,
        creadoPorId: seed.empresaA.usuarios.admin.id,
        fecha: new Date('2026-05-10'),
        impuesto: new Prisma.Decimal('0.00'),
        total: new Prisma.Decimal('500.00'),
        estado: EstadoVenta.REGISTRADA,
        numeroFactura: '=CMD_INJECTION',
      },
    });
  });

  afterAll(async () => {
    delete process.env.EXPORTACION_MAX_FILAS;
    await app.close();
  });

  // =========================================================================
  // 1. RBAC (Matriz de Permisos: reporte:exportar)
  // =========================================================================
  describe('Control de acceso basado en roles (RBAC)', () => {
    const rutas = [
      '/api/v1/reportes/exportaciones/rentabilidad?formato=xlsx',
      () =>
        `/api/v1/reportes/exportaciones/ciclos/${cicloCanvasId}?formato=xlsx`,
      () =>
        `/api/v1/reportes/exportaciones/parcelas/${parcelaAId}/comparativo?formato=xlsx`,
      '/api/v1/reportes/exportaciones/cuentas-por-cobrar?formato=xlsx',
    ];

    it('CAPTURISTA sin reporte:exportar recibe 403 PERMISO_DENEGADO en las 4 rutas', async () => {
      for (const ruta of rutas) {
        const url = typeof ruta === 'function' ? ruta() : ruta;
        const res = await testRequest(app)
          .get(url)
          .set('Authorization', `Bearer ${tokenCapturistaA}`);

        expect(res.status).toBe(403);
        const body = res.body as { code?: string };
        expect(body.code).toBe(CodigoError.PERMISO_DENEGADO);
      }
    });

    it('CONTADOR con reporte:exportar recibe 200 en las 4 rutas', async () => {
      for (const ruta of rutas) {
        const url = typeof ruta === 'function' ? ruta() : ruta;
        const res = await testRequest(app)
          .get(url)
          .set('Authorization', `Bearer ${tokenContadorA}`);

        expect(res.status).toBe(200);
      }
    });

    it('ADMIN recibe 200 en las 4 rutas', async () => {
      for (const ruta of rutas) {
        const url = typeof ruta === 'function' ? ruta() : ruta;
        const res = await testRequest(app)
          .get(url)
          .set('Authorization', `Bearer ${tokenAdminA}`);

        expect(res.status).toBe(200);
      }
    });
  });

  // =========================================================================
  // 2. AISLAMIENTO MULTI-TENANT ESTRICTO
  // =========================================================================
  describe('Aislamiento Multi-tenant estricto', () => {
    it('Empresa B recibe 404 al intentar exportar ciclo de Empresa A', async () => {
      const res = await testRequest(app)
        .get(
          `/api/v1/reportes/exportaciones/ciclos/${cicloCanvasId}?formato=xlsx`,
        )
        .set('Authorization', `Bearer ${tokenAdminB}`);

      expect(res.status).toBe(404);
      const body = res.body as { code?: string };
      expect(body.code).toBe(CodigoError.RECURSO_NO_ENCONTRADO);
    });

    it('Empresa B recibe 404 al intentar exportar comparativo de parcela de Empresa A', async () => {
      const res = await testRequest(app)
        .get(
          `/api/v1/reportes/exportaciones/parcelas/${parcelaAId}/comparativo?formato=xlsx`,
        )
        .set('Authorization', `Bearer ${tokenAdminB}`);

      expect(res.status).toBe(404);
      const body = res.body as { code?: string };
      expect(body.code).toBe(CodigoError.RECURSO_NO_ENCONTRADO);
    });

    it('Listado de rentabilidad exportado de Empresa B no contiene datos ni nombres de ciclos de Empresa A', async () => {
      const res = await testRequest(app)
        .get('/api/v1/reportes/exportaciones/rentabilidad?formato=csv')
        .set('Authorization', `Bearer ${tokenAdminB}`);

      expect(res.status).toBe(200);
      const csvStr = res.text;
      expect(csvStr).not.toContain('Ciclo Canvas Piloto');
      expect(csvStr).not.toContain('Ciclo B Escenario Completo');
    });
  });

  // =========================================================================
  // 3. CIFRAS DEL ANEXO D LEÍDAS DESDE EL .XLSX (EXCELJS)
  // =========================================================================
  describe('Cifras del Anexo D verificadas desde el archivo .xlsx', () => {
    it('Ciclo Canvas: verifica cifras del Anexo D con tipos numéricos en Excel', async () => {
      const res = await testRequest(app)
        .get(
          `/api/v1/reportes/exportaciones/ciclos/${cicloCanvasId}?formato=xlsx`,
        )
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .buffer(true)
        .parse(binaryParser);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain(
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );

      const wb = new Workbook();
      await wb.xlsx.load(res.body as Buffer);
      const sheet = wb.getWorksheet('Rentabilidad');
      expect(sheet).toBeDefined();

      const filaCanvas = sheet!.getRow(2);
      expect(filaCanvas.getCell(1).value).toBe(cicloCanvasId);
      expect(filaCanvas.getCell(11).value).toBe(86000); // costoTotal
      expect(filaCanvas.getCell(18).value).toBe(121000); // ingresos
      expect(filaCanvas.getCell(21).value).toBe(35000); // ganancia
      expect(filaCanvas.getCell(22).value).toBe(28.93); // margenPct
      expect(filaCanvas.getCell(23).value).toBe(40.7); // roiPct
      expect(filaCanvas.getCell(24).value).toBe(10.49); // costoPorKg
      expect(filaCanvas.getCell(25).value).toBe(14.76); // precioPromedioKg
    });

    it('Ciclo B: verifica balance de masa y cifras complejas en Excel', async () => {
      const res = await testRequest(app)
        .get(`/api/v1/reportes/exportaciones/ciclos/${cicloBId}?formato=xlsx`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .buffer(true)
        .parse(binaryParser);

      expect(res.status).toBe(200);

      const wb = new Workbook();
      await wb.xlsx.load(res.body as Buffer);
      const sheet = wb.getWorksheet('Rentabilidad')!;

      const filaB = sheet.getRow(2);
      expect(filaB.getCell(11).value).toBe(10000); // costoTotal
      expect(filaB.getCell(13).value).toBe(50); // kgMermaPoscosecha
      expect(filaB.getCell(14).value).toBe(300); // kgMermaCampo
      expect(filaB.getCell(15).value).toBe(950); // kgNetos
      expect(filaB.getCell(16).value).toBe(600); // kgVendidos
      expect(filaB.getCell(17).value).toBe(350); // kgDisponibles
      expect(filaB.getCell(18).value).toBe(12000); // ingresos
      expect(filaB.getCell(19).value).toBe(14000); // totalFacturado
      expect(filaB.getCell(20).value).toBe(8000); // cobrado
      expect(filaB.getCell(21).value).toBe(2000); // ganancia
      expect(filaB.getCell(22).value).toBe(16.67); // margenPct
      expect(filaB.getCell(23).value).toBe(20); // roiPct
      expect(filaB.getCell(24).value).toBe(10.53); // costoPorKg
      expect(filaB.getCell(25).value).toBe(20); // precioPromedioKg
      expect(filaB.getCell(26).value).toBe(5); // mermaPct
      expect(filaB.getCell(29).value).toBe(6000); // porCobrar
    });
  });

  // =========================================================================
  // 4. PARIDAD Y CIFRAS EN FORMATO CSV
  // =========================================================================
  describe('Exportación CSV', () => {
    it('Ciclo Canvas en CSV contiene BOM UTF-8 y las mismas cifras exactas', async () => {
      const res = await testRequest(app)
        .get(
          `/api/v1/reportes/exportaciones/ciclos/${cicloCanvasId}?formato=csv`,
        )
        .set('Authorization', `Bearer ${tokenAdminA}`);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/csv');
      const csvStr = res.text;

      // Inicia con BOM UTF-8
      expect(csvStr.charCodeAt(0)).toBe(0xfeff);

      // Cifras esperadas
      expect(csvStr).toContain('86000.00');
      expect(csvStr).toContain('121000.00');
      expect(csvStr).toContain('35000.00');
      expect(csvStr).toContain('28.93');
      expect(csvStr).toContain('40.70');
      expect(csvStr).toContain('10.49');
      expect(csvStr).toContain('14.76');
    });

    it('Ciclo B en CSV contiene las cifras del Anexo D', async () => {
      const res = await testRequest(app)
        .get(`/api/v1/reportes/exportaciones/ciclos/${cicloBId}?formato=csv`)
        .set('Authorization', `Bearer ${tokenAdminA}`);

      expect(res.status).toBe(200);
      const csvStr = res.text;

      expect(csvStr).toContain('10000.00');
      expect(csvStr).toContain('50.000');
      expect(csvStr).toContain('300.000');
      expect(csvStr).toContain('950.000');
      expect(csvStr).toContain('600.000');
      expect(csvStr).toContain('350.000');
      expect(csvStr).toContain('12000.00');
      expect(csvStr).toContain('14000.00');
      expect(csvStr).toContain('8000.00');
      expect(csvStr).toContain('2000.00');
      expect(csvStr).toContain('16.67');
      expect(csvStr).toContain('20.00');
      expect(csvStr).toContain('10.53');
      expect(csvStr).toContain('20.00');
      expect(csvStr).toContain('5.00');
      expect(csvStr).toContain('6000.00');
    });
  });

  // =========================================================================
  // 5. VALIDACIÓN DE DOCUMENTO PDF
  // =========================================================================
  describe('Exportación PDF', () => {
    it('debe generar un archivo con Content-Type application/pdf, firma %PDF y tamaño > 0', async () => {
      const res = await testRequest(app)
        .get(
          `/api/v1/reportes/exportaciones/ciclos/${cicloCanvasId}?formato=pdf`,
        )
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .buffer(true)
        .parse(binaryParser);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('application/pdf');

      const buf = res.body as Buffer;
      expect(buf.length).toBeGreaterThan(0);
      expect(buf.subarray(0, 4).toString('utf-8')).toBe('%PDF');
    });
  });

  // =========================================================================
  // 6. LÍMITE DE FILAS (400 EXPORTACION_EXCEDE_LIMITE)
  // =========================================================================
  describe('Protección contra sobrecarga (Límite de filas)', () => {
    it('debe rechazar con 400 EXPORTACION_EXCEDE_LIMITE si el total excede el límite configurado', async () => {
      // Reducimos temporalmente el límite mediante variable de entorno a 1 fila
      process.env.EXPORTACION_MAX_FILAS = '1';

      const res = await testRequest(app)
        .get('/api/v1/reportes/exportaciones/rentabilidad?formato=xlsx')
        .set('Authorization', `Bearer ${tokenAdminA}`);

      expect(res.status).toBe(400);
      const body = res.body as { code?: string; message?: string };
      expect(body.code).toBe(CodigoError.EXPORTACION_EXCEDE_LIMITE);
      expect(body.message).toContain('límite máximo permitido');

      // Restauramos el límite original
      delete process.env.EXPORTACION_MAX_FILAS;
    });
  });

  // =========================================================================
  // 7. INYECCIÓN DE FÓRMULAS NEUTRALIZADA
  // =========================================================================
  describe('Seguridad contra Formula Injection (CSV / Excel Injection)', () => {
    it('debe escapar nombres humanos maliciosos con comilla simple sin alterar importes negativos ni numéricos', async () => {
      const res = await testRequest(app)
        .get('/api/v1/reportes/exportaciones/cuentas-por-cobrar?formato=csv')
        .set('Authorization', `Bearer ${tokenAdminA}`);

      expect(res.status).toBe(200);
      const csvStr = res.text;

      // El nombre del cliente malicioso debe estar precedido por una comilla simple (')
      expect(csvStr).toContain("'=HYPERLINK");
      // El número de factura malicioso debe estar precedido por una comilla simple (')
      expect(csvStr).toContain("'=CMD_INJECTION");
    });
  });

  // =========================================================================
  // 8. CABECERAS DE SEGURIDAD Y DESCARGA
  // =========================================================================
  describe('Cabeceras HTTP de descarga y seguridad', () => {
    it('debe incluir Content-Disposition attachment, nosniff y no-store', async () => {
      const res = await testRequest(app)
        .get('/api/v1/reportes/exportaciones/rentabilidad?formato=csv')
        .set('Authorization', `Bearer ${tokenAdminA}`);

      expect(res.status).toBe(200);
      expect(res.headers['content-disposition']).toMatch(
        /^attachment; filename="rentabilidad_\d{8}\.csv"$/,
      );
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['cache-control']).toBe('no-store');
    });
  });

  // =========================================================================
  // 9. LECTURAS SIN EFECTOS SECUNDARIOS (SIN AUDITORÍA DE ESCRITURA RN-036)
  // =========================================================================
  describe('Lecturas sin efectos (RN-036)', () => {
    it('el conteo de bitacoraAuditoria permanece inalterado tras llamar a los endpoints de exportación', async () => {
      const conteoInicial = await prisma.bitacoraAuditoria.count();

      await testRequest(app)
        .get('/api/v1/reportes/exportaciones/rentabilidad?formato=xlsx')
        .set('Authorization', `Bearer ${tokenAdminA}`);

      await testRequest(app)
        .get(
          `/api/v1/reportes/exportaciones/ciclos/${cicloCanvasId}?formato=pdf`,
        )
        .set('Authorization', `Bearer ${tokenAdminA}`);

      await testRequest(app)
        .get(
          `/api/v1/reportes/exportaciones/parcelas/${parcelaAId}/comparativo?formato=csv`,
        )
        .set('Authorization', `Bearer ${tokenAdminA}`);

      await testRequest(app)
        .get('/api/v1/reportes/exportaciones/cuentas-por-cobrar?formato=xlsx')
        .set('Authorization', `Bearer ${tokenAdminA}`);

      const conteoFinal = await prisma.bitacoraAuditoria.count();
      expect(conteoFinal).toBe(conteoInicial);
    });
  });
});
