const fs = require('fs');
const path = require('path');

function parseAudit(jsonPath, mdOutputPath) {
  if (!fs.existsSync(jsonPath)) {
    console.error(`Archivo JSON no encontrado: ${jsonPath}`);
    process.exit(1);
  }

  const raw = fs.readFileSync(jsonPath, 'utf8');
  let data;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    console.error(`Error parseando JSON: ${err.message}`);
    process.exit(1);
  }

  const metadata = data.metadata?.vulnerabilities || {};
  console.log('=== RESUMEN DE VULNERABILIDADES (npm audit --omit=dev) ===');
  console.log(`Total: ${metadata.total || 0} (Info: ${metadata.info || 0}, Low: ${metadata.low || 0}, Moderate: ${metadata.moderate || 0}, High: ${metadata.high || 0}, Critical: ${metadata.critical || 0})`);
  console.log('---------------------------------------------------------');

  const vulns = data.vulnerabilities || {};
  const filas = [];

  for (const [pkgName, vuln] of Object.entries(vulns)) {
    const vias = Array.isArray(vuln.via) ? vuln.via : [];
    const urls = vias
      .map((v) => (typeof v === 'string' ? v : v.url || v.name || 'N/A'))
      .join('<br>');
    const fix = typeof vuln.fixAvailable === 'object'
      ? `${vuln.fixAvailable.name}@${vuln.fixAvailable.version}`
      : String(vuln.fixAvailable);

    console.log(`Paquete: ${pkgName}`);
    console.log(`  Severidad: ${vuln.severity}`);
    console.log(`  Rango: ${vuln.range}`);
    console.log(`  Fix disponible: ${fix}`);
    console.log(`  Vias: ${urls}`);

    filas.push({
      paquete: pkgName,
      severidad: vuln.severity,
      rango: vuln.range || 'N/A',
      fix,
      vias: urls,
    });
  }

  const hoy = new Date().toISOString().split('T')[0];
  const markdown = [
    `<!-- Fuente: salida de npm audit del ${hoy} -->`,
    '| Paquete | Severidad | Rango Afectado | Fix Disponible | Via / Advisory URL |',
    '|---|---|---|---|---|',
    ...filas.map(
      (f) =>
        `| \`${f.paquete}\` | ${f.severidad} | \`${f.rango}\` | \`${f.fix}\` | ${f.vias} |`,
    ),
  ].join('\n');

  if (mdOutputPath) {
    fs.writeFileSync(mdOutputPath, markdown, 'utf8');
    console.log(`\nTabla guardada en: ${mdOutputPath}`);
  }
}

const jsonFile = process.argv[2];
const mdFile = process.argv[3];
if (!jsonFile) {
  console.error('Uso: node parse-audit.js <ruta-audit.json> [ruta-audit-tabla.md]');
  process.exit(1);
}

parseAudit(jsonFile, mdFile);
