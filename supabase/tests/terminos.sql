-- Pruebas de los términos del staff en PDF (migración 20261021000007).
-- Repetibles: todo ocurre dentro de una transacción que termina en rollback, no queda nada en la base.
-- Simulan roles con `set local role` y `request.jwt.claims`, como hace la API.
-- Uso: psql -f supabase/tests/terminos.sql   (la última consulta lista cada prueba con ok = true/false).

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

-- Las pruebas parten de cero versiones. Si el proyecto ya tiene versiones publicadas de verdad, se apartan solo
-- dentro de esta transacción (termina en rollback: las filas reales vuelven intactas).
alter table terms_acceptances disable trigger terms_acceptances_no_change;
alter table terms_documents disable trigger terms_documents_no_change;
delete from terms_acceptances;
delete from terms_documents;
alter table terms_acceptances enable trigger terms_acceptances_no_change;
alter table terms_documents enable trigger terms_documents_no_change;

-- Personas de prueba -------------------------------------------------------------------------------

do $$
declare
  quien text;
  pid uuid;
  aid uuid;
begin
  foreach quien in array array['empleado', 'pagos'] loop
    aid := gen_random_uuid();
    insert into profiles (full_name, worker_type, role, email, has_app_access)
    values ('Prueba ' || quien, 'w2', 'employee', quien || '@prueba.local', true) returning id into pid;
    insert into auth.users (id, aud, role, email) values (aid, 'authenticated', 'authenticated', quien || '@prueba.local');
    insert into actores values (quien, aid, pid);
  end loop;
  insert into profile_permissions (profile_id, permission_key) select profile_id, 'empleados_ver_pagos' from actores where nombre = 'pagos';
  insert into actores select 'super', auth_user_id, id from profiles where is_super_admin;
end $$;

-- B1. Estructura ---------------------------------------------------------------------------------------

select pg_temp.prueba('terms_documents tiene file_path y ya no tiene body', 'true',
  (select (bool_or(column_name = 'file_path' and is_nullable = 'NO') and not bool_or(column_name = 'body'))::text
     from information_schema.columns where table_schema = 'public' and table_name = 'terms_documents'));
select pg_temp.prueba('el bucket terms es privado', 'false', (select public::text from storage.buckets where id = 'terms'));
select pg_temp.prueba('el bucket terms solo acepta PDF', '{application/pdf}', (select allowed_mime_types::text from storage.buckets where id = 'terms'));
select pg_temp.prueba('sin versiones publicadas: get_current_terms no devuelve filas', '0',
  pg_temp.valor('empleado', $q$ select count(*) from get_current_terms('staff') $q$));

-- B1. Subir y publicar: solo el Super Admin -----------------------------------------------------------

select pg_temp.prueba('empleado: no sube al bucket terms (42501)', 'ERR:42501',
  pg_temp.valor('empleado', $q$ insert into storage.objects (bucket_id, name) values ('terms', 'staff/empleado.pdf') returning 1 $q$));
select pg_temp.prueba('empleado con empleados_ver_pagos: tampoco sube al bucket terms (42501)', 'ERR:42501',
  pg_temp.valor('pagos', $q$ insert into storage.objects (bucket_id, name) values ('terms', 'staff/pagos.pdf') returning 1 $q$));
select pg_temp.prueba('anon: no sube al bucket terms (42501)', 'ERR:42501',
  pg_temp.valor('anon', $q$ insert into storage.objects (bucket_id, name) values ('terms', 'staff/anon.pdf') returning 1 $q$));
select pg_temp.prueba('Super Admin: sube al bucket terms', '1',
  pg_temp.valor('super', $q$ insert into storage.objects (bucket_id, name) values ('terms', 'staff/v1.pdf') returning 1 $q$));

select pg_temp.prueba('empleado: no publica términos (42501)', 'ERR:42501',
  pg_temp.valor('empleado', $q$ select publish_terms('staff', 'staff/v1.pdf') $q$));
select pg_temp.prueba('empleado con empleados_ver_pagos: no publica términos (42501)', 'ERR:42501',
  pg_temp.valor('pagos', $q$ select publish_terms('staff', 'staff/v1.pdf') $q$));
select pg_temp.prueba('anon: no publica términos (42501)', 'ERR:42501',
  pg_temp.valor('anon', $q$ select publish_terms('staff', 'staff/v1.pdf') $q$));
select pg_temp.prueba('nada se publicó con esos intentos', '0', (select count(*)::text from terms_documents));
select pg_temp.prueba('empleado: no escribe en terms_documents directo (42501)', 'ERR:42501',
  pg_temp.valor('empleado', $q$ insert into terms_documents (kind, version, file_path) values ('staff', 1, 'staff/v1.pdf') returning 1 $q$));

select pg_temp.prueba('Super Admin: un archivo que no existe en el bucket no se publica (22023)', 'ERR:22023',
  pg_temp.valor('super', $q$ select publish_terms('staff', 'staff/no-existe.pdf') $q$));
insert into storage.objects (bucket_id, name) values ('employee-docs', 'otro-bucket.pdf');
select pg_temp.prueba('Super Admin: un archivo de otro bucket no cuenta (22023)', 'ERR:22023',
  pg_temp.valor('super', $q$ select publish_terms('staff', 'otro-bucket.pdf') $q$));

-- B1. Numeración de versiones -------------------------------------------------------------------------

select pg_temp.valor('super', $q$ select publish_terms('staff', 'staff/v1.pdf') $q$);
select pg_temp.prueba('la primera versión publicada es la 1', '1', (select version::text from terms_documents where kind = 'staff'));
select pg_temp.prueba('la publicó el Super Admin', 'true',
  (select (published_by = (select profile_id from actores where nombre = 'super'))::text from terms_documents where kind = 'staff' and version = 1));
insert into storage.objects (bucket_id, name) values ('terms', 'staff/v2.pdf'), ('terms', 'portal/v1.pdf');
select pg_temp.valor('super', $q$ select publish_terms('staff', 'staff/v2.pdf') $q$);
select pg_temp.prueba('la segunda versión es la 2', '1,2', (select string_agg(version::text, ',' order by version) from terms_documents where kind = 'staff'));
select pg_temp.valor('super', $q$ select publish_terms('portal', 'portal/v1.pdf') $q$);
select pg_temp.prueba('cada tipo numera por su cuenta (portal empieza en 1)', '1', (select max(version)::text from terms_documents where kind = 'portal'));
select pg_temp.prueba('un tipo desconocido no se publica (23514)', 'ERR:23514',
  pg_temp.valor('super', $q$ select publish_terms('otro', 'staff/v1.pdf') $q$));
select pg_temp.prueba('publicar queda en el historial con versión y archivo', '2',
  (select count(*)::text from change_log where action = 'terminos_publicados' and detail->>'kind' = 'staff'
      and detail->>'file_path' in ('staff/v1.pdf', 'staff/v2.pdf')));

-- B1. Versión vigente y lectura ----------------------------------------------------------------------

select pg_temp.prueba('get_current_terms devuelve la versión 2 y su archivo (cualquier empleado)', '2|staff/v2.pdf',
  pg_temp.valor('empleado', $q$ select version || '|' || file_path from get_current_terms('staff') $q$));
select pg_temp.prueba('get_current_terms trae la fecha de publicación', 'true',
  pg_temp.valor('empleado', $q$ select (published_at > now() - interval '1 minute')::text from get_current_terms('staff') $q$));
select pg_temp.prueba('get_current_terms de un tipo sin versiones no devuelve filas', '0',
  pg_temp.valor('empleado', $q$ select count(*) from get_current_terms('privacy') $q$));
select pg_temp.prueba('anon no llama a get_current_terms (42501)', 'ERR:42501',
  pg_temp.valor('anon', $q$ select count(*) from get_current_terms('staff') $q$));
select pg_temp.prueba('cualquier empleado lee los archivos del bucket terms', '3',
  pg_temp.valor('empleado', $q$ select count(*) from storage.objects where bucket_id = 'terms' and name in ('staff/v1.pdf', 'staff/v2.pdf', 'portal/v1.pdf') $q$));
select pg_temp.prueba('anon no lee los archivos del bucket terms', '0',
  pg_temp.valor('anon', $q$ select count(*) from storage.objects where bucket_id = 'terms' $q$));
select pg_temp.prueba('nadie borra archivos de terms desde la API (42501)', 'ERR:42501',
  pg_temp.valor('super', $q$ with d as (delete from storage.objects where bucket_id = 'terms' returning 1) select count(*) from d $q$));
select pg_temp.prueba('nadie edita archivos de terms desde la API (0 filas: no hay política de update)', '0',
  pg_temp.valor('super', $q$ with u as (update storage.objects set name = name || 'x' where bucket_id = 'terms' returning 1) select count(*) from u $q$));
do $$
declare got text;
begin
  begin
    update terms_documents set file_path = 'otro.pdf';
    got := 'sin error';
  exception when others then got := 'ERR:' || sqlstate; end;
  perform pg_temp.prueba('terms_documents es de solo agregar: no se edita (P0001)', 'ERR:P0001', got);
end $$;

-- B1. La aceptación no cambió ------------------------------------------------------------------------

select pg_temp.valor('empleado', $q$ select accept_staff_terms() $q$);
select pg_temp.prueba('aceptar registra la versión vigente (la 2) para quien acepta', '2',
  (select t.version::text from terms_acceptances a join terms_documents t on t.id = a.document_id
     where a.profile_id = (select profile_id from actores where nombre = 'empleado')));
select pg_temp.valor('empleado', $q$ select accept_staff_terms() $q$);
select pg_temp.prueba('aceptar dos veces no duplica: hay una sola aceptación', '1',
  (select count(*)::text from terms_acceptances where profile_id = (select profile_id from actores where nombre = 'empleado')));
select pg_temp.prueba('empleado: lee solo sus aceptaciones', '1',
  pg_temp.valor('empleado', $q$ select count(*) from terms_acceptances $q$));
select pg_temp.prueba('otro empleado sin permiso de ver empleados no ve aceptaciones ajenas', '0',
  pg_temp.valor('pagos', $q$ select count(*) from terms_acceptances $q$));

-- Resultado ------------------------------------------------------------------------------------------

select prueba, ok, detalle from resultados order by n;
-- FIN-DE-PRUEBAS
rollback;
