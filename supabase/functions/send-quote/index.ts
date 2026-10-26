// Envía un quote (D-209): verify_jwt activado. Con el JWT de quien envía, prepare_send_quote valida el permiso
// (quotes_enviar), el SOW y los destinatarios; el servidor genera el PDF de una página, lo guarda con la versión,
// confirma el envío (enlace, vencimiento, reemplazo de la versión anterior) y manda el correo a cada destinatario
// desde quotes@mail.cidclean.com con respuesta a info@cidclean.com (D-249), siempre en inglés y con el PDF adjunto
// (D-247, D-250). El PDF sigue en el idioma del lead. { resend: true } reenvía el correo de una versión ya enviada
// (por ejemplo si falló).
import { CORS, clienteDeQuienLlama, clienteDeServicio, errorDeBase, responder } from '../_shared/comun.ts';
import { correoQuote, enviarCorreo, fecha, lang, pdfQuote, type QuoteMail } from '../_shared/quotes.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function enviarATodos(destinos: string[], d: QuoteMail, pdf: Uint8Array | null, version: string) {
  const m = correoQuote(d);
  const adjuntos = pdf ? [{ filename: `Cid Clean quote ${version}.pdf`, content: pdf }] : [];
  let enviados = 0;
  for (const to of destinos) if (await enviarCorreo(to, m, adjuntos)) enviados++;
  return { sent: enviados, failed: destinos.length - enviados };
}

// deno-lint-ignore no-explicit-any
function datosCorreo(x: any, expires: string, link: string): QuoteMail {
  return {
    company: x.company, site: x.site, address: x.address ?? null, contactName: x.contact_name ?? null,
    frequency: x.frequency ?? null, visitTime: x.visit_time ?? null, lines: x.lines ?? null,
    total: x.total == null ? null : Number(x.total), extra: x.extra === true, serviceDate: x.service_date ?? null,
    expires: fecha(expires, 'en'), link,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return responder(405, { error: 'method_not_allowed' });
  let body: { version_id?: string; resend?: boolean };
  try {
    body = await req.json();
  } catch {
    return responder(400, { error: 'invalid' });
  }
  if (!body.version_id || !UUID.test(body.version_id)) return responder(400, { error: 'invalid' });
  const quien = clienteDeQuienLlama(req);
  const servicio = clienteDeServicio();
  const base = Deno.env.get('PORTAL_BASE_URL') ?? 'https://quote.cidclean.com';

  if (body.resend) {
    const { data, error } = await quien.rpc('quote_mail_data', { p_version: body.version_id });
    if (error) {
      const e = errorDeBase(error.code);
      return responder(e.status, { error: e.error });
    }
    let pdf: Uint8Array | null = null;
    if (data.pdf_path) {
      const f = await servicio.storage.from('quote-files').download(data.pdf_path);
      if (f.data) pdf = new Uint8Array(await f.data.arrayBuffer());
    }
    const r = await enviarATodos(data.recipients, datosCorreo(data, data.expires_at, `${base}/q/${data.token}`), pdf, data.version);
    return responder(200, r);
  }

  const { data: p, error } = await quien.rpc('prepare_send_quote', { p_version: body.version_id });
  if (error) {
    const e = errorDeBase(error.code);
    return responder(e.status, { error: e.error });
  }
  const { data: actor } = await quien.rpc('current_profile_id');
  const l = lang(p.language);
  const ahora = new Date().toISOString();
  try {
    const pdf = await pdfQuote({ ...p, language: l, sent_at: ahora });
    const ruta = `${p.quote_id}/${p.version_id}/quote-${p.version}.pdf`;
    const up = await servicio.storage.from('quote-files').upload(ruta, pdf, { contentType: 'application/pdf', upsert: true });
    if (up.error) return responder(500, { error: 'server_error' });
    const snapshot = {
      language: l, company: p.company, site: p.site, address: p.address, frequency: p.frequency,
      extra: p.extra === true, service_date: p.service_date ?? null,
    };
    const { data: c, error: e2 } = await servicio.rpc('confirm_send_quote', {
      p_version: p.version_id, p_actor: actor, p_pdf_path: ruta, p_snapshot: snapshot,
    });
    if (e2) {
      const e = errorDeBase(e2.code);
      return responder(e.status, { error: e.error });
    }
    const r = await enviarATodos(p.recipients, datosCorreo(p, c.expires_at, `${base}/q/${c.token}`), pdf, p.version);
    return responder(200, r);
  } catch (_e) {
    return responder(500, { error: 'server_error' });
  }
});
