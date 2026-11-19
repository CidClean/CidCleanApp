-- Pruebas de la orden 152 (migración 20261121000003, D-340 (3)): "Editar mi perfil" con nombre, apellido y teléfono.
-- Todas las llamadas como `authenticated` (set local role + request.jwt.claims con aal2), no como dueño de la base.
-- Repetibles: terminan en rollback.
-- Uso: psql -f supabase/tests/mi_perfil.sql   (la última consulta lista cada prueba con ok = true/false).

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

do $$
declare
  quien text;
  pid uuid;
  aid uuid;
  cli uuid;
begin
  foreach quien in array array['ana', 'beto'] loop
    aid := gen_random_uuid();
    insert into profiles (full_name, first_name, last_name, worker_type, role, email, has_app_access, phone)
    values ('Prueba ' || quien, 'Prueba', quien, 'w2', 'employee', quien || '@prueba-mp.local', true, '(239) 555-0100') returning id into pid;
    insert into auth.users (id, aud, role, email) values (aid, 'authenticated', 'authenticated', quien || '@prueba-mp.local');
    update profiles set auth_user_id = aid where id = pid;
    insert into actores values (quien, aid, pid);
  end loop;
  select id, auth_user_id into pid, aid from profiles where is_super_admin;
  if aid is null then
    aid := gen_random_uuid();
    insert into auth.users (id, aud, role, email) values (aid, 'authenticated', 'authenticated', 'super@prueba-mp.local');
    update profiles set auth_user_id = aid where id = pid;
  end if;
  insert into actores values ('super', aid, pid);
  insert into clients (name, legacy, email) values ('Cliente MP', true, 'cliente@prueba-mp.local') returning id into cli;
  insert into ids values ('cli', cli);
end $$;

select pg_temp.prueba('update_my_profile: cambia nombre, apellido y teléfono propios (sin error)', '',
  pg_temp.valor('ana', $q$select update_my_profile(' Ana María ', 'Pérez', '1-786-250-1324')::text$q$));
select pg_temp.prueba('update_my_profile: nombre completo y teléfono normalizado', 'Ana María Pérez|Ana María|Pérez|(786) 250-1324|ana@prueba-mp.local',
  (select concat_ws('|', full_name, first_name, last_name, phone, email) from profiles where id = (select profile_id from actores where nombre = 'ana')));
select pg_temp.prueba('update_my_profile: no toca a otro usuario', 'Prueba beto|(239) 555-0100',
  (select full_name || '|' || phone from profiles where id = (select profile_id from actores where nombre = 'beto')));
select pg_temp.prueba('update_my_profile: queda en el historial', '1',
  (select count(*)::text from change_log where entity = 'profiles' and entity_id = (select profile_id from actores where nombre = 'ana')
     and action = 'perfil_cambiado'));
select pg_temp.prueba('editar a otro directo en la tabla no devuelve filas o se rechaza', 'true',
  (select (r is null or r like 'ERR:%')::text from (select pg_temp.valor('ana', format(
     $q$update profiles set first_name = 'Hack', last_name = 'Eado' where id = %L returning full_name$q$,
     (select profile_id from actores where nombre = 'beto'))) r) x));
select pg_temp.prueba('tras el intento directo, el otro sigue igual', 'Prueba beto',
  (select full_name from profiles where id = (select profile_id from actores where nombre = 'beto')));
select pg_temp.prueba('update_my_profile: teléfono vacío lo quita', '',
  pg_temp.valor('beto', $q$select update_my_profile('Beto', 'Ruiz', '')::text$q$));
select pg_temp.prueba('update_my_profile: teléfono vacío queda null', 'null',
  (select coalesce(phone, 'null') from profiles where id = (select profile_id from actores where nombre = 'beto')));
select pg_temp.prueba('update_my_profile: teléfono inválido (código de área con 1)', 'ERR:22023',
  pg_temp.valor('ana', $q$select update_my_profile('Ana', 'Pérez', '(123) 456-7890')::text$q$));
select pg_temp.prueba('update_my_profile: teléfono de 9 dígitos', 'ERR:22023',
  pg_temp.valor('ana', $q$select update_my_profile('Ana', 'Pérez', '239555014')::text$q$));
select pg_temp.prueba('update_my_profile: sin apellido', 'ERR:22023',
  pg_temp.valor('ana', $q$select update_my_profile('Ana', '  ', '')::text$q$));
select pg_temp.prueba('update_my_profile: anon no puede', 'ERR:42501',
  pg_temp.valor('anon', $q$select update_my_profile('X', 'Y', '')::text$q$));
select pg_temp.prueba('update_my_profile: el Super Admin cambia el suyo (aal2)', '',
  pg_temp.valor('super', $q$select update_my_profile('Humberto', 'Villiva', '7862501324')::text$q$));
select pg_temp.prueba('firma de las plantillas (D-330) con el nombre y teléfono nuevos', 'Humberto Villiva|(786) 250-1324',
  pg_temp.valor('super', format($q$select (c->'sender'->>'name') || '|' || (c->'sender'->>'phone') from template_email_context('client', %L) c$q$, pg_temp.id('cli'))));

select n, prueba, ok, detalle from resultados order by n;

rollback;
