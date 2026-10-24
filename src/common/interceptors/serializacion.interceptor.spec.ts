import { ExecutionContext, CallHandler, StreamableFile } from '@nestjs/common';
import { of, firstValueFrom } from 'rxjs';
import { Prisma } from '@prisma/client';
import { SerializacionInterceptor } from './serializacion.interceptor';

describe('SerializacionInterceptor', () => {
  let interceptor: SerializacionInterceptor;

  const mockExecutionContext = {} as ExecutionContext;

  const createCallHandler = (data: unknown): CallHandler => ({
    handle: () => of(data),
  });

  beforeEach(() => {
    interceptor = new SerializacionInterceptor();
  });

  it('debe dejar StreamableFile intacto sin transformarlo a POJO', async () => {
    const buffer = Buffer.from('archivo binario de prueba');
    const streamableFile = new StreamableFile(buffer, {
      type: 'text/csv',
      disposition: 'attachment; filename="reporte.csv"',
    });

    const handler = createCallHandler(streamableFile);
    const result = await firstValueFrom(
      interceptor.intercept(mockExecutionContext, handler),
    );

    expect(result).toBeInstanceOf(StreamableFile);
    expect(result).toBe(streamableFile);
  });

  it('debe dejar Buffer intacto sin descomponerlo en array/objeto indexado', async () => {
    const rawBuffer = Buffer.from([0x25, 0x50, 0x44, 0x46]); // %PDF

    const handler = createCallHandler(rawBuffer);
    const result = await firstValueFrom(
      interceptor.intercept(mockExecutionContext, handler),
    );

    expect(Buffer.isBuffer(result)).toBe(true);
    expect(result).toBe(rawBuffer);
  });

  it('debe transformar BigInt a string para serialización JSON segura', async () => {
    const data = { id: BigInt('9007199254740993') };
    const handler = createCallHandler(data);
    const result = await firstValueFrom(
      interceptor.intercept(mockExecutionContext, handler),
    );

    expect(result).toEqual({ id: '9007199254740993' });
  });

  it('debe transformar Prisma.Decimal a string para contratos JSON numéricos exactos', async () => {
    const data = {
      costo: new Prisma.Decimal('1234.56'),
      desglose: [new Prisma.Decimal('10.5'), new Prisma.Decimal('20.25')],
    };
    const handler = createCallHandler(data);
    const result = await firstValueFrom(
      interceptor.intercept(mockExecutionContext, handler),
    );

    expect(result).toEqual({
      costo: '1234.56',
      desglose: ['10.5', '20.25'],
    });
  });

  it('debe transformar Date a string ISO8601', async () => {
    const fecha = new Date('2026-10-24T12:00:00.000Z');
    const data = { fechaCreacion: fecha };
    const handler = createCallHandler(data);
    const result = await firstValueFrom(
      interceptor.intercept(mockExecutionContext, handler),
    );

    expect(result).toEqual({ fechaCreacion: '2026-10-24T12:00:00.000Z' });
  });

  it('debe preservar objetos anidados, arrays y primitivos JSON estándar intactos', async () => {
    const data = {
      nombre: 'Tomate Saladette',
      activo: true,
      conteo: 42,
      nulo: null,
      indefinido: undefined,
      etiquetas: ['campo', 'piloto'],
      meta: {
        version: 1,
        autor: 'Admin',
      },
    };
    const handler = createCallHandler(data);
    const result = await firstValueFrom(
      interceptor.intercept(mockExecutionContext, handler),
    );

    expect(result).toEqual({
      nombre: 'Tomate Saladette',
      activo: true,
      conteo: 42,
      nulo: null,
      indefinido: undefined,
      etiquetas: ['campo', 'piloto'],
      meta: {
        version: 1,
        autor: 'Admin',
      },
    });
  });
});
