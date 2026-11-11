-- Pruebas de las correcciones de seguridad del hito 8 (órdenes 80 a 83; D-126, D-304, D-306; migraciones 20261112*).
-- Repetibles: todo termina en rollback. Uso (desde la raíz del repositorio): psql -f supabase/tests/seguridad_h8.sql
-- (la última consulta lista cada prueba con ok = true/false).

begin;

create temp table resultados (n int generated always as identity, prueba text, ok boolean, detalle text);
create temp table actores (nombre text primary key, auth_id uuid, profile_id uuid);
create temp table ids (k text primary key, v uuid);
grant all on resultados, actores, ids to public;

-- Ejecuta la consulta como 'quien' con el nivel de la sesión 'aal' (aal1 = solo el código por correo; aal2 = con TOTP).
create function pg_temp.valor_aal(quien text, aal text, consulta text) returns text language plpgsql as $$
declare
  resultado text;
  uid uuid;
begin
  select auth_id into uid from actores where nombre = quien;
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated', 'aal', aal)::text, true);
  set local role authenticated;
  begin
    execute consulta into resultado;
  exception when others then
    resultado := 'ERR:' || sqlstate || ':' || sqlerrm;
  end;
  reset role;
  return resultado;
end $$;
-- Ejecuta una orden sin resultado (insert sin returning) como 'quien': 'ok' o el error.
create function pg_temp.ejecuta(quien text, consulta text) returns text language plpgsql as $$
declare
  resultado text := 'ok';
begin
  perform set_config('request.jwt.claims', json_build_object('sub', (select auth_id from actores where nombre = quien),
                     'role', 'authenticated', 'aal', 'aal1')::text, true);
  set local role authenticated;
  begin
    execute consulta;
  exception when others then
    resultado := 'ERR:' || sqlstate || ':' || sqlerrm;
  end;
  reset role;
  return resultado;
end $$;
-- El Super Admin entra con aal2 (D-306); el resto, como siempre.
create function pg_temp.valor(quien text, consulta text) returns text language sql as $$
  select pg_temp.valor_aal(quien, case when quien = 'super' then 'aal2' else 'aal1' end, consulta)
$$;
create function pg_temp.prueba(nombre text, esperado text, obtenido text) returns void language sql as $$
  insert into resultados (prueba, ok, detalle) values (nombre, esperado is not distinct from obtenido,
    'esperado=' || coalesce(esperado, 'null') || ' obtenido=' || coalesce(obtenido, 'null'));
$$;
create function pg_temp.th(t text) returns text language sql immutable as $$ select encode(sha256(convert_to(t, 'UTF8')), 'hex') $$;
create function pg_temp.id(k text) returns uuid language sql as $$ select v from ids where ids.k = $1 $$;
create function pg_temp.pid(n text) returns uuid language sql as $$ select profile_id from actores where nombre = $1 $$;

-- Personas: sup (plantilla Supervisor, sin ver pagos), pagos (aprueba y ve pagos), envia (quotes_enviar sin precios),
-- precios (quotes_enviar y quotes_ver_precios), perm (gestiona permisos y crea empleados, no es Super Admin),
-- desact (edita y desactiva empleados), super (Super Admin), w2a (asignado a la visita), w2b (no asignado), meta.
do $$
declare
  quien text;
  pid uuid;
  aid uuid;
begin
  foreach quien in array array['sup', 'pagos', 'envia', 'precios', 'perm', 'desact', 'w2a', 'w2b', 'meta'] loop
    aid := gen_random_uuid();
    insert into profiles (full_name, worker_type, role, email, has_app_access)
    values ('Prueba ' || quien, 'w2', 'employee', quien || '@prueba-h8.local', true) returning id into pid;
    insert into auth.users (id, aud, role, email) values (aid, 'authenticated', 'authenticated', quien || '@prueba-h8.local');
    update profiles set auth_user_id = aid where id = pid;
    insert into actores values (quien, aid, pid);
  end loop;
  -- El Super Admin es el que ya existe (hay uno solo).
  select id, auth_user_id into pid, aid from profiles where is_super_admin;
  if aid is null then
    aid := gen_random_uuid();
    insert into auth.users (id, aud, role, email) values (aid, 'authenticated', 'authenticated', 'super@prueba-h8.local');
    update profiles set auth_user_id = aid where id = pid;
  end if;
  insert into actores values ('super', aid, pid);
  insert into profile_permissions (profile_id, permission_key)
  select a.profile_id, p.k from actores a
    join (values ('sup', 'work_editar'), ('sup', 'work_revisar_gps'), ('sup', 'work_registrar_por_otros'),
                 ('pagos', 'work_aprobar'), ('pagos', 'empleados_ver_pagos'),
                 ('envia', 'quotes_enviar'), ('precios', 'quotes_enviar'), ('precios', 'quotes_ver_precios'),
                 ('perm', 'empleados_gestionar_permisos'), ('perm', 'empleados_invitar_crear'), ('perm', 'work_editar'),
                 ('desact', 'empleados_editar_desactivar'), ('precios', 'clientes_editar_datos')) as p(n, k) on p.n = a.nombre;
end $$;

-- Jobsite con una visita de ayer (terminada, sin aprobar) con horas de w2a pagadas a $72.
do $$
declare
  cli uuid;
  js uuid;
  v uuid;
  q uuid;
  qv uuid;
begin
  insert into clients (name, legacy) values ('Cuenta Prueba H8', true) returning id into cli;
  insert into jobsites (client_id, name, address, frequency, latitude, longitude)
  values (cli, 'Sede H8', '1 Main St', '{"kind":"other","days":[]}', 26.1421, -81.7948) returning id into js;
  insert into ids values ('js', js);
  insert into visits (jobsite_id, starts_at, minutes, local_date)
  values (js, now() - interval '30 hours', 240, local_day(now() - interval '30 hours')) returning id into v;
  insert into ids values ('v', v);
  insert into visit_staff (visit_id, profile_id) values (v, pg_temp.pid('w2a'));
  insert into work_entries (visit_id, profile_id, clock_in, clock_out, in_status, out_status, pay_minutes, pay_amount)
  values (v, pg_temp.pid('w2a'), now() - interval '30 hours', now() - interval '26 hours', 'ok', 'ok', 240, 72);
  -- Borrador de quote de un extra (sin SOW), con precios.
  insert into quotes (kind, jobsite_id) values ('extra', js) returning id into q;
  insert into quote_versions (quote_id, minor, walkthrough_version, lines, contact_email, subtotal, tax, total)
  values (q, 0, 0, '{"services":[{"name":"Windows","price":500}]}', 'cliente@prueba-h8.local', 500, 30, 530)
  returning id into qv;
  insert into ids values ('qv', qv);
end $$;

-- ===== Orden 80 =====
-- A1: montos de Work solo con empleados_ver_pagos
select pg_temp.prueba('A1 visit_work: el Supervisor ve la fila de w2a', 'Prueba w2a',
  pg_temp.valor('sup', format($q$select visit_work(%L)->'rows'->0->>'name'$q$, pg_temp.id('v'))));
select pg_temp.prueba('A1 visit_work: el Supervisor no recibe pay_amount', 'null',
  pg_temp.valor('sup', format($q$select coalesce(visit_work(%L)->'rows'->0->>'pay_amount', 'null')$q$, pg_temp.id('v'))));
select pg_temp.prueba('A1 visit_work: con empleados_ver_pagos sí', '72.00',
  pg_temp.valor('pagos', format($q$select visit_work(%L)->'rows'->0->>'pay_amount'$q$, pg_temp.id('v'))));
select pg_temp.prueba('A1 work_to_approve: la visita está por aprobar', '1',
  pg_temp.valor('sup', format($q$select count(*)::text from jsonb_array_elements(work_to_approve()) c where c->>'id' = %L$q$, pg_temp.id('v'))));
select pg_temp.prueba('A1 work_to_approve: el Supervisor no recibe ningún monto', '0',
  pg_temp.valor('sup', $q$select count(*)::text from jsonb_array_elements(work_to_approve()) c, jsonb_array_elements(c->'rows') r
                           where r->>'pay_amount' is not null or r->'service_day'->>'amount' is not null
                              or r->'service_day'->>'expected_amount' is not null$q$));
select pg_temp.prueba('A1 work_to_approve: con empleados_ver_pagos sí', '72.00',
  pg_temp.valor('pagos', format($q$select c->'rows'->0->>'pay_amount' from jsonb_array_elements(work_to_approve()) c where c->>'id' = %L$q$, pg_temp.id('v'))));

-- M4: precios del quote solo con quotes_ver_precios
select pg_temp.prueba('M4 prepare_send_quote sin precios: valida y da el sitio', 'Sede H8',
  pg_temp.valor('envia', format($q$select prepare_send_quote(%L)->>'site'$q$, pg_temp.id('qv'))));
select pg_temp.prueba('M4 prepare_send_quote sin precios: sin lines, subtotal, tax, total ni tax_rate', 'false',
  pg_temp.valor('envia', format($q$select (prepare_send_quote(%L) ?| array['lines','subtotal','tax','total','tax_rate','discount'])::text$q$, pg_temp.id('qv'))));
select pg_temp.prueba('M4 prepare_send_quote con precios: trae el total', '530.00',
  pg_temp.valor('precios', format($q$select prepare_send_quote(%L)->>'total'$q$, pg_temp.id('qv'))));
update quote_versions set status = 'sent', public_token_hash = pg_temp.th('h8-token-de-prueba-0123456789abcdef'), pdf_path = 'x/y/quote.pdf',
       expires_at = now() + interval '30 days', snapshot = '{"site":"Sede H8"}' where id = pg_temp.id('qv');
select pg_temp.prueba('M4 quote_mail_data sin precios: sin lines, total, pdf_path ni token', 'false',
  pg_temp.valor('envia', format($q$select (quote_mail_data(%L) ?| array['lines','total','pdf_path','token'])::text$q$, pg_temp.id('qv'))));
select pg_temp.prueba('M4 quote_mail_data con precios: total sí, token no', '530.00|false',
  pg_temp.valor('precios', format($q$select (quote_mail_data(%L)->>'total') || '|' || (quote_mail_data(%L) ? 'token')::text$q$, pg_temp.id('qv'), pg_temp.id('qv'))));
select pg_temp.prueba('M4 authenticated no ejecuta send_quote_data, quote_mail_info ni quote_resend_data', 'false|false|false',
  has_function_privilege('authenticated', 'send_quote_data(uuid)', 'execute')::text || '|' ||
  has_function_privilege('authenticated', 'quote_mail_info(uuid)', 'execute')::text || '|' ||
  has_function_privilege('authenticated', 'quote_resend_data(uuid)', 'execute')::text);
select pg_temp.prueba('M4 service_role ejecuta send_quote_data y quote_resend_data', 'true|true',
  has_function_privilege('service_role', 'send_quote_data(uuid)', 'execute')::text || '|' ||
  has_function_privilege('service_role', 'quote_resend_data(uuid)', 'execute')::text);

-- B1 / D-304: el rol admin solo lo da o lo quita el Super Admin
select pg_temp.prueba('B1 con gestionar permisos no se da el rol admin', 'ERR:42501',
  left(pg_temp.valor('perm', format($q$select save_employee_permissions(%L, '{}', '{}', 'admin')::text$q$, pg_temp.pid('meta'))), 9));
select pg_temp.prueba('B1 con gestionar permisos sí se cambia a supervisor', 'ok',
  pg_temp.valor('perm', format($q$select 'ok' from save_employee_permissions(%L, '{work_editar}', '{}', 'supervisor')$q$, pg_temp.pid('meta'))));
select pg_temp.prueba('B1 quedó supervisor', 'supervisor', (select role::text from profiles where id = pg_temp.pid('meta')));
select pg_temp.prueba('B1 y sigue dando permisos', 'true',
  (select exists (select 1 from profile_permissions where profile_id = pg_temp.pid('meta') and permission_key = 'work_editar'))::text);
select pg_temp.prueba('B1 el Super Admin (aal2) sí da el rol admin', 'ok',
  pg_temp.valor('super', format($q$select 'ok' from save_employee_permissions(%L, '{}', '{}', 'admin')$q$, pg_temp.pid('meta'))));
select pg_temp.prueba('B1 quedó admin', 'admin', (select role::text from profiles where id = pg_temp.pid('meta')));
select pg_temp.prueba('B1 con gestionar permisos no se quita el rol admin', 'ERR:42501',
  left(pg_temp.valor('perm', format($q$select save_employee_permissions(%L, '{}', '{}', 'employee')::text$q$, pg_temp.pid('meta'))), 9));
select pg_temp.prueba('B1 pero sí se cambian permisos de un admin sin tocar el rol', 'ok',
  pg_temp.valor('perm', format($q$select 'ok' from save_employee_permissions(%L, '{}', '{work_editar}', 'admin')$q$, pg_temp.pid('meta'))));
select pg_temp.prueba('B1 sigue admin y sin work_editar', 'admin|false', (select role::text from profiles where id = pg_temp.pid('meta'))
  || '|' || exists (select 1 from profile_permissions where profile_id = pg_temp.pid('meta') and permission_key = 'work_editar')::text);
select pg_temp.prueba('B1 create_employee con rol admin sin ser Super Admin: no', 'ERR:42501',
  left(pg_temp.valor('perm', $q$select create_employee('A', 'B', null, 'w2', 'admin', 'en', false, null)::text$q$), 9));
select pg_temp.prueba('B1 create_employee con rol employee: sí', 'true',
  pg_temp.valor('perm', $q$select (create_employee('A', 'B', null, 'w2', 'employee', 'en', false, null) is not null)::text$q$));

-- B9: visit_distance solo asignado o con permiso de GPS / editar
select pg_temp.prueba('B9 asignado: mide', 'ok',
  pg_temp.valor('w2a', format($q$select visit_distance(%L, 26.1421, -81.7948)->>'status'$q$, pg_temp.id('v'))));
select pg_temp.prueba('B9 no asignado: no', 'ERR:42501',
  left(pg_temp.valor('w2b', format($q$select visit_distance(%L, 26.1421, -81.7948)->>'status'$q$, pg_temp.id('v'))), 9));
select pg_temp.prueba('B9 con work_revisar_gps: mide', 'ok',
  pg_temp.valor('sup', format($q$select visit_distance(%L, 26.1421, -81.7948)->>'status'$q$, pg_temp.id('v'))));

-- ===== Orden 81 =====
-- M2 / B7 / D-126: desactivar corta las sesiones en el servidor
-- Como en Supabase (la base local de pruebas no siempre lo trae): RLS en storage.objects y lectura para authenticated.
alter table storage.objects enable row level security;
grant select, insert on storage.objects to authenticated;
do $$
declare
  s uuid;
begin
  insert into auth.sessions (user_id) values ((select auth_id from actores where nombre = 'w2b')) returning id into s;
  insert into auth.refresh_tokens (token, user_id, session_id, revoked)
  values ('rt-h8', (select auth_id from actores where nombre = 'w2b')::text, s, false);
  insert into auth.sessions (user_id) values ((select auth_id from actores where nombre = 'w2a'));
  insert into storage.objects (bucket_id, name, owner) values ('walkthrough-photos', 'h8/foto.jpg', (select auth_id from actores where nombre = 'w2b'));
end $$;
select pg_temp.prueba('B7 activo: ve su foto de hace menos de 24 h', '1',
  pg_temp.valor('w2b', $q$select count(*)::text from storage.objects where bucket_id = 'walkthrough-photos' and name = 'h8/foto.jpg'$q$));
select pg_temp.prueba('M2 desactivar: ok', 'ok',
  pg_temp.valor('desact', format($q$select 'ok' from set_employee_active(%L, false)$q$, pg_temp.pid('w2b'))));
select pg_temp.prueba('M2 se borraron sus sesiones y refresh tokens', '0|0',
  (select count(*)::text from auth.sessions where user_id = (select auth_id from actores where nombre = 'w2b')) || '|' ||
  (select count(*)::text from auth.refresh_tokens where user_id = (select auth_id from actores where nombre = 'w2b')::text));
select pg_temp.prueba('M2 las sesiones de otros siguen', '1',
  (select count(*)::text from auth.sessions where user_id = (select auth_id from actores where nombre = 'w2a')));
select pg_temp.prueba('B7 desactivado: ya no ve su foto', '0',
  pg_temp.valor('w2b', $q$select count(*)::text from storage.objects where bucket_id = 'walkthrough-photos' and name = 'h8/foto.jpg'$q$));
select pg_temp.prueba('M2 authenticated no ejecuta revoke_auth_sessions', 'false',
  has_function_privilege('authenticated', 'revoke_auth_sessions(uuid)', 'execute')::text);
select pg_temp.prueba('M2 revoke_auth_sessions es SECURITY DEFINER con search_path fijo', 'true|true',
  (select prosecdef::text || '|' || (proconfig::text like '%search_path%')::text from pg_proc where proname = 'revoke_auth_sessions'));
select pg_temp.prueba('M2 reactivar no falla', 'ok',
  pg_temp.valor('desact', format($q$select 'ok' from set_employee_active(%L, true)$q$, pg_temp.pid('w2b'))));

-- ===== Orden 82 =====
-- B3: la política de subida de documentos del jobsite se cumple con permiso
select pg_temp.prueba('B3 con clientes_editar_datos sube un documento "other" del jobsite ', 'ok',
  pg_temp.ejecuta('precios', format($q$insert into storage.objects (bucket_id, name) values ('jobsite-docs', %L)$q$, pg_temp.id('js') || '/other/doc-h8.pdf')));
select pg_temp.prueba('B3 el archivo quedó', '1', (select count(*)::text from storage.objects where name = pg_temp.id('js') || '/other/doc-h8.pdf'));
select pg_temp.prueba('B3 sin permiso no sube', 'ERR:42501',
  left(pg_temp.ejecuta('w2a', format($q$insert into storage.objects (bucket_id, name) values ('jobsite-docs', %L)$q$, pg_temp.id('js') || '/other/doc-h8b.pdf')), 9));
select pg_temp.prueba('B3 con permiso pero de un jobsite que no existe: no', 'ERR:42501',
  left(pg_temp.ejecuta('precios', format($q$insert into storage.objects (bucket_id, name) values ('jobsite-docs', %L)$q$, gen_random_uuid() || '/other/doc-h8.pdf')), 9));

-- B5: el token del quote se guarda solo como hash; reenviar da uno nuevo y el anterior sigue valiendo
select pg_temp.prueba('B5 el portal abre con el hash del token', 'open', portal_state(pg_temp.th('h8-token-de-prueba-0123456789abcdef'))->>'state');
select pg_temp.prueba('B5 el token en claro no sirve como llave', 'not_found', portal_state('h8-token-de-prueba-0123456789abcdef')->>'state');
select pg_temp.prueba('B5 la columna no guarda el token en claro', '0',
  (select count(*)::text from quote_versions where public_token_hash = 'h8-token-de-prueba-0123456789abcdef'));
create temp table tok2 as select quote_resend_data(pg_temp.id('qv'))->>'token' as t;
select pg_temp.prueba('B5 reenviar: el enlace nuevo abre', 'open', portal_state(pg_temp.th((select t from tok2)))->>'state');
select pg_temp.prueba('B5 reenviar: el enlace anterior sigue valiendo', 'open', portal_state(pg_temp.th('h8-token-de-prueba-0123456789abcdef'))->>'state');
select pg_temp.prueba('B5 reenviar: la fila guarda el hash del nuevo, no el token', 'true|false',
  (select (public_token_hash = pg_temp.th((select t from tok2)))::text || '|' || (public_token_hash = (select t from tok2))::text
     from quote_versions where id = pg_temp.id('qv')));
select pg_temp.prueba('B5 authenticated no ejecuta quote_resend_data ni portal_state', 'false|false',
  has_function_privilege('authenticated', 'quote_resend_data(uuid)', 'execute')::text || '|' ||
  has_function_privilege('authenticated', 'portal_state(text)', 'execute')::text);

-- B4: misma respuesta para "sin código", "no es el destinatario" y "incorrecto"; 15 fallos bloquean el link
select pg_temp.prueba('B4 correo que no es el destinatario: wrong', 'wrong',
  portal_verify_code(pg_temp.th((select t from tok2)), 'otro@prueba-h8.local', 'x', 's-h8'));
select pg_temp.prueba('B4 destinatario sin código pedido: wrong', 'wrong',
  portal_verify_code(pg_temp.th((select t from tok2)), 'cliente@prueba-h8.local', 'x', 's-h8'));
select pg_temp.prueba('B4 pide código', 'sent', portal_request_code(pg_temp.th((select t from tok2)), 'cliente@prueba-h8.local', 'bueno'));
select pg_temp.prueba('B4 código incorrecto: wrong', 'wrong',
  portal_verify_code(pg_temp.th((select t from tok2)), 'cliente@prueba-h8.local', 'malo', 's-h8'));
update quote_portal_codes set expires_at = now() - interval '1 minute' where version_id = pg_temp.id('qv');
select pg_temp.prueba('B4 código vencido (aunque sea el bueno): wrong', 'wrong',
  portal_verify_code(pg_temp.th((select t from tok2)), 'cliente@prueba-h8.local', 'bueno', 's-h8'));
select pg_temp.prueba('B4 llevamos 4 fallos en el link', '4',
  (select failures::text from portal_link_failures where kind = 'quote' and token_hash = pg_temp.th((select t from tok2))));
select pg_temp.prueba('B4 hasta el 15º fallo sigue respondiendo wrong', 'wrong',
  (select max(portal_verify_code(pg_temp.th((select t from tok2)), 'otro@prueba-h8.local', 'x', 's-h8')) from generate_series(1, 11)));
select pg_temp.prueba('B4 con 15 fallos el link queda bloqueado: no da códigos', 'closed',
  portal_request_code(pg_temp.th((select t from tok2)), 'cliente@prueba-h8.local', 'nuevo'));
select pg_temp.prueba('B4 bloqueado: verificar responde closed', 'closed',
  portal_verify_code(pg_temp.th((select t from tok2)), 'cliente@prueba-h8.local', 'bueno', 's-h8'));
select pg_temp.prueba('B4 bloqueado: el portal lo muestra vencido', 'expired', portal_state(pg_temp.th((select t from tok2)))->>'state');
select pg_temp.prueba('B4 el tope es por link: el otro enlace sigue abierto', 'open', portal_state(pg_temp.th('h8-token-de-prueba-0123456789abcdef'))->>'state');
select pg_temp.prueba('B4 el tope es 15 (D-200)', '15', portal_link_max_failures()::text);

-- B6: el enlace de un uso del W-9 recuerda su acción
do $$
declare
  d uuid;
begin
  insert into profile_documents (profile_id, kind, file_path) values (pg_temp.pid('w2a'), 'w9', pg_temp.pid('w2a') || '/w9/w9-h8.pdf.enc') returning id into d;
  insert into w9_open_tokens (token_hash, document_id, action) values (pg_temp.th('abrir-h8'), d, 'open'), (pg_temp.th('bajar-h8'), d, 'download');
end $$;
select pg_temp.prueba('B6 enlace de abrir: action open', 'open', consume_w9_open_token(pg_temp.th('abrir-h8'))->>'action');
select pg_temp.prueba('B6 enlace de descargar: action download y la ruta', 'download|true',
  (select (r->>'action') || '|' || (r->>'path' like '%/w9/w9-h8.pdf.enc')::text from (select consume_w9_open_token(pg_temp.th('bajar-h8')) r) x));
select pg_temp.prueba('B6 el enlace es de un solo uso', 'ERR', left(pg_temp.valor('w2a', 'select 1'), 0) ||
  (select case when exists (select 1 from w9_open_tokens where token_hash = pg_temp.th('abrir-h8') and used_at is null) then 'NO' else 'ERR' end));

-- @@ORDEN83@@

select n, prueba, ok, detalle from resultados order by n;
rollback;
