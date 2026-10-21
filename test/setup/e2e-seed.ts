import {
  PrismaClient,
  EstadoParcela,
  EstadoCiclo,
  CalidadCosecha,
  EtapaMerma,
  Prisma,
} from '@prisma/client';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';

export interface E2eSeedData {
  empresaA: {
    id: number;
    nombre: string;
    usuarios: {
      admin: { id: number; correo: string };
      capturista: { id: number; correo: string };
      contador: { id: number; correo: string };
    };
    predio: { id: number };
    parcela: { id: number };
    parcela2: { id: number };
    cicloActivo: { id: number };
    cicloPlanificado: { id: number };
    proveedor: { id: number };
    categoriaPropia: { id: number };
    actividadAdmin: { id: number };
    actividadCapturista: { id: number };
    gastoAdmin: { id: number };
    gastoCapturista: { id: number };
    cosechaAdmin: { id: number };
    cosechaCapturista: { id: number };
    mermaAdmin: { id: number };
    mermaCapturista: { id: number };
    cliente: { id: number };
    venta: { id: number };
  };
  empresaB: {
    id: number;
    nombre: string;
    usuarios: {
      admin: { id: number; correo: string };
      capturista: { id: number; correo: string };
      contador: { id: number; correo: string };
    };
    predio: { id: number };
    parcela: { id: number };
    cicloActivo: { id: number };
    proveedor: { id: number };
    categoriaPropia: { id: number };
    actividad: { id: number };
    gasto: { id: number };
    cosecha: { id: number };
    merma: { id: number };
    cliente: { id: number };
    venta: { id: number };
  };
  global: {
    unidadKgId: number;
    motivoMermaId: number;
    tipoActividadId: number;
    categoriaSistemaId: number;
    variedadId: number;
  };
}

let cachedSeedData: E2eSeedData | null = null;

export async function seedMultiempresaE2e(
  prisma: PrismaClient,
): Promise<E2eSeedData> {
  const contrasenaHash = await argon2.hash('Password123!');

  // Roles existentes del seed base
  const rolAdmin = await prisma.rol.findUniqueOrThrow({
    where: { codigo: 'ADMIN' },
  });
  const rolCapturista = await prisma.rol.findUniqueOrThrow({
    where: { codigo: 'CAPTURISTA' },
  });
  const rolContador = await prisma.rol.findUniqueOrThrow({
    where: { codigo: 'CONTADOR' },
  });

  // Plan existente
  const plan = await prisma.planSuscripcion.findFirstOrThrow({
    where: { codigo: 'PROFESIONAL' },
  });

  // Catálogos globales existentes
  const unidadKg = await prisma.unidadMedida.findUniqueOrThrow({
    where: { codigo: 'KG' },
  });
  const motivoMerma = await prisma.motivoMerma.findFirstOrThrow({
    where: { activo: true },
  });
  const tipoActividad = await prisma.tipoActividad.findFirstOrThrow({
    where: { activo: true },
  });
  const categoriaSistema = await prisma.categoriaGasto.findFirstOrThrow({
    where: { empresaId: null, activo: true },
  });
  const variedad = await prisma.variedad.findFirstOrThrow({
    where: { activo: true },
  });

  // =========================================================================
  // 1. EMPRESA A
  // =========================================================================
  const empresaA = await prisma.empresa.create({
    data: {
      nombre: 'Agrícola San Pedro S.A. (Empresa A)',
      rfc: 'ASP200101AA1',
      correo: 'contacto@empresa-a.com',
      planId: plan.id,
      estadoSuscripcion: 'ACTIVA',
      activo: true,
    },
  });

  const aAdmin = await prisma.usuario.create({
    data: {
      empresaId: empresaA.id,
      rolId: rolAdmin.id,
      nombre: 'Admin',
      apellido: 'Empresa A',
      correo: 'admin.a@e2e-test.com',
      contrasenaHash,
      activo: true,
    },
  });

  const aCapturista = await prisma.usuario.create({
    data: {
      empresaId: empresaA.id,
      rolId: rolCapturista.id,
      nombre: 'Capturista',
      apellido: 'Empresa A',
      correo: 'capturista.a@e2e-test.com',
      contrasenaHash,
      activo: true,
    },
  });

  const aContador = await prisma.usuario.create({
    data: {
      empresaId: empresaA.id,
      rolId: rolContador.id,
      nombre: 'Contador',
      apellido: 'Empresa A',
      correo: 'contador.a@e2e-test.com',
      contrasenaHash,
      activo: true,
    },
  });

  const predioA = await prisma.predio.create({
    data: {
      empresaId: empresaA.id,
      nombre: 'Rancho Las Palmas A',
      superficieTotal: new Prisma.Decimal('50.00'),
    },
  });

  const parcelaA1 = await prisma.parcela.create({
    data: {
      predioId: predioA.id,
      nombre: 'Parcela Norte A1',
      superficie: new Prisma.Decimal('10.00'),
      estado: EstadoParcela.EN_USO,
    },
  });

  const parcelaA2 = await prisma.parcela.create({
    data: {
      predioId: predioA.id,
      nombre: 'Parcela Sur A2',
      superficie: new Prisma.Decimal('15.00'),
      estado: EstadoParcela.DISPONIBLE,
    },
  });

  const cicloA_Activo = await prisma.cicloProduccion.create({
    data: {
      empresaId: empresaA.id,
      parcelaId: parcelaA1.id,
      variedadId: variedad.id,
      creadoPorId: aAdmin.id,
      nombre: 'Ciclo Tomate 2026 A - Activo',
      estado: EstadoCiclo.ACTIVO,
      fechaInicio: new Date('2026-01-01'),
      superficieSembrada: new Prisma.Decimal('8.00'),
    },
  });

  const cicloA_Planif = await prisma.cicloProduccion.create({
    data: {
      empresaId: empresaA.id,
      parcelaId: parcelaA2.id,
      variedadId: variedad.id,
      creadoPorId: aAdmin.id,
      nombre: 'Ciclo Tomate 2026 A - Planificado',
      estado: EstadoCiclo.PLANIFICADO,
      fechaInicio: new Date('2026-06-01'),
      superficieSembrada: new Prisma.Decimal('5.00'),
    },
  });

  const proveedorA = await prisma.proveedor.create({
    data: {
      empresaId: empresaA.id,
      nombre: 'Agroquímicos del Norte A',
      rfc: 'ANA100101999',
      activo: true,
    },
  });

  const categoriaPropiaA = await prisma.categoriaGasto.create({
    data: {
      empresaId: empresaA.id,
      nombre: 'Mantenimiento de Tractores A',
      activo: true,
    },
  });

  const actAdminA = await prisma.actividad.create({
    data: {
      cicloId: cicloA_Activo.id,
      tipoActividadId: tipoActividad.id,
      responsableId: aAdmin.id,
      creadoPorId: aAdmin.id,
      fecha: new Date('2026-02-01'),
      descripcion: 'Riego por goteo inicial A (Admin)',
    },
  });

  const actCapA = await prisma.actividad.create({
    data: {
      cicloId: cicloA_Activo.id,
      tipoActividadId: tipoActividad.id,
      responsableId: aCapturista.id,
      creadoPorId: aCapturista.id,
      fecha: new Date('2026-02-05'),
      descripcion: 'Deshierbe manual A (Capturista)',
    },
  });

  const gastoAdminA = await prisma.gasto.create({
    data: {
      cicloId: cicloA_Activo.id,
      categoriaId: categoriaPropiaA.id,
      proveedorId: proveedorA.id,
      actividadId: actAdminA.id,
      unidadId: unidadKg.id,
      creadoPorId: aAdmin.id,
      fecha: new Date('2026-02-10'),
      descripcion: 'Compra de refacciones A (Admin)',
      cantidad: new Prisma.Decimal('10.000'),
      costoUnitario: new Prisma.Decimal('100.00'),
      impuesto: new Prisma.Decimal('16.00'),
      total: new Prisma.Decimal('1016.00'),
    },
  });

  const gastoCapA = await prisma.gasto.create({
    data: {
      cicloId: cicloA_Activo.id,
      categoriaId: categoriaSistema.id,
      proveedorId: proveedorA.id,
      actividadId: actCapA.id,
      unidadId: unidadKg.id,
      creadoPorId: aCapturista.id,
      fecha: new Date('2026-02-12'),
      descripcion: 'Gasto menor campo A (Capturista)',
      cantidad: new Prisma.Decimal('2.000'),
      costoUnitario: new Prisma.Decimal('50.00'),
      impuesto: new Prisma.Decimal('0.00'),
      total: new Prisma.Decimal('100.00'),
    },
  });

  const cosechaAdminA = await prisma.cosecha.create({
    data: {
      cicloId: cicloA_Activo.id,
      unidadId: unidadKg.id,
      creadoPorId: aAdmin.id,
      fecha: new Date('2026-03-01'),
      cantidad: new Prisma.Decimal('1000.000'),
      calidad: CalidadCosecha.PRIMERA,
      observaciones: 'Primer corte A (Admin)',
    },
  });

  const cosechaCapA = await prisma.cosecha.create({
    data: {
      cicloId: cicloA_Activo.id,
      unidadId: unidadKg.id,
      creadoPorId: aCapturista.id,
      fecha: new Date('2026-03-05'),
      cantidad: new Prisma.Decimal('500.000'),
      calidad: CalidadCosecha.SEGUNDA,
      observaciones: 'Segundo corte A (Capturista)',
    },
  });

  const mermaAdminA = await prisma.merma.create({
    data: {
      cicloId: cicloA_Activo.id,
      motivoId: motivoMerma.id,
      unidadId: unidadKg.id,
      cosechaId: cosechaAdminA.id,
      creadoPorId: aAdmin.id,
      fecha: new Date('2026-03-02'),
      cantidad: new Prisma.Decimal('50.000'),
      etapa: EtapaMerma.POSCOSECHA,
      observaciones: 'Pérdida transporte empaque A (Admin)',
    },
  });

  const mermaCapA = await prisma.merma.create({
    data: {
      cicloId: cicloA_Activo.id,
      motivoId: motivoMerma.id,
      unidadId: unidadKg.id,
      cosechaId: cosechaCapA.id,
      creadoPorId: aCapturista.id,
      fecha: new Date('2026-03-06'),
      cantidad: new Prisma.Decimal('20.000'),
      etapa: EtapaMerma.POSCOSECHA,
      observaciones: 'Pérdida selección A (Capturista)',
    },
  });

  const clienteA = await prisma.cliente.create({
    data: {
      empresaId: empresaA.id,
      nombre: 'Distribuidora San Pedro A',
      rfc: 'DSP200101AA1',
      activo: true,
    },
  });

  const ventaA = await prisma.venta.create({
    data: {
      cicloId: cicloA_Activo.id,
      clienteId: clienteA.id,
      creadoPorId: aAdmin.id,
      fecha: new Date('2026-03-10'),
      numeroFactura: 'FAC-A-001',
      descuento: new Prisma.Decimal('0.00'),
      impuesto: new Prisma.Decimal('0.00'),
      total: new Prisma.Decimal('2500.00'),
      estado: 'REGISTRADA',
      detalles: {
        create: [
          {
            cosechaId: cosechaAdminA.id,
            unidadId: unidadKg.id,
            calidad: CalidadCosecha.PRIMERA,
            cantidad: new Prisma.Decimal('100.000'),
            precioUnitario: new Prisma.Decimal('25.00'),
          },
        ],
      },
    },
  });

  // =========================================================================
  // 2. EMPRESA B
  // =========================================================================
  const empresaB = await prisma.empresa.create({
    data: {
      nombre: 'Cultivos del Valle S.P.R. (Empresa B)',
      rfc: 'CVB200202BB2',
      correo: 'contacto@empresa-b.com',
      planId: plan.id,
      estadoSuscripcion: 'ACTIVA',
      activo: true,
    },
  });

  const bAdmin = await prisma.usuario.create({
    data: {
      empresaId: empresaB.id,
      rolId: rolAdmin.id,
      nombre: 'Admin',
      apellido: 'Empresa B',
      correo: 'admin.b@e2e-test.com',
      contrasenaHash,
      activo: true,
    },
  });

  const bCapturista = await prisma.usuario.create({
    data: {
      empresaId: empresaB.id,
      rolId: rolCapturista.id,
      nombre: 'Capturista',
      apellido: 'Empresa B',
      correo: 'capturista.b@e2e-test.com',
      contrasenaHash,
      activo: true,
    },
  });

  const bContador = await prisma.usuario.create({
    data: {
      empresaId: empresaB.id,
      rolId: rolContador.id,
      nombre: 'Contador',
      apellido: 'Empresa B',
      correo: 'contador.b@e2e-test.com',
      contrasenaHash,
      activo: true,
    },
  });

  const predioB = await prisma.predio.create({
    data: {
      empresaId: empresaB.id,
      nombre: 'Hacienda El Rocío B',
      superficieTotal: new Prisma.Decimal('80.00'),
    },
  });

  const parcelaB = await prisma.parcela.create({
    data: {
      predioId: predioB.id,
      nombre: 'Parcela Central B1',
      superficie: new Prisma.Decimal('20.00'),
      estado: EstadoParcela.EN_USO,
    },
  });

  const cicloB_Activo = await prisma.cicloProduccion.create({
    data: {
      empresaId: empresaB.id,
      parcelaId: parcelaB.id,
      variedadId: variedad.id,
      creadoPorId: bAdmin.id,
      nombre: 'Ciclo Tomate 2026 B - Activo',
      estado: EstadoCiclo.ACTIVO,
      fechaInicio: new Date('2026-01-01'),
      superficieSembrada: new Prisma.Decimal('12.00'),
    },
  });

  const proveedorB = await prisma.proveedor.create({
    data: {
      empresaId: empresaB.id,
      nombre: 'Semillas del Sur B',
      rfc: 'SSB200202888',
      activo: true,
    },
  });

  const categoriaPropiaB = await prisma.categoriaGasto.create({
    data: {
      empresaId: empresaB.id,
      nombre: 'Sistemas de Riego B',
      activo: true,
    },
  });

  const actB = await prisma.actividad.create({
    data: {
      cicloId: cicloB_Activo.id,
      tipoActividadId: tipoActividad.id,
      responsableId: bAdmin.id,
      creadoPorId: bAdmin.id,
      fecha: new Date('2026-02-01'),
      descripcion: 'Aplicación biológica B',
    },
  });

  const gastoB = await prisma.gasto.create({
    data: {
      cicloId: cicloB_Activo.id,
      categoriaId: categoriaPropiaB.id,
      proveedorId: proveedorB.id,
      actividadId: actB.id,
      unidadId: unidadKg.id,
      creadoPorId: bAdmin.id,
      fecha: new Date('2026-02-15'),
      descripcion: 'Gasto operativo B',
      cantidad: new Prisma.Decimal('5.000'),
      costoUnitario: new Prisma.Decimal('200.00'),
      impuesto: new Prisma.Decimal('0.00'),
      total: new Prisma.Decimal('1000.00'),
    },
  });

  const cosechaB = await prisma.cosecha.create({
    data: {
      cicloId: cicloB_Activo.id,
      unidadId: unidadKg.id,
      creadoPorId: bAdmin.id,
      fecha: new Date('2026-03-01'),
      cantidad: new Prisma.Decimal('800.000'),
      calidad: CalidadCosecha.PRIMERA,
      observaciones: 'Corte B',
    },
  });

  const mermaB = await prisma.merma.create({
    data: {
      cicloId: cicloB_Activo.id,
      motivoId: motivoMerma.id,
      unidadId: unidadKg.id,
      cosechaId: cosechaB.id,
      creadoPorId: bAdmin.id,
      fecha: new Date('2026-03-03'),
      cantidad: new Prisma.Decimal('40.000'),
      etapa: EtapaMerma.POSCOSECHA,
      observaciones: 'Merma B',
    },
  });

  const clienteB = await prisma.cliente.create({
    data: {
      empresaId: empresaB.id,
      nombre: 'Comercializadora del Valle B',
      rfc: 'CVB200202BB1',
      activo: true,
    },
  });

  const ventaB = await prisma.venta.create({
    data: {
      cicloId: cicloB_Activo.id,
      clienteId: clienteB.id,
      creadoPorId: bAdmin.id,
      fecha: new Date('2026-03-10'),
      numeroFactura: 'FAC-B-001',
      descuento: new Prisma.Decimal('0.00'),
      impuesto: new Prisma.Decimal('0.00'),
      total: new Prisma.Decimal('2500.00'),
      estado: 'REGISTRADA',
      detalles: {
        create: [
          {
            cosechaId: cosechaB.id,
            unidadId: unidadKg.id,
            calidad: CalidadCosecha.PRIMERA,
            cantidad: new Prisma.Decimal('100.000'),
            precioUnitario: new Prisma.Decimal('25.00'),
          },
        ],
      },
    },
  });

  cachedSeedData = {
    empresaA: {
      id: empresaA.id,
      nombre: empresaA.nombre,
      usuarios: {
        admin: { id: aAdmin.id, correo: aAdmin.correo },
        capturista: { id: aCapturista.id, correo: aCapturista.correo },
        contador: { id: aContador.id, correo: aContador.correo },
      },
      predio: { id: predioA.id },
      parcela: { id: parcelaA1.id },
      parcela2: { id: parcelaA2.id },
      cicloActivo: { id: cicloA_Activo.id },
      cicloPlanificado: { id: cicloA_Planif.id },
      proveedor: { id: proveedorA.id },
      categoriaPropia: { id: categoriaPropiaA.id },
      actividadAdmin: { id: actAdminA.id },
      actividadCapturista: { id: actCapA.id },
      gastoAdmin: { id: gastoAdminA.id },
      gastoCapturista: { id: gastoCapA.id },
      cosechaAdmin: { id: cosechaAdminA.id },
      cosechaCapturista: { id: cosechaCapA.id },
      mermaAdmin: { id: mermaAdminA.id },
      mermaCapturista: { id: mermaCapA.id },
      cliente: { id: clienteA.id },
      venta: { id: ventaA.id },
    },
    empresaB: {
      id: empresaB.id,
      nombre: empresaB.nombre,
      usuarios: {
        admin: { id: bAdmin.id, correo: bAdmin.correo },
        capturista: { id: bCapturista.id, correo: bCapturista.correo },
        contador: { id: bContador.id, correo: bContador.correo },
      },
      predio: { id: predioB.id },
      parcela: { id: parcelaB.id },
      cicloActivo: { id: cicloB_Activo.id },
      proveedor: { id: proveedorB.id },
      categoriaPropia: { id: categoriaPropiaB.id },
      actividad: { id: actB.id },
      gasto: { id: gastoB.id },
      cosecha: { id: cosechaB.id },
      merma: { id: mermaB.id },
      cliente: { id: clienteB.id },
      venta: { id: ventaB.id },
    },
    global: {
      unidadKgId: unidadKg.id,
      motivoMermaId: motivoMerma.id,
      tipoActividadId: tipoActividad.id,
      categoriaSistemaId: categoriaSistema.id,
      variedadId: variedad.id,
    },
  };

  return cachedSeedData;
}

export async function getOrLoadSeedData(
  prisma: PrismaClient,
): Promise<E2eSeedData> {
  if (cachedSeedData) {
    return cachedSeedData;
  }

  const empresaA = await prisma.empresa.findUniqueOrThrow({
    where: { rfc: 'ASP200101AA1' },
  });
  const empresaB = await prisma.empresa.findUniqueOrThrow({
    where: { rfc: 'CVB200202BB2' },
  });

  const [aAdmin, aCapturista, aContador] = await Promise.all([
    prisma.usuario.findFirstOrThrow({
      where: { correo: 'admin.a@e2e-test.com' },
    }),
    prisma.usuario.findFirstOrThrow({
      where: { correo: 'capturista.a@e2e-test.com' },
    }),
    prisma.usuario.findFirstOrThrow({
      where: { correo: 'contador.a@e2e-test.com' },
    }),
  ]);

  const [bAdmin, bCapturista, bContador] = await Promise.all([
    prisma.usuario.findFirstOrThrow({
      where: { correo: 'admin.b@e2e-test.com' },
    }),
    prisma.usuario.findFirstOrThrow({
      where: { correo: 'capturista.b@e2e-test.com' },
    }),
    prisma.usuario.findFirstOrThrow({
      where: { correo: 'contador.b@e2e-test.com' },
    }),
  ]);

  const predioA = await prisma.predio.findFirstOrThrow({
    where: { empresaId: empresaA.id, nombre: 'Rancho Las Palmas A' },
  });
  const parcelaA1 = await prisma.parcela.findFirstOrThrow({
    where: { predioId: predioA.id, nombre: 'Parcela Norte A1' },
  });
  const parcelaA2 = await prisma.parcela.findFirstOrThrow({
    where: { predioId: predioA.id, nombre: 'Parcela Sur A2' },
  });

  const [cicloA_Activo, cicloA_Planif] = await Promise.all([
    prisma.cicloProduccion.findFirstOrThrow({
      where: {
        empresaId: empresaA.id,
        nombre: 'Ciclo Tomate 2026 A - Activo',
      },
    }),
    prisma.cicloProduccion.findFirstOrThrow({
      where: {
        empresaId: empresaA.id,
        nombre: 'Ciclo Tomate 2026 A - Planificado',
      },
    }),
  ]);

  const proveedorA = await prisma.proveedor.findFirstOrThrow({
    where: { empresaId: empresaA.id, nombre: 'Agroquímicos del Norte A' },
  });
  const categoriaA = await prisma.categoriaGasto.findFirstOrThrow({
    where: { empresaId: empresaA.id, nombre: 'Mantenimiento de Tractores A' },
  });

  const [actAdminA, actCapA] = await Promise.all([
    prisma.actividad.findFirstOrThrow({
      where: { cicloId: cicloA_Activo.id, creadoPorId: aAdmin.id },
    }),
    prisma.actividad.findFirstOrThrow({
      where: { cicloId: cicloA_Activo.id, creadoPorId: aCapturista.id },
    }),
  ]);

  const [gastoAdminA, gastoCapA] = await Promise.all([
    prisma.gasto.findFirstOrThrow({
      where: { cicloId: cicloA_Activo.id, creadoPorId: aAdmin.id },
    }),
    prisma.gasto.findFirstOrThrow({
      where: { cicloId: cicloA_Activo.id, creadoPorId: aCapturista.id },
    }),
  ]);

  const [cosAdminA, cosCapA] = await Promise.all([
    prisma.cosecha.findFirstOrThrow({
      where: { cicloId: cicloA_Activo.id, creadoPorId: aAdmin.id },
    }),
    prisma.cosecha.findFirstOrThrow({
      where: { cicloId: cicloA_Activo.id, creadoPorId: aCapturista.id },
    }),
  ]);

  const [merAdminA, merCapA] = await Promise.all([
    prisma.merma.findFirstOrThrow({
      where: { cicloId: cicloA_Activo.id, creadoPorId: aAdmin.id },
    }),
    prisma.merma.findFirstOrThrow({
      where: { cicloId: cicloA_Activo.id, creadoPorId: aCapturista.id },
    }),
  ]);

  const predioB = await prisma.predio.findFirstOrThrow({
    where: { empresaId: empresaB.id, nombre: 'Hacienda El Rocío B' },
  });
  const parcelaB = await prisma.parcela.findFirstOrThrow({
    where: { predioId: predioB.id, nombre: 'Parcela Central B1' },
  });
  const cicloB_Activo = await prisma.cicloProduccion.findFirstOrThrow({
    where: {
      empresaId: empresaB.id,
      nombre: 'Ciclo Tomate 2026 B - Activo',
    },
  });
  const proveedorB = await prisma.proveedor.findFirstOrThrow({
    where: { empresaId: empresaB.id, nombre: 'Semillas del Sur B' },
  });
  const categoriaB = await prisma.categoriaGasto.findFirstOrThrow({
    where: { empresaId: empresaB.id, nombre: 'Sistemas de Riego B' },
  });
  const actB = await prisma.actividad.findFirstOrThrow({
    where: { cicloId: cicloB_Activo.id },
  });
  const gastoB = await prisma.gasto.findFirstOrThrow({
    where: { cicloId: cicloB_Activo.id },
  });
  const cosB = await prisma.cosecha.findFirstOrThrow({
    where: { cicloId: cicloB_Activo.id },
  });
  const merB = await prisma.merma.findFirstOrThrow({
    where: { cicloId: cicloB_Activo.id },
  });

  const unidadKg = await prisma.unidadMedida.findUniqueOrThrow({
    where: { codigo: 'KG' },
  });
  const motivoMerma = await prisma.motivoMerma.findFirstOrThrow({
    where: { activo: true },
  });
  const tipoActividad = await prisma.tipoActividad.findFirstOrThrow({
    where: { activo: true },
  });
  const categoriaSistema = await prisma.categoriaGasto.findFirstOrThrow({
    where: { empresaId: null, activo: true },
  });
  const variedad = await prisma.variedad.findFirstOrThrow({
    where: { activo: true },
  });

  const [cliA, venA] = await Promise.all([
    prisma.cliente.findFirstOrThrow({
      where: { empresaId: empresaA.id, nombre: 'Distribuidora San Pedro A' },
    }),
    prisma.venta.findFirstOrThrow({
      where: { cicloId: cicloA_Activo.id },
    }),
  ]);

  const [cliB, venB] = await Promise.all([
    prisma.cliente.findFirstOrThrow({
      where: { empresaId: empresaB.id, nombre: 'Comercializadora del Valle B' },
    }),
    prisma.venta.findFirstOrThrow({
      where: { cicloId: cicloB_Activo.id },
    }),
  ]);

  cachedSeedData = {
    empresaA: {
      id: empresaA.id,
      nombre: empresaA.nombre,
      usuarios: {
        admin: { id: aAdmin.id, correo: aAdmin.correo },
        capturista: { id: aCapturista.id, correo: aCapturista.correo },
        contador: { id: aContador.id, correo: aContador.correo },
      },
      predio: { id: predioA.id },
      parcela: { id: parcelaA1.id },
      parcela2: { id: parcelaA2.id },
      cicloActivo: { id: cicloA_Activo.id },
      cicloPlanificado: { id: cicloA_Planif.id },
      proveedor: { id: proveedorA.id },
      categoriaPropia: { id: categoriaA.id },
      actividadAdmin: { id: actAdminA.id },
      actividadCapturista: { id: actCapA.id },
      gastoAdmin: { id: gastoAdminA.id },
      gastoCapturista: { id: gastoCapA.id },
      cosechaAdmin: { id: cosAdminA.id },
      cosechaCapturista: { id: cosCapA.id },
      mermaAdmin: { id: merAdminA.id },
      mermaCapturista: { id: merCapA.id },
      cliente: { id: cliA.id },
      venta: { id: venA.id },
    },
    empresaB: {
      id: empresaB.id,
      nombre: empresaB.nombre,
      usuarios: {
        admin: { id: bAdmin.id, correo: bAdmin.correo },
        capturista: { id: bCapturista.id, correo: bCapturista.correo },
        contador: { id: bContador.id, correo: bContador.correo },
      },
      predio: { id: predioB.id },
      parcela: { id: parcelaB.id },
      cicloActivo: { id: cicloB_Activo.id },
      proveedor: { id: proveedorB.id },
      categoriaPropia: { id: categoriaB.id },
      actividad: { id: actB.id },
      gasto: { id: gastoB.id },
      cosecha: { id: cosB.id },
      merma: { id: merB.id },
      cliente: { id: cliB.id },
      venta: { id: venB.id },
    },
    global: {
      unidadKgId: unidadKg.id,
      motivoMermaId: motivoMerma.id,
      tipoActividadId: tipoActividad.id,
      categoriaSistemaId: categoriaSistema.id,
      variedadId: variedad.id,
    },
  };

  return cachedSeedData;
}

export function getCachedSeedData(): E2eSeedData {
  if (!cachedSeedData) {
    throw new Error(
      'Seed data aún no inicializada. Llame a getOrLoadSeedData(prisma) en su hook beforeAll.',
    );
  }
  return cachedSeedData;
}

/**
 * Helper para crear un ciclo productivo dedicado para pruebas de concurrencia,
 * garantizando que cada prueba tenga su propia parcela y ciclo sin colisiones.
 */
export async function crearCicloAisladoParaConcurrencia(
  prisma: PrismaClient,
  empresaId: number,
  usuarioId: number,
  variedadId: number,
  superficie = 10,
): Promise<{ predioId: number; parcelaId: number; cicloId: number }> {
  const uid = randomUUID().replace(/-/g, '').substring(0, 10);
  const predio = await prisma.predio.create({
    data: {
      empresaId,
      nombre: `Predio Concurrencia ${uid}`,
      superficieTotal: new Prisma.Decimal(superficie * 2),
    },
  });

  const parcela = await prisma.parcela.create({
    data: {
      predioId: predio.id,
      nombre: `Parcela Concurrencia ${uid}`,
      superficie: new Prisma.Decimal(superficie),
      estado: EstadoParcela.EN_USO,
    },
  });

  const ciclo = await prisma.cicloProduccion.create({
    data: {
      empresaId,
      parcelaId: parcela.id,
      variedadId,
      creadoPorId: usuarioId,
      nombre: `Ciclo Concurrencia ${uid}`,
      estado: EstadoCiclo.ACTIVO,
      fechaInicio: new Date('2026-01-01'),
      superficieSembrada: new Prisma.Decimal(superficie),
    },
  });

  return {
    predioId: predio.id,
    parcelaId: parcela.id,
    cicloId: ciclo.id,
  };
}
