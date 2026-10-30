-- Pruebas de los datos del empleado (migración 20261030000004, D-264, D-267).
-- Repetibles: todo ocurre dentro de una transacción que termina en rollback, no queda nada en la base.
-- Simulan roles con `set local role` y `request.jwt.claims`, como hace la API.
-- Uso: psql -f supabase/tests/datos_empleado.sql   (la última consulta lista cada prueba con ok = true/false).

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
grant execute on all functions in schema pg_temp to public;

do $$
declare
  quien text;
  pid uuid;
  aid uuid;
begin
  foreach quien in array array['crear', 'editar', 'ver'] loop
    aid := gen_random_uuid();
    insert into profiles (full_name, worker_type, role, email, has_app_access)
    values ('Prueba ' || quien, 'w2', 'employee', quien || '@prueba-de.local', true) returning id into pid;
    insert into auth.users (id, aud, role, email) values (aid, 'authenticated', 'authenticated', quien || '@prueba-de.local');
    insert into actores values (quien, aid, pid);
  end loop;
  insert into profile_permissions (profile_id, permission_key) select profile_id, 'empleados_invitar_crear' from actores where nombre = 'crear';
  insert into profile_permissions (profile_id, permission_key) select profile_id, 'empleados_editar_desactivar' from actores where nombre = 'editar';
  insert into profiles (full_name, worker_type, role, has_app_access) values ('Karina Lopez Vieja', '1099', 'employee', false) returning id into pid;
  insert into fx (k, id) values ('vieja', pid);
end $$;

create function pg_temp.fid(n text) returns uuid language sql as $$ select id from fx where k = n $$;
grant execute on function pg_temp.fid(text) to public;

-- A. Perfiles que ya existían ----------------------------------------------------------------------
select pg_temp.prueba('existentes: quedan sin Nombre ni Apellidos y conservan full_name (D-267 (2))', 'null|null|Karina Lopez Vieja',
  (select coalesce(first_name, 'null') || '|' || coalesce(last_name, 'null') || '|' || full_name from profiles where id = pg_temp.fid('vieja')));

-- B. Crear ------------------------------------------------------------------------------------------
select pg_temp.prueba('crear: con todos los campos, ok', 'ok',
  case when pg_temp.valor('crear', $q$ select create_employee(' Ana ', ' Ruiz Díaz ', '(239) 555-0142', '1099', 'employee', 'es', true,
    'ana@prueba-de.local', ' 1520 Golden Gate Pkwy ', ' Apt 4 ', 'fl', ' Naples ', '34105') $q$) like 'ERR%' then 'fallo' else 'ok' end);
select pg_temp.prueba('crear: full_name = Nombre + Apellidos y cada campo limpio', 'Ana Ruiz Díaz|Ana|Ruiz Díaz|1520 Golden Gate Pkwy|Apt 4|FL|Naples|34105',
  (select concat_ws('|', full_name, first_name, last_name, address_line1, address_line2, state, city, zip) from profiles where email = 'ana@prueba-de.local'));
select pg_temp.prueba('crear: sin Nombre o sin Apellidos (22023)', 'ERR:22023|ERR:22023',
  pg_temp.valor('crear', $q$ select create_employee(' ', 'Ruiz', null, 'w2', 'employee', 'en', false, null) $q$) || '|' ||
  pg_temp.valor('crear', $q$ select create_employee('Ana', null, null, 'w2', 'employee', 'en', false, null) $q$));
select pg_temp.prueba('crear: con acceso sigue pidiendo el correo (22023)', 'ERR:22023',
  pg_temp.valor('crear', $q$ select create_employee('Ana', 'Ruiz', null, 'w2', 'employee', 'en', true, null) $q$));
select pg_temp.prueba('crear: State fuera de la lista o ZIP mal escrito (22023)', 'ERR:22023|ERR:22023|ERR:22023',
  pg_temp.valor('crear', $q$ select create_employee('Ana', 'Ruiz', null, 'w2', 'employee', 'en', false, null, null, null, 'XX') $q$) || '|' ||
  pg_temp.valor('crear', $q$ select create_employee('Ana', 'Ruiz', null, 'w2', 'employee', 'en', false, null, null, null, null, null, '3410') $q$) || '|' ||
  pg_temp.valor('crear', $q$ select create_employee('Ana', 'Ruiz', null, 'w2', 'employee', 'en', false, null, null, null, null, null, '34105-12') $q$));
insert into fx (k, txt) values ('luis', pg_temp.valor('crear', $q$ select create_employee('Luis', 'Paz', null, 'w2', 'employee', 'en', false, null, null, null, 'dc', null, '20001-1234') $q$));
select pg_temp.prueba('crear: ZIP 5+4 y DC valen; la dirección es opcional', 'DC|20001-1234|null',
  (select concat_ws('|', state, zip, coalesce(address_line1, 'null')) from profiles where full_name = 'Luis Paz'));
select pg_temp.prueba('crear: sin permiso (42501)', 'ERR:42501',
  pg_temp.valor('ver', $q$ select create_employee('Ana', 'Ruiz', null, 'w2', 'employee', 'en', false, null) $q$));

-- C. Editar -----------------------------------------------------------------------------------------
insert into fx (k, txt) values ('ed1', pg_temp.valor('editar', format('select update_employee(%L, ''Karina'', ''López'', null, ''1099'', ''es'', ''3727 Milano Lakes Cir'', '''', ''FL'', ''Naples'', ''34114'')', pg_temp.fid('vieja'))));
select pg_temp.prueba('editar: llenar Nombre y Apellidos del perfil viejo arma full_name', 'Karina López|Karina|López|FL|34114',
  (select concat_ws('|', full_name, first_name, last_name, state, zip) from profiles where id = pg_temp.fid('vieja')));
select pg_temp.prueba('editar: Dirección 2 vacía queda null', 'null',
  (select coalesce(address_line2, 'null') from profiles where id = pg_temp.fid('vieja')));
select pg_temp.prueba('editar: queda en el historial con los campos nuevos', 'null|Karina|3727 Milano Lakes Cir',
  (select coalesce(detail->'antes'->>'first_name', 'null') || '|' || (detail->'despues'->>'first_name') || '|' || (detail->'despues'->>'address_line1')
     from change_log where action = 'perfil_cambiado' and entity_id = pg_temp.fid('vieja') order by id desc limit 1));
select pg_temp.prueba('editar: sin Apellidos, ZIP mal o sin permiso', 'ERR:22023|ERR:22023|ERR:42501',
  pg_temp.valor('editar', format('select update_employee(%L, ''Karina'', '' '', null, ''1099'', ''es'')', pg_temp.fid('vieja'))) || '|' ||
  pg_temp.valor('editar', format('select update_employee(%L, ''Karina'', ''López'', null, ''1099'', ''es'', null, null, null, null, ''ABCDE'')', pg_temp.fid('vieja'))) || '|' ||
  pg_temp.valor('ver', format('select update_employee(%L, ''Karina'', ''López'', null, ''1099'', ''es'')', pg_temp.fid('vieja'))));
insert into fx (k, txt) values ('ed2', pg_temp.valor('editar', format('select update_employee(%L, ''Otro Nombre'', null, ''1099'', ''es'')', pg_temp.fid('vieja'))));
select pg_temp.prueba('editar (versión anterior de la app): con Nombre y Apellidos llenos, full_name sigue saliendo de ellos', 'Karina López',
  (select full_name from profiles where id = pg_temp.fid('vieja')));

-- Resultado ------------------------------------------------------------------------------------------

select prueba, ok, detalle from resultados order by n;
-- FIN-DE-PRUEBAS
rollback;
