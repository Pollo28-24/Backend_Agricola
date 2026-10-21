import { INestApplication } from '@nestjs/common';
import { createTestApp } from '../setup/create-test-app';
import { testRequest } from '../setup/http.util';
import { PrismaService } from '../../src/prisma/prisma.service';
import {
  getOrLoadSeedData,
  crearCicloAisladoParaConcurrencia,
  E2eSeedData,
} from '../setup/e2e-seed';
import { generateTestJwt } from '../setup/test-tokens.util';
import { AuditService } from '../../src/prisma/audit.service';
import { CalidadCosecha, Prisma } from '@prisma/client';

describe('C7: Transaccionalidad Real y Rollback de Auditoría (E2E)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let auditService: AuditService;
  let seed: E2eSeedData;
  let adminToken: string;

  beforeAll(async () => {
    const testApp = await createTestApp();
    app = testApp.app;
    prisma = testApp.prisma;
    auditService = app.get<AuditService>(AuditService);
    seed = await getOrLoadSeedData(prisma);
    adminToken = `Bearer ${generateTestJwt(
      seed.empresaA.usuarios.admin.id,
      seed.empresaA.id,
      'ADMIN',
    )}`;
  });

  afterAll(async () => {
    jest.restoreAllMocks();
    await app.close();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('1. Rollback completo ante fallo intencional de AuditService.registrar', () => {
    it('(a) POST /api/v1/gastos: si auditoría falla, el gasto no se crea y no hay bitácora', async () => {
      const uniqueDescripcion = `Gasto Rollback Test ${Date.now()}`;

      // Espiar AuditService para forzar un fallo dentro de la transacción interactiva
      jest.spyOn(auditService, 'registrar').mockImplementationOnce(() => {
        return Promise.reject(
          new Error('FALLO_CRITICO_FORZADO_AUDITORIA_GASTO'),
        );
      });

      const res = await testRequest(app)
        .post('/api/v1/gastos')
        .set('Authorization', adminToken)
        .send({
          cicloId: seed.empresaA.cicloActivo.id,
          categoriaId: seed.empresaA.categoriaPropia.id,
          fecha: '2026-03-01',
          total: '300',
          descripcion: uniqueDescripcion,
        });

      // Debe responder con error HTTP >= 500
      expect(res.status).toBeGreaterThanOrEqual(500);

      // Verificar en BD MySQL real que el gasto NUNCA se persistió
      const gastoEnDb = await prisma.gasto.findFirst({
        where: { descripcion: uniqueDescripcion },
      });
      expect(gastoEnDb).toBeNull();

      // Verificar que tampoco se escribió la bitácora
      const bitacoras = await prisma.bitacoraAuditoria.findMany({
        where: {
          empresaId: seed.empresaA.id,
          entidad: 'Gasto',
        },
      });
      expect(
        bitacoras.some((b) =>
          JSON.stringify(b.valoresNuevos).includes(uniqueDescripcion),
        ),
      ).toBe(false);
    });

    it('(b) POST /api/v1/cosechas: si auditoría falla, la cosecha no se crea y no hay bitácora', async () => {
      const testObservaciones = `Cosecha Rollback Test ${Date.now()}`;

      jest.spyOn(auditService, 'registrar').mockImplementationOnce(() => {
        return Promise.reject(
          new Error('FALLO_CRITICO_FORZADO_AUDITORIA_COSECHA'),
        );
      });

      const res = await testRequest(app)
        .post('/api/v1/cosechas')
        .set('Authorization', adminToken)
        .send({
          cicloId: seed.empresaA.cicloActivo.id,
          unidadId: seed.global.unidadKgId,
          fecha: '2026-03-05',
          cantidad: '45',
          calidad: 'PRIMERA',
          observaciones: testObservaciones,
        });

      expect(res.status).toBeGreaterThanOrEqual(500);

      const cosechaEnDb = await prisma.cosecha.findFirst({
        where: { observaciones: testObservaciones },
      });
      expect(cosechaEnDb).toBeNull();

      const bitacoras = await prisma.bitacoraAuditoria.findMany({
        where: {
          empresaId: seed.empresaA.id,
          entidad: 'Cosecha',
        },
      });
      expect(
        bitacoras.some((b) =>
          JSON.stringify(b.valoresNuevos).includes(testObservaciones),
        ),
      ).toBe(false);
    });

    it('(c) POST /api/v1/mermas: si auditoría falla, la merma no se crea y no hay bitácora', async () => {
      const testObservaciones = `Merma Rollback Test ${Date.now()}`;

      jest.spyOn(auditService, 'registrar').mockImplementationOnce(() => {
        return Promise.reject(
          new Error('FALLO_CRITICO_FORZADO_AUDITORIA_MERMA'),
        );
      });

      const res = await testRequest(app)
        .post('/api/v1/mermas')
        .set('Authorization', adminToken)
        .send({
          cicloId: seed.empresaA.cicloActivo.id,
          unidadId: seed.global.unidadKgId,
          motivoId: seed.global.motivoMermaId,
          fecha: '2026-03-05',
          cantidad: '15',
          etapa: 'CAMPO',
          observaciones: testObservaciones,
        });

      expect(res.status).toBeGreaterThanOrEqual(500);

      const mermaEnDb = await prisma.merma.findFirst({
        where: { observaciones: testObservaciones },
      });
      expect(mermaEnDb).toBeNull();

      const bitacoras = await prisma.bitacoraAuditoria.findMany({
        where: {
          empresaId: seed.empresaA.id,
          entidad: 'Merma',
        },
      });
      expect(
        bitacoras.some((b) =>
          JSON.stringify(b.valoresNuevos).includes(testObservaciones),
        ),
      ).toBe(false);
    });

    it('(d) PATCH /api/v1/gastos/:id: si auditoría falla, los cambios se revierten en BD', async () => {
      // Crear un gasto previo directamente en BD con unidadId (RN-024)
      const gastoOriginal = await prisma.gasto.create({
        data: {
          cicloId: seed.empresaA.cicloActivo.id,
          categoriaId: seed.empresaA.categoriaPropia.id,
          unidadId: seed.global.unidadKgId,
          creadoPorId: seed.empresaA.usuarios.admin.id,
          descripcion: 'Gasto Original Antes De Patch',
          fecha: new Date('2026-02-15'),
          costoUnitario: new Prisma.Decimal('100.00'),
          cantidad: new Prisma.Decimal('1.000'),
          impuesto: new Prisma.Decimal('0.00'),
          total: new Prisma.Decimal('100.00'),
        },
      });

      jest.spyOn(auditService, 'registrar').mockImplementationOnce(() => {
        return Promise.reject(
          new Error('FALLO_CRITICO_FORZADO_AUDITORIA_PATCH_GASTO'),
        );
      });

      const res = await testRequest(app)
        .patch(`/api/v1/gastos/${gastoOriginal.id}`)
        .set('Authorization', adminToken)
        .send({
          descripcion: 'Gasto Intentado Modificar Con Fallo',
        });

      expect(res.status).toBeGreaterThanOrEqual(500);

      // Releer el gasto en BD: debe conservar exactamente los valores originales
      const gastoReleido = await prisma.gasto.findUnique({
        where: { id: gastoOriginal.id },
      });
      expect(gastoReleido?.descripcion).toBe('Gasto Original Antes De Patch');
      expect(Number(gastoReleido?.total)).toBe(100.0);
    });

    it('(e) DELETE /api/v1/cosechas/:id: si auditoría falla, la cosecha no se elimina', async () => {
      // Crear una cosecha previa directamente en BD
      const cosechaOriginal = await prisma.cosecha.create({
        data: {
          cicloId: seed.empresaA.cicloActivo.id,
          unidadId: seed.global.unidadKgId,
          creadoPorId: seed.empresaA.usuarios.admin.id,
          fecha: new Date('2026-02-20'),
          cantidad: new Prisma.Decimal('50.000'),
          calidad: 'PRIMERA',
          observaciones: 'Cosecha Para Test Delete Rollback',
        },
      });

      jest.spyOn(auditService, 'registrar').mockImplementationOnce(() => {
        return Promise.reject(
          new Error('FALLO_CRITICO_FORZADO_AUDITORIA_DELETE_COSECHA'),
        );
      });

      const res = await testRequest(app)
        .delete(`/api/v1/cosechas/${cosechaOriginal.id}`)
        .set('Authorization', adminToken);

      expect(res.status).toBeGreaterThanOrEqual(500);

      // Releer la cosecha en BD: NO debe tener deletedAt (sigue activa)
      const cosechaReleida = await prisma.cosecha.findUnique({
        where: { id: cosechaOriginal.id },
      });
      expect(cosechaReleida).not.toBeNull();
      expect(cosechaReleida?.deletedAt).toBeNull();
    });

    it('(f) POST /api/v1/ventas: si auditoría falla, no queda venta ni renglones y no hay bitácora', async () => {
      const cicloDed = await crearCicloAisladoParaConcurrencia(
        prisma,
        seed.empresaA.id,
        seed.empresaA.usuarios.admin.id,
        seed.global.variedadId,
      );

      // Cosecha previa de 200 kg para permitir la venta
      await prisma.cosecha.create({
        data: {
          cicloId: cicloDed.cicloId,
          unidadId: seed.global.unidadKgId,
          creadoPorId: seed.empresaA.usuarios.admin.id,
          fecha: new Date('2026-02-01'),
          cantidad: new Prisma.Decimal('200.000'),
          calidad: CalidadCosecha.PRIMERA,
        },
      });

      jest.spyOn(auditService, 'registrar').mockImplementationOnce(() => {
        return Promise.reject(
          new Error('FALLO_CRITICO_FORZADO_AUDITORIA_POST_VENTA'),
        );
      });

      const testNotas = `Venta Rollback Test ${Date.now()}`;

      const res = await testRequest(app)
        .post('/api/v1/ventas')
        .set('Authorization', adminToken)
        .send({
          cicloId: cicloDed.cicloId,
          clienteId: seed.empresaA.cliente.id,
          fecha: '2026-03-01',
          total: '500.00',
          notas: testNotas,
          renglones: [
            {
              unidadId: seed.global.unidadKgId,
              calidad: CalidadCosecha.PRIMERA,
              cantidad: '20.000',
              precioUnitario: '25.00',
            },
          ],
        });

      expect(res.status).toBeGreaterThanOrEqual(500);

      // Verificar que NUNCA se persistió la venta en BD
      const ventaEnDb = await prisma.venta.findFirst({
        where: { cicloId: cicloDed.cicloId },
      });
      expect(ventaEnDb).toBeNull();

      // Verificar que tampoco quedaron renglones huérfanos
      const renglonesEnDb = await prisma.detalleVenta.findMany({
        where: {
          venta: { cicloId: cicloDed.cicloId },
        },
      });
      expect(renglonesEnDb.length).toBe(0);

      // Verificar que no hay bitácora de la venta
      const bitacoras = await prisma.bitacoraAuditoria.findMany({
        where: {
          empresaId: seed.empresaA.id,
          entidad: 'Venta',
        },
      });
      expect(
        bitacoras.some((b) =>
          JSON.stringify(b.valoresNuevos).includes(testNotas),
        ),
      ).toBe(false);
    });

    it('(g) PATCH /api/v1/ventas/:id con reemplazo de renglones: si auditoría falla, quedan renglones originales intactos y cabecera sin cambios', async () => {
      const cicloDed = await crearCicloAisladoParaConcurrencia(
        prisma,
        seed.empresaA.id,
        seed.empresaA.usuarios.admin.id,
        seed.global.variedadId,
      );

      await prisma.cosecha.create({
        data: {
          cicloId: cicloDed.cicloId,
          unidadId: seed.global.unidadKgId,
          creadoPorId: seed.empresaA.usuarios.admin.id,
          fecha: new Date('2026-02-01'),
          cantidad: new Prisma.Decimal('300.000'),
          calidad: CalidadCosecha.PRIMERA,
        },
      });

      // Crear venta original directamente
      const ventaOriginal = await prisma.venta.create({
        data: {
          cicloId: cicloDed.cicloId,
          clienteId: seed.empresaA.cliente.id,
          creadoPorId: seed.empresaA.usuarios.admin.id,
          fecha: new Date('2026-03-01'),
          total: new Prisma.Decimal('1000.00'),
          estado: 'REGISTRADA',
          detalles: {
            create: [
              {
                unidadId: seed.global.unidadKgId,
                calidad: CalidadCosecha.PRIMERA,
                cantidad: new Prisma.Decimal('50.000'),
                precioUnitario: new Prisma.Decimal('20.00'),
              },
            ],
          },
        },
        include: { detalles: true },
      });
      const renglonOriginalId = ventaOriginal.detalles[0].id;

      jest.spyOn(auditService, 'registrar').mockImplementationOnce(() => {
        return Promise.reject(
          new Error('FALLO_CRITICO_FORZADO_AUDITORIA_PATCH_VENTA'),
        );
      });

      const res = await testRequest(app)
        .patch(`/api/v1/ventas/${ventaOriginal.id}`)
        .set('Authorization', adminToken)
        .send({
          total: '1500.00',
          renglones: [
            {
              unidadId: seed.global.unidadKgId,
              calidad: CalidadCosecha.PRIMERA,
              cantidad: '60.000',
              precioUnitario: '25.00',
            },
          ],
        });

      expect(res.status).toBeGreaterThanOrEqual(500);

      // Releer venta en BD: cabecera intacta
      const ventaReleida = await prisma.venta.findUnique({
        where: { id: ventaOriginal.id },
        include: { detalles: true },
      });
      expect(Number(ventaReleida?.total)).toBe(1000.0);
      expect(ventaReleida?.detalles.length).toBe(1);
      expect(ventaReleida?.detalles[0].id).toBe(renglonOriginalId);
      expect(Number(ventaReleida?.detalles[0].cantidad)).toBe(50.0);

      // Verificar que no se generó bitácora de actualización
      const bitacoras = await prisma.bitacoraAuditoria.findMany({
        where: {
          empresaId: seed.empresaA.id,
          entidad: 'Venta',
          entidadId: ventaOriginal.id,
          accion: 'ACTUALIZAR',
        },
      });
      expect(bitacoras.length).toBe(0);
    });

    it('(h) PATCH /api/v1/ventas/:id/cancelar: si auditoría falla, la venta sigue REGISTRADA', async () => {
      const cicloDed = await crearCicloAisladoParaConcurrencia(
        prisma,
        seed.empresaA.id,
        seed.empresaA.usuarios.admin.id,
        seed.global.variedadId,
      );

      const ventaOriginal = await prisma.venta.create({
        data: {
          cicloId: cicloDed.cicloId,
          clienteId: seed.empresaA.cliente.id,
          creadoPorId: seed.empresaA.usuarios.admin.id,
          fecha: new Date('2026-03-01'),
          total: new Prisma.Decimal('500.00'),
          estado: 'REGISTRADA',
        },
      });

      jest.spyOn(auditService, 'registrar').mockImplementationOnce(() => {
        return Promise.reject(
          new Error('FALLO_CRITICO_FORZADO_AUDITORIA_CANCELAR_VENTA'),
        );
      });

      const res = await testRequest(app)
        .patch(`/api/v1/ventas/${ventaOriginal.id}/cancelar`)
        .set('Authorization', adminToken);

      expect(res.status).toBeGreaterThanOrEqual(500);

      const ventaReleida = await prisma.venta.findUnique({
        where: { id: ventaOriginal.id },
      });
      expect(ventaReleida?.estado).toBe('REGISTRADA');

      const bitacoras = await prisma.bitacoraAuditoria.findMany({
        where: {
          empresaId: seed.empresaA.id,
          entidad: 'Venta',
          entidadId: ventaOriginal.id,
          accion: 'ACTUALIZAR',
        },
      });
      expect(bitacoras.length).toBe(0);
    });
  });

  describe('2. Prueba de control: Auditoría real exitosa y exclusión de secretos (RN-074)', () => {
    it('Mutación real registra exitosamente en bitacora_auditoria y jamás expone contraseñas', async () => {
      const descripcionExitosa = `Gasto Control Auditoria ${Date.now()}`;

      // Operación normal sin mocks
      const res = await testRequest(app)
        .post('/api/v1/gastos')
        .set('Authorization', adminToken)
        .send({
          cicloId: seed.empresaA.cicloActivo.id,
          categoriaId: seed.empresaA.categoriaPropia.id,
          fecha: '2026-03-01',
          total: '250',
          descripcion: descripcionExitosa,
        });

      expect(res.status).toBe(201);
      const gastoCreado = res.body as { id: number };
      const gastoCreadoId = gastoCreado.id;

      // Consultar bitácora real en MySQL
      const registroBitacora = await prisma.bitacoraAuditoria.findFirst({
        where: {
          empresaId: seed.empresaA.id,
          entidad: 'Gasto',
          entidadId: gastoCreadoId,
        },
      });

      expect(registroBitacora).not.toBeNull();
      expect(registroBitacora?.accion).toBe('CREAR');
      expect(registroBitacora?.usuarioId).toBe(seed.empresaA.usuarios.admin.id);

      // Verificar que los datos JSON fueron sanitizados y no contienen datos sensibles
      const serializado = JSON.stringify(registroBitacora, (_, v: unknown) =>
        typeof v === 'bigint' ? v.toString() : (v as object),
      );
      expect(serializado).not.toContain('contrasenaHash');
      expect(serializado).not.toContain('password');
      expect(serializado).not.toContain('token');
    });
  });
});
