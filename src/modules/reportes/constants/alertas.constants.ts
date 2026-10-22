export enum SeveridadAlerta {
  ALTA = 'ALTA',
  MEDIA = 'MEDIA',
  BAJA = 'BAJA',
  INFORMATIVA = 'INFORMATIVA',
}

export enum CodigoAlerta {
  CICLO_EN_PERDIDA = 'CICLO_EN_PERDIDA',
  COSTO_SUPERA_PRECIO = 'COSTO_SUPERA_PRECIO',
  COBRO_VENCIDO = 'COBRO_VENCIDO',
  MERMA_ELEVADA = 'MERMA_ELEVADA',
  CATEGORIA_DOMINANTE = 'CATEGORIA_DOMINANTE',
  COSTO_CRECIENTE = 'COSTO_CRECIENTE',
  RENDIMIENTO_BAJO = 'RENDIMIENTO_BAJO',
  CICLO_SIN_CAPTURA = 'CICLO_SIN_CAPTURA',
  CICLO_LARGO = 'CICLO_LARGO',
  LIMITE_PLAN_CERCANO = 'LIMITE_PLAN_CERCANO',
}

export enum ReferenciaTipoAlerta {
  CICLO = 'CICLO',
  VENTA = 'VENTA',
  CLIENTE = 'CLIENTE',
  EMPRESA = 'EMPRESA',
}

export const ALERTAS_UMBRALES = {
  /** Ventana de días hacia atrás para evaluar ciclos finalizados (RN-058 / ADR-010) */
  DIAS_VENTANA_CICLOS_FINALIZADOS: 30,

  /** Días sin gastos ni labores para considerar ciclo activo en abandono (RN-058) */
  DIAS_SIN_LABORES: 15,

  /** Margen mínimo esperado (%) para alertas de rentabilidad */
  MARGEN_MINIMO_ESPERADO_PCT: 15.0,

  /** Margen en riesgo (%) */
  MARGEN_EN_RIESGO_PCT: 5.0,

  /** Porcentaje de merma sobre cosecha considerado crítico (ADR-010: > 10%) */
  MERMA_ELEVADA_PCT: 10.0,

  /** Porcentaje de una sola categoría de gasto sobre el total para considerarla dominante (> 40%) */
  CATEGORIA_DOMINANTE_PCT: 40.0,

  /** Factor de incremento de costo/kg respecto al ciclo anterior de la misma parcela (15% = 1.15) */
  FACTOR_COSTO_CRECIENTE: 1.15,

  /** Porcentaje mínimo cosechado respecto a la meta de producción del ciclo (< 80%) */
  RENDIMIENTO_MINIMO_PCT: 80.0,

  /** Factor multiplicador sobre la duración estándar de la variedad para considerar ciclo largo (1.2) */
  FACTOR_DURACION_VARIEDAD: 1.2,

  /** Porcentaje de consumo de recursos (parcelas o usuarios) respecto al plan para alertar (>= 90%) */
  LIMITE_PLAN_PCT: 90.0,

  /** Días de atraso en cobro para considerar mora crítica de cliente individual */
  DIAS_MORA_CLIENTE: 60,

  /** Días para considerar cuenta por cobrar vencida */
  DIAS_CUENTA_POR_COBRAR_VENCIDA: 30,
} as const;
