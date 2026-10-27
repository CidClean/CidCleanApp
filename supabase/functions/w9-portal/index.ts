// Portal del W-9 del empleado 1099 (D-255, D-256, D-257, D-258): verify_jwt desactivado, como quote-portal, porque lo
// usa el empleado tenga o no acceso a la app. Todo pasa por funciones de la base que solo puede llamar la service
// role (w9_portal_*). Acciones: state, request, verify, data, preview, sign.
//
// Seguridad (obligatoria): el SSN/ITIN/EIN solo llega en la acción sign; se valida, se escribe en el PDF en memoria y
// se descarta. No se manda a la base, no se escribe en ningún log (no hay console.* con el cuerpo ni con errores que
// lo lleven) y ninguna respuesta lo devuelve. La vista previa (preview) se arma sin número.
// Este archivo no contiene llaves.
import { clienteDeServicio } from '../_shared/comun.ts';
import { codigo, enviarCorreo, sha256, tokenAleatorio } from '../_shared/quotes.ts';
import { base64, correoCodigoW9, fillW9, FORM_VERSION, REQUESTER, tinValid, type TinType, type W9Data } from '../_shared/w9.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const TOKEN = /^[A-Za-z0-9_-]{20,64}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const BUCKET = 'employee-docs';

function r(status: number, cuerpo: Record<string, unknown>): Response {
  return new Response(JSON.stringify(cuerpo), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

function errorRpc(code: string | undefined): Response {
  if (code === '42501') return r(401, { error: 'session' });
  if (code === '22023') return r(400, { error: 'invalid' });
  return r(500, { error: 'server_error' });
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
  // El link guarda solo el hash del token (como el código y la sesión).
  const tokenHash = typeof b.token === 'string' && TOKEN.test(b.token) ? await sha256(b.token) : null;
  const sessionHash = typeof b.session === 'string' && TOKEN.test(b.session) ? await sha256(b.session) : null;

  switch (b.action) {
    case 'state': {
      if (!tokenHash) return r(400, { error: 'invalid' });
      const { data, error } = await db.rpc('w9_portal_state', { p_token_hash: tokenHash });
      if (error) return r(500, { error: 'server_error' });
      return r(200, data);
    }
    case 'request': {
      const email = typeof b.email === 'string' ? b.email.trim().toLowerCase() : '';
      if (!tokenHash || !EMAIL.test(email) || email.length > 200) return r(400, { error: 'invalid' });
      const code = codigo();
      const { data, error } = await db.rpc('w9_portal_request_code', {
        p_token_hash: tokenHash, p_email: email, p_code_hash: await sha256(`${pepper}:w9:${tokenHash}:${code}`),
      });
      if (error) return r(500, { error: 'server_error' });
      if (data === 'closed') return r(409, { error: 'closed' });
      if (data === 'rate_limited') return r(429, { error: 'rate_limited' });
      if (data === 'sent') await enviarCorreo(email, correoCodigoW9(code)); // siempre en inglés (D-247)
      // Misma respuesta para otro correo: no se revela a quién se mandó.
      return r(200, { ok: true });
    }
    case 'verify': {
      const email = typeof b.email === 'string' ? b.email.trim().toLowerCase() : '';
      const code = typeof b.code === 'string' && /^\d{6}$/.test(b.code) ? b.code : null;
      if (!tokenHash || !email || !code) return r(400, { error: 'invalid' });
      const session = tokenAleatorio();
      const { data, error } = await db.rpc('w9_portal_verify_code', {
        p_token_hash: tokenHash, p_email: email, p_code_hash: await sha256(`${pepper}:w9:${tokenHash}:${code}`),
        p_session_hash: await sha256(session),
      });
      if (error) return r(500, { error: 'server_error' });
      if (data === 'ok') return r(200, { session });
      const status = data === 'locked' ? 423 : data === 'closed' ? 409 : data === 'expired' ? 410 : 400;
      return r(status, { error: data });
    }
    case 'data': {
      if (!sessionHash) return r(401, { error: 'session' });
      const { data, error } = await db.rpc('w9_portal_data', { p_session_hash: sessionHash });
      if (error) return r(500, { error: 'server_error' });
      if (!data) return r(401, { error: 'session' });
      return r(200, { ...data, requester: REQUESTER, form_version: FORM_VERSION });
    }
    case 'preview': {
      // Vista previa sin número ni firma: no hay nada que no se haya escrito ya en la pantalla.
      if (!sessionHash) return r(401, { error: 'session' });
      const { data: c, error } = await db.rpc('w9_portal_check', {
        p_session_hash: sessionHash, p_data: b.data ?? null, p_tin_type: null, p_signer_name: null, p_agreed: null,
      });
      if (error) return errorRpc(error.code);
      try {
        const pdf = await fillW9({ data: c.data as W9Data, tinType: null, tin: null, signer: null, signedAt: null, preview: true });
        return r(200, { pdf: base64(pdf) });
      } catch {
        return r(500, { error: 'server_error' });
      }
    }
    case 'sign': {
      if (!sessionHash) return r(401, { error: 'session' });
      const tinType = b.tin_type === 'ssn' || b.tin_type === 'itin' || b.tin_type === 'ein' ? (b.tin_type as TinType) : null;
      const signer = typeof b.signer_name === 'string' ? b.signer_name.trim().slice(0, 120) : '';
      if (!tinType || !signer || b.agreed !== true) return r(400, { error: 'invalid' });
      let tin = tinValid(tinType, b.tin);
      b.tin = null;
      if (!tin) return r(400, { error: 'invalid_tin' });
      const { data: c, error } = await db.rpc('w9_portal_check', {
        p_session_hash: sessionHash, p_data: b.data ?? null, p_tin_type: tinType, p_signer_name: signer, p_agreed: true,
      });
      if (error) {
        tin = null;
        return errorRpc(error.code);
      }
      const ahora = new Date();
      let pdf: Uint8Array;
      try {
        pdf = await fillW9({ data: c.data as W9Data, tinType, tin, signer, signedAt: ahora });
      } catch {
        return r(500, { error: 'server_error' });
      } finally {
        tin = null;
      }
      // Un archivo por intento (nunca se pisa ni se borra el PDF de una firma que sí quedó).
      const path = `${c.path_prefix as string}-${tokenAleatorio(12)}.pdf`;
      const up = await db.storage.from(BUCKET).upload(path, pdf, { contentType: 'application/pdf', upsert: false });
      if (up.error) return r(500, { error: 'server_error' });
      const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || null;
      const { data: s, error: e2 } = await db.rpc('w9_portal_sign', {
        p_session_hash: sessionHash, p_data: c.data, p_tin_type: tinType, p_signer_name: signer, p_agreed: true,
        p_form_version: FORM_VERSION, p_path: path, p_ip: ip, p_user_agent: (req.headers.get('user-agent') ?? '').slice(0, 400),
      });
      if (e2) {
        // No quedó firmado: el PDF de este intento (con el número) no se conserva.
        await db.storage.from(BUCKET).remove([path]);
        return errorRpc(e2.code);
      }
      return r(200, { ok: true, signed_at: s.signed_at });
    }
    default:
      return r(400, { error: 'invalid' });
  }
});
