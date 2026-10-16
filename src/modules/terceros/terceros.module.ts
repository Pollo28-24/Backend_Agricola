import { Module } from '@nestjs/common';
import { ProveedoresController } from './proveedores.controller';
import { ClientesController } from './clientes.controller';
import { TercerosService } from './terceros.service';

@Module({
  controllers: [ProveedoresController, ClientesController],
  providers: [TercerosService],
  exports: [TercerosService],
})
export class TercerosModule {}
