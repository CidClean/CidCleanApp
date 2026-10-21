-- Pruebas de sitios y motivos (migración 20261022000003, hito 2b: D-201, D-202, D-203).
-- Repetibles: todo ocurre dentro de una transacción que termina en rollback, no queda nada en la base
-- (tampoco en change_log). Simulan roles con `set local role` y `request.jwt.claims`, como hace la API.
-- Uso: psql -f supabase/tests/leads.sql   (la última consulta lista cada prueba con ok = true/false).

begin;

create temp table resultados (n int generated always as identity, prueba text, ok boolean, detalle text);
create temp table actores (nombre text primary key, auth_id uuid, profile_id uuid);
create temp table ids (nombre text primary key, id uuid);
grant all on resultados, actores, ids to public;

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

create function pg_temp.id(nombre text) returns uuid language sql as $$ select id from ids where ids.nombre = $1 $$;

-- Personas de prueba -------------------------------------------------------------------------------
-- ver: solo leads_ver. editor: ver y editar. borrar: ver y eliminar. wt: solo walkthroughs_hacer.
-- solo_editar: leads_editar sin leads_ver. sin: ningún permiso.
do $$
declare
  quien text;
  pid uuid;
  aid uuid;
begin
  foreach quien in array array['ver', 'editor', 'borrar', 'wt', 'solo_editar', 'sin'] loop
    aid := gen_random_uuid();
    insert into profiles (full_name, worker_type, role, email, has_app_access)
    values ('Prueba ' || quien, 'w2', 'employee', quien || '@prueba.local', true) returning id into pid;
    insert into auth.users (id, aud, role, email) values (aid, 'authenticated', 'authenticated', quien || '@prueba.local');
    insert into actores values (quien, aid, pid);
  end loop;
  insert into profile_permissions (profile_id, permission_key)
  select a.profile_id, p.k from actores a
    join (values ('ver', 'leads_ver'), ('editor', 'leads_ver'), ('editor', 'leads_editar'),
                 ('borrar', 'leads_ver'), ('borrar', 'leads_eliminar'), ('wt', 'walkthroughs_hacer'),
                 ('solo_editar', 'leads_editar')) as p(n, k) on p.n = a.nombre;
  insert into actores select 'super', auth_user_id, id from profiles where is_super_admin;
end $$;

-- Pruebas --------------------------------------------------------------------------------------------
do $$
declare
  r text;
  lead uuid;
  s1 uuid;
  s2 uuid;
  s3 uuid;
  motivo uuid;
  usado uuid;
  editor_pid uuid := (select profile_id from actores where nombre = 'editor');
begin
  insert into leads (company) values ('Prueba Sitios') returning id into lead;
  insert into lead_sites (lead_id, name, address) values (lead, 'Uno', '1 Main St') returning id into s1;
  insert into lead_sites (lead_id, name, address) values (lead, 'Dos', '2 Main St') returning id into s2;
  insert into lead_sites (lead_id, name, address) values (lead, 'Tres', '3 Main St') returning id into s3;
  insert into walkthrough_appointments (site_id, starts_at, status) values (s2, now() - interval '1 day', 'done');
  insert into walkthrough_appointments (site_id, starts_at) values (s3, now() + interval '1 day');

  -- D-202: editar sitios
  perform pg_temp.prueba('quien edita cambia la dirección de un sitio', '1',
    pg_temp.valor('editor', format($q$ with u as (update lead_sites set address = '10 Main St' where id = %L returning 1) select count(*) from u $q$, s1)));
  perform pg_temp.prueba('editar el sitio queda en el historial', '1',
    (select count(*)::text from change_log where entity_id = s1 and action = 'sitio_editado' and actor_id = editor_pid
       and detail->>'company' = 'Prueba Sitios' and detail->'despues'->>'address' = '10 Main St'));
  perform pg_temp.prueba('quien solo ve no edita sitios (0 filas)', '0',
    pg_temp.valor('ver', format($q$ with u as (update lead_sites set address = 'X' where id = %L returning 1) select count(*) from u $q$, s1)));

  -- D-202: borrar sitios
  perform pg_temp.prueba('quien solo ve no borra sitios (0 filas)', '0',
    pg_temp.valor('ver', format('with d as (delete from lead_sites where id = %L returning 1) select count(*) from d', s1)));
  perform pg_temp.prueba('un sitio con walkthrough hecho no se borra', 'ERR:23514',
    pg_temp.valor('editor', format('with d as (delete from lead_sites where id = %L returning 1) select count(*) from d', s2)));
  perform pg_temp.prueba('un sitio con walkthrough solo agendado sí se borra', '1',
    pg_temp.valor('editor', format('with d as (delete from lead_sites where id = %L returning 1) select count(*) from d', s3)));
  perform pg_temp.prueba('...y su cita agendada se va con él', '0',
    (select count(*)::text from walkthrough_appointments where site_id = s3));
  perform pg_temp.prueba('quien edita borra un sitio sin walkthrough', '1',
    pg_temp.valor('editor', format('with d as (delete from lead_sites where id = %L returning 1) select count(*) from d', s1)));
  perform pg_temp.prueba('borrar el sitio queda en el historial con la empresa', '1',
    (select count(*)::text from change_log where entity_id = s1 and action = 'sitio_eliminado'
       and detail->>'company' = 'Prueba Sitios' and actor_id = editor_pid));

  -- D-201: eliminar el lead entero aunque un sitio tenga walkthrough hecho
  perform pg_temp.prueba('quien edita pero no elimina no borra el lead (0 filas)', '0',
    pg_temp.valor('editor', format('with d as (delete from leads where id = %L returning 1) select count(*) from d', lead)));
  perform pg_temp.prueba('quien elimina borra el lead aunque tenga un walkthrough hecho', '1',
    pg_temp.valor('borrar', format('with d as (delete from leads where id = %L returning 1) select count(*) from d', lead)));
  perform pg_temp.prueba('los sitios se van con el lead sin registrar sitio_eliminado', '0|0|1',
    (select count(*) from lead_sites where lead_id = lead) || '|' ||
    (select count(*) from change_log where entity_id = s2 and action = 'sitio_eliminado') || '|' ||
    (select count(*) from change_log where entity_id = lead and action = 'lead_eliminado'));

  -- D-203: motivos
  perform pg_temp.prueba('quien edita leads no crea motivos', 'ERR:42501',
    pg_temp.valor('editor', $q$ insert into lost_reasons (label_es, label_en, sort) values ('X', 'X', 99) returning id $q$));
  r := pg_temp.valor('super', $q$ insert into lost_reasons (label_es, label_en, sort) values ('Prueba', 'Test', 99) returning id $q$);
  perform pg_temp.prueba('el Super Admin crea un motivo en los dos idiomas', 'ok', case when r like 'ERR%' then r else 'ok' end);
  motivo := r::uuid;
  perform pg_temp.prueba('crear el motivo queda en el historial', '1',
    (select count(*)::text from change_log where entity_id = motivo and action = 'motivo_creado' and detail->>'label_en' = 'Test'));
  perform pg_temp.prueba('el texto en inglés es obligatorio', 'ERR:23514',
    pg_temp.valor('super', $q$ insert into lost_reasons (label_es, label_en, sort) values ('Y', ' ', 99) returning id $q$));
  perform pg_temp.prueba('el Super Admin edita el motivo', '1',
    pg_temp.valor('super', format($q$ with u as (update lost_reasons set label_en = 'Testing' where id = %L returning 1) select count(*) from u $q$, motivo)));
  perform pg_temp.prueba('editar el motivo queda en el historial', '1',
    (select count(*)::text from change_log where entity_id = motivo and action = 'motivo_editado'));
  perform pg_temp.prueba('quien edita leads no quita motivos', 'ERR:42501',
    pg_temp.valor('editor', format('select remove_lost_reason(%L)', motivo)));
  perform pg_temp.prueba('un motivo sin uso se borra', 'deleted',
    pg_temp.valor('super', format('select remove_lost_reason(%L)', motivo)));
  perform pg_temp.prueba('borrar el motivo queda en el historial', '1',
    (select count(*)::text from change_log where entity_id = motivo and action = 'motivo_eliminado'));

  usado := (select id from lost_reasons where label_es = 'Precio');
  insert into leads (company, status, lost_reason_id) values ('Prueba Perdido', 'lost', usado) returning id into lead;
  perform pg_temp.prueba('un motivo usado por un lead no se borra: se desactiva', 'deactivated',
    pg_temp.valor('super', format('select remove_lost_reason(%L)', usado)));
  perform pg_temp.prueba('el lead conserva su motivo desactivado', usado::text,
    (select lost_reason_id::text from leads where id = lead));
  perform pg_temp.prueba('desactivar queda en el historial', '1',
    (select count(*)::text from change_log where entity_id = usado and action = 'motivo_desactivado'));
  insert into leads (company) values ('Prueba Nuevo') returning id into lead;
  perform pg_temp.prueba('un motivo desactivado no se puede elegir al marcar perdido', 'ERR:23514',
    pg_temp.valor('editor', format($q$ with u as (update leads set status = 'lost', lost_reason_id = %L where id = %L returning 1) select count(*) from u $q$, usado, lead)));
  perform pg_temp.prueba('un borrado directo de un motivo usado también falla', 'ERR:23503',
    pg_temp.valor('super', format('with d as (delete from lost_reasons where id = %L returning 1) select count(*) from d', usado)));
end $$;

-- Resultado ------------------------------------------------------------------------------------------

select prueba, ok, detalle from resultados order by n;
-- FIN-DE-PRUEBAS
rollback;
