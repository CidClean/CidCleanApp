-- Pruebas de los leads (migraciones 20261022000001 y 20261022000002, hito 2).
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
  sitio uuid;
  cita uuid;
  precio uuid := (select id from lost_reasons where label_es = 'Precio');
  editor_pid uuid := (select profile_id from actores where nombre = 'editor');
  ver_pid uuid := (select profile_id from actores where nombre = 'ver');
  manana text := quote_literal((now() + interval '1 day')::text);
  pasado text := quote_literal((now() + interval '2 days')::text);
begin
  -- Motivos de lead perdido (D-107)
  perform pg_temp.prueba('quien ve leads lee los 8 motivos de partida', '8',
    pg_temp.valor('ver', 'select count(*) from lost_reasons'));
  perform pg_temp.prueba('los motivos están en el orden de D-107', 'Precio,Eligió a otra compañía,Sin respuesta,Ya no necesita el servicio,Cambió el alcance,Trabajo muy grande o muy pequeño,Fuera de la zona de servicio,Otro',
    (select string_agg(label_es, ',' order by sort) from lost_reasons));
  perform pg_temp.prueba('sin permisos no ve los motivos', '0',
    pg_temp.valor('sin', 'select count(*) from lost_reasons'));
  perform pg_temp.prueba('anon no lee los motivos', 'ERR:42501',
    pg_temp.valor('anon', 'select count(*) from lost_reasons'));
  perform pg_temp.prueba('quien edita leads no cambia los motivos (solo el Super Admin, D-114)', 'ERR:42501',
    pg_temp.valor('editor', $q$ insert into lost_reasons (label_es, label_en, sort) values ('X', 'X', 9) returning id $q$));
  perform pg_temp.prueba('el Super Admin agrega un motivo', 'ok',
    case when pg_temp.valor('super', $q$ insert into lost_reasons (label_es, label_en, sort) values ('Prueba', 'Test', 9) returning id $q$)
      like 'ERR%' then 'fallo' else 'ok' end);

  -- Crear (leads_editar)
  perform pg_temp.prueba('quien solo ve no crea leads', 'ERR:42501',
    pg_temp.valor('ver', $q$ insert into leads (company) values ('No') returning id $q$));
  perform pg_temp.prueba('sin permisos no crea leads', 'ERR:42501',
    pg_temp.valor('sin', $q$ insert into leads (company) values ('No') returning id $q$));
  perform pg_temp.prueba('anon no crea leads', 'ERR:42501',
    pg_temp.valor('anon', $q$ insert into leads (company) values ('No') returning id $q$));
  r := pg_temp.valor('editor', format(
    $q$ insert into leads (company, contact_name, phone, email, source, notes, created_by)
        values ('Prueba Dental', 'Ana', '(239) 555-0100', 'ana@prueba.local', 'campaign', 'Nota', %L) returning id $q$, ver_pid));
  perform pg_temp.prueba('quien edita crea un lead', 'ok', case when r like 'ERR%' then r else 'ok' end);
  lead := r::uuid;
  insert into ids values ('lead', lead);
  perform pg_temp.prueba('el lead nace en Nuevo', 'new', (select status::text from leads where id = lead));
  perform pg_temp.prueba('created_by lo pone la base de datos (ignora el de la app)', editor_pid::text,
    (select created_by::text from leads where id = lead));
  perform pg_temp.prueba('la empresa es obligatoria', 'ERR:23514',
    pg_temp.valor('editor', $q$ insert into leads (company) values ('  ') returning id $q$));
  perform pg_temp.prueba('la creación queda en el historial con quién la hizo', '1',
    (select count(*)::text from change_log where entity_id = lead and action = 'lead_creado'
       and actor_id = editor_pid and detail->>'company' = 'Prueba Dental' and detail->>'source' = 'campaign'));

  -- Ver (leads_ver)
  perform pg_temp.prueba('quien ve leads ve el lead', '1',
    pg_temp.valor('ver', format('select count(*) from leads where id = %L', lead)));
  perform pg_temp.prueba('quien solo hace walkthroughs no ve los leads', '0',
    pg_temp.valor('wt', format('select count(*) from leads where id = %L', lead)));
  perform pg_temp.prueba('sin permisos no ve leads', '0',
    pg_temp.valor('sin', 'select count(*) from leads'));
  perform pg_temp.prueba('anon no lee leads', 'ERR:42501',
    pg_temp.valor('anon', 'select count(*) from leads'));

  -- Cambiar estado (D-071) y perdido (D-079)
  perform pg_temp.prueba('quien solo ve no cambia el estado (0 filas)', '0',
    pg_temp.valor('ver', format($q$ with u as (update leads set status = 'contacted' where id = %L returning 1) select count(*) from u $q$, lead)));
  perform pg_temp.prueba('quien edita cambia el estado', '1',
    pg_temp.valor('editor', format($q$ with u as (update leads set status = 'contacted' where id = %L returning 1) select count(*) from u $q$, lead)));
  perform pg_temp.prueba('el cambio de estado queda en el historial', '1',
    (select count(*)::text from change_log where entity_id = lead and action = 'lead_estado_cambiado'
       and detail->>'antes' = 'new' and detail->>'despues' = 'contacted' and actor_id = editor_pid));
  perform pg_temp.prueba('quien edita cambia los datos', '1',
    pg_temp.valor('editor', format($q$ with u as (update leads set phone = '1' where id = %L returning 1) select count(*) from u $q$, lead)));
  perform pg_temp.prueba('editar datos sin cambiar el estado no agrega historial', '1',
    (select count(*)::text from change_log where entity_id = lead and action = 'lead_estado_cambiado'));
  perform pg_temp.prueba('Perdido sin motivo no se permite', 'ERR:23514',
    pg_temp.valor('editor', format($q$ with u as (update leads set status = 'lost' where id = %L returning 1) select count(*) from u $q$, lead)));
  perform pg_temp.prueba('Perdido con motivo y nota', '1',
    pg_temp.valor('editor', format($q$ with u as (update leads set status = 'lost', lost_reason_id = %L, lost_note = 'Caro'
      where id = %L returning 1) select count(*) from u $q$, precio, lead)));
  perform pg_temp.prueba('el historial guarda el motivo de perdido', '1',
    (select count(*)::text from change_log where entity_id = lead and action = 'lead_estado_cambiado'
       and detail->>'despues' = 'lost' and detail->>'lost_reason_id' = precio::text and detail->>'lost_note' = 'Caro'));
  perform pg_temp.prueba('un motivo en uso no se puede borrar', 'ERR:23503',
    pg_temp.valor('super', format('delete from lost_reasons where id = %L', precio)));
  perform pg_temp.prueba('quien edita saca el lead de Perdido', '1',
    pg_temp.valor('editor', format($q$ with u as (update leads set status = 'contacted' where id = %L returning 1) select count(*) from u $q$, lead)));
  perform pg_temp.prueba('al salir de Perdido se borran motivo y nota', 'contacted||',
    (select status || '|' || coalesce(lost_reason_id::text, '') || '|' || coalesce(lost_note, '') from leads where id = lead));

  -- Sitios (D-003)
  r := pg_temp.valor('editor', format($q$ insert into lead_sites (lead_id, name, address) values (%L, '5th Ave S', '123 5th Ave S, Naples, FL') returning id $q$, lead));
  perform pg_temp.prueba('quien edita agrega un sitio', 'ok', case when r like 'ERR%' then r else 'ok' end);
  sitio := r::uuid;
  insert into ids values ('sitio', sitio);
  perform pg_temp.prueba('quien solo ve no agrega sitios', 'ERR:42501',
    pg_temp.valor('ver', format($q$ insert into lead_sites (lead_id, address) values (%L, 'X') returning id $q$, lead)));
  perform pg_temp.prueba('la dirección es obligatoria', 'ERR:23514',
    pg_temp.valor('editor', format($q$ insert into lead_sites (lead_id, address) values (%L, '') returning id $q$, lead)));
  perform pg_temp.prueba('quien hace walkthroughs ve el sitio', '1',
    pg_temp.valor('wt', format('select count(*) from lead_sites where id = %L', sitio)));
  perform pg_temp.prueba('sin permisos no ve sitios', '0',
    pg_temp.valor('sin', 'select count(*) from lead_sites'));
  perform pg_temp.prueba('quien solo ve no borra sitios (0 filas; borrar sitios: D-202, ver sitios_y_motivos.sql)', '0',
    pg_temp.valor('ver', format('with d as (delete from lead_sites where id = %L returning 1) select count(*) from d', sitio)));

  -- Agendar el walkthrough (D-072, D-078)
  perform pg_temp.prueba('quien solo ve no agenda', 'ERR:42501',
    pg_temp.valor('ver', format('select schedule_walkthrough(%L, %s)', sitio, manana)));
  perform pg_temp.prueba('no se agenda en el pasado', 'ERR:22023',
    pg_temp.valor('editor', format($q$ select schedule_walkthrough(%L, now() - interval '1 hour') $q$, sitio)));
  perform pg_temp.prueba('un sitio que no existe', 'ERR:P0002',
    pg_temp.valor('editor', format('select schedule_walkthrough(%L, %s)', gen_random_uuid(), manana)));
  perform pg_temp.prueba('quien edita leads pero no los ve no encuentra el sitio', 'ERR:P0002',
    pg_temp.valor('solo_editar', format('select schedule_walkthrough(%L, %s)', sitio, manana)));
  r := pg_temp.valor('editor', format('select schedule_walkthrough(%L, %s)', sitio, manana));
  perform pg_temp.prueba('quien edita agenda el walkthrough', 'ok', case when r like 'ERR%' then r else 'ok' end);
  cita := r::uuid;
  perform pg_temp.prueba('agendar pasa el lead de Contactado a Walkthrough agendado', 'walkthrough_scheduled',
    (select status::text from leads where id = lead));
  perform pg_temp.prueba('la cita queda en el historial', '1',
    (select count(*)::text from change_log where entity_id = cita and action = 'walkthrough_agendado'
       and detail->>'company' = 'Prueba Dental' and actor_id = editor_pid));
  perform pg_temp.prueba('agendar otra vez el mismo sitio mueve la cita (mismo id)', cita::text,
    pg_temp.valor('editor', format('select schedule_walkthrough(%L, %s)', sitio, pasado)));
  perform pg_temp.prueba('sigue habiendo una sola cita agendada por sitio', '1',
    (select count(*)::text from walkthrough_appointments where site_id = sitio and status = 'scheduled'));
  perform pg_temp.prueba('mover la cita queda en el historial', '1',
    (select count(*)::text from change_log where entity_id = cita and action = 'walkthrough_reagendado'));
  perform pg_temp.prueba('quien hace walkthroughs ve la cita', '1',
    pg_temp.valor('wt', format('select count(*) from walkthrough_appointments where id = %L', cita)));
  perform pg_temp.prueba('sin permisos no ve citas', '0',
    pg_temp.valor('sin', 'select count(*) from walkthrough_appointments'));
  update leads set status = 'quote_sent' where id = lead;
  perform pg_temp.valor('editor', format('select schedule_walkthrough(%L, %s)', sitio, manana));
  perform pg_temp.prueba('agendar no hace retroceder un lead más avanzado', 'quote_sent',
    (select status::text from leads where id = lead));
  update leads set status = 'walkthrough_scheduled' where id = lead;

  -- Seguimientos y pendientes del Inicio (D-111)
  perform pg_temp.prueba('quien solo ve no pone seguimientos', 'ERR:42501',
    pg_temp.valor('ver', format('select set_lead_followup(%L, current_date)', lead)));
  perform pg_temp.valor('editor', format($q$ select set_lead_followup(%L, (now() at time zone 'America/New_York')::date) $q$, lead));
  perform pg_temp.valor('editor', format($q$ select set_lead_followup(%L, (now() at time zone 'America/New_York')::date) $q$, lead));
  perform pg_temp.prueba('la misma fecha dos veces deja un solo seguimiento', '1',
    (select count(*)::text from lead_followups where lead_id = lead));
  perform pg_temp.prueba('pendientes vistos por quien ve leads incluyen el seguimiento de hoy', 'true',
    pg_temp.valor('ver', 'select followups_due >= 1 and walkthroughs_upcoming >= 1 from home_sales_pending()'));
  perform pg_temp.prueba('sin permisos los pendientes de Ventas son 0', '0|0',
    pg_temp.valor('sin', $q$ select followups_due || '|' || walkthroughs_upcoming from home_sales_pending() $q$));
  perform pg_temp.prueba('anon no lee los pendientes', 'ERR:42501',
    pg_temp.valor('anon', 'select * from home_sales_pending()'));
  r := pg_temp.valor('ver', 'select followups_due from home_sales_pending()');
  perform pg_temp.valor('editor', format($q$ select set_lead_followup(%L, (now() at time zone 'America/New_York')::date + 3) $q$, lead));
  perform pg_temp.prueba('un seguimiento a futuro no cuenta como pendiente', (r::int - 1)::text,
    pg_temp.valor('ver', 'select followups_due from home_sales_pending()'));
  perform pg_temp.prueba('cambiar la fecha cierra el anterior y abre uno nuevo', '1|2',
    (select count(*) filter (where done_at is null) || '|' || count(*) from lead_followups where lead_id = lead));
  perform pg_temp.valor('editor', format('select set_lead_followup(%L, null)', lead));
  perform pg_temp.prueba('sin fecha no queda seguimiento abierto', '0',
    (select count(*)::text from lead_followups where lead_id = lead and done_at is null));
  r := pg_temp.valor('ver', 'select walkthroughs_upcoming from home_sales_pending()');
  update leads set status = 'lost', lost_reason_id = precio where id = lead;
  perform pg_temp.prueba('un lead perdido no deja pendientes', (r::int - 1)::text,
    pg_temp.valor('ver', 'select walkthroughs_upcoming from home_sales_pending()'));

  -- Eliminar (leads_eliminar)
  perform pg_temp.prueba('quien edita pero no elimina no borra (0 filas)', '0',
    pg_temp.valor('editor', format('with d as (delete from leads where id = %L returning 1) select count(*) from d', lead)));
  perform pg_temp.prueba('quien elimina borra el lead', '1',
    pg_temp.valor('borrar', format('with d as (delete from leads where id = %L returning 1) select count(*) from d', lead)));
  perform pg_temp.prueba('con el lead se van sus sitios, citas y seguimientos', '0|0|0',
    (select (select count(*) from lead_sites where lead_id = lead) || '|' ||
            (select count(*) from walkthrough_appointments where id = cita) || '|' ||
            (select count(*) from lead_followups where lead_id = lead)));
  perform pg_temp.prueba('la eliminación queda en el historial con la empresa', '1',
    (select count(*)::text from change_log where entity_id = lead and action = 'lead_eliminado'
       and detail->>'company' = 'Prueba Dental'
       and actor_id = (select profile_id from actores where nombre = 'borrar')));
  perform pg_temp.prueba('el historial del lead no se borra', 'ERR:42501',
    pg_temp.valor('super', format('delete from change_log where entity_id = %L', lead)));
end $$;

-- Resultado ------------------------------------------------------------------------------------------

select prueba, ok, detalle from resultados order by n;
-- FIN-DE-PRUEBAS
rollback;
