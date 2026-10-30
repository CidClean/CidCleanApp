// Entrega un W-9 cifrado ya descifrado (D-280). SIN verify_jwt: el visor descarga la URL sin cabeceras; lo protege el
// enlace de un solo uso que creó open-document después de comprobar el permiso y dejar la apertura o la descarga en
// el historial. GET /w9-file/<enlace>/w9.<ext>: consume el enlace (una vez, 60 s), baja el archivo cifrado con la
// service role, lo descifra con W9_FILE_KEY y lo devuelve sin guardar copia en ningún lado (no-store).
import { claveW9, descifrar, sha256Hex, tipoDeRuta } from '../_shared/cifrado.ts';
import { clienteDeServicio } from '../_shared/comun.ts';

const ENLACE = /^[A-Za-z0-9_-]{40,64}$/;
const CABECERAS = {
  'Access-Control-Allow-Origin': '*',
  'Cache-Control': 'no-store, private',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
};

function fallo(status: number): Response {
  return new Response(status === 404 ? 'Link expired' : 'Error', { status, headers: { ...CABECERAS, 'Content-Type': 'text/plain' } });
}

Deno.serve(async (req) => {
  if (req.method !== 'GET') return fallo(405);
  const partes = new URL(req.url).pathname.split('/').filter(Boolean);
  const i = partes.indexOf('w9-file');
  const enlace = i >= 0 ? partes[i + 1] ?? '' : '';
  if (!ENLACE.test(enlace)) return fallo(404);

  const servicio = clienteDeServicio();
  const { data: ruta, error } = await servicio.rpc('consume_w9_open_token', { p_hash: await sha256Hex(enlace) });
  if (error || typeof ruta !== 'string') return fallo(404);

  const { data: archivo, error: errorBajar } = await servicio.storage.from('employee-docs').download(ruta);
  if (errorBajar || !archivo) return fallo(500);
  try {
    const plano = await descifrar(await claveW9(Deno.env.get('W9_FILE_KEY')), new Uint8Array(await archivo.arrayBuffer()));
    const { ext, mime } = tipoDeRuta(ruta);
    return new Response(plano, {
      status: 200,
      headers: { ...CABECERAS, 'Content-Type': mime, 'Content-Disposition': `inline; filename="W-9.${ext}"` },
    });
  } catch {
    return fallo(500);
  }
});
