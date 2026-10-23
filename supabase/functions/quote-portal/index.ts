// Portal del cliente (D-129, D-209): verify_jwt desactivado, porque lo usa el cliente sin cuenta. Todo pasa por
// funciones de la base que solo puede llamar la service role (portal_*). Nunca devuelve datos internos.
// Acciones: state, request, verify, quote, file, decide.
import { clienteDeServicio, responder } from '../_shared/comun.ts';
import { codigo, correoCodigo, correoDecision, enviarCorreo, lang, sha256, tokenAleatorio } from '../_shared/quotes.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const TOKEN = /^[A-Za-z0-9_-]{20,64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
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
  const token = typeof b.token === 'string' && TOKEN.test(b.token) ? b.token : null;
  const sessionHash = typeof b.session === 'string' && TOKEN.test(b.session) ? await sha256(b.session) : null;

  switch (b.action) {
    case 'state': {
      if (!token) return r(400, { error: 'invalid' });
      const { data, error } = await db.rpc('portal_state', { p_token: token });
      if (error) return r(500, { error: 'server_error' });
      return r(200, data);
    }
    case 'request': {
      const email = typeof b.email === 'string' ? b.email.trim().toLowerCase() : '';
      if (!token || !EMAIL.test(email) || email.length > 200) return r(400, { error: 'invalid' });
      const code = codigo();
      const { data, error } = await db.rpc('portal_request_code', {
        p_token: token, p_email: email, p_code_hash: await sha256(`${pepper}:${token}:${code}`),
      });
      if (error) return r(500, { error: 'server_error' });
      if (data === 'closed') return r(409, { error: 'closed' });
      if (data === 'rate_limited') return r(429, { error: 'rate_limited' });
      if (data === 'sent') {
        const { data: st } = await db.rpc('portal_state', { p_token: token });
        await enviarCorreo(email, correoCodigo(lang(st?.language), code));
      }
      // Misma respuesta para un correo que no es del quote: no se revela quién lo recibió (como D-150).
      return r(200, { ok: true });
    }
    case 'verify': {
      const email = typeof b.email === 'string' ? b.email.trim().toLowerCase() : '';
      const code = typeof b.code === 'string' && /^\d{6}$/.test(b.code) ? b.code : null;
      if (!token || !email || !code) return r(400, { error: 'invalid' });
      const session = tokenAleatorio();
      const { data, error } = await db.rpc('portal_verify_code', {
        p_token: token, p_email: email, p_code_hash: await sha256(`${pepper}:${token}:${code}`), p_session_hash: await sha256(session),
      });
      if (error) return r(500, { error: 'server_error' });
      if (data === 'ok') return r(200, { session });
      const status = data === 'locked' ? 423 : data === 'closed' ? 409 : data === 'expired' ? 410 : 400;
      return r(status, { error: data });
    }
    case 'quote': {
      if (!sessionHash) return r(401, { error: 'session' });
      const { data, error } = await db.rpc('portal_quote', { p_session_hash: sessionHash });
      if (error) return r(500, { error: 'server_error' });
      if (!data) return r(401, { error: 'session' });
      return r(200, data);
    }
    case 'file': {
      const kind = b.kind === 'sow' || b.kind === 'pdf' || b.kind === 'terms' ? b.kind : null;
      if (!sessionHash || !kind) return r(400, { error: 'invalid' });
      const { data: path, error } = await db.rpc('portal_file', { p_session_hash: sessionHash, p_kind: kind });
      if (error) return r(500, { error: 'server_error' });
      if (!path) return r(kind === 'terms' ? 404 : 401, { error: kind === 'terms' ? 'not_found' : 'session' });
      const bucket = kind === 'terms' ? 'terms' : 'quote-files';
      const { data: s, error: e2 } = await db.storage.from(bucket).createSignedUrl(path, 60);
      if (e2 || !s) return r(500, { error: 'server_error' });
      return r(200, { url: s.signedUrl });
    }
    case 'decide': {
      const kind = b.kind;
      if (!sessionHash || (kind !== 'accepted' && kind !== 'rejected' && kind !== 'changes_requested')) return r(400, { error: 'invalid' });
      const reason = typeof b.reason_id === 'string' && UUID.test(b.reason_id) ? b.reason_id : null;
      const str = (v: unknown, n: number) => (typeof v === 'string' ? v.slice(0, n) : null);
      const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || null;
      const { data: d, error } = await db.rpc('portal_decide', {
        p_session_hash: sessionHash, p_kind: kind, p_name: str(b.name, 120), p_title: str(b.title, 120), p_reason: reason,
        p_note: str(b.note, 2000), p_read_confirmed: b.read_confirmed === true, p_ip: ip,
        p_user_agent: (req.headers.get('user-agent') ?? '').slice(0, 400),
      });
      if (error) return r(error.code === '42501' ? 401 : error.code === '22023' ? 400 : 500, { error: error.code === '22023' ? 'invalid' : 'server_error' });
      // La decisión ya quedó guardada: lo que sigue (copiar el SOW y avisar) no puede hacer fallar la respuesta, o el
      // cliente vería un error aunque aceptó (D-220 d).
      try {
        // Al aceptar, el SOW se copia al Jobsite (D-209).
        if (kind === 'accepted' && d.jobsite_id && d.sow_path) {
          const f = await db.storage.from('quote-files').download(d.sow_path);
          if (f.data) {
            const destino = `${d.jobsite_id}/sow-${d.version}.pdf`;
            const up = await db.storage.from('jobsite-docs').upload(destino, f.data, { contentType: 'application/pdf', upsert: true });
            if (!up.error) {
              await db.rpc('portal_attach_jobsite_sow', { p_jobsite: d.jobsite_id, p_path: destino, p_version: null });
            }
          }
        }
      } catch (e) {
        console.error('copiar SOW', e);
      }
      try {
        if (d.sender_email) await enviarCorreo(d.sender_email, correoDecision(lang(d.sender_language), kind, d.company, d.site, d.version));
      } catch (e) {
        console.error('aviso a quien envió', e);
      }
      return r(200, { kind });
    }
    default:
      return r(400, { error: 'invalid' });
  }
});
