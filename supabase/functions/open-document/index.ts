// Abre un documento sensible de un 1099 (W-9 o certificado de seguro): D-125.
// verify_jwt activado. Único camino para abrir los archivos de employee-docs: el bucket no tiene política de lectura.
// 1) open_profile_document, con el JWT de quien llama, exige empleados_gestionar_documentos (D-193) y registra quién y cuándo en el historial.
// 2) Solo si eso funcionó, la service role firma una URL de 60 segundos.
// D-280: si el archivo está cifrado (W-9), en vez de la URL firmada se crea un enlace de un solo uso de 60 s a w9-file,
//    que descifra y entrega el PDF (solo se guarda el hash del enlace). `action`: 'open' (por defecto) o 'download';
//    las dos quedan en el historial.
import { sha256Hex, tipoDeRuta } from '../_shared/cifrado.ts';
import { CORS, clienteDeQuienLlama, clienteDeServicio, errorDeBase, responder } from '../_shared/comun.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SEGUNDOS = 60;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return responder(405, { error: 'method_not_allowed' });

  let documento = '';
  let accion = 'open';
  try {
    const body = await req.json();
    documento = String(body.document_id ?? '');
    accion = body.action === 'download' ? 'download' : 'open';
  } catch {
    return responder(400, { error: 'invalid' });
  }
  if (!UUID.test(documento)) return responder(400, { error: 'invalid' });

  // Permiso y registro: los decide la base de datos con la identidad de quien llama.
  const quien = clienteDeQuienLlama(req);
  const { data: ruta, error } = await quien.rpc('open_profile_document', { doc_id: documento, p_action: accion });
  if (error || typeof ruta !== 'string') {
    const { status, error: codigo } = errorDeBase((error as { code?: string } | null)?.code);
    return responder(status, { error: codigo });
  }

  const servicio = clienteDeServicio();
  const { data: doc, error: errorDoc } = await servicio.from('profile_documents').select('encrypted').eq('id', documento).single();
  if (errorDoc || !doc) return responder(500, { error: 'server_error' });
  if (doc.encrypted) {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    const token = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const { error: errorToken } = await servicio
      .from('w9_open_tokens')
      .insert({ token_hash: await sha256Hex(token), document_id: documento, action: accion });
    if (errorToken) return responder(500, { error: 'server_error' });
    const url = `${Deno.env.get('SUPABASE_URL')}/functions/v1/w9-file/${token}/w9.${tipoDeRuta(ruta).ext}`;
    return responder(200, { url, expires_in: SEGUNDOS });
  }

  const { data, error: errorFirma } = await servicio.storage.from('employee-docs').createSignedUrl(ruta, SEGUNDOS);
  if (errorFirma || !data?.signedUrl) return responder(500, { error: 'server_error' });
  return responder(200, { url: data.signedUrl, expires_in: SEGUNDOS });
});
