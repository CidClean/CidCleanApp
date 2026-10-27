// Manda (o reenvía) el W-9 por llenar al empleado 1099 (D-255, D-256): verify_jwt activado.
// Con el JWT de quien envía, create_w9_request / resend_w9_request exigen empleados_gestionar_documentos (D-193),
// validan los datos y guardan solo el hash del token. La función genera el token, arma el link
// https://quote.cidclean.com/w9/{token} y manda el correo en inglés (D-247) con el marco de la marca (D-250), desde
// quotes@mail.cidclean.com con respuesta a info@cidclean.com (D-249).
// Cuerpo: { profile_id, data, email } para mandar uno nuevo, o { request_id, resend: true } para reenviar.
// Devuelve { sent, expires_at }: sent = false si el correo no salió (la solicitud queda y se puede reenviar).
// Este archivo no contiene llaves.
import { CORS, clienteDeQuienLlama, errorDeBase, responder } from '../_shared/comun.ts';
import { enviarCorreo, fecha, sha256, tokenAleatorio } from '../_shared/quotes.ts';
import { correoW9 } from '../_shared/w9.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return responder(405, { error: 'method_not_allowed' });
  let b: { profile_id?: unknown; data?: unknown; email?: unknown; request_id?: unknown; resend?: unknown };
  try {
    b = await req.json();
  } catch {
    return responder(400, { error: 'invalid' });
  }
  const quien = clienteDeQuienLlama(req);
  const base = Deno.env.get('PORTAL_BASE_URL') ?? 'https://quote.cidclean.com';
  const token = tokenAleatorio();
  const tokenHash = await sha256(token);

  let r;
  if (b.resend === true) {
    if (typeof b.request_id !== 'string' || !UUID.test(b.request_id)) return responder(400, { error: 'invalid' });
    r = await quien.rpc('resend_w9_request', { p_request: b.request_id, p_token_hash: tokenHash });
  } else {
    if (typeof b.profile_id !== 'string' || !UUID.test(b.profile_id)) return responder(400, { error: 'invalid' });
    if (typeof b.email !== 'string' || b.email.length > 200 || !b.data || typeof b.data !== 'object') {
      return responder(400, { error: 'invalid' });
    }
    r = await quien.rpc('create_w9_request', { p_profile: b.profile_id, p_data: b.data, p_email: b.email, p_token_hash: tokenHash });
  }
  if (r.error) {
    const e = errorDeBase(r.error.code);
    return responder(e.status, { error: e.error });
  }
  const d = r.data as { id: string; email: string; name: string; expires_at: string };
  let sent = false;
  try {
    sent = await enviarCorreo(d.email, correoW9({ name: d.name, link: `${base}/w9/${token}`, expires: fecha(d.expires_at, 'en') }));
  } catch {
    sent = false;
  }
  return responder(200, { id: d.id, sent, expires_at: d.expires_at });
});
