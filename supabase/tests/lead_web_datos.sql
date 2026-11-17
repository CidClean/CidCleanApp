-- Pruebas de la orden 110 (migración 20261117000001, D-317 y D-319 1-3): lead web con City/State/ZIP en sus campos,
-- sin "Website estimate" ni la persona como empresa, tipo/sq ft/frecuencia como datos del sitio, dirección del
-- walkthrough al sitio del lead, y cliente y jobsite con los datos ya capturados. Repetibles: terminan en rollback.
-- Uso: psql -f supabase/tests/lead_web_datos.sql   (la última consulta lista cada prueba con ok = true/false).

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
  foreach quien in array array['ventas'] loop
    aid := gen_random_uuid();
    insert into profiles (full_name, worker_type, role, email, has_app_access)
    values ('Prueba ' || quien, 'w2', 'employee', quien || '@prueba-lw.local', true) returning id into pid;
    insert into auth.users (id, aud, role, email) values (aid, 'authenticated', 'authenticated', quien || '@prueba-lw.local');
    update profiles set auth_user_id = aid where id = pid;
    insert into actores values (quien, aid, pid);
  end loop;
  insert into profile_permissions (profile_id, permission_key)
    select profile_id, k from actores, unnest(array['quotes_ver', 'quotes_editar', 'quotes_ver_precios', 'quotes_enviar',
      'sow_contratos_subir_ver', 'leads_ver', 'leads_editar', 'walkthroughs_hacer']) k where nombre = 'ventas';
end $$;

-- Ayudas ----------------------------------------------------------------------------------------------------------
select pg_temp.prueba('teléfono 10 dígitos (D-216)', '(239) 555-0142', us_phone_format('239.555.0142'));
select pg_temp.prueba('teléfono con 1 delante', '(239) 555-0142', us_phone_format('+1 239 555 0142'));
select pg_temp.prueba('nombre del lead sin empresa = contacto', 'Ana Web', lead_display_name(null, 'Ana Web'));
select pg_temp.prueba('etiqueta de sitio sin nombre ni dirección', 'Naples, FL', lead_site_label(null, null));

-- 1. site_submit --------------------------------------------------------------------------------------------------
do $$
declare r jsonb;
begin
  r := site_submit('estimate', 'Ana Web', '', 'ana@prueba-lw.local', '239-555-0142', 'Bonita Springs', '34135', 'retail', 3000, 'weekly_3', null, 'lw1');
  perform pg_temp.prueba('lead web sin empresa: company vacía, teléfono con formato', '∅|Ana Web|(239) 555-0142',
    (select coalesce(company, '∅') || '|' || contact_name || '|' || phone from leads where id = (r->>'lead_id')::uuid));
  perform pg_temp.prueba('sitio sin nombre; City, State y ZIP en sus campos; sin calle, para completar',
    '∅|∅|Bonita Springs|FL|34135|t|Bonita Springs, FL 34135',
    (select concat_ws('|', coalesce(name, '∅'), coalesce(address_line1, '∅'), city, state, zip, address_needs_review, address)
       from lead_sites where lead_id = (r->>'lead_id')::uuid));
  perform pg_temp.prueba('tipo, sq ft y frecuencia como datos del sitio', 'retail|3000|weekly_3',
    (select concat_ws('|', facility_type, sqft, web_frequency) from lead_sites where lead_id = (r->>'lead_id')::uuid));
  r := site_submit('contact', 'Luis Web', 'Luis LLC', 'luis@prueba-lw.local', '2395550199', 'Naples', '', null, null, null, 'Hello there, we need a quote.', 'lw2');
  perform pg_temp.prueba('mensaje con empresa: company = empresa; sitio con solo City y State', 'Luis LLC|Naples|FL|∅|∅',
    (select l.company || '|' || concat_ws('|', s.city, s.state, coalesce(s.zip, '∅'), coalesce(s.facility_type, '∅'))
       from leads l join lead_sites s on s.lead_id = l.id where l.id = (r->>'lead_id')::uuid));
end $$;

-- 2. Disparador: City, State y ZIP sin calle se conservan; al poner la calle se completa --------------------------
do $$
declare s uuid;
begin
  select id into s from lead_sites where lead_id = (select id from leads where email = 'ana@prueba-lw.local');
  update lead_sites set address_line1 = '280 Commercial Blvd' where id = s;
  perform pg_temp.prueba('con la calle queda completa', '280 Commercial Blvd, Bonita Springs, FL 34135|false',
    (select address || '|' || address_needs_review from lead_sites where id = s));
  update lead_sites set address_line1 = null where id = s;
  perform pg_temp.prueba('sin calle otra vez: conserva City, State y ZIP', 'Bonita Springs|FL|34135|t',
    (select concat_ws('|', city, state, zip, address_needs_review) from lead_sites where id = s));
end $$;
insert into clients (name, state) values ('Solo State LW', 'FL');
select pg_temp.prueba('cliente con solo State (formulario vacío): no se guarda', '∅|∅',
  (select coalesce(address, '∅') || '|' || coalesce(state, '∅') from clients where name = 'Solo State LW'));

-- 3. Datos existentes: la corrección de la migración --------------------------------------------------------------
do $$
declare l uuid; s uuid;
begin
  insert into leads (company, contact_name, phone, email, source) values ('Vieja Web', 'Vieja Web', '2395550111', 'vieja@prueba-lw.local', 'web')
  returning id into l;
  insert into lead_sites (lead_id, name, address) values (l, 'Website estimate', 'Naples, FL 34114') returning id into s;
  insert into site_submissions (kind, email, email_key, lead_id, attached, city, zip, type_name, sqft, frequency_name)
  values ('estimate', 'vieja@prueba-lw.local', 'vieja@prueba-lw.local', l, false, 'Naples', '34114', 'Office', 1800, 'Every 2 weeks');
  perform pg_temp.prueba('antes: el texto quedó en Dirección', 'Naples, FL 34114|true', (select address_line1 || '|' || address_needs_review from lead_sites where id = s));
end $$;

-- Se vuelve a correr la corrección de datos de la migración (idempotente).
-- Datos existentes ---------------------------------------------------------------------------------------------------

-- Sitios de leads web: "Ciudad, FL ZIP" (o "FL ZIP", "FL") en Dirección → City, State y ZIP; sin "Website …" de nombre.
update lead_sites s set address_line1 = null, address_line2 = null,
       city = nullif(btrim(x.m[1]), ''), state = 'FL', zip = x.m[2]
  from (select ls.id, regexp_match(coalesce(ls.address_line1, ''), '^(?:([^,0-9]+),\s*)?FL(?:\s+([0-9]{5}(?:-[0-9]{4})?))?$') m
          from lead_sites ls join leads l on l.id = ls.lead_id where l.source = 'web') x
 where x.id = s.id and x.m is not null;
update lead_sites s set name = null
  from leads l where l.id = s.lead_id and l.source = 'web' and s.name ~ '^Website (estimate|contact)$';
-- Jobsites que nacieron con ese nombre: toman su dirección.
update jobsites set name = coalesce(nullif(btrim(address), ''), 'Naples, FL') where name ~ '^Website (estimate|contact)$';

-- Leads web con el nombre de la persona como empresa: la empresa queda para completar. Teléfono como D-216.
update leads set company = null where source = 'web' and btrim(company) = btrim(coalesce(contact_name, ''));
update leads set phone = us_phone_format(phone) where source = 'web' and phone is not null;

-- Tipo, sq ft y frecuencia desde la solicitud que creó el lead (claves del estimador).
update lead_sites s set
       facility_type = coalesce(s.facility_type, (select x->>'key' from estimator_settings e, jsonb_array_elements(e.place_types) x
                                                   where x->>'name' = sub.type_name limit 1)),
       sqft = coalesce(s.sqft, sub.sqft),
       web_frequency = coalesce(s.web_frequency, (select x->>'key' from estimator_settings e, jsonb_array_elements(e.frequencies) x
                                                   where x->>'name' = sub.frequency_name limit 1))
  from (select distinct on (lead_id) lead_id, type_name, sqft, frequency_name
          from site_submissions where kind = 'estimate' and not attached and lead_id is not null
         order by lead_id, created_at) sub
 where sub.lead_id = s.lead_id
   and s.id = (select x.id from lead_sites x where x.lead_id = s.lead_id order by x.created_at, x.id limit 1);


select pg_temp.prueba('después: City, State y ZIP en sus campos, sin nombre', '∅|∅|Naples|FL|34114|t',
  (select concat_ws('|', coalesce(name, '∅'), coalesce(address_line1, '∅'), city, state, zip, address_needs_review)
     from lead_sites where lead_id = (select id from leads where email = 'vieja@prueba-lw.local')));
select pg_temp.prueba('después: empresa vacía y teléfono con formato', '∅|(239) 555-0111',
  (select coalesce(company, '∅') || '|' || phone from leads where email = 'vieja@prueba-lw.local'));
select pg_temp.prueba('después: tipo, sq ft y frecuencia desde la solicitud', 'office|1800|biweekly',
  (select concat_ws('|', facility_type, sqft, web_frequency) from lead_sites
    where lead_id = (select id from leads where email = 'vieja@prueba-lw.local')));

-- 4 y 5. Walkthrough cerrado → sitio del lead; aceptación → cliente y jobsite ---------------------------------------
create temp table fx (k text primary key, id uuid);
grant all on fx to public;
do $$
declare
  l uuid := (select id from leads where email = 'ana@prueba-lw.local');
  s uuid := (select id from lead_sites where lead_id = (select id from leads where email = 'ana@prueba-lw.local'));
  w uuid := gen_random_uuid(); q uuid; v uuid; r jsonb; j uuid;
  d jsonb := '{"contact":{"address":"280 Commercial Blvd, Suite 4, Bonita Springs, FL 34135","addressLine1":"280 Commercial Blvd","addressLine2":"Suite 4","city":"Bonita Springs","state":"FL","zip":"34135","contactName":"Ana Web","phone":"(239) 555-0142","email":"ana@prueba-lw.local","general":""},"site":{"facilityType":"retail","sqft":3200,"schedule":"After 5:00 PM","estHours":2.5},"areas":[],"frequency":{"kind":"weekly","days":[0,2,4],"other":""},"internal":{"staff":"","time":"","supplies":""}}';
  ln jsonb := '{"services":[{"label":"Limpieza","amount":1000,"taxable":true}],"addons":[],"discounts":[]}';
begin
  insert into walkthroughs (id, site_id, status, current_version, draft) values (w, s, 'draft', 0, d);
  perform pg_temp.prueba('cerrar el walkthrough', '1', pg_temp.valor('ventas', format('select close_walkthrough(%L)', w)));
  perform pg_temp.prueba('la dirección del walkthrough pasa al sitio del lead', '280 Commercial Blvd|Suite 4|Bonita Springs|FL|34135|f',
    (select concat_ws('|', address_line1, address_line2, city, state, zip, address_needs_review) from lead_sites where id = s));
  perform pg_temp.prueba('crear el quote', 'ok', case when pg_temp.valor('ventas', format('select ensure_quote(%L)', s)) like 'ERR%' then pg_temp.valor('ventas', format('select ensure_quote(%L)', s)) else 'ok' end);
  select id into q from quotes where site_id = s;
  select id into v from quote_versions where quote_id = q;
  perform pg_temp.valor('ventas', format('select save_quote_draft(%L, %L, 6, 30, null)', v, ln));
  update quote_versions set sow_path = 'x/y/sow.pdf', valid_days = 30 where id = v;
  perform pg_temp.prueba('enviar', 'ok', case when pg_temp.directo(format('select confirm_send_quote(%L, %L, %L, %L)::text', v, (select profile_id from actores where nombre = 'ventas'), 'x/y/quote.pdf', '{"company":"Ana Web","site":"x","language":"en"}')) like 'ERR%' then 'fallo' else 'ok' end);
  if v is null then return; end if;
  insert into quote_portal_sessions (token_hash, version_id, email, expires_at, sow_opened_at) values ('ses-lw', v, 'ana@prueba-lw.local', now() + interval '1 hour', now());
  r := portal_decide('ses-lw', 'accepted', 'Ana Web', 'Owner', null, null, true, '1.2.3.4', 'Prueba');
  perform pg_temp.prueba('aceptar devuelve el nombre del contacto como empresa', 'Ana Web', r->>'company');
  perform pg_temp.prueba('el cliente nace con nombre, teléfono, correo y dirección', 'Ana Web|(239) 555-0142|ana@prueba-lw.local|280 Commercial Blvd, Suite 4, Bonita Springs, FL 34135',
    (select concat_ws('|', name, phone, email, address) from clients where lead_id = l));
  j := (r->>'jobsite_id')::uuid;
  perform pg_temp.prueba('el jobsite nace con la dirección completa, sin "Website", con sq ft, tipo, horario y horas',
    '280 Commercial Blvd, Suite 4, Bonita Springs, FL 34135|280 Commercial Blvd, Suite 4, Bonita Springs, FL 34135|34135|3200|retail|After 5:00 PM|2.50',
    (select concat_ws('|', name, address, zip, sqft, facility_type, service_schedule, est_hours_per_visit) from jobsites where id = j));
end $$;

select n, prueba, ok, detalle from resultados order by n;
rollback;
