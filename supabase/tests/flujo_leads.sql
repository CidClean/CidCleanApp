-- Pruebas de la orden 130 (migraciones 20261119000001 y 20261119000002, D-332, D-333): flujo de leads automático.
-- Transiciones (correo de plantilla, Respondió, Sin respuesta, venta), plazos de 7, 30 y 14 días con fechas
-- simuladas, aviso, Inicio y permisos. Repetibles: todo termina en rollback.
-- Uso: psql -f supabase/tests/flujo_leads.sql   (la última consulta lista cada prueba con ok = true/false).

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

create function pg_temp.id(nombre text) returns uuid language sql as $$ select id from ids where ids.nombre = $1 $$;

-- ver: solo leads_ver. editor: ver y editar. sin: ningún permiso.
do $$
declare
  quien text;
  pid uuid;
  aid uuid;
begin
  foreach quien in array array['ver', 'editor', 'sin'] loop
    aid := gen_random_uuid();
    insert into profiles (full_name, worker_type, role, email, has_app_access)
    values ('Prueba ' || quien, 'w2', 'employee', quien || '@prueba-fl.local', true) returning id into pid;
    insert into auth.users (id, aud, role, email) values (aid, 'authenticated', 'authenticated', quien || '@prueba-fl.local');
    insert into actores values (quien, aid, pid);
  end loop;
  insert into profile_permissions (profile_id, permission_key)
  select a.profile_id, p.k from actores a
    join (values ('ver', 'leads_ver'), ('editor', 'leads_ver'), ('editor', 'leads_editar')) as p(n, k) on p.n = a.nombre;
end $$;

do $$
declare
  r text;
  lead uuid;
  otro uuid;
  sitio uuid;
  t_primer uuid := (select id from email_templates where name = 'Primer contacto');
  t_seg uuid := (select id from email_templates where name = 'Seguimiento');
  t_fin uuid := (select id from email_templates where name = 'Seguimiento final');
  hoy date := cc_today();
  -- Mediodía en Naples de un día relativo a hoy, para simular fechas.
  dia_ts timestamptz;
begin
  insert into leads (company, contact_name, email) values ('Flujo Uno', 'Pedro', 'pedro@prueba-fl.local') returning id into lead;
  insert into leads (company, source) values ('Venta Uno', 'manual') returning id into otro;

  -- Estados y etapas
  perform pg_temp.prueba('lead_stage: frío 0, Interesado 1, venta 2-5, cerrado 6', '0|0|0|0|0|0|1|2|3|4|5|6|6',
    (select string_agg(lead_stage(s)::text, '|' order by o) from unnest(array['new','waiting','follow_up','follow_up_2',
      'no_response','contacted','interested','walkthrough_scheduled','walkthrough_done','quote_sent','negotiation','won','lost']::lead_status[])
      with ordinality as x(s, o) ) );

  -- Correo de plantilla desde Nuevo
  perform pg_temp.prueba('quien solo ve leads registra el correo', 'ok',
    case when pg_temp.valor('ver', format('select log_template_email(%L, %L, %L, %L)', t_primer, 'lead', lead, 'open')) like 'ERR%' then 'fallo' else 'ok' end);
  perform pg_temp.prueba('Nuevo → Esperando con primer y último contacto ahora', 'waiting|0|true|true',
    (select status || '|' || followups_sent || '|' || (first_contact_at = now()) || '|' || (last_contact_at = now()) from leads where id = lead));
  perform pg_temp.prueba('siguiente paso: Follow up a los 7 días', (hoy + 7)::text,
    (select next_step_on(l)::text from leads l where id = lead));
  perform pg_temp.prueba('el cambio queda en el historial', 'new>waiting',
    (select detail->>'antes' || '>' || (detail->>'despues') from change_log where entity_id = lead and action = 'lead_estado_cambiado'));

  -- Plazo de 7 días (fechas simuladas: el primer contacto se mueve al pasado)
  update leads set first_contact_at = now() - interval '6 days', last_contact_at = now() - interval '6 days' where id = lead;
  perform set_config('request.jwt.claims', '{}', true);
  perform lead_followups_advance();
  perform pg_temp.prueba('a los 6 días sigue esperando', 'waiting', (select status::text from leads where id = lead));
  perform set_config('request.jwt.claims', '{}', true);
  perform lead_followups_advance(now() + interval '1 day');
  perform pg_temp.prueba('a los 7 días pasa a Follow up', 'follow_up', (select status::text from leads where id = lead));
  perform pg_temp.prueba('Follow up vencido: next_step_on = el día en que venció', hoy::text,
    (select next_step_on(l)::text from leads l where id = lead));

  -- Correo desde Follow up
  perform pg_temp.valor('ver', format('select log_template_email(%L, %L, %L, %L)', t_seg, 'lead', lead, 'copy'));
  perform pg_temp.prueba('Follow up → Esperando con 1 seguimiento; el primer contacto no cambia', 'waiting|1|true|true|true',
    (select status || '|' || followups_sent || '|' || (followup_sent_at = now()) || '|' || (last_contact_at = now())
       || '|' || (local_day(first_contact_at) = hoy - 6) from leads where id = lead));
  perform pg_temp.prueba('siguiente paso: 2nd follow up a los 30 días del primer contacto', (hoy - 6 + 30)::text,
    (select next_step_on(l)::text from leads l where id = lead));

  -- Plazo de 30 días
  perform set_config('request.jwt.claims', '{}', true);
  perform lead_followups_advance(now() + interval '22 days');
  perform pg_temp.prueba('a los 28 días del primer contacto sigue esperando', 'waiting', (select status::text from leads where id = lead));
  perform set_config('request.jwt.claims', '{}', true);
  perform lead_followups_advance(now() + interval '24 days');
  perform pg_temp.prueba('a los 30 días del primer contacto pasa a 2nd follow up', 'follow_up_2', (select status::text from leads where id = lead));

  -- Correo desde 2nd follow up
  perform pg_temp.valor('ver', format('select log_template_email(%L, %L, %L, %L)', t_fin, 'lead', lead, 'open'));
  perform pg_temp.prueba('2nd follow up → Esperando con 2 seguimientos', 'waiting|2', (select status || '|' || followups_sent from leads where id = lead));
  perform pg_temp.prueba('siguiente paso: Sin respuesta a los 14 días del último contacto', (hoy + 14)::text,
    (select next_step_on(l)::text from leads l where id = lead));

  -- Plazo de 14 días y aviso
  perform set_config('request.jwt.claims', '{}', true);
  perform lead_followups_advance(now() + interval '13 days');
  perform pg_temp.prueba('a los 13 días sigue esperando', 'waiting', (select status::text from leads where id = lead));
  perform set_config('request.jwt.claims', '{}', true);
  perform lead_followups_advance(now() + interval '14 days');
  perform pg_temp.prueba('a los 14 días pasa a Sin respuesta', 'no_response', (select status::text from leads where id = lead));
  perform pg_temp.prueba('aviso Seguimiento de lead pendiente a quien ve leads (no a quien no)', '1|1|0',
    (select count(*) filter (where n.profile_id = (select profile_id from actores where nombre = 'ver')) || '|' ||
            count(*) filter (where n.profile_id = (select profile_id from actores where nombre = 'editor')) || '|' ||
            count(*) filter (where n.profile_id = (select profile_id from actores where nombre = 'sin'))
       from notifications n where n.kind = 'followup_due' and n.link->'params'->>'id' = lead::text));
  perform set_config('request.jwt.claims', '{}', true);
  perform lead_followups_advance(now() + interval '15 days');
  perform pg_temp.prueba('el aviso no se repite', '1',
    (select count(*)::text from notifications n where n.kind = 'followup_due' and n.link->'params'->>'id' = lead::text
        and n.profile_id = (select profile_id from actores where nombre = 'ver')));

  -- Sin respuesta: decidir
  perform pg_temp.prueba('quien solo ve no decide', 'ERR:42501',
    pg_temp.valor('ver', format('select lead_no_response_decide(%L, %L)', lead, 'retry')));
  perform pg_temp.prueba('acción no válida', 'ERR:22023',
    pg_temp.valor('editor', format('select lead_no_response_decide(%L, %L)', lead, 'otra')));
  r := pg_temp.valor('editor', format('select lead_no_response_decide(%L, %L)', lead, 'retry'));
  perform pg_temp.prueba('Reintentar vuelve a Follow up y empieza otra ronda', 'follow_up|follow_up|0|true',
    r || '|' || (select status || '|' || followups_sent || '|' || (first_contact_at = now()) from leads where id = lead));
  perform pg_temp.prueba('Reintentar solo desde Sin respuesta', 'ERR:22023',
    pg_temp.valor('editor', format('select lead_no_response_decide(%L, %L)', lead, 'retry')));
  update leads set status = 'no_response' where id = lead;
  r := pg_temp.valor('editor', format('select lead_no_response_decide(%L, %L)', lead, 'lost'));
  perform pg_temp.prueba('Marcar perdido (Sin respuesta)', 'lost|lost|Sin respuesta',
    r || '|' ||
    (select l.status || '|' || m.label_es from leads l join lost_reasons m on m.id = l.lost_reason_id where l.id = lead));

  -- Respondió
  update leads set status = 'waiting' where id = lead;
  perform pg_temp.prueba('quien solo ve no marca Respondió', 'ERR:42501',
    pg_temp.valor('ver', format('select lead_mark_responded(%L)', lead)));
  r := pg_temp.valor('editor', format('select lead_mark_responded(%L)', lead));
  perform pg_temp.prueba('Respondió → Interesado con fecha', 'interested|true',
    r || '|' ||
    (select (responded_at = now())::text from leads where id = lead));
  perform pg_temp.prueba('Interesado no tiene siguiente paso de seguimiento', null,
    (select next_step_on(l)::text from leads l where id = lead));
  perform set_config('request.jwt.claims', '{}', true);
  perform lead_followups_advance(now() + interval '60 days');
  perform pg_temp.prueba('los plazos no tocan a un Interesado', 'interested', (select status::text from leads where id = lead));
  update leads set last_contact_at = now() - interval '1 day' where id = lead;
  perform pg_temp.valor('ver', format('select log_template_email(%L, %L, %L, %L)', t_seg, 'lead', lead, 'open'));
  perform pg_temp.prueba('el correo de plantilla no toca leads en venta', 'interested|true',
    (select status || '|' || (last_contact_at < now())::text from leads l where id = lead));
  perform pg_temp.prueba('Respondió en un lead en venta no cambia nada', 'interested',
    pg_temp.valor('editor', format('select lead_mark_responded(%L)', lead)));
  perform pg_temp.prueba('lead inexistente', 'ERR:P0002',
    pg_temp.valor('editor', format('select lead_mark_responded(%L)', gen_random_uuid())));

  -- Venta: agendar walkthrough desde Interesado y desde el frío; no retrocede
  insert into lead_sites (lead_id, address) values (lead, '1 Main St') returning id into sitio;
  perform pg_temp.valor('editor', format('select schedule_walkthrough(%L, %L)', sitio, now() + interval '2 days'));
  perform pg_temp.prueba('Interesado → Walkthrough agendado al crear la cita', 'walkthrough_scheduled', (select status::text from leads where id = lead));
  update leads set status = 'follow_up' where id = otro;
  insert into lead_sites (lead_id, address) values (otro, '2 Main St') returning id into sitio;
  perform pg_temp.valor('editor', format('select schedule_walkthrough(%L, %L)', sitio, now() + interval '2 days'));
  perform pg_temp.prueba('Follow up → Walkthrough agendado al crear la cita', 'walkthrough_scheduled', (select status::text from leads where id = otro));
  update leads set status = 'quote_sent' where id = otro;
  perform pg_temp.valor('editor', format('select schedule_walkthrough(%L, %L)', sitio, now() + interval '3 days'));
  perform pg_temp.prueba('mover la cita no retrocede un Quote enviado', 'quote_sent', (select status::text from leads where id = otro));

  -- Cambiar estado a mano (corrección): queda en el historial; Esperando sin fecha toma hoy
  update leads set status = 'new', first_contact_at = null, last_contact_at = null where id = otro;
  perform pg_temp.prueba('corrección a mano a Esperando con leads_editar', '1',
    pg_temp.valor('editor', format($q$ with u as (update leads set status = 'waiting' where id = %L returning 1) select count(*) from u $q$, otro)));
  perform pg_temp.prueba('Esperando a mano toma el primer contacto de hoy', 'waiting|true',
    (select status || '|' || (first_contact_at = now()) from leads where id = otro));
  perform pg_temp.prueba('el cambio a mano queda en el historial con quién lo hizo', '1',
    (select count(*)::text from change_log where entity_id = otro and action = 'lead_estado_cambiado' and detail->>'despues' = 'waiting'
       and actor_id = (select profile_id from actores where nombre = 'editor')));

  -- Inicio
  update leads set status = 'follow_up' where id = lead;
  perform pg_temp.prueba('Inicio: te toca escribir, esperando, sin respuesta (incluye datos previos)', 'ok',
    case when pg_temp.valor('ver', 'select to_write || ''|'' || waiting || ''|'' || no_response from home_leads_followup()') =
      (select count(*) filter (where status in ('follow_up','follow_up_2')) || '|' || count(*) filter (where status = 'waiting')
         || '|' || count(*) filter (where status = 'no_response') from leads) then 'ok' else 'fallo' end);
  perform pg_temp.prueba('Inicio pide leads_ver', 'ERR:42501', pg_temp.valor('sin', 'select to_write from home_leads_followup()'));
  perform pg_temp.prueba('nadie de la app corre los plazos', 'ERR:42501', pg_temp.valor('editor', 'select lead_followups_advance()'));
  perform pg_temp.prueba('anon no marca Respondió', 'ERR:42501', pg_temp.valor('anon', format('select lead_mark_responded(%L)', lead)));

  -- Lead del sitio web entra directo a Interesado
  r := (site_submit('contact', 'Web Persona', 'Web Co', 'web@prueba-fl.local', '2395550100', 'Naples', '34102',
        null, null, null, 'Necesito limpieza de oficina', 'hash-fl'))->>'lead_id';
  perform pg_temp.prueba('lead web nuevo → Interesado', 'interested|web', (select status || '|' || source from leads where id = r::uuid));

  -- El barrido de avisos corre los plazos
  update leads set status = 'waiting', followups_sent = 0, first_contact_at = now() - interval '8 days' where id = otro;
  perform set_config('request.jwt.claims', '{}', true);
  perform notifications_scan();
  perform pg_temp.prueba('notifications_scan (cron cidclean-avisos) aplica los plazos', 'follow_up', (select status::text from leads where id = otro));
end $$;

-- Migración de datos (D-334): Contactado → Esperando con el primer contacto = fecha del cambio de estado.
do $$
declare
  dia timestamptz := '2026-11-18 10:00-05';
begin
  perform pg_temp.prueba('ningún lead queda en Contactado', '0', (select count(*)::text from leads where status = 'contacted'));
  perform pg_temp.prueba('un lead con primer contacto el 2026-11-18 tiene Follow up el 2026-11-25', '2026-11-25',
    (select next_step_on(row('00000000-0000-0000-0000-000000000000'::uuid, 'X', null, null, null, 'manual', null, 'waiting', null, null,
       dia, null, dia, dia, 'en', null, dia, dia, 0, null, null, null, 'cold', 'recurring', null)::leads)::text));
end $$;

select n, prueba, ok, detalle from resultados order by n;
-- FIN-DE-PRUEBAS
rollback;
