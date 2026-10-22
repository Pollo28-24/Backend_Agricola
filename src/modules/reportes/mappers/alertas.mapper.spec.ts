import { AlertasMapper } from './alertas.mapper';
import {
  CodigoAlerta,
  SeveridadAlerta,
  ReferenciaTipoAlerta,
} from '../constants/alertas.constants';
import { AlertaItemDto } from '../dto/alertas-response.dto';

describe('AlertasMapper (Unitario)', () => {
  const alertaAlta: AlertaItemDto = {
    codigo: CodigoAlerta.CICLO_EN_PERDIDA,
    severidad: SeveridadAlerta.ALTA,
    cicloId: 2,
    ventaId: null,
    clienteId: null,
    observado: '-$1000.00',
    umbral: '$0.00',
    mensaje: 'Pérdida',
    referenciaTipo: ReferenciaTipoAlerta.CICLO,
    referenciaId: 2,
    metadata: null,
  };

  const alertaMedia: AlertaItemDto = {
    codigo: CodigoAlerta.MERMA_ELEVADA,
    severidad: SeveridadAlerta.MEDIA,
    cicloId: 1,
    ventaId: null,
    clienteId: null,
    observado: '15.00%',
    umbral: '10.00%',
    mensaje: 'Merma',
    referenciaTipo: ReferenciaTipoAlerta.CICLO,
    referenciaId: 1,
    metadata: null,
  };

  const alertaBaja: AlertaItemDto = {
    codigo: CodigoAlerta.CICLO_SIN_CAPTURA,
    severidad: SeveridadAlerta.BAJA,
    cicloId: 3,
    ventaId: null,
    clienteId: null,
    observado: '20 días',
    umbral: '15 días',
    mensaje: 'Inactivo',
    referenciaTipo: ReferenciaTipoAlerta.CICLO,
    referenciaId: 3,
    metadata: null,
  };

  const alertaInfo: AlertaItemDto = {
    codigo: CodigoAlerta.LIMITE_PLAN_CERCANO,
    severidad: SeveridadAlerta.INFORMATIVA,
    cicloId: null,
    ventaId: null,
    clienteId: null,
    observado: '9 de 10',
    umbral: '90.00%',
    mensaje: 'Límite',
    referenciaTipo: ReferenciaTipoAlerta.EMPRESA,
    referenciaId: 1,
    metadata: null,
  };

  it('ordena alertas por severidad canónica ALTA -> MEDIA -> BAJA -> INFORMATIVA', () => {
    const desordenadas = [alertaBaja, alertaInfo, alertaAlta, alertaMedia];
    const ordenadas = AlertasMapper.ordenarAlertas(desordenadas);

    expect(ordenadas[0].severidad).toBe(SeveridadAlerta.ALTA);
    expect(ordenadas[1].severidad).toBe(SeveridadAlerta.MEDIA);
    expect(ordenadas[2].severidad).toBe(SeveridadAlerta.BAJA);
    expect(ordenadas[3].severidad).toBe(SeveridadAlerta.INFORMATIVA);
  });

  it('toResumenDto calcula el desglose correcto por severidad', () => {
    const resumen = AlertasMapper.toResumenDto([
      alertaAlta,
      alertaMedia,
      alertaBaja,
      alertaInfo,
    ]);

    expect(resumen.totalAltas).toBe(1);
    expect(resumen.totalMedias).toBe(1);
    expect(resumen.totalBajas).toBe(1);
    expect(resumen.totalInformativas).toBe(1);
    expect(resumen.total).toBe(4);
  });
});
