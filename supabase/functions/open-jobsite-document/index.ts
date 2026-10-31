// Abre un documento del jobsite (SOW, contrato u otro): D-055, D-210. verify_jwt activado.
// El contrato no tiene lectura directa en Storage: este es su único camino.
// 1) open_jobsite_document, con el JWT de quien llama, exige clientes_ver (y clientes_ver_tarifa para el contrato) y
//    deja la apertura en el historial (quién y cuándo).
// 2) Solo si eso funcionó, la service role firma una URL de 60 segundos.
import { CORS, clienteDeQuienLlama, clienteDeServicio, errorDeBase, responder } from '../_shared/comun.ts';
import { nombreLegible } from '../_shared/fileName.ts';

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

  const servicio = clienteDeServicio();
  const nombre = await nombreDelDocumento(servicio, documento, ruta);
  const { data, error: errorFirma } = await servicio.storage.from('jobsite-docs').createSignedUrl(ruta, SEGUNDOS);
  if (errorFirma || !data?.signedUrl) return responder(500, { error: 'server_error' });
  return responder(200, { url: data.signedUrl, expires_in: SEGUNDOS, file_name: nombre });
});

/**
 * D-296: nombre legible para el visor. Contrato: "Cid Clean - Service Agreement CSA-0007 - {empresa}.pdf"; SOW:
 * "Cid Clean - SOW v2 - {empresa}.pdf"; otros: "Cid Clean - {título} - {empresa}.{ext}". Si algo falla, el genérico.
 */
async function nombreDelDocumento(servicio: ReturnType<typeof clienteDeServicio>, documento: string, ruta: string): Promise<string> {
  const ext = (ruta.split('.').pop() ?? 'pdf').toLowerCase();
  try {
    const { data: d } = await servicio.from('jobsite_documents').select('kind, title, version, jobsite_id').eq('id', documento).maybeSingle();
    if (!d) return nombreLegible(['Document'], ext);
    const { data: j } = await servicio.from('jobsites').select('name, client_id').eq('id', d.jobsite_id).maybeSingle();
    const { data: c } = j?.client_id ? await servicio.from('clients').select('name').eq('id', j.client_id).maybeSingle() : { data: null };
    let empresa: string | null = c?.name ?? j?.name ?? null;
    if (d.kind === 'contract') {
      const { data: k } = await servicio.from('client_contracts').select('number, fields').eq('document_id', documento).maybeSingle();
      const legal = (k?.fields as { client_legal_name?: string } | null)?.client_legal_name;
      if (legal) empresa = legal;
      const csa = k?.number ? `CSA-${String(k.number).padStart(4, '0')}` : null;
      return nombreLegible([csa ? `Service Agreement ${csa}` : 'Service Agreement', empresa], ext);
    }
    if (d.kind === 'sow') return nombreLegible([d.version ? `SOW v${d.version}` : 'SOW', empresa], ext);
    return nombreLegible([d.title || 'Document', empresa], ext);
  } catch {
    return nombreLegible(['Document'], ext);
  }
}
