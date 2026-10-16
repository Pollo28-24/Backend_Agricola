import { PaginationUtil } from './pagination.util';

describe('PaginationUtil', () => {
  describe('normalizar', () => {
    it('debe usar valores por defecto (page=1, limit=20, skip=0) cuando no se pasan parámetros', () => {
      const res = PaginationUtil.normalizar();
      expect(res).toEqual({
        page: 1,
        limit: 20,
        skip: 0,
      });
    });

    it('debe normalizar página inexistente, vacía o undefined a página 1', () => {
      expect(PaginationUtil.normalizar({ page: undefined }).page).toBe(1);
      expect(PaginationUtil.normalizar({ page: '' as any }).page).toBe(1);
      expect(PaginationUtil.normalizar({ page: 'abc' as any }).page).toBe(1);
    });

    it('debe corregir página negativa o cero a página 1', () => {
      expect(PaginationUtil.normalizar({ page: 0 }).page).toBe(1);
      expect(PaginationUtil.normalizar({ page: -5 }).page).toBe(1);
    });

    it('debe respetar página válida y calcular skip correctamente', () => {
      const res = PaginationUtil.normalizar({ page: 3, limit: 10 });
      expect(res).toEqual({
        page: 3,
        limit: 10,
        skip: 20, // (3 - 1) * 10
      });
    });

    it('debe usar defaultLimit cuando el límite es inexistente, cero o negativo', () => {
      expect(PaginationUtil.normalizar({ limit: undefined }).limit).toBe(20);
      expect(PaginationUtil.normalizar({ limit: 0 }).limit).toBe(20);
      expect(PaginationUtil.normalizar({ limit: -10 }).limit).toBe(20);
      expect(
        PaginationUtil.normalizar({ limit: 'invalido' as any }).limit,
      ).toBe(20);
    });

    it('debe acotar el límite a maxLimit (100 por defecto) cuando se solicita un límite mayor', () => {
      const res = PaginationUtil.normalizar({ limit: 500 });
      expect(res.limit).toBe(100);
    });

    it('debe admitir parámetros string provenientes de query params', () => {
      const res = PaginationUtil.normalizar({ page: '4', limit: '25' });
      expect(res).toEqual({
        page: 4,
        limit: 25,
        skip: 75,
      });
    });

    it('debe redondear hacia abajo valores decimales en page y limit', () => {
      const res = PaginationUtil.normalizar({ page: 2.7, limit: 15.9 });
      expect(res).toEqual({
        page: 2,
        limit: 15,
        skip: 15,
      });
    });
  });

  describe('calcularTotalPages', () => {
    it('debe retornar 1 si total es 0', () => {
      expect(PaginationUtil.calcularTotalPages(0, 20)).toBe(1);
    });

    it('debe calcular división exacta de páginas', () => {
      expect(PaginationUtil.calcularTotalPages(100, 20)).toBe(5);
      expect(PaginationUtil.calcularTotalPages(50, 10)).toBe(5);
    });

    it('debe calcular división con residuo redondeando hacia arriba', () => {
      expect(PaginationUtil.calcularTotalPages(21, 20)).toBe(2);
      expect(PaginationUtil.calcularTotalPages(45, 20)).toBe(3);
      expect(PaginationUtil.calcularTotalPages(1, 20)).toBe(1);
    });

    it('debe retornar 1 si el límite es menor o igual a cero', () => {
      expect(PaginationUtil.calcularTotalPages(50, 0)).toBe(1);
      expect(PaginationUtil.calcularTotalPages(50, -5)).toBe(1);
    });
  });

  describe('crearMeta', () => {
    it('debe construir el objeto PaginationMetaDto con el contrato exacto', () => {
      const meta = PaginationUtil.crearMeta(2, 20, 45);
      expect(meta).toEqual({
        total: 45,
        page: 2,
        limit: 20,
        totalPages: 3,
      });
    });
  });
});
