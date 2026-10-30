-- Pruebas de "Mis documentos" del 1099 (migración 20261030000003, D-263, D-271).
-- Repetibles: todo ocurre dentro de una transacción que termina en rollback, no queda nada en la base.
-- Simulan roles con `set local role` y `request.jwt.claims`, como hace la API.
-- Uso: psql -f supabase/tests/mis_documentos.sql   (la última consulta lista cada prueba con ok = true/false).

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

-- Personas de prueba -------------------------------------------------------------------------------
do $$
declare
  quien text;
  pid uuid;
  aid uuid;
begin
  foreach quien in array array['docs', 'sin_permisos', 'karina', 'otro1099'] loop
    aid := gen_random_uuid();
    insert into profiles (full_name, worker_type, role, email, has_app_access)
    values ('Prueba ' || quien, case when quien in ('karina', 'otro1099') then '1099' else 'w2' end::worker_type,
            'employee', quien || '@prueba.local', true) returning id into pid;
    insert into auth.users (id, aud, role, email) values (aid, 'authenticated', 'authenticated', quien || '@prueba.local');
    insert into actores values (quien, aid, pid);
  end loop;
  aid := gen_random_uuid();
  insert into auth.users (id, aud, role, email) values (aid, 'authenticated', 'authenticated', 'super@prueba-md.local');
  update profiles set auth_user_id = aid where is_super_admin and auth_user_id is null;
  insert into actores select 'super', auth_user_id, id from profiles where is_super_admin;
  insert into profile_permissions (profile_id, permission_key)
    select profile_id, 'empleados_gestionar_documentos' from actores where nombre = 'docs';
end $$;

-- Documentos vigentes de Karina (W-9 firmado y certificado) y uno del otro 1099.
do $$
declare
  k uuid := (select profile_id from actores where nombre = 'karina');
  o uuid := (select profile_id from actores where nombre = 'otro1099');
  d uuid;
begin
  insert into storage.objects (bucket_id, name) values ('employee-docs', k || '/w9/a.pdf'), ('employee-docs', k || '/insurance_certificate/a.pdf'),
    ('employee-docs', o || '/insurance_certificate/a.pdf'), ('employee-docs', o || '/insurance_certificate/z.pdf');
  insert into profile_documents (profile_id, kind, file_path) values (k, 'w9', k || '/w9/a.pdf') returning id into d;
  insert into fx (k, id) values ('k_w9', d);
  insert into profile_documents (profile_id, kind, file_path) values (k, 'insurance_certificate', k || '/insurance_certificate/a.pdf') returning id into d;
  insert into fx (k, id) values ('k_cert', d);
  insert into profile_documents (profile_id, kind, file_path) values (o, 'insurance_certificate', o || '/insurance_certificate/a.pdf') returning id into d;
  insert into fx (k, id) values ('o_cert', d);
end $$;

create function pg_temp.pid(n text) returns uuid language sql as $$ select profile_id from actores where nombre = n $$;
create function pg_temp.fid(n text) returns uuid language sql as $$ select id from fx where k = n $$;
grant execute on all functions in schema pg_temp to public;

-- A. Listar -----------------------------------------------------------------------------------------
select pg_temp.prueba('listar: el 1099 ve solo sus 2 documentos', '2',
  pg_temp.valor('karina', 'select count(*)::text from profile_documents'));
select pg_temp.prueba('listar: quien no gestiona documentos no ve los de otro', '0',
  pg_temp.valor('sin_permisos', 'select count(*)::text from profile_documents'));
select pg_temp.prueba('listar: quien gestiona documentos sigue viendo todos', '3',
  pg_temp.valor('docs', 'select count(*)::text from profile_documents'));

-- B. Abrir ------------------------------------------------------------------------------------------
select pg_temp.prueba('abrir: el 1099 abre su W-9 y su certificado', 'ok|ok',
  (select case when pg_temp.valor('karina', format('select open_profile_document(%L)', pg_temp.fid('k_w9'))) like '%/w9/a.pdf' then 'ok' else 'no' end) || '|' ||
  (select case when pg_temp.valor('karina', format('select open_profile_document(%L)', pg_temp.fid('k_cert'))) like '%/insurance_certificate/a.pdf' then 'ok' else 'no' end));
select pg_temp.prueba('abrir: su W-9 no lo abre quien gestiona documentos (D-260), sí el Super Admin', 'ERR:42501|ok',
  pg_temp.valor('docs', format('select open_profile_document(%L)', pg_temp.fid('k_w9'))) || '|' ||
  (select case when pg_temp.valor('super', format('select open_profile_document(%L)', pg_temp.fid('k_w9'))) like '%/w9/a.pdf' then 'ok' else 'no' end));
select pg_temp.prueba('abrir: quien gestiona documentos abre el certificado', 'ok',
  (select case when pg_temp.valor('docs', format('select open_profile_document(%L)', pg_temp.fid('k_cert'))) like '%.pdf' then 'ok' else 'no' end));
select pg_temp.prueba('abrir: otro 1099 o alguien sin permiso no abre lo de Karina', 'ERR:42501|ERR:42501|ERR:42501',
  pg_temp.valor('otro1099', format('select open_profile_document(%L)', pg_temp.fid('k_cert'))) || '|' ||
  pg_temp.valor('otro1099', format('select open_profile_document(%L)', pg_temp.fid('k_w9'))) || '|' ||
  pg_temp.valor('sin_permisos', format('select open_profile_document(%L)', pg_temp.fid('k_w9'))));
select pg_temp.prueba('abrir: cada apertura del dueño queda en el historial', '2',
  (select count(*)::text from change_log where action = 'documento_abierto' and actor_id = pg_temp.pid('karina')));

-- C. Subir su certificado -----------------------------------------------------------------------------
select pg_temp.prueba('subir: el 1099 sube a su carpeta del certificado', 'ok',
  pg_temp.valor('karina', format('insert into storage.objects (bucket_id, name) values (''employee-docs'', %L) returning ''ok''',
    pg_temp.pid('karina') || '/insurance_certificate/b.pdf')));
select pg_temp.prueba('subir: no a su carpeta del W-9 ni a la de otro', 'ERR:42501|ERR:42501',
  pg_temp.valor('karina', format('insert into storage.objects (bucket_id, name) values (''employee-docs'', %L) returning ''ok''',
    pg_temp.pid('karina') || '/w9/b.pdf')) || '|' ||
  pg_temp.valor('karina', format('insert into storage.objects (bucket_id, name) values (''employee-docs'', %L) returning ''ok''',
    pg_temp.pid('otro1099') || '/insurance_certificate/b.pdf')));
select pg_temp.prueba('subir: sin permiso no sube a la carpeta de otro', 'ERR:42501',
  pg_temp.valor('sin_permisos', format('insert into storage.objects (bucket_id, name) values (''employee-docs'', %L) returning ''ok''',
    pg_temp.pid('karina') || '/insurance_certificate/c.pdf')));
select pg_temp.prueba('registrar: el 1099 registra su certificado nuevo', 'true',
  (pg_temp.valor('karina', format('select register_profile_document(%L, ''insurance_certificate'', %L)',
    pg_temp.pid('karina'), pg_temp.pid('karina') || '/insurance_certificate/b.pdf')) ~ '^[0-9a-f-]{36}$')::text);
select pg_temp.prueba('registrar: el anterior queda reemplazado y hay un solo vigente', 'true|1',
  (select (replaced_at is not null)::text from profile_documents where id = pg_temp.fid('k_cert')) || '|' ||
  (select count(*)::text from profile_documents where profile_id = pg_temp.pid('karina') and kind = 'insurance_certificate' and replaced_at is null));
select pg_temp.prueba('registrar: queda en el historial como reemplazo hecho por él', '1',
  (select count(*)::text from change_log where action = 'documento_reemplazado' and actor_id = pg_temp.pid('karina')
     and detail->>'reemplaza' = pg_temp.fid('k_cert')::text));
select pg_temp.prueba('registrar: no su W-9 ni el certificado de otro', 'ERR:42501|ERR:42501',
  pg_temp.valor('karina', format('select register_profile_document(%L, ''w9'', %L)', pg_temp.pid('karina'), pg_temp.pid('karina') || '/w9/a.pdf')) || '|' ||
  pg_temp.valor('karina', format('select register_profile_document(%L, ''insurance_certificate'', %L)',
    pg_temp.pid('otro1099'), pg_temp.pid('otro1099') || '/insurance_certificate/a.pdf')));
select pg_temp.prueba('registrar: quien gestiona documentos sigue registrando', 'true',
  (pg_temp.valor('docs', format('select register_profile_document(%L, ''insurance_certificate'', %L)',
    pg_temp.pid('otro1099'), pg_temp.pid('otro1099') || '/insurance_certificate/z.pdf')) ~ '^[0-9a-f-]{36}$')::text);

-- Resultado ------------------------------------------------------------------------------------------

select prueba, ok, detalle from resultados order by n;
-- FIN-DE-PRUEBAS
rollback;
