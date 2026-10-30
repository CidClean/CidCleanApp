// Cifra los W-9 ya guardados en employee-docs (orden 59, D-280). Lo corre el arquitecto UNA vez, después de aplicar
// la migración 20261030000011_w9_cifrado.sql y de crear el secreto W9_FILE_KEY (supabase/scripts/edge-functions.md).
// Por cada fila de profile_documents con kind = 'w9' y encrypted = false: baja el archivo con la service role, lo
// cifra (AES-256-GCM, mismo formato que supabase/functions/_shared/cifrado.ts), comprueba que se descifra igual,
// reemplaza el objeto en la misma ruta y marca encrypted = true. Si el archivo ya estaba cifrado, solo lo marca.
// Repetible: lo que ya está marcado no se vuelve a tocar. No imprime contenido ni llaves.
//
// Uso (Node 22.18 o más nuevo, desde la raíz del repositorio):
//   SUPABASE_URL=https://<ref>.supabase.co SUPABASE_SERVICE_ROLE_KEY=... W9_FILE_KEY=... \
//     node supabase/scripts/cifrar-w9-existentes.mjs [--dry-run]
import { cifrar, claveW9, descifrar, estaCifrado, tipoDeRuta } from '../functions/_shared/cifrado.ts';

const URL_BASE = process.env.SUPABASE_URL?.replace(/\/$/, '');
const SERVICIO = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PRUEBA = process.argv.includes('--dry-run');
if (!URL_BASE || !SERVICIO || !process.env.W9_FILE_KEY) {
  console.error('Faltan SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY o W9_FILE_KEY.');
  process.exit(1);
}
const clave = await claveW9(process.env.W9_FILE_KEY);
const auth = { apikey: SERVICIO, Authorization: `Bearer ${SERVICIO}` };
const objeto = (ruta) => `${URL_BASE}/storage/v1/object/employee-docs/${ruta.split('/').map(encodeURIComponent).join('/')}`;

const lista = await fetch(`${URL_BASE}/rest/v1/profile_documents?kind=eq.w9&encrypted=eq.false&select=id,file_path`, { headers: auth });
if (!lista.ok) {
  console.error(`No se pudo leer profile_documents (${lista.status}).`);
  process.exit(1);
}
const filas = await lista.json();
console.log(`${filas.length} W-9 sin cifrar${PRUEBA ? ' (prueba: no se cambia nada)' : ''}.`);

let hechos = 0;
let fallos = 0;
for (const { id, file_path: ruta } of filas) {
  try {
    const bajada = await fetch(objeto(ruta), { headers: auth });
    if (!bajada.ok) throw new Error(`bajar ${bajada.status}`);
    const plano = new Uint8Array(await bajada.arrayBuffer());
    if (!estaCifrado(plano)) {
      const cifrado = await cifrar(clave, plano);
      const vuelta = await descifrar(clave, cifrado);
      if (vuelta.length !== plano.length || vuelta.some((b, i) => b !== plano[i])) throw new Error('verificación');
      if (!PRUEBA) {
        const subida = await fetch(objeto(ruta), {
          method: 'PUT',
          headers: { ...auth, 'Content-Type': tipoDeRuta(ruta).mime, 'x-upsert': 'true' },
          body: cifrado,
        });
        if (!subida.ok) throw new Error(`subir ${subida.status}`);
      }
    }
    if (!PRUEBA) {
      const marca = await fetch(`${URL_BASE}/rest/v1/profile_documents?id=eq.${id}`, {
        method: 'PATCH',
        headers: { ...auth, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({ encrypted: true }),
      });
      if (!marca.ok) throw new Error(`marcar ${marca.status}`);
    }
    hechos += 1;
    console.log(`ok ${id}`);
  } catch (e) {
    fallos += 1;
    console.error(`fallo ${id}: ${e instanceof Error ? e.message : 'error'}`);
  }
}
console.log(`Listo: ${hechos} cifrados${PRUEBA ? ' (prueba)' : ''}, ${fallos} con fallo.`);
process.exit(fallos > 0 ? 1 : 0);
