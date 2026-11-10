// Pie de página de los PDF (D-293): "Generated … · Page n of m" nunca se monta sobre el contenido cuando una tabla
// cruza de página. Se arma una tabla larga de 3 hojas con los dos generadores (servidor: pdf-lib en
// supabase/functions/_shared/docPdf.ts; app: HTML de app/src/lib/docPdf.ts con el pie en las cajas de margen de @page,
// impreso con Chromium) y se revisa con `pdftotext -layout` que el pie no comparte líneas con filas de la tabla y que
// es lo último de cada hoja.
// Uso: node --experimental-transform-types --test supabase/tests/pie-pdf.test.mjs   (Node 22.18 o más nuevo; necesita pdftotext y pdf-lib 1.17.1:
// PDF_LIB=/ruta/a/node_modules/pdf-lib si no está en /opt/npm-tools; la parte de la app necesita Python con Playwright
// y Chromium, si no se salta).
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { register } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';

const pdfLib = process.env.PDF_LIB ?? '/opt/npm-tools/node_modules/pdf-lib';
const appSrc = new URL('../../app/src/', import.meta.url).href;
// Resuelve "npm:pdf-lib@1.17.1" (Deno) y el alias "@/" de la app para poder importar los .ts desde Node.
register(
  'data:text/javascript,' +
    encodeURIComponent(`
export async function resolve(spec, ctx, next) {
  if (spec.startsWith('npm:pdf-lib')) return next(${JSON.stringify(pathToFileURL(join(pdfLib, 'cjs/index.js')).href)}, ctx);
  if (spec.startsWith('@/')) return next(${JSON.stringify(appSrc)} + spec.slice(2) + '.ts', ctx);
  return next(spec, ctx);
}`),
);

const dir = mkdtempSync(join(tmpdir(), 'pie-pdf-'));
const FILAS = 100;
const filas = Array.from({ length: FILAS }, (_, i) => [`Row ${String(i + 1).padStart(3, '0')} Naples Yacht Club`, `2026-10-${String((i % 28) + 1).padStart(2, '0')}`, `$${(80 + i).toFixed(2)}`]);

/** Revisa cada hoja: el pie está, es lo último de la hoja y ninguna línea suya tiene texto de una fila. */
function revisar(pdf) {
  const texto = execFileSync('pdftotext', ['-layout', pdf, '-'], { encoding: 'utf8' });
  const hojas = texto.split('\f').filter((h) => h.trim());
  assert.ok(hojas.length >= 3, `se esperaban 3 hojas o más, salieron ${hojas.length}`);
  const vistas = new Set();
  hojas.forEach((h, i) => {
    const lineas = h.split('\n').filter((l) => l.trim());
    const conPie = lineas.filter((l) => /Generated .* Cid Clean LLC|Page \d+ of \d+/.test(l));
    assert.ok(conPie.length > 0, `hoja ${i + 1}: sin pie`);
    for (const l of conPie) assert.ok(!/Row \d{3}|\$\d+\.\d\d|2026-10-\d\d/.test(l), `hoja ${i + 1}: el pie comparte línea con una fila: "${l.trim()}"`);
    assert.match(lineas[lineas.length - 1], /Generated|Page \d+ of \d+/, `hoja ${i + 1}: hay contenido debajo del pie`);
    assert.match(conPie.join(' '), new RegExp(`Page ${i + 1} of ${hojas.length}`), `hoja ${i + 1}: número de página`);
    for (const l of lineas) for (const m of l.matchAll(/Row (\d{3})/g)) vistas.add(m[1]);
  });
  // Ninguna fila quedó tapada o perdida.
  assert.equal(vistas.size, FILAS);
  // Geometría: en cada hoja, la parte de arriba del pie queda debajo de la parte de abajo de toda fila.
  const cajas = execFileSync('pdftotext', ['-bbox', pdf, '-'], { encoding: 'utf8' });
  cajas.split('<page ').slice(1).forEach((pg, i) => {
    const ws = [...pg.matchAll(/<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]*)<\/word>/g)].map((m) => ({ y0: +m[2], y1: +m[4], t: m[5] }));
    const pie = ws.filter((w) => w.t === 'Generated' || w.t === 'Page');
    const contenido = ws.filter((w) => /^Row$|^\d{3}$|^\$\d+\.\d\d$/.test(w.t));
    assert.ok(pie.length > 0, `hoja ${i + 1}: sin pie (bbox)`);
    const arribaPie = Math.min(...pie.map((w) => w.y0));
    const abajoFilas = Math.max(...contenido.map((w) => w.y1));
    assert.ok(arribaPie > abajoFilas, `hoja ${i + 1}: el pie (y=${arribaPie}) se monta sobre una fila (y=${abajoFilas})`);
    // Y va en el margen de abajo reservado (los últimos 36 pt = 48 px de @page), no dentro del área del contenido.
    const alto = Number(/height="([\d.]+)"/.exec(pg)?.[1]);
    assert.ok(arribaPie >= alto - 36, `hoja ${i + 1}: el pie (y=${arribaPie}) está dentro del área del contenido (alto ${alto})`);
  });
}

test('servidor (pdf-lib): la tabla de 3 hojas no toca el pie', async () => {
  assert.ok(existsSync(pdfLib), `falta pdf-lib en ${pdfLib}`);
  const { Documento } = await import('../functions/_shared/docPdf.ts');
  const d = await Documento.crear('Prueba pie');
  d.titulo('Prueba del pie', 'Tabla larga de 3 hojas');
  d.tabla([{ head: 'Account', w: 3 }, { head: 'Day', w: 1.2 }, { head: 'Amount', w: 1, num: true }], filas, { total: ['Total', '', '$1.00'] });
  const pdf = join(dir, 'servidor.pdf');
  writeFileSync(pdf, await d.guardar({ generado: new Date('2026-11-10T12:00:00Z') }));
  revisar(pdf);
});

const py = spawnSync('python3', ['-c', 'import playwright'], { encoding: 'utf8' });
test('app (HTML con @page): la tabla de 3 hojas no toca el pie', { skip: py.status !== 0 && 'sin Python Playwright' }, async () => {
  const { docHtml, docTable } = await import('../../app/src/lib/docPdf.ts');
  const html = docHtml({
    title: 'Prueba del pie',
    subtitle: 'Tabla larga de 3 hojas',
    body: docTable(['Account', 'Day', 'Amount'], filas.map(([a, b, c]) => [a, b, { text: c, num: true }]), { num: [2], total: ['Total', '', { text: '$1.00', num: true }] }),
    generated: new Date(2026, 10, 10),
  });
  const entrada = join(dir, 'app.html');
  const pdf = join(dir, 'app.pdf');
  writeFileSync(entrada, html);
  // Como expo-print: el tamaño y los márgenes salen del @page del documento.
  const r = spawnSync('python3', ['-I', '-c', `
import sys
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page()
    pg.goto('file://' + sys.argv[1])
    pg.pdf(path=sys.argv[2], prefer_css_page_size=True, print_background=True)
    b.close()
`, entrada, pdf], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  revisar(pdf);
});
