// PDFs de la versión 1.0 de los Términos del Staff y de la Política de Privacidad (orden 56, D-282), a partir de las
// páginas públicas en inglés de app/public (las arma build.py). El arquitecto los publica después en la app como 1.0
// (Ajustes → Términos del staff y Ajustes → Política de Privacidad).
// Formato Letter, márgenes normales (1 in), con los colores de la página tal cual (fondo incluido).
// Uso (desde la raíz del repositorio; Playwright con Chromium ya instalado):
//   node legal/rev3/web/pdf.mjs
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, '..', '..', '..');
const SALIDA = join(AQUI, 'pdf');

// Playwright puede estar en el proyecto o instalado globalmente (NODE_PATH, /opt/npm-tools).
function cargarPlaywright() {
  const require = createRequire(import.meta.url);
  for (const desde of [AQUI, join(RAIZ, 'app'), '/opt/npm-tools', process.env.NODE_PATH ?? '']) {
    if (!desde) continue;
    try {
      return require(require.resolve('playwright', { paths: [desde] }));
    } catch {
      // siguiente
    }
  }
  throw new Error('No se encontró Playwright (npm i -D playwright o NODE_PATH).');
}

const DOCUMENTOS = [
  { pagina: 'app/public/terms/staff/index.html', archivo: 'Staff_Terms_v1.0.pdf' },
  { pagina: 'app/public/privacy/index.html', archivo: 'Privacy_Policy_v1.0.pdf' },
];

const { chromium } = cargarPlaywright();
mkdirSync(SALIDA, { recursive: true });
const navegador = await chromium.launch();
try {
  const pagina = await navegador.newPage();
  for (const { pagina: html, archivo } of DOCUMENTOS) {
    await pagina.goto(pathToFileURL(join(RAIZ, html)).href, { waitUntil: 'networkidle', timeout: 30000 }).catch(async () => {
      // Sin red (fuente o logo remotos): se imprime con lo que haya cargado.
      await pagina.goto(pathToFileURL(join(RAIZ, html)).href, { waitUntil: 'load' });
    });
    await pagina.emulateMedia({ media: 'print', colorScheme: 'light' });
    await pagina.pdf({
      path: join(SALIDA, archivo),
      format: 'Letter',
      margin: { top: '1in', right: '1in', bottom: '1in', left: '1in' },
      printBackground: true,
    });
    console.log(`ok legal/rev3/web/pdf/${archivo}`);
  }
} finally {
  await navegador.close();
}
