import { HttpStatus, ArgumentsHost } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DomainExceptionFilter } from './domain-exception.filter';
import { DomainError } from '../errors/domain.error';
import { CodigoError } from '../errors/codigos-error.enum';

describe('DomainExceptionFilter', () => {
  let filter: DomainExceptionFilter;
  let mockResponse: { status: jest.Mock; json: jest.Mock };
  let mockHost: ArgumentsHost;

  beforeEach(() => {
    filter = new DomainExceptionFilter();
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    mockHost = {
      switchToHttp: () => ({
        getResponse: () => mockResponse,
        getRequest: () => ({}),
      }),
    } as unknown as ArgumentsHost;
  });

  it('debe manejar DomainError correctamente respetando su código y status', () => {
    const error = new DomainError(
      CodigoError.LIMITE_PLAN_EXCEDIDO,
      'Límite de parcelas alcanzado',
      HttpStatus.CONFLICT,
      { maxParcelas: 5 },
    );

    filter.catch(error, mockHost);

    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.CONFLICT);
    expect(mockResponse.json).toHaveBeenCalledWith({
      statusCode: HttpStatus.CONFLICT,
      code: CodigoError.LIMITE_PLAN_EXCEDIDO,
      message: 'Límite de parcelas alcanzado',
      details: { maxParcelas: 5 },
    });
  });

  describe('Manejo de errores Prisma (ADR-003)', () => {
    it('debe mapear P2002 a 409 Conflict con mensaje sanitizado sin exponer meta ni SQL', () => {
      const prismaError = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed on the constraint: `empresa_rfc_key`',
        {
          code: 'P2002',
          clientVersion: '7.0.0',
          meta: { target: ['rfc'] },
        },
      );

      filter.catch(prismaError, mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.CONFLICT);
      expect(mockResponse.json).toHaveBeenCalledWith({
        statusCode: HttpStatus.CONFLICT,
        code: CodigoError.CONFLICTO,
        message: 'Ya existe un registro con los datos proporcionados',
      });
      // Verificar sanitización estricta: NO fugar meta
      const calls = mockResponse.json.mock.calls as Array<
        [Record<string, unknown>]
      >;
      const jsonCall = calls[0][0];
      expect(jsonCall.meta).toBeUndefined();
      expect(jsonCall.target).toBeUndefined();
    });

    it('debe mapear P2003 a 409 Conflict con mensaje de dependencias residuales', () => {
      const prismaError = new Prisma.PrismaClientKnownRequestError(
        'Foreign key constraint failed on the field: `predioId`',
        {
          code: 'P2003',
          clientVersion: '7.0.0',
          meta: { field_name: 'predioId' },
        },
      );

      filter.catch(prismaError, mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.CONFLICT);
      expect(mockResponse.json).toHaveBeenCalledWith({
        statusCode: HttpStatus.CONFLICT,
        code: CodigoError.CONFLICTO,
        message:
          'No es posible completar la operación debido a dependencias con otros registros',
      });
    });

    it('debe mapear P2025 a 404 Not Found', () => {
      const prismaError = new Prisma.PrismaClientKnownRequestError(
        'An operation failed because it depends on one or more records that were required but not found.',
        {
          code: 'P2025',
          clientVersion: '7.0.0',
        },
      );

      filter.catch(prismaError, mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
      expect(mockResponse.json).toHaveBeenCalledWith({
        statusCode: HttpStatus.NOT_FOUND,
        code: CodigoError.RECURSO_NO_ENCONTRADO,
        message:
          'El registro solicitado no existe o no se encuentra disponible',
      });
    });

    it('debe mapear otros códigos Prisma desconocidos a 500 Internal Server Error', () => {
      const prismaError = new Prisma.PrismaClientKnownRequestError(
        'Some generic database error',
        {
          code: 'P2010',
          clientVersion: '7.0.0',
        },
      );

      filter.catch(prismaError, mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
      expect(mockResponse.json).toHaveBeenCalledWith({
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        code: CodigoError.ERROR_INTERNO,
        message: 'Ocurrió un error en la base de datos',
      });
    });
  });

  it('debe registrar en log estructurado el correlationId y contexto ante errores no controlados', () => {
    const errorGenerico = new Error('Fallo inesperado del sistema');
    const loggerObj = (
      filter as unknown as { logger: { error: (...args: unknown[]) => void } }
    ).logger;
    const loggerSpy = jest.spyOn(loggerObj, 'error').mockImplementation();

    const mockHostConContexto = {
      switchToHttp: () => ({
        getResponse: () => mockResponse,
        getRequest: () => ({
          url: '/api/v1/ciclos',
          method: 'POST',
          headers: {
            'x-correlation-id': 'test-corr-id-xyz',
          },
        }),
      }),
    } as unknown as ArgumentsHost;

    filter.catch(errorGenerico, mockHostConContexto);

    expect(mockResponse.status).toHaveBeenCalledWith(
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
    expect(loggerSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        correlationId: 'test-corr-id-xyz',
        endpoint: '/api/v1/ciclos',
        metodo: 'POST',
        codigo: CodigoError.ERROR_INTERNO,
        mensaje: 'Error no controlado: Fallo inesperado del sistema',
      }),
    );
  });

  it('debe mapear 429 Too Many Requests a DEMASIADAS_PETICIONES y fijar cabecera Retry-After', () => {
    const setHeaderMock = jest.fn();
    const getHeaderMock = jest.fn().mockReturnValue(undefined);
    const mockHost429 = {
      switchToHttp: () => ({
        getResponse: () => ({
          ...mockResponse,
          setHeader: setHeaderMock,
          getHeader: getHeaderMock,
        }),
        getRequest: () => ({
          url: '/api/v1/auth/login',
          method: 'POST',
        }),
      }),
    } as unknown as ArgumentsHost;

    const throttlerError = new DomainError(
      'DEMASIADAS_PETICIONES' as CodigoError,
      'Demasiadas peticiones. Intente más tarde.',
      HttpStatus.TOO_MANY_REQUESTS,
      { retryAfter: 900 },
    );

    filter.catch(throttlerError, mockHost429);

    expect(mockResponse.status).toHaveBeenCalledWith(
      HttpStatus.TOO_MANY_REQUESTS,
    );
    expect(setHeaderMock).toHaveBeenCalledWith('Retry-After', '900');
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        code: 'DEMASIADAS_PETICIONES',
      }),
    );
  });
});
