import { Request, Response, NextFunction } from 'express';
import { ClsService } from 'nestjs-cls';
import {
  CorrelationIdMiddleware,
  HEADER_CORRELATION_ID,
  HEADER_REQUEST_ID,
} from './correlation-id.middleware';
import { AppClsStore } from '../context/app-cls.store';

describe('CorrelationIdMiddleware', () => {
  let middleware: CorrelationIdMiddleware;
  let mockClsService: {
    isActive: jest.Mock;
    set: jest.Mock;
  };
  let mockRequest: Partial<Request>;
  let mockResponse: {
    setHeader: jest.Mock;
  };
  let mockNext: NextFunction;

  beforeEach(() => {
    mockClsService = {
      isActive: jest.fn().mockReturnValue(true),
      set: jest.fn(),
    };
    middleware = new CorrelationIdMiddleware(
      mockClsService as unknown as ClsService<AppClsStore>,
    );

    mockRequest = {
      headers: {},
    };
    mockResponse = {
      setHeader: jest.fn(),
    };
    mockNext = jest.fn();
  });

  it('debe generar un UUID si no viene encabezado x-correlation-id ni x-request-id', () => {
    middleware.use(
      mockRequest as Request,
      mockResponse as unknown as Response,
      mockNext,
    );

    expect(mockResponse.setHeader).toHaveBeenCalledWith(
      HEADER_CORRELATION_ID,
      expect.stringMatching(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      ),
    );
    expect(mockResponse.setHeader).toHaveBeenCalledWith(
      HEADER_REQUEST_ID,
      expect.stringMatching(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      ),
    );
    expect(mockClsService.set).toHaveBeenCalledWith(
      'correlationId',
      expect.any(String),
    );
    expect(mockNext).toHaveBeenCalled();
  });

  it('debe reutilizar x-correlation-id si ya está presente en el request', () => {
    const existingCorrelationId = 'custom-correlation-12345';
    mockRequest.headers = {
      'x-correlation-id': existingCorrelationId,
    };

    middleware.use(
      mockRequest as Request,
      mockResponse as unknown as Response,
      mockNext,
    );

    expect(mockResponse.setHeader).toHaveBeenCalledWith(
      HEADER_CORRELATION_ID,
      existingCorrelationId,
    );
    expect(mockResponse.setHeader).toHaveBeenCalledWith(
      HEADER_REQUEST_ID,
      existingCorrelationId,
    );
    expect(mockClsService.set).toHaveBeenCalledWith(
      'correlationId',
      existingCorrelationId,
    );
    expect(mockNext).toHaveBeenCalled();
  });

  it('debe reutilizar x-request-id cuando no hay x-correlation-id', () => {
    const proxyRequestId = 'proxy-request-abc-987';
    mockRequest.headers = {
      'x-request-id': proxyRequestId,
    };

    middleware.use(
      mockRequest as Request,
      mockResponse as unknown as Response,
      mockNext,
    );

    expect(mockResponse.setHeader).toHaveBeenCalledWith(
      HEADER_CORRELATION_ID,
      proxyRequestId,
    );
    expect(mockResponse.setHeader).toHaveBeenCalledWith(
      HEADER_REQUEST_ID,
      proxyRequestId,
    );
    expect(mockClsService.set).toHaveBeenCalledWith(
      'correlationId',
      proxyRequestId,
    );
    expect(mockNext).toHaveBeenCalled();
  });

  it('no debe fallar si CLS no está activo al ejecutar la solicitud', () => {
    mockClsService.isActive.mockReturnValue(false);

    middleware.use(
      mockRequest as Request,
      mockResponse as unknown as Response,
      mockNext,
    );

    expect(mockClsService.set).not.toHaveBeenCalled();
    expect(mockNext).toHaveBeenCalled();
  });

  it('debe respetar y no sobrescribir x-request-id si ambos encabezados vienen con valores distintos', () => {
    mockRequest.headers = {
      'x-correlation-id': 'corr-abc-111',
      'x-request-id': 'req-xyz-222',
    };

    middleware.use(
      mockRequest as Request,
      mockResponse as unknown as Response,
      mockNext,
    );

    expect(mockResponse.setHeader).toHaveBeenCalledWith(
      HEADER_CORRELATION_ID,
      'corr-abc-111',
    );
    expect(mockResponse.setHeader).toHaveBeenCalledWith(
      HEADER_REQUEST_ID,
      'req-xyz-222',
    );
    expect(mockClsService.set).toHaveBeenCalledWith(
      'correlationId',
      'corr-abc-111',
    );
    expect(mockNext).toHaveBeenCalled();
  });
});
