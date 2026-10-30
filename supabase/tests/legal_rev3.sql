-- Pruebas de la legal rev. 3, fase B (órdenes 56 a 59; migraciones 20261030000008 a 20261030000011; D-282, D-284, D-280).
-- Repetibles: todo ocurre dentro de una transacción que termina en rollback, no queda nada en la base.
-- Simulan roles con `set local role` y `request.jwt.claims`, como hace la API.
-- Uso: psql -f supabase/tests/legal_rev3.sql   (la última consulta lista cada prueba con ok = true/false).

begin;

create temp table resultados (n int generated always as identity, prueba text, ok boolean, detalle text);
create temp table actores (nombre text primary key, auth_id uuid, profile_id uuid);
create temp table fx (k text primary key, id uuid, txt text);
grant all on resultados, actores, fx to public;

create function pg_temp.valor(quien text, consulta text) returns text language plpgsql as $$
declare
  resultado text;
  uid uuid;
begin
  if quien = 'anon' then
    perform set_config('request.jwt.claims', '{"role":"anon"}', true);
    set local role anon;
  else
    select auth_id into uid from actores where nombre = quien;
    perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
    set local role authenticated;
  end if;
  begin
    execute consulta into resultado;
  exception when others then
    resultado := 'ERR:' || sqlstate;
  end;
  reset role;
  return resultado;
end $$;

-- Como la service role (lo que hace la Edge Function w9-portal).
create function pg_temp.servicio(consulta text) returns text language plpgsql as $$
declare resultado text;
begin
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  set local role service_role;
  begin
    execute consulta into resultado;
  exception when others then
    resultado := 'ERR:' || sqlstate;
  end;
  reset role;
  return resultado;
end $$;

create function pg_temp.prueba(nombre text, esperado text, obtenido text) returns void language sql as $$
  insert into resultados (prueba, ok, detalle) values (nombre, esperado is not distinct from obtenido,
    'esperado=' || coalesce(esperado, 'null') || ' obtenido=' || coalesce(obtenido, 'null'));
$$;

-- Hash como el de la Edge Function (sha256 en hex).
create function pg_temp.h(t text) returns text language sql as $$ select encode(digest(t, 'sha256'), 'hex') $$;

grant execute on all functions in schema pg_temp to public;
grant usage on schema storage to service_role;
grant select, insert on storage.objects to service_role;

grant insert on storage.objects to authenticated;
grant select on storage.objects to authenticated;

-- Personas de prueba -------------------------------------------------------------------------------
do $$
declare
  quien text;
  pid uuid;
  aid uuid;
begin
  foreach quien in array array['emp', 'otro', 'admin', 'sup', 'docs', 'karina'] loop
    aid := gen_random_uuid();
    insert into profiles (full_name, worker_type, role, email, has_app_access)
    values ('Prueba ' || quien, case when quien = 'karina' then '1099' else 'w2' end::worker_type,
            case quien when 'admin' then 'admin' when 'sup' then 'supervisor' else 'employee' end::role_template,
            quien || '@prueba-r3.local', true) returning id into pid;
    insert into auth.users (id, aud, role, email) values (aid, 'authenticated', 'authenticated', quien || '@prueba-r3.local');
    insert into actores values (quien, aid, pid);
  end loop;
  aid := gen_random_uuid();
  insert into auth.users (id, aud, role, email) values (aid, 'authenticated', 'authenticated', 'super@prueba-r3.local');
  update profiles set auth_user_id = aid where is_super_admin and auth_user_id is null;
  insert into actores select 'super', auth_user_id, id from profiles where is_super_admin;
  insert into profile_permissions (profile_id, permission_key)
    select profile_id, 'empleados_gestionar_documentos' from actores where nombre = 'docs';
  insert into profile_permissions (profile_id, permission_key)
    select profile_id, 'walkthroughs_hacer' from actores where nombre in ('sup', 'admin');
  insert into storage.objects (bucket_id, name) values ('terms', 'staff/t1.pdf'), ('terms', 'privacy/p1.pdf'),
    ('terms', 'privacy/p2.pdf'), ('terms', 'privacy/p3.pdf');
end $$;

create function pg_temp.pid(n text) returns uuid language sql as $$ select profile_id from actores where nombre = n $$;
create function pg_temp.aid(n text) returns uuid language sql as $$ select auth_id from actores where nombre = n $$;
create function pg_temp.fid(n text) returns uuid language sql as $$ select id from fx where k = n $$;
-- IP y navegador como los pone el servidor (PostgREST: request.headers).
create function pg_temp.cabeceras() returns void language sql as $$
  select set_config('request.headers', '{"cf-connecting-ip":"203.0.113.7","x-forwarded-for":"10.0.0.1","user-agent":"Prueba/1.0"}', true)
$$;
grant execute on all functions in schema pg_temp to public;

-- A. Términos y Política de Privacidad (orden 56) -------------------------------------------------------
select pg_temp.prueba('privacidad: el empleado no publica (42501)', 'ERR:42501',
  pg_temp.valor('emp', 'select ''ok'' from (select publish_terms(''privacy'', ''privacy/p1.pdf'', true)) x'));
select pg_temp.prueba('publicar staff v1 (Super Admin)', 'ok',
  pg_temp.valor('super', 'select ''ok'' from (select publish_terms(''staff'', ''staff/t1.pdf'')) x'));
select pg_temp.prueba('staff pendiente: una fila sin aceptar', '1|false',
  pg_temp.valor('emp', 'select count(*) || ''|'' || bool_or(accepted) from my_terms_status()'));
select pg_temp.prueba('privacidad v1 sin cambio importante: no se pide aceptarla', 'ok|1|false',
  pg_temp.valor('super', 'select ''ok'' from (select publish_terms(''privacy'', ''privacy/p1.pdf'', false)) x') || '|' ||
  pg_temp.valor('emp', 'select count(*) || ''|'' || bool_or(accepted) from my_terms_status()'));
select pg_temp.prueba('privacidad v1 no importante: se avisa igual (privacy_new, major false), por correo y en la app', 'false|pending',
  (select (data->>'major') || '|' || email_status from notifications where profile_id = pg_temp.pid('emp') and kind = 'privacy_new'));
select pg_temp.prueba('privacidad v2 con cambio importante: se pide aceptarla', 'ok|2',
  pg_temp.valor('super', 'select ''ok'' from (select publish_terms(''privacy'', ''privacy/p2.pdf'', true)) x') || '|' ||
  pg_temp.valor('emp', 'select count(*) from my_terms_status() where not accepted'));
select pg_temp.prueba('avisos: terms_new y 2 privacy_new al empleado; ninguno al Super Admin', '1|2|0',
  (select count(*) from notifications where profile_id = pg_temp.pid('emp') and kind = 'terms_new') || '|' ||
  (select count(*) from notifications where profile_id = pg_temp.pid('emp') and kind = 'privacy_new') || '|' ||
  (select count(*) from notifications where profile_id = pg_temp.pid('super') and kind in ('terms_new', 'privacy_new')));
select pg_temp.prueba('texto del aviso: por aceptar (inglés del correo) y solo aviso', 'New Privacy Policy to accept|Política de Privacidad actualizada',
  (notification_text('privacy_new', '{"version":2,"major":true}', 'en')).title || '|' ||
  (notification_text('privacy_new', '{"version":1,"major":false}', 'es')).title);
select pg_temp.cabeceras();
select pg_temp.prueba('aceptar registra los 2 pendientes', '2',
  pg_temp.valor('emp', 'select accept_pending_terms()'));
select pg_temp.prueba('la aceptación guarda la IP del servidor (cf-connecting-ip) y el navegador', '2|203.0.113.7|Prueba/1.0',
  (select count(*) || '|' || min(ip) || '|' || min(user_agent) from terms_acceptances where profile_id = pg_temp.pid('emp')));
select pg_temp.prueba('la privacidad aceptada es la última versión (2) y queda en el historial', '2|2',
  (select t.version::text from terms_acceptances a join terms_documents t on t.id = a.document_id
    where a.profile_id = pg_temp.pid('emp') and t.kind = 'privacy') || '|' ||
  (select count(*)::text from change_log where action = 'terminos_aceptados' and actor_id = pg_temp.pid('emp') and detail->>'ip' = '203.0.113.7'));
select pg_temp.prueba('ya no queda nada pendiente; aceptar otra vez no duplica', '0|0',
  pg_temp.valor('emp', 'select count(*) from my_terms_status() where not accepted') || '|' ||
  pg_temp.valor('emp', 'select accept_pending_terms()'));
select pg_temp.prueba('privacidad v3 no importante: quien aceptó la v2 sigue sin pendientes; get_current_terms dice major false', 'ok|0|3|false',
  pg_temp.valor('super', 'select ''ok'' from (select publish_terms(''privacy'', ''privacy/p3.pdf'', false)) x') || '|' ||
  pg_temp.valor('emp', 'select count(*) from my_terms_status() where not accepted') || '|' ||
  pg_temp.valor('emp', 'select version || ''|'' || major from get_current_terms(''privacy'')'));
select pg_temp.prueba('otro empleado: sigue pendiente staff y privacidad v2', '2',
  pg_temp.valor('otro', 'select count(*) from my_terms_status() where not accepted'));
select pg_temp.prueba('el Super Admin no tiene nada que aceptar', '0',
  pg_temp.valor('super', 'select count(*) from my_terms_status()'));
select pg_temp.prueba('nadie escribe la aceptación (ni la IP) directo (42501)', 'ERR:42501',
  pg_temp.valor('otro', format('insert into terms_acceptances (profile_id, document_id, ip) select %L, id, ''1.1.1.1'' from terms_documents limit 1 returning ''ok''', pg_temp.pid('otro'))));
select pg_temp.prueba('anon no consulta ni acepta (42501)', 'ERR:42501|ERR:42501',
  pg_temp.valor('anon', 'select count(*) from my_terms_status()') || '|' || pg_temp.valor('anon', 'select accept_pending_terms()'));

-- B. Eliminar cuenta (orden 57) ---------------------------------------------------------------------------
select pg_temp.prueba('el empleado pide eliminar su cuenta; pedirla otra vez devuelve la misma fecha', 'true',
  (pg_temp.valor('emp', 'select request_account_deletion()') = pg_temp.valor('emp', 'select request_account_deletion()'))::text);
select pg_temp.prueba('queda una sola solicitud pendiente', '1',
  (select count(*)::text from account_deletion_requests where profile_id = pg_temp.pid('emp') and status = 'pending'));
select pg_temp.prueba('queda en el historial y avisa al Super Admin (app y correo)', '1|1|pending',
  (select count(*)::text from change_log where action = 'cuenta_eliminacion_solicitada' and actor_id = pg_temp.pid('emp')) || '|' ||
  (select count(*) || '|' || min(email_status) from notifications where profile_id = pg_temp.pid('super') and kind = 'account_deletion_requested'));
select pg_temp.prueba('el Super Admin no pide eliminar su cuenta (42501)', 'ERR:42501',
  pg_temp.valor('super', 'select request_account_deletion()'));
select pg_temp.prueba('cada uno ve solo su solicitud; el Super Admin las ve todas', '1|0|1',
  pg_temp.valor('emp', 'select count(*) from account_deletion_requests') || '|' ||
  pg_temp.valor('otro', 'select count(*) from account_deletion_requests') || '|' ||
  pg_temp.valor('super', 'select count(*) from list_account_deletion_requests()'));
select pg_temp.prueba('solo el Super Admin lista y atiende (42501)', 'ERR:42501|ERR:42501|ERR:42501',
  pg_temp.valor('admin', 'select count(*) from list_account_deletion_requests()') || '|' ||
  pg_temp.valor('admin', format('select ''ok'' from (select complete_account_deletion(%L)) x', (select id from account_deletion_requests where profile_id = pg_temp.pid('emp')))) || '|' ||
  pg_temp.valor('emp', 'insert into account_deletion_requests (profile_id) values (current_profile_id()) returning ''ok'''));
select pg_temp.prueba('el Super Admin la marca como atendida', 'ok',
  pg_temp.valor('super', format('select ''ok'' from (select complete_account_deletion(%L)) x', (select id from account_deletion_requests where profile_id = pg_temp.pid('emp')))));
select pg_temp.prueba('atendida: estado done, cuenta y acceso desactivados, en el historial', 'done|false|false|1',
  (select status from account_deletion_requests where profile_id = pg_temp.pid('emp')) || '|' ||
  (select active || '|' || has_app_access from profiles where id = pg_temp.pid('emp')) || '|' ||
  (select count(*)::text from change_log where action = 'cuenta_eliminacion_atendida' and entity_id = pg_temp.pid('emp')));

-- C. Fotos solo admin (orden 58) ----------------------------------------------------------------------------
insert into storage.objects (bucket_id, name, owner, created_at) values
  ('walkthrough-photos', 'w1/a.jpg', pg_temp.aid('sup'), now()),
  ('walkthrough-photos', 'w1/b.jpg', pg_temp.aid('sup'), now() - interval '2 days'),
  ('walkthrough-photos', 'w1/c.jpg', pg_temp.aid('admin'), now());
select pg_temp.prueba('el bucket de fotos es privado', 'false',
  (select public::text from storage.buckets where id = 'walkthrough-photos'));
select pg_temp.prueba('rol admin y Super Admin ven todas las fotos', '3|3',
  pg_temp.valor('admin', 'select count(*) from storage.objects where bucket_id = ''walkthrough-photos''') || '|' ||
  pg_temp.valor('super', 'select count(*) from storage.objects where bucket_id = ''walkthrough-photos'''));
select pg_temp.prueba('supervisor que hace walkthroughs: solo la suya recién subida, no la galería', '1|w1/a.jpg',
  pg_temp.valor('sup', 'select count(*) from storage.objects where bucket_id = ''walkthrough-photos''') || '|' ||
  pg_temp.valor('sup', 'select min(name) from storage.objects where bucket_id = ''walkthrough-photos'''));
select pg_temp.prueba('empleado sin permisos y anon: ninguna', '0|ERR:42501',
  pg_temp.valor('otro', 'select count(*) from storage.objects where bucket_id = ''walkthrough-photos''') || '|' ||
  pg_temp.valor('anon', 'select count(*) from storage.objects where bucket_id = ''walkthrough-photos'''));
select pg_temp.prueba('is_admin_role: admin y Super Admin sí; supervisor no', 'true|true|false',
  pg_temp.valor('admin', 'select is_admin_role()') || '|' || pg_temp.valor('super', 'select is_admin_role()') || '|' ||
  pg_temp.valor('sup', 'select is_admin_role()'));

-- D. W-9 cifrado (orden 59) -------------------------------------------------------------------------------
do $$
declare
  k uuid := (select profile_id from actores where nombre = 'karina');
  d uuid;
begin
  insert into storage.objects (bucket_id, name) values ('employee-docs', k || '/w9/signed-1.pdf.enc'), ('employee-docs', k || '/w9/plano.pdf');
  insert into profile_documents (profile_id, kind, file_path) values (k, 'w9', k || '/w9/signed-1.pdf.enc') returning id into d;
  insert into fx (k, id) values ('k_w9', d);
  insert into w9_open_tokens (token_hash, document_id, action) values ('h-bueno', d, 'open');
  insert into w9_open_tokens (token_hash, document_id, action, expires_at) values ('h-vencido', d, 'open', now() - interval '1 second');
end $$;
select pg_temp.prueba('un W-9 .enc queda marcado como cifrado', 'true',
  (select encrypted::text from profile_documents where id = pg_temp.fid('k_w9')));
select pg_temp.prueba('abrir: Karina su W-9 y el Super Admin sí; quien gestiona documentos no', 'ok|ok|ERR:42501',
  (select case when pg_temp.valor('karina', format('select open_profile_document(%L)', pg_temp.fid('k_w9'))) like '%.enc' then 'ok' else 'no' end) || '|' ||
  (select case when pg_temp.valor('super', format('select open_profile_document(%L, ''download'')', pg_temp.fid('k_w9'))) like '%.enc' then 'ok' else 'no' end) || '|' ||
  pg_temp.valor('docs', format('select open_profile_document(%L)', pg_temp.fid('k_w9'))));
select pg_temp.prueba('historial: apertura de Karina y descarga del Super Admin (quién, cuándo, cuál)', '1|1',
  (select count(*)::text from change_log where action = 'documento_abierto' and actor_id = pg_temp.pid('karina') and entity_id = pg_temp.fid('k_w9')) || '|' ||
  (select count(*)::text from change_log where action = 'documento_descargado' and actor_id = pg_temp.pid('super') and entity_id = pg_temp.fid('k_w9')));
select pg_temp.prueba('acción no válida (22023)', 'ERR:22023',
  pg_temp.valor('karina', format('select open_profile_document(%L, ''borrar'')', pg_temp.fid('k_w9'))));
select pg_temp.prueba('enlace de un solo uso: la primera vez da la ruta, la segunda no; vencido no', 'ok|ERR:P0002|ERR:P0002',
  (select case when pg_temp.servicio('select consume_w9_open_token(''h-bueno'')') like '%.enc' then 'ok' else 'no' end) || '|' ||
  pg_temp.servicio('select consume_w9_open_token(''h-bueno'')') || '|' ||
  pg_temp.servicio('select consume_w9_open_token(''h-vencido'')'));
select pg_temp.prueba('la app no consume enlaces ni lee la tabla (42501)', 'ERR:42501|ERR:42501',
  pg_temp.valor('super', 'select consume_w9_open_token(''h-bueno'')') || '|' ||
  pg_temp.valor('super', 'select count(*) from w9_open_tokens'));
select pg_temp.prueba('nadie sube un W-9 directo a Storage desde la app (42501); el certificado sí', 'ERR:42501|ok',
  pg_temp.valor('docs', format('insert into storage.objects (bucket_id, name) values (''employee-docs'', %L) returning ''ok''', pg_temp.pid('karina') || '/w9/x.pdf')) || '|' ||
  pg_temp.valor('docs', format('insert into storage.objects (bucket_id, name) values (''employee-docs'', %L) returning ''ok''', pg_temp.pid('karina') || '/insurance_certificate/x.pdf')));
select pg_temp.prueba('registrar un W-9 sin cifrar no se puede (22023); cifrado sí', 'ERR:22023|true',
  pg_temp.valor('docs', format('select register_profile_document(%L, ''w9'', %L)', pg_temp.pid('karina'), pg_temp.pid('karina') || '/w9/plano.pdf')) || '|' ||
  (pg_temp.valor('docs', format('select register_profile_document(%L, ''w9'', %L)', pg_temp.pid('karina'), pg_temp.pid('karina') || '/w9/signed-1.pdf.enc')) is not null)::text);

-- Resultado ------------------------------------------------------------------------------------------

select prueba, ok, detalle from resultados order by n;
-- FIN-DE-PRUEBAS
rollback;
