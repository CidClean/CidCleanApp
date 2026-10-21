// Reenvía la invitación (D-172) mientras el empleado no haya entrado por primera vez (first_login_at null).
// verify_jwt activado; mismo permiso que crear.
import { CORS, clienteDeQuienLlama, clienteDeServicio, enviarInvitacion, responder } from '../_shared/comun.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return responder(405, { error: 'method_not_allowed' });

  let perfil = '';
  try {
    perfil = String((await req.json()).profile_id ?? '');
  } catch {
    return responder(400, { error: 'invalid' });
  }
  if (!UUID.test(perfil)) return responder(400, { error: 'invalid' });

  const quien = clienteDeQuienLlama(req);
  const { data: permitido } = await quien.rpc('has_permission', { perm: 'empleados_invitar_crear' });
  if (permitido !== true) return responder(403, { error: 'forbidden' });

  const servicio = clienteDeServicio();
  const { data: p } = await servicio
    .from('profiles')
    .select('id, full_name, email, has_app_access, active, first_login_at, auth_user_id')
    .eq('id', perfil)
    .maybeSingle();
  if (!p) return responder(404, { error: 'not_found' });
  if (!p.has_app_access || !p.email) return responder(409, { error: 'no_access' });
  if (p.first_login_at) return responder(409, { error: 'already_logged_in' });
  if (!p.active) return responder(409, { error: 'inactive' });

  if (!p.auth_user_id) {
    const { error } = await servicio.auth.admin.createUser({ email: p.email, email_confirm: true });
    if (error && !/already|registered|exists/i.test(error.message ?? '')) return responder(500, { error: 'server_error' });
  }

  const enviado = await enviarInvitacion(p.email, p.full_name);
  const { data: actor } = await quien.rpc('current_profile_id');
  await servicio.from('change_log').insert({
    actor_id: actor ?? null,
    action: enviado ? 'invitacion_reenviada' : 'invitacion_fallida',
    entity: 'profiles',
    entity_id: p.id,
    detail: {},
  });
  return responder(enviado ? 200 : 502, enviado ? { invitation: 'sent' } : { error: 'email_failed' });
});
