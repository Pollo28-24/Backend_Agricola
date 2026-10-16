import { PaginacionMetaDto } from '../dto/paginated-response.dto';

export interface ParametrosPaginacion {
  page?: number | string;
  limit?: number | string;
  defaultLimit?: number;
  maxLimit?: number;
}

export interface PaginacionNormalizada {
  page: number;
  limit: number;
  skip: number;
}

export class PaginationUtil {
  static normalizar(
    params: ParametrosPaginacion = {},
  ): PaginacionNormalizada {
    const rawPage = Number(params.page);
    const rawLimit = Number(params.limit);

    const defaultLimit = params.defaultLimit ?? 20;
    const maxLimit = params.maxLimit ?? 100;

    const page =
      !isNaN(rawPage) && rawPage > 0
        ? Math.floor(rawPage)
        : 1;

    const limit =
      !isNaN(rawLimit) && rawLimit > 0
        ? Math.min(Math.floor(rawLimit), maxLimit)
        : defaultLimit;

    return {
      page,
      limit,
      skip: (page - 1) * limit,
    };
  }

  static calcularTotalPages(
    total: number,
    limit: number,
  ): number {
    if (limit <= 0) {
      return 1;
    }

    return Math.ceil(total / limit) || 1;
  }

  static crearMeta(
    page: number,
    limit: number,
    total: number,
  ): PaginacionMetaDto {
    return {
      total,
      page,
      limit,
      totalPages: this.calcularTotalPages(total, limit),
    };
  }
}
