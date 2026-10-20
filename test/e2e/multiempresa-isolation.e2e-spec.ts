import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { createTestApp } from '../setup/create-test-app';
import { PrismaService } from '../../src/prisma/prisma.service';
import { getOrLoadSeedData, E2eSeedData } from '../setup/e2e-seed';
import { generateTestJwt } from '../setup/test-tokens.util';
import { CodigoError } from '../../src/common/errors/codigos-error.enum';

describe('C3: Aislamiento Multiempresa y Seguridad RBAC/ABAC (E2E)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let seed: E2eSeedData;

  let tokenA_Admin: string;
  let tokenA_Capturista: string;
  let tokenA_Contador: string;
  let tokenB_Admin: string;

  beforeAll(async () => {
    const testApp = await createTestApp();
    app = testApp.app;
    prisma = testApp.prisma;
    seed = await getOrLoadSeedData(prisma);

    tokenA_Admin = `Bearer ${generateTestJwt(
      seed.empresaA.usuarios.admin.id,
      seed.empresaA.id,
      'ADMIN',
    )}`;
    tokenA_Capturista = `Bearer ${generateTestJwt(
      seed.empresaA.usuarios.capturista.id,
      seed.empresaA.id,
      'CAPTURISTA',
    )}`;
    tokenA_Contador = `Bearer ${generateTestJwt(
      seed.empresaA.usuarios.contador.id,
      seed.empresaA.id,
      'CONTADOR',
    )}`;
    tokenB_Admin = `Bearer ${generateTestJwt(
      seed.empresaB.usuarios.admin.id,
      seed.empresaB.id,
      'ADMIN',
    )}`;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('1. Matriz de 404 estricto ante recursos ajenos (Token A_Admin sobre Entidades de B)', () => {
    it('Predios ajenos: GET detalle, PATCH y DELETE responden 404 y no mutan la BD', async () => {
      const predioBId = seed.empresaB.predio.id;

      const resGet = await request(app.getHttpServer())
        .get(`/api/v1/predios/${predioBId}`)
        .set('Authorization', tokenA_Admin);
      expect(resGet.status).toBe(404);

      const resPatch = await request(app.getHttpServer())
        .patch(`/api/v1/predios/${predioBId}`)
        .set('Authorization', tokenA_Admin)
        .send({ nombre: 'Intento hackeo' });
      expect(resPatch.status).toBe(404);

      const resDelete = await request(app.getHttpServer())
        .delete(`/api/v1/predios/${predioBId}`)
        .set('Authorization', tokenA_Admin);
      expect(resDelete.status).toBe(404);

      const predioBReal = await prisma.predio.findUnique({
        where: { id: predioBId },
      });
      expect(predioBReal?.nombre).not.toBe('Intento hackeo');
      expect(predioBReal?.deletedAt).toBeNull();
    });

    it('Parcelas ajenas: GET detalle, PATCH y DELETE responden 404 y no mutan la BD', async () => {
      const parcelaBId = seed.empresaB.parcela.id;

      const resGet = await request(app.getHttpServer())
        .get(`/api/v1/parcelas/${parcelaBId}`)
        .set('Authorization', tokenA_Admin);
      expect(resGet.status).toBe(404);

      const resPatch = await request(app.getHttpServer())
        .patch(`/api/v1/parcelas/${parcelaBId}`)
        .set('Authorization', tokenA_Admin)
        .send({ nombre: 'Intento hackeo' });
      expect(resPatch.status).toBe(404);

      const resDelete = await request(app.getHttpServer())
        .delete(`/api/v1/parcelas/${parcelaBId}`)
        .set('Authorization', tokenA_Admin);
      expect(resDelete.status).toBe(404);

      const parcelaBReal = await prisma.parcela.findUnique({
        where: { id: parcelaBId },
      });
      expect(parcelaBReal?.nombre).not.toBe('Intento hackeo');
      expect(parcelaBReal?.deletedAt).toBeNull();
    });

    it('Ciclos ajenos: GET detalle, PATCH y transiciones responden 404 y no mutan la BD', async () => {
      const cicloBId = seed.empresaB.cicloActivo.id;

      const resGet = await request(app.getHttpServer())
        .get(`/api/v1/ciclos/${cicloBId}`)
        .set('Authorization', tokenA_Admin);
      expect(resGet.status).toBe(404);

      const resPatch = await request(app.getHttpServer())
        .patch(`/api/v1/ciclos/${cicloBId}`)
        .set('Authorization', tokenA_Admin)
        .send({ nombre: 'Ciclo hackeado' });
      expect(resPatch.status).toBe(404);

      const resFinalizar = await request(app.getHttpServer())
        .patch(`/api/v1/ciclos/${cicloBId}/finalizar`)
        .set('Authorization', tokenA_Admin)
        .send({ fechaFin: '2026-12-31' });
      expect(resFinalizar.status).toBe(404);

      const cicloBReal = await prisma.cicloProduccion.findUnique({
        where: { id: cicloBId },
      });
      expect(cicloBReal?.nombre).not.toBe('Ciclo hackeado');
      expect(cicloBReal?.estado).toBe('ACTIVO');
    });

    it('Actividades ajenas: GET detalle, PATCH y DELETE responden 404 y no mutan la BD', async () => {
      const actBId = seed.empresaB.actividad.id;

      const resGet = await request(app.getHttpServer())
        .get(`/api/v1/actividades/${actBId}`)
        .set('Authorization', tokenA_Admin);
      expect(resGet.status).toBe(404);

      const resPatch = await request(app.getHttpServer())
        .patch(`/api/v1/actividades/${actBId}`)
        .set('Authorization', tokenA_Admin)
        .send({ descripcion: 'Actividad hackeada' });
      expect(resPatch.status).toBe(404);

      const resDelete = await request(app.getHttpServer())
        .delete(`/api/v1/actividades/${actBId}`)
        .set('Authorization', tokenA_Admin);
      expect(resDelete.status).toBe(404);

      const actBReal = await prisma.actividad.findUnique({
        where: { id: actBId },
      });
      expect(actBReal?.descripcion).not.toBe('Actividad hackeada');
      expect(actBReal?.deletedAt).toBeNull();
    });

    it('Gastos ajenos: GET detalle, PATCH y DELETE responden 404 y no mutan la BD', async () => {
      const gastoBId = seed.empresaB.gasto.id;

      const resGet = await request(app.getHttpServer())
        .get(`/api/v1/gastos/${gastoBId}`)
        .set('Authorization', tokenA_Admin);
      expect(resGet.status).toBe(404);

      const resPatch = await request(app.getHttpServer())
        .patch(`/api/v1/gastos/${gastoBId}`)
        .set('Authorization', tokenA_Admin)
        .send({ descripcion: 'Gasto hackeado' });
      expect(resPatch.status).toBe(404);

      const resDelete = await request(app.getHttpServer())
        .delete(`/api/v1/gastos/${gastoBId}`)
        .set('Authorization', tokenA_Admin);
      expect(resDelete.status).toBe(404);

      const gastoBReal = await prisma.gasto.findUnique({
        where: { id: gastoBId },
      });
      expect(gastoBReal?.descripcion).not.toBe('Gasto hackeado');
      expect(gastoBReal?.deletedAt).toBeNull();
    });

    it('Cosechas ajenas: GET detalle, PATCH y DELETE responden 404 y no mutan la BD', async () => {
      const cosechaBId = seed.empresaB.cosecha.id;

      const resGet = await request(app.getHttpServer())
        .get(`/api/v1/cosechas/${cosechaBId}`)
        .set('Authorization', tokenA_Admin);
      expect(resGet.status).toBe(404);

      const resPatch = await request(app.getHttpServer())
        .patch(`/api/v1/cosechas/${cosechaBId}`)
        .set('Authorization', tokenA_Admin)
        .send({ observaciones: 'Cosecha hackeada' });
      expect(resPatch.status).toBe(404);

      const resDelete = await request(app.getHttpServer())
        .delete(`/api/v1/cosechas/${cosechaBId}`)
        .set('Authorization', tokenA_Admin);
      expect(resDelete.status).toBe(404);

      const cosechaBReal = await prisma.cosecha.findUnique({
        where: { id: cosechaBId },
      });
      expect(cosechaBReal?.observaciones).not.toBe('Cosecha hackeada');
      expect(cosechaBReal?.deletedAt).toBeNull();
    });

    it('Mermas ajenas: GET detalle, PATCH y DELETE responden 404 y no mutan la BD', async () => {
      const mermaBId = seed.empresaB.merma.id;

      const resGet = await request(app.getHttpServer())
        .get(`/api/v1/mermas/${mermaBId}`)
        .set('Authorization', tokenA_Admin);
      expect(resGet.status).toBe(404);

      const resPatch = await request(app.getHttpServer())
        .patch(`/api/v1/mermas/${mermaBId}`)
        .set('Authorization', tokenA_Admin)
        .send({ observaciones: 'Merma hackeada' });
      expect(resPatch.status).toBe(404);

      const resDelete = await request(app.getHttpServer())
        .delete(`/api/v1/mermas/${mermaBId}`)
        .set('Authorization', tokenA_Admin);
      expect(resDelete.status).toBe(404);

      const mermaBReal = await prisma.merma.findUnique({
        where: { id: mermaBId },
      });
      expect(mermaBReal?.observaciones).not.toBe('Merma hackeada');
      expect(mermaBReal?.deletedAt).toBeNull();
    });
  });

  describe('2. Listados limpios (Token A nunca contiene registros de B)', () => {
    it('Listados de Predios, Parcelas, Ciclos, Actividades, Gastos, Cosechas y Mermas', async () => {
      const [
        resPredios,
        resParcelas,
        resCiclos,
        resActs,
        resGastos,
        resCosechas,
        resMermas,
      ] = await Promise.all([
        request(app.getHttpServer())
          .get('/api/v1/predios')
          .set('Authorization', tokenA_Admin),
        request(app.getHttpServer())
          .get('/api/v1/parcelas')
          .set('Authorization', tokenA_Admin),
        request(app.getHttpServer())
          .get('/api/v1/ciclos')
          .set('Authorization', tokenA_Admin),
        request(app.getHttpServer())
          .get('/api/v1/actividades')
          .set('Authorization', tokenA_Admin),
        request(app.getHttpServer())
          .get('/api/v1/gastos')
          .set('Authorization', tokenA_Admin),
        request(app.getHttpServer())
          .get('/api/v1/cosechas')
          .set('Authorization', tokenA_Admin),
        request(app.getHttpServer())
          .get('/api/v1/mermas')
          .set('Authorization', tokenA_Admin),
      ]);

      const extraeIds = (body: unknown): number[] => {
        if (Array.isArray(body)) {
          return (body as Array<{ id: number }>).map((x) => x.id);
        }
        const obj = body as { data?: Array<{ id: number }> };
        if (Array.isArray(obj?.data)) {
          return obj.data.map((x) => x.id);
        }
        return [];
      };

      expect(extraeIds(resPredios.body)).not.toContain(seed.empresaB.predio.id);
      expect(extraeIds(resParcelas.body)).not.toContain(
        seed.empresaB.parcela.id,
      );
      expect(extraeIds(resCiclos.body)).not.toContain(
        seed.empresaB.cicloActivo.id,
      );
      expect(extraeIds(resActs.body)).not.toContain(seed.empresaB.actividad.id);
      expect(extraeIds(resGastos.body)).not.toContain(seed.empresaB.gasto.id);
      expect(extraeIds(resCosechas.body)).not.toContain(
        seed.empresaB.cosecha.id,
      );
      expect(extraeIds(resMermas.body)).not.toContain(seed.empresaB.merma.id);
    });
  });

  describe('3. Referencias cruzadas en creaciones (Entidad B con token A)', () => {
    it('Crear Ciclo con parcela de B da 404', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/ciclos')
        .set('Authorization', tokenA_Admin)
        .send({
          parcelaId: seed.empresaB.parcela.id,
          variedadId: seed.global.variedadId,
          nombre: 'Ciclo cruzado',
          fechaInicio: '2026-07-01',
          superficieSembrada: 5,
        });
      expect(res.status).toBe(404);
    });

    it('Crear Gasto con cicloId de B da 404', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/gastos')
        .set('Authorization', tokenA_Admin)
        .send({
          cicloId: seed.empresaB.cicloActivo.id,
          categoriaId: seed.empresaA.categoriaPropia.id,
          fecha: '2026-02-01',
          total: '100',
        });
      expect(res.status).toBe(404);
    });

    it('Crear Gasto con proveedorId de B da 404', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/gastos')
        .set('Authorization', tokenA_Admin)
        .send({
          cicloId: seed.empresaA.cicloActivo.id,
          categoriaId: seed.empresaA.categoriaPropia.id,
          proveedorId: seed.empresaB.proveedor.id,
          fecha: '2026-02-01',
          total: '100',
        });
      expect(res.status).toBe(404);
    });

    it('Crear Gasto con categoriaId propia de B da 404', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/gastos')
        .set('Authorization', tokenA_Admin)
        .send({
          cicloId: seed.empresaA.cicloActivo.id,
          categoriaId: seed.empresaB.categoriaPropia.id,
          fecha: '2026-02-01',
          total: '100',
        });
      expect(res.status).toBe(404);
    });

    it('Crear Gasto con categoriaId global del sistema da 201', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/gastos')
        .set('Authorization', tokenA_Admin)
        .send({
          cicloId: seed.empresaA.cicloActivo.id,
          categoriaId: seed.global.categoriaSistemaId,
          fecha: '2026-02-01',
          total: '250',
          descripcion: 'Gasto con categoria del sistema',
        });
      expect(res.status).toBe(201);
    });

    it('Crear Cosecha con cicloId de B da 404', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/cosechas')
        .set('Authorization', tokenA_Admin)
        .send({
          cicloId: seed.empresaB.cicloActivo.id,
          unidadId: seed.global.unidadKgId,
          fecha: '2026-03-01',
          cantidad: 100,
          calidad: 'PRIMERA',
        });
      expect(res.status).toBe(404);
    });

    it('Crear Merma con cosechaId de B da 404', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/mermas')
        .set('Authorization', tokenA_Admin)
        .send({
          cicloId: seed.empresaA.cicloActivo.id,
          cosechaId: seed.empresaB.cosecha.id,
          unidadId: seed.global.unidadKgId,
          motivoId: seed.global.motivoMermaId,
          fecha: '2026-03-02',
          cantidad: 10,
          etapa: 'POSCOSECHA',
        });
      expect(res.status).toBe(404);
    });
  });

  describe('4. Visibilidad acotada (Scoped Visibility) de CAPTURISTA en Empresa A', () => {
    it('CAPTURISTA solo ve sus propios gastos en el listado y detalle de ADMIN da 404', async () => {
      const resList = await request(app.getHttpServer())
        .get('/api/v1/gastos')
        .set('Authorization', tokenA_Capturista);
      expect(resList.status).toBe(200);

      const bodyGasto = resList.body as { data?: Array<{ id: number }> };
      const itemsGasto: Array<{ id: number }> = Array.isArray(bodyGasto)
        ? (bodyGasto as Array<{ id: number }>)
        : (bodyGasto.data ?? []);
      const ids = itemsGasto.map((x) => x.id);
      expect(ids).toContain(seed.empresaA.gastoCapturista.id);
      expect(ids).not.toContain(seed.empresaA.gastoAdmin.id);

      const resDetalleAdmin = await request(app.getHttpServer())
        .get(`/api/v1/gastos/${seed.empresaA.gastoAdmin.id}`)
        .set('Authorization', tokenA_Capturista);
      expect(resDetalleAdmin.status).toBe(404);
    });

    it('CAPTURISTA solo ve sus propias cosechas en el listado y detalle de ADMIN da 404', async () => {
      const resList = await request(app.getHttpServer())
        .get('/api/v1/cosechas')
        .set('Authorization', tokenA_Capturista);
      expect(resList.status).toBe(200);

      const bodyCos = resList.body as { data?: Array<{ id: number }> };
      const itemsCos: Array<{ id: number }> = Array.isArray(bodyCos)
        ? (bodyCos as Array<{ id: number }>)
        : (bodyCos.data ?? []);
      const ids = itemsCos.map((x) => x.id);
      expect(ids).toContain(seed.empresaA.cosechaCapturista.id);
      expect(ids).not.toContain(seed.empresaA.cosechaAdmin.id);

      const resDetalleAdmin = await request(app.getHttpServer())
        .get(`/api/v1/cosechas/${seed.empresaA.cosechaAdmin.id}`)
        .set('Authorization', tokenA_Capturista);
      expect(resDetalleAdmin.status).toBe(404);
    });

    it('CAPTURISTA solo ve sus propias mermas en el listado y detalle de ADMIN da 404', async () => {
      const resList = await request(app.getHttpServer())
        .get('/api/v1/mermas')
        .set('Authorization', tokenA_Capturista);
      expect(resList.status).toBe(200);

      const bodyMerma = resList.body as { data?: Array<{ id: number }> };
      const itemsMerma: Array<{ id: number }> = Array.isArray(bodyMerma)
        ? (bodyMerma as Array<{ id: number }>)
        : (bodyMerma.data ?? []);
      const ids = itemsMerma.map((x) => x.id);
      expect(ids).toContain(seed.empresaA.mermaCapturista.id);
      expect(ids).not.toContain(seed.empresaA.mermaAdmin.id);

      const resDetalleAdmin = await request(app.getHttpServer())
        .get(`/api/v1/mermas/${seed.empresaA.mermaAdmin.id}`)
        .set('Authorization', tokenA_Capturista);
      expect(resDetalleAdmin.status).toBe(404);
    });
  });

  describe('5. Matriz de Permisos (RBAC)', () => {
    it('CONTADOR recibe 403 PERMISO_DENEGADO al crear cosechas', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/cosechas')
        .set('Authorization', tokenA_Contador)
        .send({
          cicloId: seed.empresaA.cicloActivo.id,
          unidadId: seed.global.unidadKgId,
          fecha: '2026-03-01',
          cantidad: 100,
          calidad: 'PRIMERA',
        });
      expect(res.status).toBe(403);
      const resBody = res.body as { code?: string };
      expect(resBody.code).toBe(CodigoError.PERMISO_DENEGADO);
    });

    it('CONTADOR recibe 403 PERMISO_DENEGADO al crear mermas', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/mermas')
        .set('Authorization', tokenA_Contador)
        .send({
          cicloId: seed.empresaA.cicloActivo.id,
          cosechaId: seed.empresaA.cosechaAdmin.id,
          unidadId: seed.global.unidadKgId,
          motivoId: seed.global.motivoMermaId,
          fecha: '2026-03-02',
          cantidad: 10,
          etapa: 'POSCOSECHA',
        });
      expect(res.status).toBe(403);
      const resBody = res.body as { code?: string };
      expect(resBody.code).toBe(CodigoError.PERMISO_DENEGADO);
    });

    it('CAPTURISTA recibe 403 PERMISO_DENEGADO al intentar eliminar un gasto', async () => {
      const res = await request(app.getHttpServer())
        .delete(`/api/v1/gastos/${seed.empresaA.gastoCapturista.id}`)
        .set('Authorization', tokenA_Capturista);
      expect(res.status).toBe(403);
      const resBody = res.body as { code?: string };
      expect(resBody.code).toBe(CodigoError.PERMISO_DENEGADO);
    });
  });
});
