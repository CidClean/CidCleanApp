// Contrato del cliente, lado de Cid Clean (orden 62, D-283): verify_jwt activado. Con el JWT de quien llama, las
// funciones contract_* de la base exigen el Super Admin. La service role solo sube y baja los PDF de jobsite-docs.
// Acciones:
//   get        { jobsite_id }              contrato del jobsite (crea el borrador con los campos de la app)
//   save       { contract_id, fields }     guarda los campos editables (vuelve a borrador si ya se había enviado)
//   preview    { jobsite_id }              URL de 60 s del PDF (sin firmar, o con la firma del cliente)
//   send       { contract_id, email? }     PDF sin firmar, link de un solo uso por 15 días y correo al cliente
//   countersign { contract_id }            contrafirma: PDF firmado con certificado, documento del jobsite y copias
// Correos desde documents@mail.cidclean.com con respuesta a info@cidclean.com (D-268). Este archivo no contiene llaves.
import { CORS, clienteDeQuienLlama, clienteDeServicio, errorDeBase, responder } from '../_shared/comun.ts';
import { enviarCorreo, fecha, sha256, tokenAleatorio } from '../_shared/quotes.ts';
import { camposDe, filasCertificadoContrato, sha256Bytes, type ContratoDb } from '../_shared/contrato.ts';
import { correoContrato, correoContratoFirmado, REMITENTE_DOCUMENTOS } from '../_shared/contratoCorreos.ts';
import { agregarCertificadoContrato, NOTA_CERTIFICADO_CONTRATO, pdfContrato } from '../_shared/contratoPdf.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BUCKET = 'jobsite-docs';

type Fila = ContratoDb & Record<string, unknown>;

function fallo(e: { code?: string; message?: string }) {
  if (e.message?.startsWith('missing_fields:')) return responder(400, { error: 'missing_fields', fields: e.message.slice(15).split(',') });
  const x = errorDeBase(e.code);
  return responder(x.status, { error: x.error });
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

  switch (b.action) {
    case 'get': {
      if (!id('jobsite_id')) return responder(400, { error: 'invalid' });
      const { data, error } = await quien.rpc('contract_prepare', { p_jobsite: id('jobsite_id') });
      return error ? fallo(error) : responder(200, data);
    }
    case 'save': {
      if (!id('contract_id') || !b.fields || typeof b.fields !== 'object') return responder(400, { error: 'invalid' });
      const { data, error } = await quien.rpc('contract_save_fields', { p_contract: id('contract_id'), p_fields: b.fields });
      return error ? fallo(error) : responder(200, data);
    }
    case 'preview': {
      // "Ver PDF" (sin firmar) y "Ver PDF firmado" (con la firma del cliente, antes de contrafirmar), D-289. Se guarda
      // en jobsite-docs/<jobsite>/contract-draft/preview.pdf (privado, sin fila en jobsite_documents) y se devuelve una
      // URL firmada de 60 s para el visor.
      if (!id('jobsite_id')) return responder(400, { error: 'invalid' });
      const { data, error } = await quien.rpc('contract_prepare', { p_jobsite: id('jobsite_id') });
      if (error) return fallo(error);
      const c = data as Fila;
      let pdf: Uint8Array;
      try {
        const cliente = c.client_signed_at
          ? { name: c.client_signer_name as string, title: c.client_signer_title as string, at: new Date(c.client_signed_at) }
          : null;
        pdf = await pdfContrato({ campos: camposDe(c), csa: c.csa, firmas: { cliente } });
      } catch {
        return responder(500, { error: 'server_error' });
      }
      const path = `${c.jobsite_id}/contract-draft/preview.pdf`;
      const up = await servicio.storage.from(BUCKET).upload(path, pdf, { contentType: 'application/pdf', upsert: true });
      if (up.error) return responder(500, { error: 'server_error' });
      const { data: s, error: e2 } = await servicio.storage.from(BUCKET).createSignedUrl(path, 60);
      return e2 || !s ? responder(500, { error: 'server_error' }) : responder(200, { url: s.signedUrl, missing: c.missing });
    }
    case 'send': {
      if (!id('contract_id')) return responder(400, { error: 'invalid' });
      const { data, error } = await quien.rpc('contract_send_prepare', { p_contract: id('contract_id') });
      if (error) return fallo(error);
      const c = data as Fila;
      const email = (typeof b.email === 'string' && b.email.trim() ? b.email : c.fields.client_email ?? '').trim().toLowerCase();
      let pdf: Uint8Array;
      try {
        pdf = await pdfContrato({ campos: camposDe(c), csa: c.csa });
      } catch {
        return responder(500, { error: 'server_error' });
      }
      const path = `${c.jobsite_id}/contract-draft/${c.csa}-${tokenAleatorio(9)}.pdf`;
      const up = await servicio.storage.from(BUCKET).upload(path, pdf, { contentType: 'application/pdf', upsert: false });
      if (up.error) return responder(500, { error: 'server_error' });
      const token = tokenAleatorio();
      const r = await quien.rpc('contract_send_confirm', {
        p_contract: c.id, p_path: path, p_sha256: await sha256Bytes(pdf), p_token_hash: await sha256(token), p_email: email,
      });
      if (r.error) {
        await servicio.storage.from(BUCKET).remove([path]);
        return fallo(r.error);
      }
      const d = r.data as Fila & { company: string; name: string; expires_at: string };
      const base = Deno.env.get('PORTAL_BASE_URL') ?? 'https://quote.cidclean.com';
      let sent = false;
      try {
        sent = await enviarCorreo(email, correoContrato({
          name: d.name, company: d.company, csa: d.csa, link: `${base}/contract/${token}`, expires: fecha(d.expires_at, 'en'),
        }), [], REMITENTE_DOCUMENTOS);
      } catch {
        sent = false;
      }
      return responder(200, { id: d.id, sent, expires_at: d.expires_at });
    }
    case 'countersign': {
      if (!id('contract_id')) return responder(400, { error: 'invalid' });
      const { data, error } = await quien.rpc('contract_countersign_prepare', { p_contract: id('contract_id') });
      if (error) return fallo(error);
      const c = data as Fila & { cc_name: string; cc_email: string | null; sent_by_name: string | null };
      const ahora = new Date();
      const campos = camposDe(c);
      const ccTitle = campos.cc_title || 'Managing Member';
      const clienteAt = new Date(c.client_signed_at as string);
      const signatureId = crypto.randomUUID();
      let pdf: Uint8Array;
      let hash: string;
      try {
        pdf = await pdfContrato({
          campos, csa: c.csa, conCertificado: true,
          firmas: {
            cliente: { name: c.client_signer_name as string, title: c.client_signer_title as string, at: clienteAt },
            cidClean: { name: c.cc_name, title: ccTitle, at: ahora },
          },
        });
        hash = await sha256Bytes(pdf);
        pdf = await agregarCertificadoContrato(pdf, `${c.csa} · ${c.sow}`, filasCertificadoContrato({
          csa: c.csa, sow: c.sow, pdfSha256: hash, signatureId, company: campos.client_legal_name ?? '',
          cliente: {
            name: c.client_signer_name as string, title: c.client_signer_title as string, email: c.client_signer_email as string,
            at: clienteAt, ip: c.client_ip, userAgent: c.client_user_agent, signatureId: c.client_signature_id,
          },
          cidClean: { name: c.cc_name, title: ccTitle, email: c.cc_email, at: ahora, ip, userAgent: ua },
          sentAt: c.sent_at ? new Date(c.sent_at) : null, sentBy: c.sent_by_name,
        }), NOTA_CERTIFICADO_CONTRATO);
      } catch {
        return responder(500, { error: 'server_error' });
      }
      const path = `${c.jobsite_id}/contract/${c.csa}-signed-${tokenAleatorio(9)}.pdf`;
      const up = await servicio.storage.from(BUCKET).upload(path, pdf, { contentType: 'application/pdf', upsert: false });
      if (up.error) return responder(500, { error: 'server_error' });
      const r = await quien.rpc('contract_countersign_confirm', {
        p_contract: c.id, p_path: path, p_sha256: await sha256Bytes(pdf), p_signature_id: signatureId,
        p_signed_at: ahora.toISOString(), p_ip: ip, p_user_agent: ua,
      });
      if (r.error) {
        await servicio.storage.from(BUCKET).remove([path]);
        return fallo(r.error);
      }
      const d = r.data as Fila & { company: string; cc_email: string | null };
      // Copia del contrato firmado a ambas partes (D-283).
      const adj = [{ filename: `${c.csa}-signed.pdf`, content: pdf }];
      const copias: { to: string; cc: boolean }[] = [{ to: c.client_signer_email as string, cc: false }];
      copias.push({ to: 'info@cidclean.com', cc: true }); // D-289: copia a info@cidclean.com
      const enviados: Record<string, boolean> = {};
      for (const x of copias) {
        try {
          enviados[x.cc ? 'cid_clean' : 'client'] = await enviarCorreo(x.to, correoContratoFirmado({
            company: d.company, csa: c.csa, sow: c.sow, signedAt: ahora, paraCidClean: x.cc,
          }), adj, REMITENTE_DOCUMENTOS);
        } catch {
          enviados[x.cc ? 'cid_clean' : 'client'] = false;
        }
      }
      return responder(200, { id: d.id, status: d.status, signed_at: ahora.toISOString(), copies: enviados });
    }
    default:
      return responder(400, { error: 'invalid' });
  }
});
