-- Pruebas de la orden 112 (migración 20261117000002, D-318 1 y 5, D-320 2): SOW armado en la app desde el walkthrough,
-- editable en el borrador, obligatorio para enviar (salvo extras), copiado a la versión nueva y usado como Parte A del
-- contrato. Repetibles: terminan en rollback. Uso: psql -f supabase/tests/sow.sql

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


do $$
declare quien text; pid uuid; aid uuid;
begin
  foreach quien in array array['ventas', 'mirar'] loop
    aid := gen_random_uuid();
    insert into profiles (full_name, worker_type, role, email, has_app_access)
    values ('Prueba ' || quien, 'w2', 'employee', quien || '@prueba-sow.local', true) returning id into pid;
    insert into auth.users (id, aud, role, email) values (aid, 'authenticated', 'authenticated', quien || '@prueba-sow.local');
    update profiles set auth_user_id = aid where id = pid;
    insert into actores values (quien, aid, pid);
  end loop;
  insert into profile_permissions (profile_id, permission_key)
    select profile_id, k from actores, unnest(array['quotes_ver', 'quotes_editar', 'quotes_ver_precios', 'quotes_enviar',
      'sow_contratos_subir_ver', 'leads_ver', 'leads_editar']) k where nombre = 'ventas';
  insert into profile_permissions (profile_id, permission_key)
    select profile_id, 'quotes_ver' from actores where nombre = 'mirar';
end $$;

create temp table fx (k text primary key, id uuid);
grant all on fx to public;
do $$
declare
  l uuid; s uuid; w uuid := gen_random_uuid(); q uuid; v uuid;
  ln jsonb := '{"services":[{"label":"Limpieza","amount":1000,"taxable":true}],"addons":[],"discounts":[]}';
begin
  insert into leads (company, contact_name, phone, email) values ('Superior Pool LLC', 'Armando Z', '(239) 825-6841', 'armando@prueba-sow.local') returning id into l;
  insert into lead_sites (lead_id, address) values (l, '280 Commercial Blvd, Naples, FL 34104') returning id into s;
  insert into walkthroughs (id, site_id, status, current_version, closed_at) values (w, s, 'closed', 1, now());
  insert into walkthrough_versions (walkthrough_id, version, data) values (w, 1,
    '{"contact":{"address":"280 Commercial Blvd, Naples, FL 34104","addressLine1":"280 Commercial Blvd","addressLine2":"","city":"Naples","state":"FL","zip":"34104","contactName":"Armando Z","phone":"(239) 825-6841","email":"armando@prueba-sow.local","general":""},
      "site":{"facilityType":"retail","sqft":3000,"schedule":"After 5:00 PM","estHours":2.5},
      "areas":[{"type":"bathroom","name":"Baño 01","specialRequest":"No bleach"},{"type":"bathroom","name":"Baño 02"},{"type":"office","name":"Oficina 01"}],
      "frequency":{"kind":"weekly","days":[0,2,4],"other":""},"internal":{"staff":"","time":"","supplies":""}}');
  perform pg_temp.valor('ventas', format('select ensure_quote(%L)', s));
  select id into q from quotes where site_id = s;
  select id into v from quote_versions where quote_id = q;
  perform pg_temp.valor('ventas', format('select save_quote_draft(%L, %L, 6, 30, null)', v, ln));
  insert into fx values ('lead', l), ('site', s), ('q', q), ('v', v);
end $$;

-- Armado desde el walkthrough ------------------------------------------------------------------------------------------
select pg_temp.prueba('A1 desde el lead y el walkthrough', 'Superior Pool LLC|Armando Z, (239) 825-6841|280 Commercial Blvd, Naples, FL 34104|3,000|Retail / showroom',
  (select concat_ws('|', f->>'client_company', f->>'client_contact', f->>'site_address', f->>'area_sqft', f->>'facility_type')
     from (select (pg_temp.valor('ventas', format('select quote_sow(%L)::text', (select id from fx where k = 'v')))::jsonb)->'fields' f) x));
select pg_temp.prueba('áreas contadas por tipo', '3 areas: 2 restrooms, 1 office',
  (select (pg_temp.valor('ventas', format('select quote_sow(%L)::text', (select id from fx where k = 'v')))::jsonb)->'fields'->>'floors_rooms'));
select pg_temp.prueba('A2: frecuencia y horario del walkthrough; inicio por definir', '3 days per week: Monday, Wednesday, Friday|After 5:00 PM|',
  (select concat_ws('|', f->>'frequency', f->>'service_window', f->>'start_date')
     from (select (pg_temp.valor('ventas', format('select quote_sow(%L)::text', (select id from fx where k = 'v')))::jsonb)->'fields' f) x));
select pg_temp.prueba('A3: sin cocina ni lobby, esas filas quedan vacías', 'Offices / workstations|Restrooms|||Hard floors',
  (select concat_ws('|', f->>'a3_offices_area', f->>'a3_restrooms_area', f->>'a3_breakroom_area', f->>'a3_entrances_area', f->>'a3_floors_area')
     from (select (pg_temp.valor('ventas', format('select quote_sow(%L)::text', (select id from fx where k = 'v')))::jsonb)->'fields' f) x));
select pg_temp.prueba('A4: el pedido especial entra como aclaración', 'Baño 01: No bleach',
  (select (pg_temp.valor('ventas', format('select quote_sow(%L)::text', (select id from fx where k = 'v')))::jsonb)->'fields'->>'a4_clarifications'));
select pg_temp.prueba('falta solo el almacén (A6 y A7 opcionales)', '["storage"]',
  (select ((pg_temp.valor('ventas', format('select quote_sow(%L)::text', (select id from fx where k = 'v')))::jsonb)->'missing')::text));
select pg_temp.prueba('el SOW no lleva precio', 'false',
  (select ((pg_temp.valor('ventas', format('select quote_sow(%L)::text', (select id from fx where k = 'v')))::jsonb)->'fields' ? 'price')::text));
select pg_temp.prueba('número del SOW = el del quote', 'true',
  (select (j->>'sow_no' = replace(j->>'quote_no', 'Q-', 'SOW-'))::text
     from (select pg_temp.valor('ventas', format('select quote_sow(%L)::text', (select id from fx where k = 'v')))::jsonb j) x));

-- Permisos y envío -----------------------------------------------------------------------------------------------------
select pg_temp.prueba('con quotes_ver se ve pero no se edita', 'false',
  (select (pg_temp.valor('mirar', format('select quote_sow(%L)::text', (select id from fx where k = 'v')))::jsonb->>'editable')));
select pg_temp.prueba('sin permiso de editar no se guarda (42501)', 'ERR:42501',
  pg_temp.valor('mirar', format('select save_quote_sow(%L, %L)::text', (select id from fx where k = 'v'), '{"storage":"Closet"}')));
select pg_temp.prueba('llave que no es del SOW: rechazada (22023)', 'ERR:22023',
  pg_temp.valor('ventas', format('select save_quote_sow(%L, %L)::text', (select id from fx where k = 'v'), '{"price":"$1"}')));
select pg_temp.prueba('sin el almacén no se envía (22023)', 'ERR:22023',
  pg_temp.valor('ventas', format('select prepare_send_quote(%L)::text', (select id from fx where k = 'v'))));
select pg_temp.prueba('guardar el almacén y una aclaración', '[]',
  (select ((pg_temp.valor('ventas', format('select save_quote_sow(%L, %L)::text', (select id from fx where k = 'v'),
     '{"storage":"Janitor closet","a4_clarifications":"No windows or glass."}')))::jsonb->'missing')::text));
select pg_temp.prueba('ahora sí se puede enviar y trae el SOW', 'Janitor closet|No windows or glass.',
  (select concat_ws('|', j->'sow'->'fields'->>'storage', j->'sow'->'fields'->>'a4_clarifications')
     from (select send_quote_data((select id from fx where k = 'v')) j) x));

-- Envío, versión nueva y contrato -------------------------------------------------------------------------------------
do $$
declare v uuid := (select id from fx where k = 'v'); q uuid := (select id from fx where k = 'q'); v2 uuid; r jsonb; j uuid; c jsonb;
begin
  perform confirm_quote_sow(v, sow_effective_fields(v), 'x/y/sow-v1-0.pdf');
  perform confirm_send_quote(v, (select profile_id from actores where nombre = 'ventas'), 'x/y/quote.pdf', '{"company":"Superior Pool LLC","site":"x","language":"en"}');
  perform pg_temp.prueba('al enviar quedan el PDF del SOW y sus datos con la versión', 'x/y/sow-v1-0.pdf|Janitor closet',
    (select sow_path || '|' || (sow_fields->>'storage') from quote_versions where id = v));
  perform pg_temp.prueba('enviado: el SOW ya no se edita (22023)', 'ERR:22023',
    pg_temp.valor('ventas', format('select save_quote_sow(%L, %L)::text', v, '{"storage":"Otro"}')));
  v2 := (pg_temp.valor('ventas', format('select new_quote_version(%L)', q)))::uuid;
  perform pg_temp.prueba('la versión nueva parte del SOW corregido', 'Janitor closet|No windows or glass.',
    (select (sow_fields->>'storage') || '|' || (sow_fields->>'a4_clarifications') from quote_versions where id = v2));
  delete from quote_versions where id = v2;
  update quote_versions set status = 'sent' where id = v;
  insert into quote_portal_sessions (token_hash, version_id, email, expires_at, sow_opened_at) values ('ses-sow', v, 'armando@prueba-sow.local', now() + interval '1 hour', now());
  r := portal_decide('ses-sow', 'accepted', 'Armando Z', 'Branch Manager', null, null, true, '1.2.3.4', 'Prueba');
  j := (r->>'jobsite_id')::uuid;
  c := contract_default_fields(j, v);
  perform pg_temp.prueba('el contrato toma la Parte A del SOW aceptado', 'Janitor closet|No windows or glass.|3,000|Retail / showroom|3 areas: 2 restrooms, 1 office',
    concat_ws('|', c->>'storage', c->>'a4_clarifications', c->>'area_sqft', c->>'facility_type', c->>'floors_rooms'));
  perform pg_temp.prueba('acceso, llaves, áreas restringidas e inspecciones no faltan (opcionales)', 'false',
    (select (contract_missing_fields(c) && array['access_method', 'keys_count', 'restricted_areas', 'inspections', 'a4_clarifications'])::text));
end $$;

select n, prueba, ok, detalle from resultados order by n;
rollback;
