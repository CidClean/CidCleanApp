// Genera supabase/functions/_shared/irs/fw9.ts a partir de supabase/functions/_shared/irs/fw9-2024-03.pdf (Form W-9,
// Rev. March 2024, del IRS, D-255, D-256). El PDF es la única fuente; el .ts es su copia en base64 para que la Edge
// Function w9-portal lo lleve dentro al desplegarse (sin leer archivos sueltos).
// Uso: node supabase/scripts/generar-w9.mjs
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const raiz = fileURLToPath(new URL('..', import.meta.url));
const pdf = readFileSync(`${raiz}functions/_shared/irs/fw9-2024-03.pdf`);
const sha = createHash('sha256').update(pdf).digest('hex');
const salida =
  '// GENERADO por supabase/scripts/generar-w9.mjs desde supabase/functions/_shared/irs/fw9-2024-03.pdf. No editar a mano.\n' +
  `// SHA-256 del PDF: ${sha}\n` +
  `export const FW9_PDF_BASE64 = '${pdf.toString('base64')}';\n`;
writeFileSync(`${raiz}functions/_shared/irs/fw9.ts`, salida);
console.log('functions/_shared/irs/fw9.ts actualizado', sha);
