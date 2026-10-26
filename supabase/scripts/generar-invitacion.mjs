// Genera supabase/functions/_shared/invitacion.ts a partir de supabase/email-templates/invitacion.html.
// La plantilla HTML es la única fuente del correo de invitación (D-186 en inglés, D-247; estilo D-250); el .ts es solo su copia para la Edge Function.
// Uso: node supabase/scripts/generar-invitacion.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const raiz = fileURLToPath(new URL('..', import.meta.url));
const html = readFileSync(`${raiz}email-templates/invitacion.html`, 'utf8');
const salida =
  '// GENERADO por supabase/scripts/generar-invitacion.mjs desde supabase/email-templates/invitacion.html. No editar a mano.\n' +
  `export const INVITACION_HTML = ${JSON.stringify(html)};\n`;
writeFileSync(`${raiz}functions/_shared/invitacion.ts`, salida);
console.log('functions/_shared/invitacion.ts actualizado');
