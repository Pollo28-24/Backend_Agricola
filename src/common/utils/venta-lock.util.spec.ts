import { EstadoVenta, Prisma } from '@prisma/client';
import { bloquearVentaParaModificacion } from './venta-lock.util';
import { CodigoError } from '../errors/codigos-error.enum';

describe('bloquearVentaParaModificacion (RN-071)', () => {
  it('bloquea exitosamente la venta y convierte campos decimales y fechas', async () => {
    const mockRow = {
      id: 10,
      cicloId: 5,
      clienteId: 2,
      total: '1250.50',
      estado: 'REGISTRADA',
      fechaLimitePago: '2026-03-31T00:00:00.000Z',
      fecha: '2026-03-01T00:00:00.000Z',
    };

    const mockQueryRaw = jest.fn().mockResolvedValue([mockRow]);
    const mockTx = {
      $queryRaw: mockQueryRaw,
    } as unknown as Prisma.TransactionClient;

    const res = await bloquearVentaParaModificacion(mockTx, 10, 1);

    expect(mockQueryRaw).toHaveBeenCalledTimes(1);
    expect(res.id).toBe(10);
    expect(res.cicloId).toBe(5);
    expect(res.clienteId).toBe(2);
    expect(res.total).toBeInstanceOf(Prisma.Decimal);
    expect(res.total.toString()).toBe('1250.5');
    expect(res.estado).toBe(EstadoVenta.REGISTRADA);
    expect(res.fechaLimitePago).toBeInstanceOf(Date);
    expect(res.fecha).toBeInstanceOf(Date);
  });

  it('lanza 404 RECURSO_NO_ENCONTRADO si la venta no existe o no pertenece a la empresa', async () => {
    const mockQueryRaw = jest.fn().mockResolvedValue([]);
    const mockTx = {
      $queryRaw: mockQueryRaw,
    } as unknown as Prisma.TransactionClient;

    await expect(
      bloquearVentaParaModificacion(mockTx, 999, 1),
    ).rejects.toMatchObject({
      code: CodigoError.RECURSO_NO_ENCONTRADO,
    });
  });

  it('maneja fechaLimitePago nula correctamente', async () => {
    const mockRow = {
      id: 11,
      cicloId: 5,
      clienteId: 2,
      total: '500.00',
      estado: 'REGISTRADA',
      fechaLimitePago: null,
      fecha: '2026-03-01T00:00:00.000Z',
    };

    const mockQueryRaw = jest.fn().mockResolvedValue([mockRow]);
    const mockTx = {
      $queryRaw: mockQueryRaw,
    } as unknown as Prisma.TransactionClient;

    const res = await bloquearVentaParaModificacion(mockTx, 11, 1);
    expect(res.fechaLimitePago).toBeNull();
  });
});
