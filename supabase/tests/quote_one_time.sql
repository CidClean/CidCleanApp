-- Pruebas de la orden 162 (migración 20261122000003, D-349, D-350 (4)): quote one-time. Crear sin walkthrough, guardar
-- precio total, fecha, hora y alcance (residencial sin impuesto), enviar sin SOW, portal y aceptar: cliente con el
-- nombre de la persona, jobsite one-time sin tarifa mensual, una visita y un ingreso único el mes del servicio; P&L.
-- Las funciones de la app se prueban como `authenticated`. Repetibles: terminan en rollback.
-- Uso: psql -f supabase/tests/quote_one_time.sql   (la última consulta lista cada prueba con ok = true/false).

begin;

create temp table resultados (n int generated always as identity, prueba text, ok boolean, detalle text);
create temp table actores (nombre text primary key, auth_id uuid, profile_id uuid);
create temp table ids (nombre text primary key, id uuid, txt text);
grant all on resultados, actores, ids to public;

-- Ejecuta una consulta como una persona autenticada (super1 = Super Admin con aal1), anon o la service role, y
-- devuelve el primer valor como texto, o 'ERR:' y el código de error si falla.
create function pg_temp.valor(quien text, consulta text) returns text language plpgsql as $$
declare
  resultado text;
  uid uuid;
begin
  if quien = 'anon' then
    perform set_config('request.jwt.claims', '{"role":"anon"}', true);
    set local role anon;
  elsif quien = 'servicio' then
    perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
    set local role service_role;
  else
    select auth_id into uid from actores where nombre = case when quien = 'super1' then 'super' else quien end;
    perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated',
      'aal', case when quien = 'super1' then 'aal1' else 'aal2' end)::text, true);
    set local role authenticated;
  end if;
  begin
    execute consulta into resultado;
  exception when others then
    resultado := 'ERR:' || sqlstate;
  end;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  return resultado;
end $$;

create function pg_temp.prueba(nombre text, esperado text, obtenido text) returns void language sql as $$
  insert into resultados (prueba, ok, detalle) values (nombre, esperado is not distinct from obtenido,
    'esperado=' || coalesce(esperado, 'null') || ' obtenido=' || coalesce(obtenido, 'null'));
$$;

create function pg_temp.th(t text) returns text language sql immutable as $$ select encode(sha256(convert_to(t, 'UTF8')), 'hex') $$;

-- Actores: ventas (leads y quotes completos), mira (solo quotes_ver) y el Super Admin (P&L).
do $$
declare
  quien text;
  pid uuid;
  aid uuid;
begin
  foreach quien in array array['ventas', 'mira'] loop
    aid := gen_random_uuid();
    insert into profiles (full_name, worker_type, role, email, has_app_access)
    values ('Prueba ' || quien, 'w2', 'employee', quien || '@prueba-ot.local', true) returning id into pid;
    insert into auth.users (id, aud, role, email) values (aid, 'authenticated', 'authenticated', quien || '@prueba-ot.local');
    insert into actores values (quien, aid, pid);
  end loop;
  insert into profile_permissions (profile_id, permission_key)
  select a.profile_id, p.k from actores a
    join (values ('ventas', 'leads_ver'), ('ventas', 'leads_editar'), ('ventas', 'quotes_ver'), ('ventas', 'quotes_editar'),
                 ('ventas', 'quotes_ver_precios'), ('ventas', 'quotes_enviar'), ('mira', 'quotes_ver')) as p(n, k) on p.n = a.nombre;
  select id, auth_user_id into pid, aid from profiles where is_super_admin;
  if aid is null then
    aid := gen_random_uuid();
    insert into auth.users (id, aud, role, email) values (aid, 'authenticated', 'authenticated', 'super@prueba-ot.local');
    update profiles set auth_user_id = aid where id = pid;
  end if;
  insert into actores values ('super', aid, pid);
end $$;

do $$
declare
  lead uuid;
  rec uuid;
  sitio uuid;
  sitio2 uuid;
  q uuid;
  v uuid;
  tok text;
  ventas uuid := (select profile_id from actores where nombre = 'ventas');
  dia date := cc_today() + 8;
  r jsonb;
  js uuid;
  cl uuid;
begin
  -- Lead residencial one-time sin empresa y su sitio (sin walkthrough).
  insert into leads (contact_name, phone, email, source, service, cleaning_type, status)
  values ('Maria Gonzalez', '(239) 555-0142', 'maria@prueba-ot.local', 'manual', 'one_time', 'residential', 'interested') returning id into lead;
  insert into lead_sites (lead_id, address_line1, city, state, zip) values (lead, '10 Palm St', 'Naples', 'FL', '34102') returning id into sitio;
  insert into leads (company, source) values ('Recurrente SA', 'manual') returning id into rec;
  insert into lead_sites (lead_id, address_line1, city, state, zip) values (rec, '1 Main St', 'Naples', 'FL', '34102') returning id into sitio2;

  -- Crear: walkthrough opcional; solo leads one-time; permisos
  perform pg_temp.prueba('quien solo ve quotes no crea el one-time', 'ERR:42501', pg_temp.valor('mira', format('select ensure_one_time_quote(%L)', sitio)));
  perform pg_temp.prueba('un lead recurrente no lleva quote one-time', 'ERR:22023', pg_temp.valor('ventas', format('select ensure_one_time_quote(%L)', sitio2)));
  q := pg_temp.valor('ventas', format('select ensure_one_time_quote(%L)', sitio))::uuid;
  perform pg_temp.prueba('se crea sin walkthrough: kind one_time y borrador 1.0 con el correo del lead', 'one_time|true|draft|maria@prueba-ot.local',
    (select x.kind || '|' || (x.walkthrough_id is null)::text || '|' || qv.status || '|' || qv.contact_email from quotes x join quote_versions qv on qv.quote_id = x.id where x.id = q));
  perform pg_temp.prueba('crear otra vez devuelve el mismo', q::text, pg_temp.valor('ventas', format('select ensure_one_time_quote(%L)', sitio)));
  perform pg_temp.prueba('el quote mensual del sitio no se crea encima (sin walkthrough)', 'ERR:22023', pg_temp.valor('ventas', format('select ensure_quote(%L)', sitio2)));
  select id into v from quote_versions where quote_id = q;

  -- Guardar: precio total, fecha y hora, alcance; residencial sin impuesto (regla existente)
  perform pg_temp.prueba('quien solo ve quotes no guarda', 'ERR:42501',
    pg_temp.valor('mira', format($q$select save_one_time_quote(%L, 480, %L, '09:00', 'Move-out', 30, '{}')$q$, v, dia)));
  perform pg_temp.prueba('precio negativo no', 'ERR:22023',
    pg_temp.valor('ventas', format($q$select save_one_time_quote(%L, -1, %L, '09:00', 'Move-out', 30, '{}')$q$, v, dia)));
  perform pg_temp.valor('ventas', format($q$select save_one_time_quote(%L, 480, %L, '09:00', 'Full move-out clean: kitchen, 2 baths, floors.', 30, '{}')$q$, v, dia));
  perform pg_temp.prueba('borrador: total 480 sin tax (residencial), fecha, hora y alcance', '480.00|0.00|480.00|' || dia || '|09:00|Full move-out clean: kitchen, 2 baths, floors.',
    (select subtotal || '|' || tax || '|' || total || '|' || service_date || '|' || to_char(service_time, 'HH24:MI') || '|' || scope from quote_versions where id = v));
  perform pg_temp.prueba('el editor lo lee con hora y alcance', '09:00|Full move-out clean: kitchen, 2 baths, floors.|Maria Gonzalez',
    pg_temp.valor('ventas', format($q$select (d->'versions'->0->>'service_time') || '|' || (d->'versions'->0->>'scope') || '|' || (d->>'company') from (select get_one_time_quote(%L) d) z$q$, sitio)));

  -- Enviar: sin SOW, como un extra con hora y alcance
  r := pg_temp.valor('ventas', format('select prepare_send_quote(%L)', v))::jsonb;
  perform pg_temp.prueba('preparar el envío: sin SOW, total de una vez, fecha, hora y alcance', 'true|true|' || dia || '|09:00|Maria Gonzalez|480.00',
    (r->>'extra') || '|' || (r->>'one_time') || '|' || (r->>'service_date') || '|' || (r->>'visit_time') || '|' || (r->>'company') || '|' || (r->>'total'));
  tok := pg_temp.th(confirm_send_quote(v, ventas, q || '/' || v || '/quote-1.0.pdf',
    jsonb_build_object('language', 'en', 'company', 'Maria Gonzalez', 'site', '10 Palm St', 'extra', true, 'service_date', dia, 'visit_time', '09:00'))->>'token');
  perform pg_temp.prueba('enviado y lead en Quote enviado', 'sent|quote_sent', (select status::text from quote_versions where id = v) || '|' || (select status::text from leads where id = lead));
  perform portal_request_code(tok, 'maria@prueba-ot.local', 'h1');
  perform portal_verify_code(tok, 'maria@prueba-ot.local', 'h1', 'sesot');
  perform pg_temp.prueba('portal: precio total, fecha, hora y alcance; sin texto legal mensual (casilla del extra)', 'true|true|480.00|' || dia || '|09:00|Full move-out clean: kitchen, 2 baths, floors.|null',
    (select (d->>'extra') || '|' || (d->>'one_time') || '|' || (d->>'total') || '|' || (d->>'service_date') || '|' || (d->>'service_time') || '|' || (d->>'scope') || '|' || coalesce(d->>'acceptance_text', 'null') from (select portal_quote('sesot') d) z));

  -- Aceptar
  r := portal_decide('sesot', 'accepted', 'Maria Gonzalez', 'Owner', null, null, true, '1.2.3.4', 'UA');
  perform pg_temp.prueba('aceptar: devuelve one-time con jobsite', 'accepted|true|true',
    (r->>'kind') || '|' || (r->>'one_time') || '|' || (r->>'jobsite_id' is not null)::text);
  js := (r->>'jobsite_id')::uuid;
  select client_id into cl from jobsites where id = js;
  perform pg_temp.prueba('cliente con el nombre de la persona (residencial)', 'Maria Gonzalez', (select name from clients where id = cl));
  perform pg_temp.prueba('jobsite one-time con su fecha, activo, residencial, sin contrato pendiente', 'true|' || dia || '|active|residential|both_signed',
    (select one_time::text || '|' || one_time_on || '|' || status || '|' || cleaning_type || '|' || contract_status from jobsites where id = js));
  perform pg_temp.prueba('sin tarifa mensual', '0', (select count(*)::text from jobsite_rates where jobsite_id = js));
  perform pg_temp.prueba('una sola visita en esa fecha a las 9:00 AM (Naples)', '1|' || dia || '|09:00|120',
    (select count(*)::text || '|' || min(local_date) || '|' || to_char(min(starts_at) at time zone cc_tz(), 'HH24:MI') || '|' || min(minutes) from visits where jobsite_id = js));
  perform pg_temp.prueba('ingreso único el mes del servicio', '1|' || month_start(dia) || '|480.00',
    (select count(*)::text || '|' || min(month) || '|' || sum(amount) from income_extras where jobsite_id = js));
  perform pg_temp.prueba('lead Ganado', 'won', (select status::text from leads where id = lead));
  perform pg_temp.prueba('la generación mensual no le crea ingreso mensual', '0',
    (select (generate_accounting(dia + 40) is not null)::int * 0 + count(*)::int from income_expected where jobsite_id = js and amount is not null)::text);

  -- P&L: cuenta el ingreso una vez cuando se marca recibido, y nada de tarifa mensual
  update income_expected set received = true, received_on = dia, received_at = now() + interval '1 second' where jobsite_id = js;
  perform pg_temp.prueba('P&L: el one-time entra una vez (480, sin tarifa mensual)', '480.00',
    (select (p->>'income') from (select (pg_temp.valor('super', format('select profit_and_loss(%s)', extract(year from dia)::int)))::jsonb p) z));
end $$;

select n, prueba, ok, detalle from resultados order by n;
-- FIN-DE-PRUEBAS
rollback;
