-- Pruebas del walkthrough (migración 20261023000001, hito 3).
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
-- hacer: walkthroughs_hacer. ver: leads_ver. sow: clientes_editar_walkthrough_sow. sin: ningún permiso.
do $$
declare
  quien text;
  pid uuid;
  aid uuid;
begin
  foreach quien in array array['hacer', 'ver', 'sow', 'sin'] loop
    aid := gen_random_uuid();
    insert into profiles (full_name, worker_type, role, email, has_app_access)
    values ('Prueba ' || quien, 'w2', 'employee', quien || '@prueba.local', true) returning id into pid;
    insert into auth.users (id, aud, role, email) values (aid, 'authenticated', 'authenticated', quien || '@prueba.local');
    insert into actores values (quien, aid, pid);
  end loop;
  insert into profile_permissions (profile_id, permission_key)
  select a.profile_id, p.k from actores a
    join (values ('hacer', 'walkthroughs_hacer'), ('ver', 'leads_ver'), ('sow', 'clientes_editar_walkthrough_sow')) as p(n, k)
      on p.n = a.nombre;
end $$;

-- Pruebas --------------------------------------------------------------------------------------------
do $$
declare
  lead uuid;
  sitio uuid;
  otro_sitio uuid;
  cita uuid;
  wt uuid := gen_random_uuid();
  hacer_pid uuid := (select profile_id from actores where nombre = 'hacer');
  datos text := $j$ '{"contact": {"address": "123 5th Ave S"}, "areas": [{"id": "a1", "type": "bathroom", "name": "Baño 01", "photos": [{"id": "f1", "path": "%s/f1.jpg", "note": "Piso"}]}], "frequency": {"kind": "weekly", "days": [1, 3, 5]}}' $j$;
  r text;
begin
  insert into leads (company, status) values ('Prueba WT', 'walkthrough_scheduled') returning id into lead;
  insert into lead_sites (lead_id, address) values (lead, '123 5th Ave S') returning id into sitio;
  insert into lead_sites (lead_id, address) values (lead, '9 Otro') returning id into otro_sitio;
  insert into walkthrough_appointments (site_id, starts_at) values (sitio, now() + interval '1 hour') returning id into cita;
  datos := format(datos, wt);

  -- Guardar el borrador
  perform pg_temp.prueba('quien solo ve leads no inicia walkthroughs', 'ERR:42501',
    pg_temp.valor('ver', format('select save_walkthrough(%L, %L, %L, %s)::text', wt, sitio, cita, datos)));
  perform pg_temp.prueba('quien edita walkthrough y SOW no inicia uno nuevo', 'ERR:42501',
    pg_temp.valor('sow', format('select save_walkthrough(%L, %L, %L, %s)::text', wt, sitio, cita, datos)));
  perform pg_temp.prueba('anon no guarda', 'ERR:42501',
    pg_temp.valor('anon', format('select save_walkthrough(%L, %L, %L, %s)::text', wt, sitio, cita, datos)));
  perform pg_temp.prueba('la cita tiene que ser del sitio', 'ERR:22023',
    pg_temp.valor('hacer', format('select save_walkthrough(%L, %L, %L, %s)::text', wt, otro_sitio, cita, datos)));
  perform pg_temp.prueba('un documento que no es objeto no se guarda', 'ERR:22023',
    pg_temp.valor('hacer', format($q$ select save_walkthrough(%L, %L, %L, '[]')::text $q$, wt, sitio, cita)));
  perform pg_temp.prueba('quien hace walkthroughs inicia el walkthrough con el id del teléfono', '',
    pg_temp.valor('hacer', format('select save_walkthrough(%L, %L, %L, %s)::text', wt, sitio, cita, datos)));
  perform pg_temp.prueba('queda en borrador con sus datos', 'draft|Baño 01|0',
    (select status || '|' || (draft->'areas'->0->>'name') || '|' || current_version from walkthroughs where id = wt));
  perform pg_temp.prueba('iniciar queda en el historial', '1',
    (select count(*)::text from change_log where entity_id = wt and action = 'walkthrough_iniciado' and actor_id = hacer_pid
       and detail->>'company' = 'Prueba WT'));
  perform pg_temp.prueba('un segundo walkthrough del mismo sitio no se permite', 'ERR:23505',
    pg_temp.valor('hacer', format('select save_walkthrough(%L, %L, null, %s)::text', gen_random_uuid(), sitio, datos)));
  perform pg_temp.valor('hacer', format($q$ select save_walkthrough(%L, %L, %L, '{"areas": [{"name": "Cocina 01"}]}')::text $q$, wt, sitio, cita));
  perform pg_temp.prueba('guardar otra vez actualiza el borrador', 'Cocina 01',
    (select draft->'areas'->0->>'name' from walkthroughs where id = wt));
  perform pg_temp.valor('hacer', format('select save_walkthrough(%L, %L, %L, %s)::text', wt, sitio, cita, datos));

  -- Ver
  perform pg_temp.prueba('quien ve leads ve el walkthrough', '1',
    pg_temp.valor('ver', format('select count(*) from walkthroughs where id = %L', wt)));
  perform pg_temp.prueba('sin permisos no lo ve', '0',
    pg_temp.valor('sin', 'select count(*) from walkthroughs'));
  perform pg_temp.prueba('nadie escribe la tabla directo', 'ERR:42501',
    pg_temp.valor('hacer', format($q$ with u as (update walkthroughs set status = 'closed' where id = %L returning 1) select count(*) from u $q$, wt)));

  -- Fotos
  perform pg_temp.prueba('quien hace walkthroughs sube una foto a la carpeta del walkthrough', 'ok',
    case when pg_temp.valor('hacer', format($q$ insert into storage.objects (bucket_id, name) values ('walkthrough-photos', %L) returning name $q$, wt || '/f0.jpg'))
      like 'ERR%' then 'fallo' else 'ok' end);
  perform pg_temp.prueba('no sube fotos a una carpeta que no es de un walkthrough', 'ERR:42501',
    pg_temp.valor('hacer', format($q$ insert into storage.objects (bucket_id, name) values ('walkthrough-photos', %L) returning name $q$, gen_random_uuid() || '/x.jpg')));
  perform pg_temp.prueba('quien solo ve no sube fotos', 'ERR:42501',
    pg_temp.valor('ver', format($q$ insert into storage.objects (bucket_id, name) values ('walkthrough-photos', %L) returning name $q$, wt || '/y.jpg')));
  perform pg_temp.prueba('sin permisos no ve las fotos', '0',
    pg_temp.valor('sin', $q$ select count(*) from storage.objects where bucket_id = 'walkthrough-photos' $q$));

  -- Cerrar
  perform pg_temp.prueba('no se cierra con fotos sin subir', 'ERR:22023',
    pg_temp.valor('hacer', format('select close_walkthrough(%L)', wt)));
  insert into storage.objects (bucket_id, name) values ('walkthrough-photos', wt || '/f1.jpg');
  perform pg_temp.prueba('quien solo ve no cierra', 'ERR:42501',
    pg_temp.valor('ver', format('select close_walkthrough(%L)', wt)));
  perform pg_temp.prueba('quien edita walkthrough y SOW no cierra el primero', 'ERR:42501',
    pg_temp.valor('sow', format('select close_walkthrough(%L)', wt)));
  perform pg_temp.prueba('cerrar crea la versión 1', '1',
    pg_temp.valor('hacer', format('select close_walkthrough(%L)', wt)));
  perform pg_temp.prueba('la cita pasa a hecha y el lead a Walkthrough hecho', 'done|walkthrough_done',
    (select status::text from walkthrough_appointments where id = cita) || '|' || (select status::text from leads where id = lead));
  perform pg_temp.prueba('cerrar queda en el historial', '1',
    (select count(*)::text from change_log where entity_id = wt and action = 'walkthrough_cerrado' and detail->>'version' = '1'));

  -- Corrección: versión nueva, la anterior se conserva
  perform pg_temp.valor('sow', format($q$ select save_walkthrough(%L, %L, %L, '{"areas": []}')::text $q$, wt, sitio, cita));
  perform pg_temp.prueba('quien edita walkthrough y SOW corrige un walkthrough cerrado (versión 2)', '2',
    pg_temp.valor('sow', format('select close_walkthrough(%L)', wt)));
  perform pg_temp.prueba('las dos versiones se conservan', '2|1|0',
    (select count(*) || '|' || (select jsonb_array_length(data->'areas') from walkthrough_versions where walkthrough_id = wt and version = 1)
       || '|' || (select jsonb_array_length(data->'areas') from walkthrough_versions where walkthrough_id = wt and version = 2)
     from walkthrough_versions where walkthrough_id = wt));
  perform pg_temp.prueba('la corrección queda en el historial', '1',
    (select count(*)::text from change_log where entity_id = wt and action = 'walkthrough_corregido'));
  update leads set status = 'quote_sent' where id = lead;
  perform pg_temp.valor('hacer', format('select close_walkthrough(%L)', wt));
  perform pg_temp.prueba('una corrección no hace retroceder el lead', 'quote_sent',
    (select status::text from leads where id = lead));

  -- D-202: el sitio con walkthrough cerrado no se borra suelto
  update walkthrough_appointments set status = 'canceled' where id = cita;
  begin
    delete from lead_sites where id = sitio;
    r := 'borrado';
  exception when others then
    r := 'ERR:' || sqlstate;
  end;
  perform pg_temp.prueba('un sitio con walkthrough cerrado no se borra (aunque la cita no esté hecha)', 'ERR:23514', r);
end $$;

-- Resultado ------------------------------------------------------------------------------------------

select prueba, ok, detalle from resultados order by n;
-- FIN-DE-PRUEBAS
rollback;
