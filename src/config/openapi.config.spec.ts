import { INestApplication } from '@nestjs/common';
import { OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import { configurarSwagger } from './openapi.config';

describe('configurarSwagger', () => {
  const envOriginal = process.env;
  let setupSpy: jest.SpyInstance;
  let createDocSpy: jest.SpyInstance;

  beforeEach(() => {
    process.env = { ...envOriginal };
    setupSpy = jest.spyOn(SwaggerModule, 'setup').mockImplementation(() => {});
    createDocSpy = jest
      .spyOn(SwaggerModule, 'createDocument')
      .mockReturnValue({ openapi: '3.0.0', paths: {} } as OpenAPIObject);
  });

  afterEach(() => {
    setupSpy.mockRestore();
    createDocSpy.mockRestore();
  });

  afterAll(() => {
    process.env = envOriginal;
  });

  it('en production NO debe montar Swagger (0 llamadas a SwaggerModule.setup)', () => {
    process.env.NODE_ENV = 'production';
    const fakeApp = {} as INestApplication;

    const res = configurarSwagger(fakeApp);

    expect(res).toBeNull();
    expect(setupSpy).not.toHaveBeenCalled();
  });

  it('en development SI debe montar Swagger (>= 1 llamada a SwaggerModule.setup)', () => {
    process.env.NODE_ENV = 'development';
    const fakeApp = {} as INestApplication;

    const res = configurarSwagger(fakeApp);

    expect(res).toBeDefined();
    expect(setupSpy).toHaveBeenCalledTimes(1);
    expect(setupSpy).toHaveBeenCalledWith(
      'api/docs',
      fakeApp,
      expect.objectContaining({
        openapi: '3.0.0',
      }),
    );
  });

  it('en test SI debe montar Swagger (>= 1 llamada a SwaggerModule.setup)', () => {
    process.env.NODE_ENV = 'test';
    const fakeApp = {} as INestApplication;

    const res = configurarSwagger(fakeApp);

    expect(res).toBeDefined();
    expect(setupSpy).toHaveBeenCalledTimes(1);
  });
});
