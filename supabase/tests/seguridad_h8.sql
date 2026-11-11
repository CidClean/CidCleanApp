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
-- El Super Admin entra con aal2 (D-306); el resto, como siempre.
create function pg_temp.valor(quien text, consulta text) returns text language sql as $$
  select pg_temp.valor_aal(quien, case when quien = 'super' then 'aal2' else 'aal1' end, consulta)
$$;
create function pg_temp.prueba(nombre text, esperado text, obtenido text) returns void language sql as $$
  insert into resultados (prueba, ok, detalle) values (nombre, esperado is not distinct from obtenido,
    'esperado=' || coalesce(esperado, 'null') || ' obtenido=' || coalesce(obtenido, 'null'));
$$;
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
                 ('desact', 'empleados_editar_desactivar')) as p(n, k) on p.n = a.nombre;
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
update quote_versions set status = 'sent', public_token = 'h8-token-de-prueba-0123456789abcdef', pdf_path = 'x/y/quote.pdf',
       expires_at = now() + interval '30 days', snapshot = '{"site":"Sede H8"}' where id = pg_temp.id('qv');
select pg_temp.prueba('M4 quote_mail_data sin precios: sin lines, total, pdf_path ni token', 'false',
  pg_temp.valor('envia', format($q$select (quote_mail_data(%L) ?| array['lines','total','pdf_path','token'])::text$q$, pg_temp.id('qv'))));
select pg_temp.prueba('M4 quote_mail_data con precios: total sí, token no', '530.00|false',
  pg_temp.valor('precios', format($q$select (quote_mail_data(%L)->>'total') || '|' || (quote_mail_data(%L) ? 'token')::text$q$, pg_temp.id('qv'), pg_temp.id('qv'))));
select pg_temp.prueba('M4 authenticated no ejecuta send_quote_data ni quote_mail_data_full', 'false|false',
  has_function_privilege('authenticated', 'send_quote_data(uuid)', 'execute')::text || '|' ||
  has_function_privilege('authenticated', 'quote_mail_data_full(uuid)', 'execute')::text);
select pg_temp.prueba('M4 service_role ejecuta quote_mail_data_full', 'true',
  has_function_privilege('service_role', 'quote_mail_data_full(uuid)', 'execute')::text);

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

-- @@ORDEN81@@

select n, prueba, ok, detalle from resultados order by n;
rollback;
