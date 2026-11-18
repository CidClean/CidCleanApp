-- Pruebas de la orden 121 (migración 20261118000002, D-322 (4), D-323 (5)): qué versiones de quote reciben el
-- recordatorio a los 3 y a los 7 días, cortes por estado, una sola vez, enlace nuevo, solo el contacto e historial.
-- Repetibles: terminan en rollback.
-- Uso: psql -f supabase/tests/recordatorio_quote.sql   (la última consulta lista cada prueba con ok = true/false).

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

-- Ejecuta como la service role (dueño de las funciones) y devuelve el valor o 'ERR:' y el código.
create function pg_temp.directo(consulta text) returns text language plpgsql as $$
declare resultado text;
begin
  begin
    execute consulta into resultado;
  exception when others then
    resultado := 'ERR:' || sqlstate;
  end;
  return resultado;
end $$;

create function pg_temp.prueba(nombre text, esperado text, obtenido text) returns void language sql as $$
  insert into resultados (prueba, ok, detalle) values (nombre, esperado is not distinct from obtenido,
    'esperado=' || coalesce(esperado, 'null') || ' obtenido=' || coalesce(obtenido, 'null'));
$$;

-- "Ahora" simulado: el recordatorio solo toma quotes enviados desde el 2026-11-17 (20261118000002, D-200), así que los
-- envíos de prueba se cuentan desde un día posterior al corte (o desde hoy, si ya es más tarde).
create function pg_temp.ahora() returns timestamptz language sql stable as $$
  select greatest(now(), timestamptz '2026-11-28 12:00:00-05')
$$;

-- Un lead con un sitio y una versión por caso; sent_at relativo al "ahora" simulado. El vencimiento explícito (vence)
-- se cuenta desde la hora real, porque expire_quotes usa now().
create function pg_temp.version(etiqueta text, dias numeric, estado quote_status, contacto text default 'cliente@prueba-rq.local',
                                vence interval default null) returns uuid language plpgsql as $$
declare l uuid; s uuid; q uuid; v uuid; w uuid := gen_random_uuid();
begin
  insert into leads (company, contact_name, email) values ('Empresa ' || etiqueta, 'Ana Cliente', 'lead-' || etiqueta || '@prueba-rq.local') returning id into l;
  insert into lead_sites (lead_id, address) values (l, '1 Main St, Naples, FL 34102') returning id into s;
  insert into walkthroughs (id, site_id) values (w, s);
  insert into quotes (site_id, lead_id, walkthrough_id) values (s, l, w) returning id into q;
  insert into quote_versions (quote_id, minor, walkthrough_version, status, contact_email, recipients, sent_at, expires_at, public_token_hash, snapshot)
  values (q, 0, 1, estado, contacto, array['otro@prueba-rq.local'], pg_temp.ahora() - make_interval(secs => dias * 86400),
          case when vence is null then pg_temp.ahora() + interval '20 days' else now() + vence end, 'hash-' || etiqueta,
          jsonb_build_object('company', 'Empresa ' || etiqueta, 'site', 'Oficina', 'language', 'en'))
  returning id into v;
  return v;
end $$;

create temp table casos (etiqueta text primary key, v uuid);
insert into casos values
  ('dos', pg_temp.version('dos', 2.9, 'sent')),
  ('tres', pg_temp.version('tres', 3.1, 'sent')),
  ('visto', pg_temp.version('visto', 4, 'viewed')),
  ('siete', pg_temp.version('siete', 7.2, 'viewed')),
  ('aceptado', pg_temp.version('aceptado', 5, 'accepted')),
  ('cambios', pg_temp.version('cambios', 5, 'changes_requested')),
  ('rechazado', pg_temp.version('rechazado', 5, 'rejected')),
  ('reemplazado', pg_temp.version('reemplazado', 5, 'superseded')),
  ('vencido', pg_temp.version('vencido', 5, 'sent', vence => interval '-1 hour')),
  ('sincorreo', pg_temp.version('sincorreo', 5, 'sent', contacto => null)),
  ('previo', pg_temp.version('previo', 5, 'sent'));
-- Enviado antes del corte (2026-11-16): no recibe recordatorios aunque ya pasaron más de 3 días.
update quote_versions set sent_at = timestamptz '2026-11-16 12:00:00-05' where id = (select v from casos where etiqueta = 'previo');

create temp table reclamo1 as select jsonb_array_elements(claim_quote_reminders(pg_temp.ahora())) j;
grant all on reclamo1 to public;

select pg_temp.prueba('califican: 3 días, vista a los 4 y 7 días', 'siete:7|tres:3|visto:3',
  (select string_agg(c.etiqueta || ':' || (r.j->>'step'), '|' order by c.etiqueta) from reclamo1 r join casos c on c.v = (r.j->>'version_id')::uuid));
select pg_temp.prueba('no califican: antes de 3 días, aceptado, negociado, rechazado, reemplazado, vencido, sin correo', '0',
  (select count(*)::text from reclamo1 r join casos c on c.v = (r.j->>'version_id')::uuid
    where c.etiqueta in ('dos', 'aceptado', 'cambios', 'rechazado', 'reemplazado', 'vencido', 'sincorreo')));
select pg_temp.prueba('un quote enviado antes del 2026-11-17 no recibe recordatorio', '0',
  (select count(*)::text from reclamo1 r where (r.j->>'version_id')::uuid = (select v from casos where etiqueta = 'previo')));
select pg_temp.prueba('el vencido pasó a Expirado', 'expired', (select status::text from quote_versions where id = (select v from casos where etiqueta = 'vencido')));
select pg_temp.prueba('solo al contacto del quote, no a los otros destinatarios', 'cliente@prueba-rq.local',
  (select string_agg(distinct r.j->>'to', ',') from reclamo1 r));
select pg_temp.prueba('enlace nuevo: el hash es el del token devuelto y el anterior queda en previos', 'ok',
  (select case when v.public_token_hash = encode(sha256(convert_to(r.j->>'token', 'UTF8')), 'hex') and 'hash-tres' = any (v.previous_token_hashes)
               then 'ok' else 'fallo' end
     from reclamo1 r join quote_versions v on v.id = (r.j->>'version_id')::uuid where v.id = (select v from casos where etiqueta = 'tres')));
select pg_temp.prueba('datos del correo', 'Empresa tres|Oficina|Ana Cliente|1.0',
  (select concat_ws('|', r.j->>'company', r.j->>'site', r.j->>'contact_name', r.j->>'version') from reclamo1 r where (r.j->>'version_id')::uuid = (select v from casos where etiqueta = 'tres')));
select pg_temp.prueba('a los 7 días sin el de 3: el de 3 queda saltado', '3:∅|7:∅',
  (select string_agg(step || ':' || coalesce(ok::text, '∅'), '|' order by step) from quote_reminders where version_id = (select v from casos where etiqueta = 'siete')));
select pg_temp.prueba('una sola vez: un segundo reclamo no devuelve nada', '0', (select jsonb_array_length(claim_quote_reminders(pg_temp.ahora()))::text));

-- Envío: marca e historial.
select mark_quote_reminder((select v from casos where etiqueta = 'tres'), 3::smallint, true);
select mark_quote_reminder((select v from casos where etiqueta = 'visto'), 3::smallint, false);
select pg_temp.prueba('marca el resultado', 'true|false',
  (select string_agg(ok::text, '|' order by c.etiqueta) from quote_reminders r join casos c on c.v = r.version_id where c.etiqueta in ('tres', 'visto') and r.step = 3));
select pg_temp.prueba('el enviado queda en el historial del lead', 'quote_recordatorio|1.0|3',
  (select concat_ws('|', g.action, g.detail->>'version', g.detail->>'kind') from change_log g
    where g.entity = 'leads' and g.action = 'quote_recordatorio' and g.entity_id = (select q.lead_id from quotes q join quote_versions v on v.quote_id = q.id where v.id = (select v from casos where etiqueta = 'tres'))));
select pg_temp.prueba('el fallido no queda en el historial', '0',
  (select count(*)::text from change_log g where g.action = 'quote_recordatorio'
      and g.entity_id = (select q.lead_id from quotes q join quote_versions v on v.quote_id = q.id where v.id = (select v from casos where etiqueta = 'visto'))));
select mark_quote_reminder((select v from casos where etiqueta = 'tres'), 3::smallint, true);
select pg_temp.prueba('marcar dos veces no duplica el historial', '1', (select count(*)::text from change_log where action = 'quote_recordatorio'));

-- A los 7 días, la que recibió el de 3 recibe el de 7.
select pg_temp.prueba('el de 7 días sale después del de 3', '7',
  (select string_agg(j->>'step', ',') from jsonb_array_elements(claim_quote_reminders(pg_temp.ahora() + interval '4 days')) j
    where (j->>'version_id')::uuid = (select v from casos where etiqueta = 'tres')));
update quote_versions set status = 'accepted' where id = (select v from casos where etiqueta = 'dos');
select pg_temp.prueba('si el cliente acepta antes de los 3 días, ya no sale', '0',
  (select count(*)::text from jsonb_array_elements(claim_quote_reminders(pg_temp.ahora() + interval '1 day')) j
    where (j->>'version_id')::uuid = (select v from casos where etiqueta = 'dos')));

-- Permisos: nadie fuera de la service role.
do $$
declare aid uuid := gen_random_uuid(); pid uuid;
begin
  insert into profiles (full_name, worker_type, role, email, has_app_access) values ('Prueba rq', 'w2', 'employee', 'rq@prueba-rq.local', true) returning id into pid;
  insert into auth.users (id, aud, role, email) values (aid, 'authenticated', 'authenticated', 'rq@prueba-rq.local');
  update profiles set auth_user_id = aid where id = pid;
  insert into actores values ('empleado', aid, pid);
  insert into profile_permissions (profile_id, permission_key) select pid, k from unnest(array['quotes_ver', 'quotes_enviar', 'leads_ver']) k;
end $$;
select pg_temp.prueba('un empleado no reclama recordatorios', 'ERR:42501', pg_temp.valor('empleado', 'select claim_quote_reminders()::text'));
select pg_temp.prueba('un empleado no marca', 'ERR:42501', pg_temp.valor('empleado', format('select mark_quote_reminder(%L, 3::smallint, true)::text', (select v from casos where etiqueta = 'dos'))));
select pg_temp.prueba('anon no reclama', 'ERR:42501', pg_temp.valor('anon', 'select claim_quote_reminders()::text'));
select pg_temp.prueba('el empleado ve el recordatorio en la línea de tiempo del lead', 'quote_recordatorio|1.0',
  pg_temp.valor('empleado', format('select action || %L || template from entity_email_log(%L, %L)', '|', 'lead',
    (select q.lead_id from quotes q join quote_versions v on v.quote_id = q.id where v.id = (select v from casos where etiqueta = 'tres')))));

select n, prueba, ok, detalle from resultados order by n;
rollback;
