// Portal de firma del contrato del cliente (orden 62, D-283): verify_jwt desactivado, como quote-portal y w9-portal,
// porque lo usa el cliente sin cuenta. Link https://quote.cidclean.com/contract/{token} (solo se guarda el hash del
// token, de un solo uso y 15 días de vida), código de 6 dígitos al correo del contrato, firma con nombre, cargo y la
// casilla de consentimiento. Todo pasa por funciones de la base que solo puede llamar la service role
// (contract_portal_*). Acciones: state, request, verify, data, file, sign. Este archivo no contiene llaves.
import { clienteDeServicio } from '../_shared/comun.ts';
import { codigo, enviarCorreo, sha256, tokenAleatorio } from '../_shared/quotes.ts';
import { correoCodigoContrato, correoFirmaCliente, REMITENTE_DOCUMENTOS } from '../_shared/contratoCorreos.ts';
import { consentText } from '../_shared/legal/csa-sow-1.0.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const TOKEN = /^[A-Za-z0-9_-]{20,64}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function r(status: number, cuerpo: Record<string, unknown>): Response {
  return new Response(JSON.stringify(cuerpo), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return r(405, { error: 'method_not_allowed' });
  let b: Record<string, unknown>;
  try {
    b = await req.json();
  } catch {
    return r(400, { error: 'invalid' });
  }
  const db = clienteDeServicio();
  const pepper = Deno.env.get('PORTAL_CODE_PEPPER') ?? '';
  const tokenHash = typeof b.token === 'string' && TOKEN.test(b.token) ? await sha256(b.token) : null;
  const sessionHash = typeof b.session === 'string' && TOKEN.test(b.session) ? await sha256(b.session) : null;

  switch (b.action) {
    case 'state': {
      if (!tokenHash) return r(400, { error: 'invalid' });
      const { data, error } = await db.rpc('contract_portal_state', { p_token_hash: tokenHash });
      return error ? r(500, { error: 'server_error' }) : r(200, data);
    }
    case 'request': {
      const email = typeof b.email === 'string' ? b.email.trim().toLowerCase() : '';
      if (!tokenHash || !EMAIL.test(email) || email.length > 200) return r(400, { error: 'invalid' });
      const code = codigo();
      const { data, error } = await db.rpc('contract_portal_request_code', {
        p_token_hash: tokenHash, p_email: email, p_code_hash: await sha256(`${pepper}:contract:${tokenHash}:${code}`),
      });
      if (error) return r(500, { error: 'server_error' });
      if (data === 'closed') return r(409, { error: 'closed' });
      if (data === 'rate_limited') return r(429, { error: 'rate_limited' });
      if (data === 'sent') await enviarCorreo(email, correoCodigoContrato(code), [], REMITENTE_DOCUMENTOS);
      return r(200, { ok: true }); // misma respuesta para otro correo
    }
    case 'verify': {
      const email = typeof b.email === 'string' ? b.email.trim().toLowerCase() : '';
      const code = typeof b.code === 'string' && /^\d{6}$/.test(b.code) ? b.code : null;
      if (!tokenHash || !email || !code) return r(400, { error: 'invalid' });
      const session = tokenAleatorio();
      const { data, error } = await db.rpc('contract_portal_verify_code', {
        p_token_hash: tokenHash, p_email: email, p_code_hash: await sha256(`${pepper}:contract:${tokenHash}:${code}`),
        p_session_hash: await sha256(session),
      });
      if (error) return r(500, { error: 'server_error' });
      if (data === 'ok') return r(200, { session });
      const status = data === 'locked' ? 423 : data === 'closed' ? 409 : data === 'expired' ? 410 : 400;
      return r(status, { error: data });
    }
    case 'data': {
      if (!sessionHash) return r(401, { error: 'session' });
      const { data, error } = await db.rpc('contract_portal_data', { p_session_hash: sessionHash });
      if (error) return r(500, { error: 'server_error' });
      if (!data) return r(401, { error: 'session' });
      const { unsigned_path: _, ...resto } = data as Record<string, unknown>;
      return r(200, { ...resto, consent_text: consentText(String(resto.company ?? '')) });
    }
    case 'file': {
      // El contrato sin firmar, para leerlo antes de firmar (URL firmada de 60 segundos).
      if (!sessionHash) return r(401, { error: 'session' });
      const { data, error } = await db.rpc('contract_portal_data', { p_session_hash: sessionHash });
      if (error) return r(500, { error: 'server_error' });
      const path = (data as { unsigned_path?: string } | null)?.unsigned_path;
      if (!path) return r(401, { error: 'session' });
      const { data: s, error: e2 } = await db.storage.from('jobsite-docs').createSignedUrl(path, 60);
      return e2 || !s ? r(500, { error: 'server_error' }) : r(200, { url: s.signedUrl });
    }
    case 'sign': {
      if (!sessionHash) return r(401, { error: 'session' });
      const name = typeof b.name === 'string' ? b.name.trim().slice(0, 120) : '';
      const title = typeof b.title === 'string' ? b.title.trim().slice(0, 120) : '';
      if (!name || !title || b.consent !== true) return r(400, { error: 'invalid' });
      const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || null;
      const { data, error } = await db.rpc('contract_portal_sign', {
        p_session_hash: sessionHash, p_name: name, p_title: title, p_consent: true, p_ip: ip,
        p_user_agent: (req.headers.get('user-agent') ?? '').slice(0, 400), p_signature_id: crypto.randomUUID(),
      });
      if (error) return r(error.code === '42501' ? 401 : error.code === '22023' ? 409 : 500, { error: error.code === '22023' ? 'closed' : 'server_error' });
      const d = data as { signed_at: string; csa: string; company: string; site: string; sent_by_email: string | null };
      try {
        if (d.sent_by_email) await enviarCorreo(d.sent_by_email, correoFirmaCliente({ company: d.company, site: d.site, csa: d.csa, signer: name }), [], REMITENTE_DOCUMENTOS);
      } catch (e) {
        console.error('aviso de firma', e);
      }
      return r(200, { ok: true, signed_at: d.signed_at });
    }
    default:
      return r(400, { error: 'invalid' });
  }
});
