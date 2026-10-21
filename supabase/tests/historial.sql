-- Pruebas del historial y de transferir el rol de Super Admin (migración 20261021000010, D-088, D-090, D-116, D-198, D-199).
-- Repetibles: todo ocurre dentro de una transacción que termina en rollback, no queda nada en la base.
-- Simulan roles con `set local role` y `request.jwt.claims`, como hace la API.
-- Uso: psql -f supabase/tests/historial.sql   (la última consulta lista cada prueba con ok = true/false).

begin;

create temp table resultados (n int generated always as identity, prueba text, ok boolean, detalle text);
create temp table actores (nombre text primary key, auth_id uuid, profile_id uuid);
grant all on resultados, actores to public;

-- Ejecuta una consulta como una persona autenticada (o anon) y devuelve el primer valor como texto,
-- o 'ERR:' y el código de error si falla.
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

create function pg_temp.prueba(nombre text, esperado text, obtenido text) returns void language sql as $$
  insert into resultados (prueba, ok, detalle) values (nombre, esperado is not distinct from obtenido,
    'esperado=' || coalesce(esperado, 'null') || ' obtenido=' || coalesce(obtenido, 'null'));
$$;

-- Personas de prueba -------------------------------------------------------------------------------
do $$
declare
  quien text;
  pid uuid;
  aid uuid;
begin
  foreach quien in array array['hist', 'sin_permisos', 'candidato', 'inactivo', 'sin_entrar'] loop
    aid := gen_random_uuid();
    insert into profiles (full_name, worker_type, role, email, has_app_access)
    values ('Prueba ' || quien, 'w2', 'employee', quien || '@prueba.local', true) returning id into pid;
    insert into auth.users (id, aud, role, email) values (aid, 'authenticated', 'authenticated', quien || '@prueba.local');
    insert into actores values (quien, aid, pid);
  end loop;
  update auth.users set last_sign_in_at = now() where email in ('hist@prueba.local', 'candidato@prueba.local', 'inactivo@prueba.local', 'sin_permisos@prueba.local');
  update profiles set active = false where email = 'inactivo@prueba.local';
  insert into profiles (full_name, worker_type, role, has_app_access) values ('Prueba sin acceso', 'w2', 'employee', false) returning id into pid;
  insert into actores values ('sin_acceso', null, pid);
  insert into profile_permissions (profile_id, permission_key) select profile_id, 'historial_ver' from actores where nombre = 'hist';
  insert into actores select 'super', auth_user_id, id from profiles where is_super_admin;
end $$;

-- A. Historial -----------------------------------------------------------------------------------------

do $$
declare
  obj uuid := (select profile_id from actores where nombre = 'candidato');
  sa uuid := (select profile_id from actores where nombre = 'super');
  doc uuid := gen_random_uuid();
  ultimo bigint;
begin
  -- Filas de ejemplo (dentro de la transacción).
  insert into change_log (actor_id, action, entity, entity_id, detail) values
    (sa, 'documento_abierto', 'profile_documents', doc, jsonb_build_object('profile_id', obj, 'kind', 'w9')),
    (sa, 'terminos_publicados', 'terms_documents', gen_random_uuid(), jsonb_build_object('kind', 'staff', 'version', 2, 'file_path', 'staff/secreto.pdf')),
    (obj, 'terminos_aceptados', 'terms_documents', gen_random_uuid(), jsonb_build_object('kind', 'staff', 'version', 2)),
    (sa, 'lead_creado', 'leads', gen_random_uuid(), jsonb_build_object('company', 'Oficinas Naples', 'monto', 1234)),
    (sa, 'motivo_creado', 'lost_reasons', gen_random_uuid(), jsonb_build_object('label_es', 'Precio', 'label_en', 'Price')),
    (sa, 'sitio_eliminado', 'lead_sites', gen_random_uuid(), jsonb_build_object('company', 'Oficinas Naples', 'name', 'Sede norte', 'address', 'Calle 1')),
    (sa, 'accion_rara', 'tabla_que_no_existe', gen_random_uuid(), jsonb_build_object('tarifa', 99, 'file_path', 'x/y.pdf'));
  select max(id) into ultimo from change_log;

  perform pg_temp.prueba('anon no lee el historial (42501)', 'ERR:42501', pg_temp.valor('anon', 'select count(*) from list_change_log(null, 30)'));
  perform pg_temp.prueba('sin historial_ver no lo lee (42501)', 'ERR:42501', pg_temp.valor('sin_permisos', 'select count(*) from list_change_log(null, 30)'));
  perform pg_temp.prueba('con historial_ver lo lee', '30', pg_temp.valor('hist', 'select count(*) from list_change_log(null, 30)'));
  perform pg_temp.prueba('el Super Admin lo lee siempre', '5', pg_temp.valor('super', 'select count(*) from list_change_log(null, 5)'));
  perform pg_temp.prueba('la más reciente arriba', ultimo::text, pg_temp.valor('hist', 'select id from list_change_log(null, 1)'));
  perform pg_temp.prueba('por páginas: la siguiente empieza antes de la última mostrada', (ultimo - 1)::text,
    pg_temp.valor('hist', format('select max(id) from list_change_log(%s, 10)', ultimo)));
  perform pg_temp.prueba('el tamaño de página tiene tope de 100', 'ok',
    case when pg_temp.valor('hist', 'select count(*) from list_change_log(null, 1000)')::int <= 100 then 'ok' else 'pasó' end);
  perform pg_temp.prueba('documento abierto: a quién (el empleado) y por quién', 'Prueba candidato|' || (select full_name from profiles where id = sa) || '|w9',
    pg_temp.valor('hist', format('select subject || ''|'' || actor || ''|'' || (info->>''kind'') from list_change_log(null, 100) where action = ''documento_abierto'' and id > %s', ultimo - 8)));
  perform pg_temp.prueba('términos publicados: tipo y versión, sin la ruta del archivo', 'staff|2|false',
    pg_temp.valor('hist', format('select subject || ''|'' || (info->>''version'') || ''|'' || (info ? ''file_path'')::text from list_change_log(null, 100) where action = ''terminos_publicados'' and id > %s', ultimo - 8)));
  perform pg_temp.prueba('lead (fila ya borrada): la empresa sale del detalle y el monto no', 'Oficinas Naples|{}',
    pg_temp.valor('hist', format('select subject || ''|'' || info::text from list_change_log(null, 100) where action = ''lead_creado'' and id > %s', ultimo - 8)));
  perform pg_temp.prueba('motivo: sin sujeto y con sus etiquetas en los dos idiomas', 'null|Precio|Price',
    pg_temp.valor('hist', format('select coalesce(subject, ''null'') || ''|'' || (info->>''label_es'') || ''|'' || (info->>''label_en'') from list_change_log(null, 100) where action = ''motivo_creado'' and id > %s', ultimo - 8)));
  perform pg_temp.prueba('sitio eliminado: por su nombre y sin la dirección', 'Sede norte|false',
    pg_temp.valor('hist', format('select subject || ''|'' || (info::text like ''%%Calle%%'')::text from list_change_log(null, 100) where action = ''sitio_eliminado'' and id > %s', ultimo - 8)));
  perform pg_temp.prueba('acción desconocida: no falla, sin sujeto y sin datos sensibles', 'null|{}',
    pg_temp.valor('hist', format('select coalesce(subject, ''null'') || ''|'' || info::text from list_change_log(null, 100) where action = ''accion_rara'' and id > %s', ultimo - 8)));
  perform pg_temp.prueba('ningún detalle devuelve rutas de archivos ni montos', '0',
    pg_temp.valor('hist', 'select count(*) from list_change_log(null, 100) where info ?| array[''file_path'', ''monto'', ''tarifa'', ''amount'', ''rate'', ''body'']'));
  perform pg_temp.prueba('las funciones internas no se pueden llamar desde la API (42501)', 'ERR:42501',
    pg_temp.valor('hist', 'select change_log_subject(''profiles'', null, ''{}'')'));
  perform pg_temp.prueba('el historial sigue sin poder cambiarse', 'ERR:42501',
    pg_temp.valor('super', 'with d as (delete from change_log returning 1) select count(*) from d'));
end $$;

-- B. Transferir el rol de Super Admin --------------------------------------------------------------------

do $$
declare
  sa uuid := (select profile_id from actores where nombre = 'super');
  cand uuid := (select profile_id from actores where nombre = 'candidato');
  antes bigint;
begin
  perform pg_temp.prueba('candidatos: solo el Super Admin los ve (42501)', 'ERR:42501', pg_temp.valor('hist', 'select count(*) from super_admin_candidates()'));
  perform pg_temp.prueba('candidatos: activos, con acceso y que ya entraron, sin uno mismo',
    'Prueba candidato,Prueba hist,Prueba sin_permisos',
    pg_temp.valor('super', 'select string_agg(full_name, '','' order by full_name) from super_admin_candidates() where full_name like ''Prueba%'''));
  perform pg_temp.prueba('candidatos: el Super Admin no está', '0',
    pg_temp.valor('super', format('select count(*) from super_admin_candidates() where id = %L', sa)));

  perform pg_temp.prueba('anon no transfiere (42501)', 'ERR:42501', pg_temp.valor('anon', format('select transfer_super_admin(%L)', cand)));
  perform pg_temp.prueba('quien no es Super Admin no transfiere, aunque tenga permisos (42501)', 'ERR:42501',
    pg_temp.valor('hist', format('select transfer_super_admin(%L)', cand)));
  perform pg_temp.prueba('no a sí mismo (22023)', 'ERR:22023', pg_temp.valor('super', format('select transfer_super_admin(%L)', sa)));
  perform pg_temp.prueba('no a un inactivo (22023)', 'ERR:22023',
    pg_temp.valor('super', format('select transfer_super_admin(%L)', (select profile_id from actores where nombre = 'inactivo'))));
  perform pg_temp.prueba('no a quien no tiene acceso a la app (22023)', 'ERR:22023',
    pg_temp.valor('super', format('select transfer_super_admin(%L)', (select profile_id from actores where nombre = 'sin_acceso'))));
  perform pg_temp.prueba('no a quien nunca entró (22023)', 'ERR:22023',
    pg_temp.valor('super', format('select transfer_super_admin(%L)', (select profile_id from actores where nombre = 'sin_entrar'))));
  perform pg_temp.prueba('a un perfil que no existe (P0002)', 'ERR:P0002',
    pg_temp.valor('super', format('select transfer_super_admin(%L)', gen_random_uuid())));

  -- D-206: sin tipo de trabajador, transferir exige elegirlo (el Super Admin real no lo tiene).
  update profiles set worker_type = null where id = sa; -- solo dentro de esta transacción
  perform pg_temp.prueba('quien transfiere sin tipo y sin elegirlo: rechazado (23514)', 'ERR:23514',
    pg_temp.valor('super', format('select transfer_super_admin(%L)', cand)));
  perform pg_temp.prueba('pasar un tipo que no existe: rechazado (22P02)', 'ERR:22P02',
    pg_temp.valor('super', format('select transfer_super_admin(%L, ''contratista'')', cand)));
  perform pg_temp.prueba('atomicidad: tras los rechazos nada cambió', 'true|false|0|0',
    (select (select is_super_admin from profiles where id = sa)::text || '|' || (select is_super_admin from profiles where id = cand)::text
       || '|' || (select count(*) from profile_permissions where profile_id = sa)::text
       || '|' || (select count(*) from change_log where action = 'super_admin_transferido')::text));

  select max(id) into antes from change_log;
  perform pg_temp.prueba('el Super Admin sin tipo transfiere eligiendo 1099 (D-206)', 'ok',
    case when pg_temp.valor('super', format('select transfer_super_admin(%L, ''1099'')', cand)) like 'ERR%' then 'fallo' else 'ok' end);
  perform pg_temp.prueba('el tipo elegido quedó guardado en la misma transacción', '1099', (select worker_type::text from profiles where id = sa));
  perform pg_temp.prueba('el nuevo es Super Admin', 'true', (select is_super_admin::text from profiles where id = cand));
  perform pg_temp.prueba('el anterior ya no es Super Admin y su rol es Admin', 'false|admin', (select is_super_admin::text || '|' || role from profiles where id = sa));
  perform pg_temp.prueba('el anterior queda con los 36 permisos delegables', '36', (select count(*)::text from profile_permissions where profile_id = sa));
  perform pg_temp.prueba('incluido Gestionar permisos', '1',
    (select count(*)::text from profile_permissions where profile_id = sa and permission_key = 'empleados_gestionar_permisos'));
  perform pg_temp.prueba('sigue habiendo un solo Super Admin', '1', (select count(*)::text from profiles where is_super_admin));
  perform pg_temp.prueba('queda en el historial con quién y a quién', '1',
    (select count(*)::text from change_log where id > antes and action = 'super_admin_transferido' and actor_id = sa and entity_id = cand));
  perform pg_temp.prueba('el anterior ya no puede transferir (42501)', 'ERR:42501',
    pg_temp.valor('super', format('select transfer_super_admin(%L)', cand)));
  perform pg_temp.prueba('el anterior conserva Gestionar permisos (has_permission)', 'true',
    pg_temp.valor('super', 'select has_permission(''empleados_gestionar_permisos'')'));
  perform pg_temp.prueba('el anterior ya no es Super Admin para la base (is_super_admin)', 'false', pg_temp.valor('super', 'select is_super_admin()'));
  perform pg_temp.prueba('el nuevo sí puede transferir de vuelta (con tipo propio, el tipo enviado se ignora)', 'ok',
    case when pg_temp.valor('candidato', format('select transfer_super_admin(%L, ''1099'')', sa)) like 'ERR%' then 'fallo' else 'ok' end);
  perform pg_temp.prueba('quien ya tenía tipo lo conserva', 'w2', (select worker_type::text from profiles where id = cand));
  perform pg_temp.prueba('de vuelta: un solo Super Admin y es el original', 'true|1', (select is_super_admin::text from profiles where id = sa) || '|' || (select count(*)::text from profiles where is_super_admin));
end $$;

-- Resultado ------------------------------------------------------------------------------------------

select prueba, ok, detalle from resultados order by n;
-- FIN-DE-PRUEBAS
rollback;
