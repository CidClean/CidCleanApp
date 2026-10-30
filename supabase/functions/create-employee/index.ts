// Crea un empleado (D-171, D-264): perfil con la plantilla del rol, usuario de Auth si tiene acceso y correo de invitación (D-172, D-186).
// verify_jwt activado. La service role solo se usa aquí dentro.
import { CORS, clienteDeQuienLlama, clienteDeServicio, enviarInvitacion, errorDeBase, responder } from '../_shared/comun.ts';

const TIPOS = ['w2', '1099'];
const ROLES = ['admin', 'supervisor', 'employee'];
const IDIOMAS = ['en', 'es'];
const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return responder(405, { error: 'method_not_allowed' });

  let cuerpo: Record<string, unknown>;
  try {
    cuerpo = await req.json();
  } catch {
    return responder(400, { error: 'invalid' });
  }
  // D-264, D-267: Nombre y Apellidos obligatorios; full_name lo arma la base. Dirección opcional (la valida la base).
  const texto = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  const nombrePila = texto(cuerpo.first_name);
  const apellidos = texto(cuerpo.last_name);
  const nombre = nombrePila && apellidos ? `${nombrePila} ${apellidos}` : '';
  const telefono = typeof cuerpo.phone === 'string' ? cuerpo.phone.trim() : '';
  const correo = typeof cuerpo.email === 'string' ? cuerpo.email.trim().toLowerCase() : '';
  const conAcceso = cuerpo.has_app_access === true;
  if (
    !nombre ||
    !TIPOS.includes(String(cuerpo.worker_type)) ||
    !ROLES.includes(String(cuerpo.role)) ||
    !IDIOMAS.includes(String(cuerpo.language)) ||
    (conAcceso && !CORREO.test(correo)) ||
    (!conAcceso && correo !== '' && !CORREO.test(correo))
  ) {
    return responder(400, { error: 'invalid' });
  }

  // 1. Permisos y perfil: lo hace la base de datos con el JWT de quien llama (empleados_invitar_crear y plantilla del rol).
  const quien = clienteDeQuienLlama(req);
  const { data: id, error } = await quien.rpc('create_employee', {
    p_first_name: nombrePila,
    p_last_name: apellidos,
    p_phone: telefono || null,
    p_worker_type: cuerpo.worker_type,
    p_role: cuerpo.role,
    p_language: cuerpo.language,
    p_has_app_access: conAcceso,
    p_email: correo || null,
    p_address_line1: texto(cuerpo.address_line1) || null,
    p_address_line2: texto(cuerpo.address_line2) || null,
    p_state: texto(cuerpo.state) || null,
    p_city: texto(cuerpo.city) || null,
    p_zip: texto(cuerpo.zip) || null,
  });
  if (error || !id) {
    const e = errorDeBase(error?.code);
    return responder(e.status, { error: e.error });
  }
  if (!conAcceso) return responder(200, { id, invitation: 'none' });

  // 2. Usuario de Auth con el correo confirmado (el registro público sigue cerrado). El disparador lo enlaza con el perfil.
  const servicio = clienteDeServicio();
  const { error: errorAuth } = await servicio.auth.admin.createUser({ email: correo, email_confirm: true });
  if (errorAuth) {
    await servicio.from('profiles').delete().eq('id', id); // no queda un perfil sin usuario
    const repetido = /already|registered|exists/i.test(errorAuth.message ?? '');
    return responder(repetido ? 409 : 500, { error: repetido ? 'email_taken' : 'server_error' });
  }

  // 3. Correo de invitación; si falla, el empleado queda creado y se puede reenviar.
  const enviado = await enviarInvitacion(correo, nombre);
  const { data: actor } = await quien.rpc('current_profile_id');
  await servicio.from('change_log').insert({
    actor_id: actor ?? null,
    action: enviado ? 'invitacion_enviada' : 'invitacion_fallida',
    entity: 'profiles',
    entity_id: id,
    detail: {},
  });
  return responder(200, { id, invitation: enviado ? 'sent' : 'failed' });
});
