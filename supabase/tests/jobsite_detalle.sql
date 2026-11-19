-- Pruebas de las órdenes 150 y 151 (migraciones 20261121000001 y 20261121000002, D-339, D-340): documentos e historial
-- del jobsite, y reactivar un jobsite terminado. Todas las llamadas como `authenticated` (set local role +
-- request.jwt.claims con aal2), no como dueño de la base. Repetibles: terminan en rollback.
-- Uso: psql -f supabase/tests/jobsite_detalle.sql   (la última consulta lista cada prueba con ok = true/false).

begin;

create temp table resultados (n int generated always as identity, prueba text, ok boolean, detalle text);
create temp table actores (nombre text primary key, auth_id uuid, profile_id uuid);
create temp table ids (nombre text primary key, id uuid);
grant all on resultados, actores, ids to public;

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
    perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated', 'aal', 'aal2')::text, true);
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

create function pg_temp.prueba(nombre text, esperado text, obtenido text) returns void language sql as $$
  insert into resultados (prueba, ok, detalle) values (nombre, esperado is not distinct from obtenido,
    'esperado=' || coalesce(esperado, 'null') || ' obtenido=' || coalesce(obtenido, 'null'));
$$;

create function pg_temp.id(n text) returns uuid language sql as $$ select id from ids where nombre = n $$;

-- cuentas: clientes_ver. tarifa: clientes_ver + clientes_ver_tarifa. historial: clientes_ver + historial_ver.
-- estado: clientes_ver + clientes_ver_tarifa + clientes_cambiar_estado. pagos: lo de estado + empleados_ver_pagos.
-- sin: ningún permiso. super: Super Admin (aal2).
do $$
declare
  quien text;
  pid uuid;
  aid uuid;
begin
  foreach quien in array array['cuentas', 'tarifa', 'historial', 'estado', 'pagos', 'sin'] loop
    aid := gen_random_uuid();
    insert into profiles (full_name, worker_type, role, email, has_app_access)
    values ('Prueba ' || quien, 'w2', 'employee', quien || '@prueba-jd.local', true) returning id into pid;
    insert into auth.users (id, aud, role, email) values (aid, 'authenticated', 'authenticated', quien || '@prueba-jd.local');
    update profiles set auth_user_id = aid where id = pid;
    insert into actores values (quien, aid, pid);
  end loop;
  -- El Super Admin es el que ya existe (hay uno solo).
  select id, auth_user_id into pid, aid from profiles where is_super_admin;
  if aid is null then
    aid := gen_random_uuid();
    insert into auth.users (id, aud, role, email) values (aid, 'authenticated', 'authenticated', 'super@prueba-jd.local');
    update profiles set auth_user_id = aid where id = pid;
  end if;
  insert into actores values ('super', aid, pid);
  insert into profile_permissions (profile_id, permission_key)
  select a.profile_id, p.k from actores a
    join (values ('cuentas', 'clientes_ver'),
                 ('tarifa', 'clientes_ver'), ('tarifa', 'clientes_ver_tarifa'),
                 ('historial', 'clientes_ver'), ('historial', 'historial_ver'),
                 ('estado', 'clientes_ver'), ('estado', 'clientes_ver_tarifa'), ('estado', 'clientes_cambiar_estado'),
                 ('pagos', 'clientes_ver'), ('pagos', 'clientes_ver_tarifa'), ('pagos', 'clientes_cambiar_estado'),
                 ('pagos', 'empleados_ver_pagos')) as p(n, k) on p.n = a.nombre;
end $$;

do $$
declare
  cli uuid;
  ja uuid;
  jb uuid;
begin
  insert into clients (name, legacy) values ('Cliente Prueba JD', true) returning id into cli;
  insert into jobsites (client_id, name, address, start_date) values (cli, 'Sede A JD', '1 Main St', '2026-09-17') returning id into ja;
  insert into jobsites (client_id, name, address, start_date) values (cli, 'Sede B JD', '2 Main St', '2026-09-17') returning id into jb;
  insert into jobsite_documents (jobsite_id, kind, file_path, title) values (ja, 'contract', 'x/contrato.pdf', 'Contract');
  insert into jobsite_documents (jobsite_id, kind, file_path, title) values (ja, 'other', 'x/otro.pdf', 'Permiso');
  insert into jobsite_documents (jobsite_id, kind, file_path, title, replaced_at) values (ja, 'other', 'x/viejo.pdf', 'Viejo', now());
  insert into jobsite_documents (jobsite_id, kind, file_path, title) values (jb, 'other', 'x/b.pdf', 'De otra sede');
  insert into change_log (actor_id, action, entity, entity_id, detail) values
    (null, 'jobsite_estado_cambiado', 'jobsites', ja, '{"name":"Sede A JD","antes":"active","despues":"paused"}'),
    (null, 'tarifa_abierta', 'jobsites', ja, '{"name":"Sede A JD"}'),
    (null, 'tarifa_cambiada', 'jobsites', ja, '{"name":"Sede A JD","antes":100,"despues":200}'),
    (null, 'jobsite_estado_cambiado', 'jobsites', jb, '{"name":"Sede B JD","antes":"active","despues":"paused"}'),
    (null, 'correo_plantilla', 'clients', cli, '{"plantilla":"Hola"}');
  insert into ids values ('cli', cli), ('ja', ja), ('jb', jb);
end $$;

-- (1) Documents del jobsite
select pg_temp.prueba('jobsite_library: con clientes_ver ve los documentos vigentes sin el contrato', 'Permiso v1',
  pg_temp.valor('cuentas', format('select string_agg(title, '','' order by title) from jobsite_library(%L)', pg_temp.id('ja'))));
select pg_temp.prueba('jobsite_library: con ver tarifa también el contrato', 'Contract v1,Permiso v1',
  pg_temp.valor('tarifa', format('select string_agg(title, '','' order by title) from jobsite_library(%L)', pg_temp.id('ja'))));
select pg_temp.prueba('jobsite_library: no mezcla documentos de otra sede', '0',
  pg_temp.valor('super', format('select count(*) from jobsite_library(%L) where title like ''De otra%%''', pg_temp.id('ja'))));
select pg_temp.prueba('jobsite_library: sin permiso no puede', 'ERR:42501',
  pg_temp.valor('sin', format('select count(*) from jobsite_library(%L)', pg_temp.id('ja'))));
select pg_temp.prueba('jobsite_library: anon no puede', 'ERR:42501',
  pg_temp.valor('anon', format('select count(*) from jobsite_library(%L)', pg_temp.id('ja'))));
select pg_temp.prueba('jobsite_library: jobsite que no existe', 'ERR:P0002',
  pg_temp.valor('cuentas', format('select count(*) from jobsite_library(%L)', gen_random_uuid())));

-- (2) History del jobsite
select pg_temp.prueba('jobsite_history: con historial ve cambios y correos, sin aperturas ni otra sede', 'correo_plantilla,jobsite_estado_cambiado,tarifa_cambiada',
  pg_temp.valor('historial', format('select string_agg(action, '','' order by action) from jobsite_history(%L)', pg_temp.id('ja'))));
select pg_temp.prueba('jobsite_history: sin historial_ver solo los correos', 'correo_plantilla',
  pg_temp.valor('cuentas', format('select string_agg(action, '','' order by action) from jobsite_history(%L)', pg_temp.id('ja'))));
select pg_temp.prueba('jobsite_history: sin montos en el detalle', '0',
  pg_temp.valor('historial', format('select count(*) from jobsite_history(%L) where info::text like ''%%200%%''', pg_temp.id('ja'))));
select pg_temp.prueba('jobsite_history: el estado nuevo va en el detalle', 'paused',
  pg_temp.valor('historial', format('select info->>''despues'' from jobsite_history(%L) where action = ''jobsite_estado_cambiado''', pg_temp.id('ja'))));
select pg_temp.prueba('jobsite_history: sin permiso no puede', 'ERR:42501',
  pg_temp.valor('sin', format('select count(*) from jobsite_history(%L)', pg_temp.id('ja'))));
select pg_temp.prueba('jobsite_history: anon no puede', 'ERR:42501',
  pg_temp.valor('anon', format('select count(*) from jobsite_history(%L)', pg_temp.id('ja'))));

-- @@ORDEN151@@

select n, prueba, ok, detalle from resultados order by n;

rollback;
