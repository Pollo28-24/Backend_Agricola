import 'dotenv/config';
import { PrismaClient, TipoUnidad } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { permitirRecuperacionClavePublica } from '../src/config/database-security.config';

function createPrismaClient(): PrismaClient {
  const dbUrl = new URL(process.env.DATABASE_URL!);
  const adapter = new PrismaMariaDb({
    host: dbUrl.hostname,
    port: dbUrl.port ? Number(dbUrl.port) : 3306,
    user: dbUrl.username,
    password: dbUrl.password ? decodeURIComponent(dbUrl.password) : undefined,
    database: dbUrl.pathname.substring(1),
    allowPublicKeyRetrieval: permitirRecuperacionClavePublica(),
  });

  return new PrismaClient({ adapter });
}

const prisma = createPrismaClient();

const PERMISOS: Record<string, string> = {
  'empresa:administrar': 'Datos de la empresa, plan y bitácora',
  'usuario:administrar': 'Crear y desactivar usuarios, asignar rol',
  'estructura:administrar': 'Predios y parcelas',
  'tercero:administrar': 'Proveedores y clientes',
  'catalogo:administrar': 'Categorías de gasto propias',
  'ciclo:crear': 'Crear, editar, iniciar, suspender y reanudar ciclos',
  'ciclo:cerrar': 'Finalizar y cancelar ciclos',
  'ciclo:reabrir': 'Reabrir ciclos finalizados o cancelados',
  'actividad:crear': 'Registrar actividades',
  'gasto:crear': 'Registrar gastos',
  'gasto:editar_todos': 'Editar gastos de cualquier usuario',
  'cosecha:crear': 'Registrar cosechas',
  'merma:crear': 'Registrar mermas',
  'venta:crear': 'Crear y editar ventas',
  'venta:cancelar': 'Cancelar ventas',
  'cobro:crear': 'Registrar y anular cobros',
  'registro:administrar':
    'Editar y eliminar cualquier actividad, gasto, cosecha o merma',
  'reporte:ver': 'Tablero, indicadores y alertas',
  'reporte:exportar': 'Exportar reportes',
};

const ROLES: Record<
  string,
  { nombre: string; descripcion: string; permisos: string[] }
> = {
  ADMIN: {
    nombre: 'Administrador',
    descripcion: 'Dueño o productor con acceso total al sistema',
    permisos: Object.keys(PERMISOS),
  },
  CAPTURISTA: {
    nombre: 'Capturista de campo',
    descripcion:
      'Encargado de registrar actividades, gastos, cosechas y mermas en campo',
    permisos: [
      'actividad:crear',
      'gasto:crear',
      'cosecha:crear',
      'merma:crear',
    ],
  },
  CONTADOR: {
    nombre: 'Contador',
    descripcion:
      'Administración de gastos, ventas, cobros y reportes financieros',
    permisos: [
      'tercero:administrar',
      'gasto:crear',
      'gasto:editar_todos',
      'venta:crear',
      'venta:cancelar',
      'cobro:crear',
      'reporte:ver',
      'reporte:exportar',
    ],
  },
};

const PLANES = [
  {
    codigo: 'BASICO',
    nombre: 'Básico',
    precioMensual: 299.0,
    maxParcelas: 3,
    maxUsuarios: 1,
    incluyeReportes: false,
  },
  {
    codigo: 'PRODUCTOR',
    nombre: 'Productor',
    precioMensual: 699.0,
    maxParcelas: 10,
    maxUsuarios: 3,
    incluyeReportes: false,
  },
  {
    codigo: 'PROFESIONAL',
    nombre: 'Profesional',
    precioMensual: 1299.0,
    maxParcelas: 30,
    maxUsuarios: 10,
    incluyeReportes: true,
  },
];

const UNIDADES_MEDIDA: Array<{
  codigo: string;
  nombre: string;
  tipo: TipoUnidad;
  factorABase: number;
}> = [
  { codigo: 'KG', nombre: 'Kilogramo', tipo: TipoUnidad.PESO, factorABase: 1 },
  {
    codigo: 'TON',
    nombre: 'Tonelada',
    tipo: TipoUnidad.PESO,
    factorABase: 1000,
  },
  { codigo: 'G', nombre: 'Gramo', tipo: TipoUnidad.PESO, factorABase: 0.001 },
  {
    codigo: 'CAJA_20KG',
    nombre: 'Caja de 20 kg',
    tipo: TipoUnidad.PESO,
    factorABase: 20,
  },
  {
    codigo: 'COSTAL_50KG',
    nombre: 'Costal de 50 kg',
    tipo: TipoUnidad.PESO,
    factorABase: 50,
  },
  { codigo: 'L', nombre: 'Litro', tipo: TipoUnidad.VOLUMEN, factorABase: 1 },
  {
    codigo: 'ML',
    nombre: 'Mililitro',
    tipo: TipoUnidad.VOLUMEN,
    factorABase: 0.001,
  },
  { codigo: 'HA', nombre: 'Hectárea', tipo: TipoUnidad.AREA, factorABase: 1 },
  { codigo: 'HR', nombre: 'Hora', tipo: TipoUnidad.TIEMPO, factorABase: 1 },
  {
    codigo: 'JORNAL',
    nombre: 'Jornal',
    tipo: TipoUnidad.TIEMPO,
    factorABase: 1,
  },
  { codigo: 'PIEZA', nombre: 'Pieza', tipo: TipoUnidad.CONTEO, factorABase: 1 },
];

const TIPOS_ACTIVIDAD = [
  'Preparación de suelo',
  'Siembra',
  'Riego',
  'Fertilización',
  'Aplicación fitosanitaria',
  'Deshierbe',
  'Poda',
  'Tutoreo',
  'Cosecha',
  'Empaque',
];

const TIPOS_SUELO = [
  'Arcilloso',
  'Arenoso',
  'Franco',
  'Franco-arcilloso',
  'Franco-arenoso',
  'Limoso',
];

const MOTIVOS_MERMA = [
  'Plaga',
  'Enfermedad',
  'Lluvia/Granizo',
  'Sequía',
  'Golpe/Manejo',
  'Sobremaduración',
  'Robo',
  'Rechazo del comprador',
];

const CATEGORIAS_RAIZ = [
  'Mano de obra',
  'Semillas',
  'Fertilizantes',
  'Agroquímicos',
  'Riego',
  'Combustible',
  'Maquinaria',
  'Transporte',
  'Servicios',
  'Herramientas',
  'Otros',
];

const SUBCATEGORIAS: Record<string, string[]> = {
  'Mano de obra': ['Siembra', 'Mantenimiento', 'Cosecha'],
  Fertilizantes: ['NPK', 'Orgánicos'],
};

async function main() {
  console.log('Iniciando sembrado de datos (seed)...');

  // 1. Planes de suscripción
  for (const plan of PLANES) {
    await prisma.planSuscripcion.upsert({
      where: { codigo: plan.codigo },
      update: {
        nombre: plan.nombre,
        precioMensual: plan.precioMensual,
        maxParcelas: plan.maxParcelas,
        maxUsuarios: plan.maxUsuarios,
        incluyeReportes: plan.incluyeReportes,
        activo: true,
      },
      create: plan,
    });
  }
  console.log('✓ Planes de suscripción sembrados');

  // 2. Permisos
  for (const [codigo, descripcion] of Object.entries(PERMISOS)) {
    await prisma.permiso.upsert({
      where: { codigo },
      update: { descripcion },
      create: { codigo, descripcion },
    });
  }
  console.log('✓ Permisos sembrados');

  // 3. Roles y RolPermiso dentro de transacción
  for (const [codigo, r] of Object.entries(ROLES)) {
    await prisma.$transaction(async (tx) => {
      const rol = await tx.rol.upsert({
        where: { codigo },
        update: { nombre: r.nombre, descripcion: r.descripcion },
        create: { codigo, nombre: r.nombre, descripcion: r.descripcion },
      });

      await tx.rolPermiso.deleteMany({ where: { rolId: rol.id } });

      for (const permCodigo of r.permisos) {
        const permiso = await tx.permiso.findUniqueOrThrow({
          where: { codigo: permCodigo },
        });
        await tx.rolPermiso.create({
          data: {
            rolId: rol.id,
            permisoId: permiso.id,
          },
        });
      }
    });
  }
  console.log('✓ Roles y matriz de permisos sembrados');

  // 4. Unidades de medida
  for (const u of UNIDADES_MEDIDA) {
    await prisma.unidadMedida.upsert({
      where: { codigo: u.codigo },
      update: {
        nombre: u.nombre,
        tipo: u.tipo,
        factorABase: u.factorABase,
      },
      create: u,
    });
  }
  console.log('✓ Unidades de medida sembradas');

  // 5. Tipos de actividad
  for (const nombre of TIPOS_ACTIVIDAD) {
    await prisma.tipoActividad.upsert({
      where: { nombre },
      update: { activo: true },
      create: { nombre },
    });
  }
  console.log('✓ Tipos de actividad sembrados');

  // 6. Tipos de suelo
  for (const nombre of TIPOS_SUELO) {
    await prisma.tipoSuelo.upsert({
      where: { nombre },
      update: {},
      create: { nombre },
    });
  }
  console.log('✓ Tipos de suelo sembrados');

  // 7. Motivos de merma
  for (const nombre of MOTIVOS_MERMA) {
    await prisma.motivoMerma.upsert({
      where: { nombre },
      update: { activo: true },
      create: { nombre },
    });
  }
  console.log('✓ Motivos de merma sembrados');

  // 8. Categorías de gasto del sistema (empresaId = null)
  // Las categorías usan claveNombre generada: CONCAT(IFNULL(empresaId, 0), ':', IFNULL(categoriaPadreId, 0), ':', nombre)
  for (const nombre of CATEGORIAS_RAIZ) {
    const claveNombre = `0:0:${nombre}`;
    const categoria = await prisma.categoriaGasto.upsert({
      where: { claveNombre },
      update: { activo: true },
      create: {
        nombre,
        empresaId: null,
        categoriaPadreId: null,
        activo: true,
      },
    });

    const hijas = SUBCATEGORIAS[nombre];
    if (hijas && hijas.length > 0) {
      for (const hijaNombre of hijas) {
        const claveHija = `0:${categoria.id}:${hijaNombre}`;
        await prisma.categoriaGasto.upsert({
          where: { claveNombre: claveHija },
          update: { activo: true },
          create: {
            nombre: hijaNombre,
            empresaId: null,
            categoriaPadreId: categoria.id,
            activo: true,
          },
        });
      }
    }
  }
  console.log('✓ Categorías de gasto sembradas');

  // 9. Cultivo y Variedad iniciales
  const cultivo = await prisma.cultivo.upsert({
    where: { nombre: 'Tomate' },
    update: { activo: true },
    create: {
      nombre: 'Tomate',
      nombreCientifico: 'Solanum lycopersicum',
      descripcion: 'Cultivo piloto de referencia',
      activo: true,
    },
  });

  await prisma.variedad.upsert({
    where: {
      cultivoId_nombre: {
        cultivoId: cultivo.id,
        nombre: 'Saladette',
      },
    },
    update: { activo: true },
    create: {
      cultivoId: cultivo.id,
      nombre: 'Saladette',
      descripcion:
        'Variedad de tomate Saladette para consumo en fresco e industria',
      duracionCicloDias: 120,
      activo: true,
    },
  });
  console.log('✓ Cultivo y variedad piloto sembrados');

  console.log('¡Sembrado completado con éxito!');
}

main()
  .catch((e) => {
    console.error('Error en seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
