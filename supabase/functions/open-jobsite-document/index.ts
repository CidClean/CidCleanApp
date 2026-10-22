// Abre un documento del jobsite (SOW, contrato u otro): D-055, D-210. verify_jwt activado.
// El contrato no tiene lectura directa en Storage: este es su único camino.
// 1) open_jobsite_document, con el JWT de quien llama, exige clientes_ver (y clientes_ver_tarifa para el contrato) y
//    deja la apertura en el historial (quién y cuándo).
// 2) Solo si eso funcionó, la service role firma una URL de 60 segundos.
import { CORS, clienteDeQuienLlama, clienteDeServicio, errorDeBase, responder } from '../_shared/comun.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SEGUNDOS = 60;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return responder(405, { error: 'method_not_allowed' });

  let documento = '';
  try {
    documento = String((await req.json()).document_id ?? '');
  } catch {
    return responder(400, { error: 'invalid' });
  }
  if (!UUID.test(documento)) return responder(400, { error: 'invalid' });

  const quien = clienteDeQuienLlama(req);
  const { data: ruta, error } = await quien.rpc('open_jobsite_document', { p_doc: documento });
  if (error || typeof ruta !== 'string') {
    const { status, error: codigo } = errorDeBase((error as { code?: string } | null)?.code);
    return responder(status, { error: codigo });
  }

  const { data, error: errorFirma } = await clienteDeServicio().storage.from('jobsite-docs').createSignedUrl(ruta, SEGUNDOS);
  if (errorFirma || !data?.signedUrl) return responder(500, { error: 'server_error' });
  return responder(200, { url: data.signedUrl, expires_in: SEGUNDOS });
});
