// Abre un documento sensible de un 1099 (W-9 o certificado de seguro): D-125.
// verify_jwt activado. Único camino para abrir los archivos de employee-docs: el bucket no tiene política de lectura.
// 1) open_profile_document, con el JWT de quien llama, exige empleados_ver_pagos y registra quién y cuándo en el historial.
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

  // Permiso y registro: los decide la base de datos con la identidad de quien llama.
  const quien = clienteDeQuienLlama(req);
  const { data: ruta, error } = await quien.rpc('open_profile_document', { doc_id: documento });
  if (error || typeof ruta !== 'string') {
    const { status, error: codigo } = errorDeBase((error as { code?: string } | null)?.code);
    return responder(status, { error: codigo });
  }

  const { data, error: errorFirma } = await clienteDeServicio().storage.from('employee-docs').createSignedUrl(ruta, SEGUNDOS);
  if (errorFirma || !data?.signedUrl) return responder(500, { error: 'server_error' });
  return responder(200, { url: data.signedUrl, expires_in: SEGUNDOS });
});
