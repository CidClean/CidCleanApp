// ICA, lado de Cid Clean (orden 65, D-285): verify_jwt activado. Con el JWT de quien llama, las funciones ica_* de la
// base exigen el Super Admin. La service role solo sube y baja los PDF del bucket privado contractor-docs.
// Acciones:
//   get         { profile_id }             ICA del contratista (crea el borrador con los datos del perfil y del W-9)
//   save        { agreement_id, fields }   guarda los campos editables (vuelve a borrador si ya se había enviado)
//   preview     { profile_id }             URL de 60 s del PDF (sin firmar, o con la firma del contratista)
//   send        { agreement_id, email? }   PDF sin firmar, link de un solo uso por 15 días y correo al contratista
//   countersign { agreement_id }           contrafirma: PDF firmado con certificado y copias por correo
//   upload      { profile_id, file, mime_type }  ICA firmado en papel (PDF o imagen, base64): "Firmado por ambas partes"
//   open        { agreement_id }           URL de 60 s del ICA firmado (queda en el historial)
// Correos desde documents@mail.cidclean.com con respuesta a info@cidclean.com (D-268). Este archivo no contiene llaves.
import { CORS, clienteDeQuienLlama, clienteDeServicio, errorDeBase, responder } from '../_shared/comun.ts';
import { enviarCorreo, fecha, sha256, tokenAleatorio } from '../_shared/quotes.ts';
import { sha256Bytes } from '../_shared/contrato.ts';
import { REMITENTE_DOCUMENTOS } from '../_shared/contratoCorreos.ts';
import { agregarCertificadoContrato } from '../_shared/contratoPdf.ts';
import { camposDeIca, filasCertificadoIca, NOTA_CERTIFICADO_ICA, type IcaDb } from '../_shared/ica.ts';
import { correoIca, correoIcaFirmado } from '../_shared/icaCorreos.ts';
import { pdfIca } from '../_shared/icaPdf.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BUCKET = 'contractor-docs';
const EXT: Record<string, string> = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/heic': 'heic', 'image/webp': 'webp' };
const MAXIMO = 10 * 1024 * 1024;

type Fila = IcaDb & Record<string, unknown>;

function fallo(e: { code?: string; message?: string }) {
  if (e.message?.startsWith('missing_fields:')) return responder(400, { error: 'missing_fields', fields: e.message.slice(15).split(',') });
  const x = errorDeBase(e.code);
  return responder(x.status, { error: x.error });
}

function deBase64(texto: string): Uint8Array {
  const bin = atob(texto);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return responder(405, { error: 'method_not_allowed' });
  let b: Record<string, unknown>;
  try {
    b = await req.json();
  } catch {
    return responder(400, { error: 'invalid' });
  }
  const quien = clienteDeQuienLlama(req);
  const servicio = clienteDeServicio();
  const id = (k: string) => (typeof b[k] === 'string' && UUID.test(b[k] as string) ? (b[k] as string) : null);
  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || null;
  const ua = (req.headers.get('user-agent') ?? '').slice(0, 400);
  const urlFirmada = async (path: string) => {
    const { data: s, error } = await servicio.storage.from(BUCKET).createSignedUrl(path, 60);
    return error || !s ? null : s.signedUrl;
  };

  switch (b.action) {
    case 'get': {
      if (!id('profile_id')) return responder(400, { error: 'invalid' });
      const { data, error } = await quien.rpc('ica_prepare', { p_profile: id('profile_id') });
      return error ? fallo(error) : responder(200, data);
    }
    case 'save': {
      if (!id('agreement_id') || !b.fields || typeof b.fields !== 'object') return responder(400, { error: 'invalid' });
      const { data, error } = await quien.rpc('ica_save_fields', { p_agreement: id('agreement_id'), p_fields: b.fields });
      return error ? fallo(error) : responder(200, data);
    }
    case 'preview': {
      if (!id('profile_id')) return responder(400, { error: 'invalid' });
      const { data, error } = await quien.rpc('ica_prepare', { p_profile: id('profile_id') });
      if (error) return fallo(error);
      const c = data as Fila;
      if (c.signed) return responder(409, { error: 'signed' }); // el firmado se abre con "open"
      let pdf: Uint8Array;
      try {
        const contratista = c.contractor_signed_at ? { name: c.contractor_signer_name as string, at: new Date(c.contractor_signed_at) } : null;
        pdf = await pdfIca({ campos: camposDeIca(c), ica: c.ica, firmas: { contratista } });
      } catch {
        return responder(500, { error: 'server_error' });
      }
      const path = `${c.profile_id}/ica-draft/preview.pdf`;
      const up = await servicio.storage.from(BUCKET).upload(path, pdf, { contentType: 'application/pdf', upsert: true });
      if (up.error) return responder(500, { error: 'server_error' });
      const url = await urlFirmada(path);
      return url ? responder(200, { url, missing: c.missing }) : responder(500, { error: 'server_error' });
    }
    case 'send': {
      if (!id('agreement_id')) return responder(400, { error: 'invalid' });
      const { data, error } = await quien.rpc('ica_send_prepare', { p_agreement: id('agreement_id') });
      if (error) return fallo(error);
      const c = data as Fila;
      const email = (typeof b.email === 'string' && b.email.trim() ? b.email : c.fields.contractor_email ?? '').trim().toLowerCase();
      let pdf: Uint8Array;
      try {
        pdf = await pdfIca({ campos: camposDeIca(c), ica: c.ica });
      } catch {
        return responder(500, { error: 'server_error' });
      }
      const path = `${c.profile_id}/ica-draft/${c.ica}-${tokenAleatorio(9)}.pdf`;
      const up = await servicio.storage.from(BUCKET).upload(path, pdf, { contentType: 'application/pdf', upsert: false });
      if (up.error) return responder(500, { error: 'server_error' });
      const token = tokenAleatorio();
      const r = await quien.rpc('ica_send_confirm', {
        p_agreement: c.id, p_path: path, p_sha256: await sha256Bytes(pdf), p_token_hash: await sha256(token), p_email: email,
      });
      if (r.error) {
        await servicio.storage.from(BUCKET).remove([path]);
        return fallo(r.error);
      }
      const d = r.data as Fila & { expires_at: string };
      const base = Deno.env.get('PORTAL_BASE_URL') ?? 'https://quote.cidclean.com';
      let sent = false;
      try {
        sent = await enviarCorreo(email, correoIca({
          name: d.fields.contractor_name ?? null, ica: d.ica, link: `${base}/ica/${token}`, expires: fecha(d.expires_at, 'en'),
        }), [], REMITENTE_DOCUMENTOS);
      } catch {
        sent = false;
      }
      return responder(200, { id: d.id, sent, expires_at: d.expires_at });
    }
    case 'countersign': {
      if (!id('agreement_id')) return responder(400, { error: 'invalid' });
      const { data, error } = await quien.rpc('ica_countersign_prepare', { p_agreement: id('agreement_id') });
      if (error) return fallo(error);
      const c = data as Fila & { cc_name: string; cc_email: string | null; sent_by_name: string | null };
      const ahora = new Date();
      const campos = camposDeIca(c);
      const ccTitle = campos.cc_title || 'Managing Member';
      const firmoAt = new Date(c.contractor_signed_at as string);
      const signatureId = crypto.randomUUID();
      let pdf: Uint8Array;
      try {
        pdf = await pdfIca({
          campos, ica: c.ica, conCertificado: true,
          firmas: { contratista: { name: c.contractor_signer_name as string, at: firmoAt }, cidClean: { name: c.cc_name, title: ccTitle, at: ahora } },
        });
        const hash = await sha256Bytes(pdf);
        pdf = await agregarCertificadoContrato(pdf, c.ica, filasCertificadoIca({
          ica: c.ica, pdfSha256: hash, signatureId,
          contratista: {
            name: c.contractor_signer_name as string, email: c.contractor_signer_email as string, at: firmoAt,
            ip: c.contractor_ip, userAgent: c.contractor_user_agent, signatureId: c.contractor_signature_id,
          },
          cidClean: { name: c.cc_name, title: ccTitle, email: c.cc_email, at: ahora, ip, userAgent: ua },
          sentAt: c.sent_at ? new Date(c.sent_at) : null, sentBy: c.sent_by_name,
        }), NOTA_CERTIFICADO_ICA);
      } catch {
        return responder(500, { error: 'server_error' });
      }
      const path = `${c.profile_id}/ica/${c.ica}-signed-${tokenAleatorio(9)}.pdf`;
      const up = await servicio.storage.from(BUCKET).upload(path, pdf, { contentType: 'application/pdf', upsert: false });
      if (up.error) return responder(500, { error: 'server_error' });
      const r = await quien.rpc('ica_countersign_confirm', {
        p_agreement: c.id, p_path: path, p_sha256: await sha256Bytes(pdf), p_signature_id: signatureId,
        p_signed_at: ahora.toISOString(), p_ip: ip, p_user_agent: ua,
      });
      if (r.error) {
        await servicio.storage.from(BUCKET).remove([path]);
        return fallo(r.error);
      }
      const copias = await enviarCopias(c.contractor_signer_email as string, campos.contractor_name || String(c.contractor ?? ''), c.ica, ahora,
        [{ filename: `${c.ica}-signed.pdf`, content: pdf }], false);
      return responder(200, { id: c.id, status: 'signed', signed_at: ahora.toISOString(), copies: copias });
    }
    case 'upload': {
      if (!id('profile_id')) return responder(400, { error: 'invalid' });
      const mime = String(b.mime_type ?? 'application/pdf');
      let datos: Uint8Array;
      try {
        datos = deBase64(String(b.file ?? ''));
      } catch {
        return responder(400, { error: 'invalid' });
      }
      if (!EXT[mime] || datos.length === 0 || datos.length > MAXIMO) return responder(400, { error: 'invalid' });
      const { data: soy, error: e0 } = await quien.rpc('is_super_admin');
      if (e0) return fallo(e0);
      if (soy !== true) return responder(403, { error: 'forbidden' });
      const path = `${id('profile_id')}/ica/paper-${tokenAleatorio(9)}.${EXT[mime]}`;
      const up = await servicio.storage.from(BUCKET).upload(path, datos, { contentType: mime, upsert: false });
      if (up.error) return responder(500, { error: 'server_error' });
      const r = await quien.rpc('ica_upload_paper', { p_profile: id('profile_id'), p_path: path, p_sha256: await sha256Bytes(datos) });
      if (r.error) {
        await servicio.storage.from(BUCKET).remove([path]);
        return fallo(r.error);
      }
      const d = r.data as Fila;
      const copias = d.fields.contractor_email
        ? await enviarCopias(d.fields.contractor_email, d.fields.contractor_name || d.contractor as string, d.ica, new Date(),
          [{ filename: `${d.ica}-signed.${EXT[mime]}`, content: datos }], true)
        : {};
      return responder(200, { id: d.id, status: d.status, copies: copias });
    }
    case 'open': {
      if (!id('agreement_id')) return responder(400, { error: 'invalid' });
      const { data, error } = await quien.rpc('ica_open', { p_agreement: id('agreement_id') });
      if (error) return fallo(error);
      const url = await urlFirmada(data as string);
      return url ? responder(200, { url, expires_in: 60 }) : responder(500, { error: 'server_error' });
    }
    default:
      return responder(400, { error: 'invalid' });
  }
});

/** Copia del ICA firmado al contratista y a info@cidclean.com (orden 65). */
async function enviarCopias(email: string, contractor: string, ica: string, at: Date, adj: { filename: string; content: Uint8Array }[], paper: boolean) {
  const enviados: Record<string, boolean> = {};
  for (const x of [{ to: email, cc: false }, { to: 'info@cidclean.com', cc: true }]) {
    try {
      enviados[x.cc ? 'cid_clean' : 'contractor'] = await enviarCorreo(x.to,
        correoIcaFirmado({ contractor, ica, signedAt: at, paraCidClean: x.cc, paper }), adj, REMITENTE_DOCUMENTOS);
    } catch {
      enviados[x.cc ? 'cid_clean' : 'contractor'] = false;
    }
  }
  return enviados;
}
