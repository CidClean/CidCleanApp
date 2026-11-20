// Envía un quote (D-209): verify_jwt activado. Con el JWT de quien envía, prepare_send_quote valida el permiso
// (quotes_enviar), el SOW y los destinatarios (sin devolverle montos, M4); los datos completos los lee la service role
// con send_quote_data; el servidor genera el PDF de una página, lo guarda con la versión,
// confirma el envío (enlace, vencimiento, reemplazo de la versión anterior) y manda el correo a cada destinatario
// desde quotes@mail.cidclean.com con respuesta a info@cidclean.com (D-249), siempre en inglés y con el PDF adjunto
// (D-247, D-250). El PDF sigue en el idioma del lead. { resend: true } reenvía el correo de una versión ya enviada
// (por ejemplo si falló) con un enlace nuevo; el anterior sigue valiendo (la base guarda solo hashes, B5).
// Orden 112 (D-318): el SOW se arma aquí con la Parte A de la plantilla del abogado y los datos guardados con la versión;
// al enviar se guarda en quote-files como sow_path (el portal lo exige abrir, D-042). { sow_preview: true } devuelve
// una URL firmada de 60 s del SOW tal como va, para "Ver PDF del SOW" antes de enviar.
import { CORS, clienteDeQuienLlama, clienteDeServicio, errorDeBase, responder } from '../_shared/comun.ts';
import { correoQuote, enviarCorreo, fecha, lang, pdfQuote, type QuoteMail } from '../_shared/quotes.ts';
import { nombreDeQuote, nombreLegible, numeroDeQuote } from '../_shared/fileName.ts';
import { camposSow, type SowDb } from '../_shared/contrato.ts';
import { pdfSow } from '../_shared/contratoPdf.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function enviarATodos(destinos: string[], d: QuoteMail, pdf: Uint8Array | null, nombre: string) {
  const m = correoQuote(d);
  // D-296: "Cid Clean - Quote Q-0012 v1.2 - Naples Yacht Club.pdf".
  const adjuntos = pdf ? [{ filename: nombre, content: pdf }] : [];
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
  let body: { version_id?: string; resend?: boolean; sow_preview?: boolean };
  try {
    body = await req.json();
  } catch {
    return responder(400, { error: 'invalid' });
  }
  if (!body.version_id || !UUID.test(body.version_id)) return responder(400, { error: 'invalid' });
  const quien = clienteDeQuienLlama(req);
  const servicio = clienteDeServicio();
  const base = Deno.env.get('PORTAL_BASE_URL') ?? 'https://quote.cidclean.com';

  if (body.sow_preview) {
    // Con el JWT de quien mira: quote_sow comprueba el permiso (quotes_ver o SOW) y da los datos.
    const { data: s, error: e0 } = await quien.rpc('quote_sow', { p_version: body.version_id });
    if (e0 || !s) {
      const e = errorDeBase(e0?.code);
      return responder(e.status, { error: e.error });
    }
    try {
      const sow = s as SowDb & { quote_id: string };
      const empresa = sow.fields.client_company ?? '';
      const pdf = await pdfSow({ campos: camposSow(sow), sow: sow.sow_no, company: empresa });
      const ruta = `${sow.quote_id}/${body.version_id}/sow-preview.pdf`;
      const up = await servicio.storage.from('quote-files').upload(ruta, pdf, { contentType: 'application/pdf', upsert: true });
      if (up.error) return responder(500, { error: 'server_error' });
      const { data, error } = await servicio.storage.from('quote-files').createSignedUrl(ruta, 60);
      if (error || !data?.signedUrl) return responder(500, { error: 'server_error' });
      return responder(200, { url: data.signedUrl, file_name: nombreDeSow(sow, empresa) });
    } catch (_e) {
      return responder(500, { error: 'server_error' });
    }
  }

  if (body.resend) {
    // Valida con el JWT de quien envía (quotes_enviar); los montos, el PDF y el enlace solo los lee la service role (M4).
    const { error: e0 } = await quien.rpc('quote_mail_data', { p_version: body.version_id });
    if (e0) {
      const e = errorDeBase(e0.code);
      return responder(e.status, { error: e.error });
    }
    const { data, error } = await servicio.rpc('quote_resend_data', { p_version: body.version_id });
    if (error) {
      const e = errorDeBase(error.code);
      return responder(e.status, { error: e.error });
    }
    let pdf: Uint8Array | null = null;
    if (data.pdf_path) {
      const f = await servicio.storage.from('quote-files').download(data.pdf_path);
      if (f.data) pdf = new Uint8Array(await f.data.arrayBuffer());
    }
    const r = await enviarATodos(data.recipients, datosCorreo(data, data.expires_at, `${base}/q/${data.token}`), pdf,
      nombreDeQuote(await numeroDeQuote(servicio, String(data.pdf_path ?? '').split('/')[0]), data.version, data.company));
    return responder(200, r);
  }

  const { error: e0 } = await quien.rpc('prepare_send_quote', { p_version: body.version_id });
  if (e0) {
    const e = errorDeBase(e0.code);
    return responder(e.status, { error: e.error });
  }
  const { data: p, error } = await servicio.rpc('send_quote_data', { p_version: body.version_id });
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
    // D-318: el SOW generado con los datos de la versión; se guarda con ella (lo que se envió no cambia después).
    if (p.extra !== true && p.sow) {
      const sow = p.sow as SowDb;
      const sowPdf = await pdfSow({ campos: camposSow(sow), sow: sow.sow_no, company: p.company });
      const rutaSow = `${p.quote_id}/${p.version_id}/sow-v${String(p.version).replace(/[^0-9]+/g, '-')}.pdf`;
      const upSow = await servicio.storage.from('quote-files').upload(rutaSow, sowPdf, { contentType: 'application/pdf', upsert: true });
      if (upSow.error) return responder(500, { error: 'server_error' });
      const { error: eSow } = await servicio.rpc('confirm_quote_sow', { p_version: p.version_id, p_fields: sow.fields, p_path: rutaSow });
      if (eSow) return responder(500, { error: 'server_error' });
    }
    const snapshot = {
      language: l, company: p.company, site: p.site, address: p.address, frequency: p.frequency,
      extra: p.extra === true, service_date: p.service_date ?? null,
      // Orden 162: hora del one-time, para el reenvío.
      ...(p.one_time === true ? { one_time: true, visit_time: p.visit_time ?? null } : {}),
    };
    const { data: c, error: e2 } = await servicio.rpc('confirm_send_quote', {
      p_version: p.version_id, p_actor: actor, p_pdf_path: ruta, p_snapshot: snapshot,
    });
    if (e2) {
      const e = errorDeBase(e2.code);
      return responder(e.status, { error: e.error });
    }
    const r = await enviarATodos(p.recipients, datosCorreo(p, c.expires_at, `${base}/q/${c.token}`), pdf,
      nombreDeQuote(await numeroDeQuote(servicio, p.quote_id), p.version, p.company));
    return responder(200, r);
  } catch (_e) {
    return responder(500, { error: 'server_error' });
  }
});

/** D-296: "Cid Clean - SOW-0007 v1.0 - Naples Yacht Club.pdf". */
function nombreDeSow(s: SowDb, empresa: string): string {
  return nombreLegible([`${s.sow_no} v${s.quote_version}`, empresa]);
}
