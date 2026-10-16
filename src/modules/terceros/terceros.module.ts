import { Module } from '@nestjs/common';
import { ProveedoresController } from './proveedores.controller';
import { ClientesController } from './clientes.controller';
import { ProveedoresService } from './proveedores.service';
import { ClientesService } from './clientes.service';

@Module({
  controllers: [ProveedoresController, ClientesController],
  providers: [ProveedoresService, ClientesService],
  exports: [ProveedoresService, ClientesService],
})
export class TercerosModule {}
