// PDF del resumen del walkthrough (D-212, diseño bajo D-208). verify_jwt activado.
// 1) walkthrough_pdf_source, con el JWT de quien llama, comprueba que puede ver walkthroughs y da los datos de la versión.
// 2) Si la versión aún no tiene PDF, la service role lo arma (resumen sin fotos y fotos en un anexo, SIN notas internas),
//    lo guarda en el bucket privado walkthrough-pdfs y anota la ruta en walkthrough_versions.
// 3) Devuelve una URL firmada de 60 s para el visor de la app (D-196).
import { CORS, clienteDeQuienLlama, clienteDeServicio, errorDeBase, responder } from '../_shared/comun.ts';
import { armarPdf, type Fuente } from './pdf.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SEGUNDOS = 60;
const BUCKET = 'walkthrough-pdfs';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return responder(405, { error: 'method_not_allowed' });

  let id = '';
  let version = 0;
  let idioma: 'es' | 'en' = 'es';
  try {
    const body = await req.json();
    id = String(body.walkthrough_id ?? '');
    version = Number(body.version);
    idioma = body.language === 'en' ? 'en' : 'es';
  } catch {
    return responder(400, { error: 'invalid' });
  }
  if (!UUID.test(id) || !Number.isInteger(version) || version < 1) return responder(400, { error: 'invalid' });

  const quien = clienteDeQuienLlama(req);
  const { data: fuente, error } = await quien.rpc('walkthrough_pdf_source', { p_id: id, p_version: version });
  if (error || !fuente) {
    const { status, error: codigo } = errorDeBase((error as { code?: string } | null)?.code);
    return responder(status, { error: codigo });
  }

  const servicio = clienteDeServicio();
  let ruta = (fuente as Fuente).pdf_path;
  if (!ruta) {
    try {
      const bytes = await armarPdf(fuente as Fuente, idioma, async (path) => {
        const { data } = await servicio.storage.from('walkthrough-photos').download(path);
        return data ? new Uint8Array(await data.arrayBuffer()) : null;
      });
      ruta = `${id}/v${version}.pdf`;
      const subida = await servicio.storage.from(BUCKET).upload(ruta, bytes, { contentType: 'application/pdf', upsert: true });
      if (subida.error) return responder(500, { error: 'server_error' });
      const { error: errorRuta } = await servicio
        .from('walkthrough_versions')
        .update({ pdf_path: ruta })
        .eq('walkthrough_id', id)
        .eq('version', version);
      if (errorRuta) return responder(500, { error: 'server_error' });
    } catch {
      return responder(500, { error: 'server_error' });
    }
  }

  const { data, error: errorFirma } = await servicio.storage.from(BUCKET).createSignedUrl(ruta, SEGUNDOS);
  if (errorFirma || !data?.signedUrl) return responder(500, { error: 'server_error' });
  return responder(200, { url: data.signedUrl, expires_in: SEGUNDOS, path: ruta });
});
