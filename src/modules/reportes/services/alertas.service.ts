import { Injectable } from '@nestjs/common';
import { Prisma, EstadoCiclo } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { FiltroAlertasDto } from '../dto/filtro-alertas.dto';
import { AlertasResponseDto, AlertaItemDto } from '../dto/alertas-response.dto';
import {
  SeveridadAlerta,
  CodigoAlerta,
  ReferenciaTipoAlerta,
  ALERTAS_UMBRALES,
} from '../constants/alertas.constants';
import { AlertasMapper } from '../mappers/alertas.mapper';
import { VentaEstadoCobroPolicy } from '../../../common/domain/policies/venta-estado-cobro.policy';
import { ReporteFormatoUtil } from '../../../common/utils/reporte-formato.util';
import { PaginationUtil } from '../../../common/utils/pagination.util';

interface RentabilidadRow {
  cicloId: number;
  empresaId: number;
  parcelaId: number;
  variedadId: number;
  estado: string;
  totalFacturado: Prisma.Decimal | string | number | null;
  costoTotal: Prisma.Decimal | string | number | null;
  ganancia: Prisma.Decimal | string | number | null;
  costoPorKg: Prisma.Decimal | string | number | null;
  precioPromedioKg: Prisma.Decimal | string | number | null;
  mermaPct: Prisma.Decimal | string | number | null;
  kgCosechados: Prisma.Decimal | string | number | null;
}

interface CategoriaCostoRow {
  cicloId: number;
  categoriaRaizId: number;
  categoriaRaiz: string;
  porcentaje: Prisma.Decimal | string | number | null;
}

interface ComparativoRow {
  parcelaId: number;
  cicloId: number;
  fechaInicio: Date | string;
  costoPorKg: Prisma.Decimal | string | number | null;
}

interface VentaVencidaRow {
  ventaId: number;
  folio: string | null;
  clienteId: number;
  clienteNombre: string;
  cicloId: number;
  fechaVencimiento: Date | string | null;
  saldoPendiente: Prisma.Decimal | string | number;
}

@Injectable()
export class AlertasService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Evalúa en memoria las 10 reglas de alerta sobre consultas agregadas constantes (sin N+1).
   */
  async obtenerAlertas(
    empresaId: number,
    filtro: FiltroAlertasDto,
  ): Promise<AlertasResponseDto> {
    const hoy = filtro.hoy ?? VentaEstadoCobroPolicy.obtenerHoyMexico();
    const page = filtro.page && filtro.page > 0 ? filtro.page : 1;
    const limit =
      filtro.limit && filtro.limit > 0 ? Math.min(filtro.limit, 100) : 10;
    const skip = (page - 1) * limit;

    const [yHoy, mHoy, dHoy] = hoy.split('-').map(Number);
    const dateHoy = new Date(Date.UTC(yHoy, mHoy - 1, dHoy));
    const fechaLimiteCiclos = new Date(
      dateHoy.getTime() -
        ALERTAS_UMBRALES.DIAS_VENTANA_CICLOS_FINALIZADOS * 24 * 60 * 60 * 1000,
    );

    // =========================================================================
    // CONSULTA 1: Universo de ciclos relevantes para evaluación de alertas
    // =========================================================================
    const ciclos = await this.prisma.cicloProduccion.findMany({
      where: {
        empresaId,
        deletedAt: null,
        OR: [
          { estado: { in: [EstadoCiclo.ACTIVO, EstadoCiclo.SUSPENDIDO] } },
          {
            estado: EstadoCiclo.FINALIZADO,
            OR: [
              { cerradoEn: { gte: fechaLimiteCiclos } },
              { fechaFin: { gte: fechaLimiteCiclos } },
            ],
          },
        ],
      },
      select: {
        id: numberAsNumber(),
        nombre: true,
        estado: true,
        fechaInicio: true,
        fechaFin: true,
        cerradoEn: true,
        superficieSembrada: true,
        metaProduccionKg: true,
        parcelaId: true,
        variedadId: true,
        variedad: {
          select: {
            duracionCicloDias: true,
          },
        },
      },
    });

    const cicloIds = ciclos.map((c) => c.id);
    const parcelaIds = Array.from(new Set(ciclos.map((c) => c.parcelaId)));
    const ciclosActivosIds = ciclos
      .filter((c) => c.estado === EstadoCiclo.ACTIVO)
      .map((c) => c.id);

    const alertas: AlertaItemDto[] = [];

    // =========================================================================
    // CONSULTAS 2, 3, 4: Indicadores sobre vistas acotadas
    // =========================================================================
    const rentabilidadMap = new Map<number, RentabilidadRow>();
    const categoriasPorCiclo = new Map<number, CategoriaCostoRow[]>();
    const comparativoPorParcela = new Map<number, ComparativoRow[]>();
    const maxFechaGastoMap = new Map<number, Date>();

    if (cicloIds.length > 0) {
      const compPromise: Promise<ComparativoRow[]> =
        parcelaIds.length > 0
          ? this.prisma.$queryRaw<ComparativoRow[]>(Prisma.sql`
              SELECT parcelaId, cicloId, fechaInicio, costoPorKg
              FROM v_comparativo_parcela
              WHERE empresaId = ${empresaId}
                AND parcelaId IN (${Prisma.join(parcelaIds)})
              ORDER BY parcelaId ASC, fechaInicio DESC, cicloId DESC
            `)
          : Promise.resolve<ComparativoRow[]>([]);

      const gastosPromise =
        ciclosActivosIds.length > 0
          ? this.prisma.gasto.groupBy({
              by: ['cicloId'],
              where: {
                cicloId: { in: ciclosActivosIds },
                deletedAt: null,
              },
              _max: { fecha: true },
            })
          : Promise.resolve<
              Array<{ cicloId: number | null; _max: { fecha: Date | null } }>
            >([]);

      const [filasRent, filasCat, filasComp, gastosMax] = await Promise.all([
        this.prisma.$queryRaw<RentabilidadRow[]>(Prisma.sql`
          SELECT
            cicloId, empresaId, parcelaId, variedadId, estado,
            totalFacturado, costoTotal, ganancia, costoPorKg, precioPromedioKg,
            mermaPct, kgCosechados
          FROM v_rentabilidad_ciclo
          WHERE empresaId = ${empresaId}
            AND cicloId IN (${Prisma.join(cicloIds)})
        `),
        this.prisma.$queryRaw<CategoriaCostoRow[]>(Prisma.sql`
          SELECT cicloId, categoriaRaizId, categoriaRaiz, porcentaje
          FROM v_costo_por_categoria
          WHERE empresaId = ${empresaId}
            AND cicloId IN (${Prisma.join(cicloIds)})
        `),
        compPromise,
        gastosPromise,
      ]);

      filasRent.forEach((r) => rentabilidadMap.set(Number(r.cicloId), r));

      filasCat.forEach((r) => {
        const cId = Number(r.cicloId);
        const list = categoriasPorCiclo.get(cId) ?? [];
        list.push(r);
        categoriasPorCiclo.set(cId, list);
      });

      filasComp.forEach((r) => {
        const pId = Number(r.parcelaId);
        const list = comparativoPorParcela.get(pId) ?? [];
        list.push(r);
        comparativoPorParcela.set(pId, list);
      });

      gastosMax.forEach((g) => {
        if (g._max.fecha) {
          maxFechaGastoMap.set(Number(g.cicloId), g._max.fecha);
        }
      });
    }

    // =========================================================================
    // CONSULTA 5: Ventas vencidas para COBRO_VENCIDO (independiente de ciclos)
    // =========================================================================
    const ventasVencidas = await this.prisma.$queryRaw<VentaVencidaRow[]>(
      Prisma.sql`
        SELECT
          v.id AS ventaId,
          v.numeroFactura AS folio,
          v.clienteId,
          cl.nombre AS clienteNombre,
          v.cicloId,
          v.fechaLimitePago AS fechaVencimiento,
          (v.total - COALESCE(cb.totalCobrado, 0)) AS saldoPendiente
        FROM venta v
        JOIN ciclo_produccion cp ON cp.id = v.cicloId AND cp.empresaId = ${empresaId} AND cp.deletedAt IS NULL
        JOIN cliente cl ON cl.id = v.clienteId AND cl.deletedAt IS NULL
        LEFT JOIN (
          SELECT ventaId, SUM(monto) AS totalCobrado
          FROM cobro_venta
          WHERE deletedAt IS NULL
          GROUP BY ventaId
        ) cb ON cb.ventaId = v.id
        WHERE v.deletedAt IS NULL
          AND v.estado != 'CANCELADA'
          AND v.fechaLimitePago IS NOT NULL
          AND v.fechaLimitePago < ${hoy}
          AND (v.total - COALESCE(cb.totalCobrado, 0)) > 0
      `,
    );

    // =========================================================================
    // CONSULTA 6: Plan de suscripción y uso de recursos
    // =========================================================================
    const [empresaData, parcelasCount, usuariosCount] = await Promise.all([
      this.prisma.empresa.findUnique({
        where: { id: empresaId },
        select: {
          plan: {
            select: {
              nombre: true,
              maxParcelas: true,
              maxUsuarios: true,
            },
          },
        },
      }),
      this.prisma.parcela.count({
        where: {
          predio: { empresaId, deletedAt: null },
          estado: { not: 'INACTIVA' },
          deletedAt: null,
        },
      }),
      this.prisma.usuario.count({
        where: {
          empresaId,
          activo: true,
          deletedAt: null,
        },
      }),
    ]);

    // =========================================================================
    // EVALUACIÓN DE REGLAS EN MEMORIA
    // =========================================================================

    // Regla 3: COBRO_VENCIDO (ALTA)
    for (const vv of ventasVencidas) {
      const saldoStr =
        ReporteFormatoUtil.formatearImporte(vv.saldoPendiente) ?? '0.00';
      const fVenc = VentaEstadoCobroPolicy.normalizarFecha(vv.fechaVencimiento);
      alertas.push({
        codigo: CodigoAlerta.COBRO_VENCIDO,
        severidad: SeveridadAlerta.ALTA,
        cicloId: Number(vv.cicloId),
        ventaId: Number(vv.ventaId),
        clienteId: Number(vv.clienteId),
        observado: `$${saldoStr}`,
        umbral: '0.00',
        mensaje: `La venta #${vv.folio || vv.ventaId} de '${vv.clienteNombre}' tiene saldo vencido por $${saldoStr} desde ${fVenc}`,
        referenciaTipo: ReferenciaTipoAlerta.VENTA,
        referenciaId: Number(vv.ventaId),
        metadata: {
          clienteNombre: vv.clienteNombre,
          fechaVencimiento: fVenc,
        },
      });
    }

    // Reglas sobre ciclos
    for (const c of ciclos) {
      const cId = c.id;
      const rent = rentabilidadMap.get(cId);
      const nombreCiclo = c.nombre || `Ciclo #${cId}`;

      if (rent) {
        const ganancia = Number(rent.ganancia ?? 0);
        const facturado = Number(rent.totalFacturado ?? 0);
        const costoKg =
          rent.costoPorKg !== null && rent.costoPorKg !== undefined
            ? Number(rent.costoPorKg)
            : null;
        const precioKg =
          rent.precioPromedioKg !== null && rent.precioPromedioKg !== undefined
            ? Number(rent.precioPromedioKg)
            : null;
        const mermaPct =
          rent.mermaPct !== null && rent.mermaPct !== undefined
            ? Number(rent.mermaPct)
            : null;
        const kgCosechados =
          rent.kgCosechados !== null && rent.kgCosechados !== undefined
            ? Number(rent.kgCosechados)
            : null;

        // Regla 1: CICLO_EN_PERDIDA (ALTA)
        if (ganancia < 0 && facturado > 0) {
          const obsStr =
            ReporteFormatoUtil.formatearImporte(rent.ganancia) ?? '0.00';
          alertas.push({
            codigo: CodigoAlerta.CICLO_EN_PERDIDA,
            severidad: SeveridadAlerta.ALTA,
            cicloId: cId,
            ventaId: null,
            clienteId: null,
            observado: `$${obsStr}`,
            umbral: '$0.00',
            mensaje: `El ciclo '${nombreCiclo}' presenta margen negativo (${obsStr}) con facturación activa`,
            referenciaTipo: ReferenciaTipoAlerta.CICLO,
            referenciaId: cId,
            metadata: { ganancia: obsStr, totalFacturado: facturado },
          });
        }

        // Regla 2: COSTO_SUPERA_PRECIO (ALTA)
        if (
          costoKg !== null &&
          precioKg !== null &&
          costoKg > 0 &&
          precioKg > 0 &&
          costoKg > precioKg
        ) {
          const cKgStr =
            ReporteFormatoUtil.formatearImporte(rent.costoPorKg) ?? '0.00';
          const pKgStr =
            ReporteFormatoUtil.formatearImporte(rent.precioPromedioKg) ??
            '0.00';
          alertas.push({
            codigo: CodigoAlerta.COSTO_SUPERA_PRECIO,
            severidad: SeveridadAlerta.ALTA,
            cicloId: cId,
            ventaId: null,
            clienteId: null,
            observado: `$${cKgStr}/kg`,
            umbral: `$${pKgStr}/kg`,
            mensaje: `El costo unitario ($${cKgStr}/kg) supera el precio promedio de venta ($${pKgStr}/kg) en el ciclo '${nombreCiclo}'`,
            referenciaTipo: ReferenciaTipoAlerta.CICLO,
            referenciaId: cId,
            metadata: { costoPorKg: cKgStr, precioPromedioKg: pKgStr },
          });
        }

        // Regla 4: MERMA_ELEVADA (MEDIA)
        if (
          mermaPct !== null &&
          mermaPct > ALERTAS_UMBRALES.MERMA_ELEVADA_PCT
        ) {
          const mStr =
            ReporteFormatoUtil.formatearPorcentaje(rent.mermaPct) ?? '0.00';
          alertas.push({
            codigo: CodigoAlerta.MERMA_ELEVADA,
            severidad: SeveridadAlerta.MEDIA,
            cicloId: cId,
            ventaId: null,
            clienteId: null,
            observado: `${mStr}%`,
            umbral: `${ALERTAS_UMBRALES.MERMA_ELEVADA_PCT.toFixed(2)}%`,
            mensaje: `El ciclo '${nombreCiclo}' registra un porcentaje de merma elevado (${mStr}%)`,
            referenciaTipo: ReferenciaTipoAlerta.CICLO,
            referenciaId: cId,
            metadata: { mermaPct: mStr },
          });
        }

        // Regla 5: CATEGORIA_DOMINANTE (MEDIA)
        const cats = categoriasPorCiclo.get(cId) ?? [];
        for (const cat of cats) {
          const pct = Number(cat.porcentaje ?? 0);
          if (pct > ALERTAS_UMBRALES.CATEGORIA_DOMINANTE_PCT) {
            const pctStr =
              ReporteFormatoUtil.formatearPorcentaje(cat.porcentaje) ?? '0.00';
            alertas.push({
              codigo: CodigoAlerta.CATEGORIA_DOMINANTE,
              severidad: SeveridadAlerta.MEDIA,
              cicloId: cId,
              ventaId: null,
              clienteId: null,
              observado: `${pctStr}%`,
              umbral: `${ALERTAS_UMBRALES.CATEGORIA_DOMINANTE_PCT.toFixed(2)}%`,
              mensaje: `La categoría '${cat.categoriaRaiz}' absorbe el ${pctStr}% del costo total en el ciclo '${nombreCiclo}'`,
              referenciaTipo: ReferenciaTipoAlerta.CICLO,
              referenciaId: cId,
              metadata: {
                categoriaRaizId: cat.categoriaRaizId,
                categoriaRaiz: cat.categoriaRaiz,
                porcentaje: pctStr,
              },
            });
          }
        }

        // Regla 6: COSTO_CRECIENTE (MEDIA)
        if (costoKg !== null && costoKg > 0) {
          const historialParcela = comparativoPorParcela.get(c.parcelaId) ?? [];
          const idxActual = historialParcela.findIndex(
            (h) => Number(h.cicloId) === cId,
          );
          if (idxActual !== -1 && idxActual + 1 < historialParcela.length) {
            const anterior = historialParcela[idxActual + 1];
            const costoAnt =
              anterior.costoPorKg !== null && anterior.costoPorKg !== undefined
                ? Number(anterior.costoPorKg)
                : null;
            if (
              costoAnt !== null &&
              costoAnt > 0 &&
              costoKg > costoAnt * ALERTAS_UMBRALES.FACTOR_COSTO_CRECIENTE
            ) {
              const cKgStr =
                ReporteFormatoUtil.formatearImporte(costoKg) ?? '0.00';
              const cAntStr =
                ReporteFormatoUtil.formatearImporte(costoAnt) ?? '0.00';
              const umbralStr =
                ReporteFormatoUtil.formatearImporte(
                  costoAnt * ALERTAS_UMBRALES.FACTOR_COSTO_CRECIENTE,
                ) ?? '0.00';
              alertas.push({
                codigo: CodigoAlerta.COSTO_CRECIENTE,
                severidad: SeveridadAlerta.MEDIA,
                cicloId: cId,
                ventaId: null,
                clienteId: null,
                observado: `$${cKgStr}/kg`,
                umbral: `$${umbralStr}/kg`,
                mensaje: `El costo unitario ($${cKgStr}/kg) aumentó más del 15% respecto al ciclo anterior ($${cAntStr}/kg) en la misma parcela`,
                referenciaTipo: ReferenciaTipoAlerta.CICLO,
                referenciaId: cId,
                metadata: {
                  costoActual: cKgStr,
                  costoAnterior: cAntStr,
                  cicloAnteriorId: Number(anterior.cicloId),
                },
              });
            }
          }
        }

        // Regla 7: RENDIMIENTO_BAJO (MEDIA)
        if (
          c.estado === EstadoCiclo.FINALIZADO &&
          c.metaProduccionKg !== null &&
          c.metaProduccionKg !== undefined
        ) {
          const meta = Number(c.metaProduccionKg);
          const cosechado = kgCosechados ?? 0;
          if (meta > 0 && cosechado < meta * 0.8) {
            const pctAlcanzado = ((cosechado / meta) * 100).toFixed(2);
            const kgCosStr =
              ReporteFormatoUtil.formatearKg(cosechado) ?? '0.000';
            const metaStr = ReporteFormatoUtil.formatearKg(meta) ?? '0.000';
            alertas.push({
              codigo: CodigoAlerta.RENDIMIENTO_BAJO,
              severidad: SeveridadAlerta.MEDIA,
              cicloId: cId,
              ventaId: null,
              clienteId: null,
              observado: `${pctAlcanzado}% (${kgCosStr} kg)`,
              umbral: `80.00% (${ReporteFormatoUtil.formatearKg(meta * 0.8)} kg)`,
              mensaje: `El ciclo '${nombreCiclo}' finalizó con un rendimiento del ${pctAlcanzado}% respecto a su meta (${metaStr} kg)`,
              referenciaTipo: ReferenciaTipoAlerta.CICLO,
              referenciaId: cId,
              metadata: { meta, cosechado, porcentaje: pctAlcanzado },
            });
          }
        }
      }

      // Regla 8: CICLO_SIN_CAPTURA (BAJA)
      if (c.estado === EstadoCiclo.ACTIVO) {
        const ultimaFecha = maxFechaGastoMap.get(cId) ?? c.fechaInicio;
        const uFechaDate = new Date(ultimaFecha);
        const msInactividad = dateHoy.getTime() - uFechaDate.getTime();
        const diasInactividad = Math.floor(
          msInactividad / (24 * 60 * 60 * 1000),
        );

        if (diasInactividad > ALERTAS_UMBRALES.DIAS_SIN_LABORES) {
          alertas.push({
            codigo: CodigoAlerta.CICLO_SIN_CAPTURA,
            severidad: SeveridadAlerta.BAJA,
            cicloId: cId,
            ventaId: null,
            clienteId: null,
            observado: `${diasInactividad} días`,
            umbral: `${ALERTAS_UMBRALES.DIAS_SIN_LABORES} días`,
            mensaje: `El ciclo activo '${nombreCiclo}' no registra actividades ni gastos desde hace ${diasInactividad} días`,
            referenciaTipo: ReferenciaTipoAlerta.CICLO,
            referenciaId: cId,
            metadata: { diasInactividad },
          });
        }
      }

      // Regla 9: CICLO_LARGO (BAJA)
      const duracionVariedad = c.variedad?.duracionCicloDias;
      if (duracionVariedad && duracionVariedad > 0) {
        const fechaFinEvaluada =
          c.estado === EstadoCiclo.FINALIZADO && c.fechaFin
            ? new Date(c.fechaFin)
            : dateHoy;
        const msDuracion =
          fechaFinEvaluada.getTime() - new Date(c.fechaInicio).getTime();
        const diasTranscurridos = Math.floor(
          msDuracion / (24 * 60 * 60 * 1000),
        );
        const umbralMaximoDias = Math.floor(
          duracionVariedad * ALERTAS_UMBRALES.FACTOR_DURACION_VARIEDAD,
        );

        if (diasTranscurridos > umbralMaximoDias) {
          alertas.push({
            codigo: CodigoAlerta.CICLO_LARGO,
            severidad: SeveridadAlerta.BAJA,
            cicloId: cId,
            ventaId: null,
            clienteId: null,
            observado: `${diasTranscurridos} días`,
            umbral: `${umbralMaximoDias} días`,
            mensaje: `La duración del ciclo '${nombreCiclo}' (${diasTranscurridos} días) excede en más del 20% el tiempo típico de la variedad (${duracionVariedad} días)`,
            referenciaTipo: ReferenciaTipoAlerta.CICLO,
            referenciaId: cId,
            metadata: { diasTranscurridos, duracionVariedad },
          });
        }
      }
    }

    // Regla 10: LIMITE_PLAN_CERCANO (INFORMATIVA)
    if (empresaData?.plan) {
      const plan = empresaData.plan;
      if (plan.maxParcelas && plan.maxParcelas > 0) {
        const pctParcelas = (parcelasCount / plan.maxParcelas) * 100;
        if (pctParcelas >= ALERTAS_UMBRALES.LIMITE_PLAN_PCT) {
          alertas.push({
            codigo: CodigoAlerta.LIMITE_PLAN_CERCANO,
            severidad: SeveridadAlerta.INFORMATIVA,
            cicloId: null,
            ventaId: null,
            clienteId: null,
            observado: `${parcelasCount} de ${plan.maxParcelas} (${pctParcelas.toFixed(1)}%)`,
            umbral: `${ALERTAS_UMBRALES.LIMITE_PLAN_PCT.toFixed(1)}%`,
            mensaje: `La empresa está próxima al límite de parcelas de su plan (${parcelasCount}/${plan.maxParcelas})`,
            referenciaTipo: ReferenciaTipoAlerta.EMPRESA,
            referenciaId: empresaId,
            metadata: {
              recurso: 'parcelas',
              actual: parcelasCount,
              limite: plan.maxParcelas,
            },
          });
        }
      }

      if (plan.maxUsuarios && plan.maxUsuarios > 0) {
        const pctUsuarios = (usuariosCount / plan.maxUsuarios) * 100;
        if (pctUsuarios >= ALERTAS_UMBRALES.LIMITE_PLAN_PCT) {
          alertas.push({
            codigo: CodigoAlerta.LIMITE_PLAN_CERCANO,
            severidad: SeveridadAlerta.INFORMATIVA,
            cicloId: null,
            ventaId: null,
            clienteId: null,
            observado: `${usuariosCount} de ${plan.maxUsuarios} (${pctUsuarios.toFixed(1)}%)`,
            umbral: `${ALERTAS_UMBRALES.LIMITE_PLAN_PCT.toFixed(1)}%`,
            mensaje: `La empresa está próxima al límite de usuarios de su plan (${usuariosCount}/${plan.maxUsuarios})`,
            referenciaTipo: ReferenciaTipoAlerta.EMPRESA,
            referenciaId: empresaId,
            metadata: {
              recurso: 'usuarios',
              actual: usuariosCount,
              limite: plan.maxUsuarios,
            },
          });
        }
      }
    }

    // =========================================================================
    // FILTROS Y ORDENAMIENTO EN MEMORIA
    // =========================================================================
    let filtradas = AlertasMapper.ordenarAlertas(alertas);

    if (filtro.severidad) {
      filtradas = filtradas.filter((a) => a.severidad === filtro.severidad);
    }
    if (filtro.tipo) {
      filtradas = filtradas.filter((a) => a.codigo === filtro.tipo);
    }
    if (filtro.referenciaTipo) {
      filtradas = filtradas.filter(
        (a) => a.referenciaTipo === filtro.referenciaTipo,
      );
    }
    if (filtro.cicloId) {
      filtradas = filtradas.filter((a) => a.cicloId === filtro.cicloId);
    }

    const total = filtradas.length;
    const data = filtradas.slice(skip, skip + limit);
    const resumen = AlertasMapper.toResumenDto(filtradas);

    return {
      data,
      resumen,
      meta: PaginationUtil.crearMeta(page, limit, total),
    };
  }
}

function numberAsNumber(): true {
  return true;
}
