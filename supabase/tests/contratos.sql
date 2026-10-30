-- Pruebas de la orden 62 (migración 20261030000013, D-283): contrato del cliente, portal de firma y contrafirma.
-- Repetibles: terminan en rollback. Uso: psql -f supabase/tests/contratos.sql (la última consulta lista cada prueba).

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

-- Personas y datos de prueba -------------------------------------------------------------------------------
do $$
declare
  pid uuid; aid uuid := gen_random_uuid();
begin
  insert into profiles (full_name, worker_type, role, email, has_app_access)
  values ('Prueba clientes', 'w2', 'employee', 'clientes@prueba.local', true) returning id into pid;
  insert into auth.users (id, aud, role, email) values (aid, 'authenticated', 'authenticated', 'clientes@prueba.local');
  insert into actores values ('clientes', aid, pid);
  insert into profile_permissions (profile_id, permission_key)
    select pid, k from unnest(array['clientes_ver', 'clientes_editar_datos', 'clientes_ver_tarifa', 'schedule_ver_editar']) k;
  -- El Super Admin sembrado (D-144), con un usuario de Auth de prueba.
  aid := gen_random_uuid();
  insert into auth.users (id, aud, role, email) values (aid, 'authenticated', 'authenticated', 'admin@cidclean.com');
  update profiles set auth_user_id = aid where is_super_admin;
  insert into actores select 'super', aid, id from profiles where is_super_admin;
end $$;

create temp table fx (k text primary key, id uuid, txt text);
grant all on fx to public;

-- Quote aceptado: jobsite en "contrato pendiente".
do $$
declare
  l uuid; s uuid; w uuid := gen_random_uuid(); q uuid; v uuid; j uuid;
begin
  insert into leads (company, contact_name, email) values ('Firma Prueba LLC', 'Luis', 'luis@prueba.local') returning id into l;
  insert into lead_sites (lead_id, name, address) values (l, 'Bodega', '20 Bay St') returning id into s;
  insert into walkthroughs (id, site_id, status, current_version, closed_at) values (w, s, 'closed', 1, now());
  insert into walkthrough_versions (walkthrough_id, version, data) values (w, 1,
    '{"contact":{"address":"20 Bay St, Naples, FL 34102","contactName":"Luis Paz","phone":"239 555 0102","email":"luis@prueba.local","general":""},"areas":[{"id":"a","type":"office","name":"Front office"},{"id":"b","type":"bathroom","name":"Restroom 1"}],"frequency":{"kind":"weekly","days":[0,2,4],"other":""},"internal":{"staff":"1","time":"2 h","supplies":""}}');
  insert into quotes (site_id, lead_id, walkthrough_id) values (s, l, w) returning id into q;
  insert into quote_versions (quote_id, minor, walkthrough_version, lines, contact_email, sow_path, status)
  values (q, 0, 1, '{"services":[{"label":"Limpieza","amount":2000,"taxable":true}],"addons":[],"discounts":[]}', 'luis@prueba.local', 'x/sow.pdf', 'draft')
  returning id into v;
  update quote_versions set subtotal = 2000, tax = 120, total = 2120 where id = v;
  perform confirm_send_quote(v, null, 'x/quote.pdf', '{"company":"Firma Prueba LLC","site":"Bodega","address":"20 Bay St","language":"en"}');
  insert into quote_portal_sessions (token_hash, version_id, email, expires_at, sow_opened_at) values ('ses-c', v, 'luis@prueba.local', now() + interval '1 hour', now());
  perform portal_decide('ses-c', 'accepted', 'Luis Paz', 'Owner', null, null, true, '5.6.7.8', 'UA cliente');
  select id into j from jobsites where site_id = s;
  update jobsites set visit_start_time = '18:30' where id = j;
  insert into fx (k, id) values ('j', j), ('v', v), ('q', q);
end $$;

-- A. Preparar ---------------------------------------------------------------------------------------------------
do $$
declare
  j uuid := (select id from fx where k = 'j');
  r jsonb; c uuid;
begin
  perform pg_temp.prueba('solo el Super Admin prepara el contrato (42501)', 'ERR:42501', pg_temp.valor('clientes', format('select contract_prepare(%L)::text', j)));
  r := pg_temp.valor('super', format('select contract_prepare(%L)::text', j))::jsonb;
  c := (r->>'id')::uuid;
  insert into fx (k, id) values ('c', c);
  perform pg_temp.prueba('nace en borrador con CSA y SOW del mismo número y plantilla 1.0', 'draft|true|1.0',
    (r->>'status') || '|' || (substr(r->>'csa', 5) = substr(r->>'sow', 5) and r->>'csa' ~ '^CSA-\d{4,}$')::text || '|' || (r->>'template_version'));
  perform pg_temp.prueba('campos de la app: empresa, contacto de la aceptación, sitio, frecuencia, hora y precio sin tax',
    'Firma Prueba LLC|Luis Paz, Owner, luis@prueba.local, 239 555 0102|20 Bay St, Naples, FL 34102|3 days per week: Monday, Wednesday, Friday|after 6:30 PM|$2,000.00 per month|Front office, Restroom 1',
    concat_ws('|', r->'fields'->>'client_legal_name', r->'fields'->>'client_contact', r->'fields'->>'site_address', r->'fields'->>'frequency',
      r->'fields'->>'service_window', r->'fields'->>'price', r->'fields'->>'floors_rooms'));
  perform pg_temp.prueba('lo que la app no tiene queda en blanco y se lista como faltante', 'true|true',
    ((r->'missing') ? 'effective_date')::text || '|' || ((r->'missing') ? 'client_entity')::text);
  perform pg_temp.prueba('retención: 5 años desde la aceptación', 'true',
    ((r->>'retain_until')::date = (cc_today() + interval '5 years')::date)::text);
  perform pg_temp.prueba('prepararlo otra vez devuelve el mismo', c::text, (pg_temp.valor('super', format('select contract_prepare(%L)::text', j))::jsonb->>'id'));
  perform pg_temp.prueba('no se envía con campos vacíos (missing_fields)', 'ERR:22023', pg_temp.valor('super', format('select contract_send_prepare(%L)::text', c)));
  perform pg_temp.prueba('un campo que no es de la plantilla: rechazado (22023)', 'ERR:22023',
    pg_temp.valor('super', format('select contract_save_fields(%L, %L)::text', c, '{"hack":"x"}')));
  r := pg_temp.valor('super', format('select contract_save_fields(%L, %L)::text', c, jsonb_build_object(
    'effective_date', '11/01/2026', 'client_entity', 'a Florida limited liability company', 'client_address', '20 Bay St, Naples, FL 34102',
    'area_sqft', '2,400', 'facility_type', 'Office', 'start_date', '11/02/2026', 'storage', 'Janitor closet', 'access_method', 'Code',
    'keys_count', '0', 'restricted_areas', 'None', 'inspections', 'Monthly walkthrough')))::jsonb;
  perform pg_temp.prueba('con todo completo no falta nada', '0', jsonb_array_length(r->'missing')::text);
  perform pg_temp.prueba('el cliente/jobsite no se programa todavía', 'false', jobsite_contract_ready(j)::text);
end $$;

-- B. Enviar y firmar (portal) -----------------------------------------------------------------------------------
do $$
declare
  j uuid := (select id from fx where k = 'j');
  c uuid := (select id from fx where k = 'c');
  th text := encode(digest('token-1', 'sha256'), 'hex');
  r jsonb;
begin
  perform pg_temp.prueba('preparar el envío sin faltantes', 'ok',
    case when pg_temp.valor('super', format('select contract_send_prepare(%L)::text', c)) like 'ERR%' then 'fallo' else 'ok' end);
  perform pg_temp.prueba('ruta fuera de la carpeta del jobsite: rechazada', 'ERR:22023',
    pg_temp.valor('super', format('select contract_send_confirm(%L, %L, %L, %L, %L)::text', c, 'otro/contract-draft/a.pdf', repeat('a', 64), th, 'luis@prueba.local')));
  r := pg_temp.valor('super', format('select contract_send_confirm(%L, %L, %L, %L, %L)::text', c, j || '/contract-draft/csa-a.pdf', repeat('a', 64), th, 'Luis@Prueba.local'))::jsonb;
  perform pg_temp.prueba('enviado: link de 15 días al correo del cliente', 'sent|luis@prueba.local|15',
    (r->>'status') || '|' || (r->>'email') || '|' || extract(day from ((r->>'expires_at')::timestamptz - (r->>'sent_at')::timestamptz))::int);
  perform pg_temp.prueba('el link abre el portal', 'open', contract_portal_state(th)->>'state');
  perform pg_temp.prueba('otro correo no recibe código', 'not_recipient', contract_portal_request_code(th, 'otro@prueba.local', 'h1'));
  perform pg_temp.prueba('el correo del contrato sí', 'sent', contract_portal_request_code(th, 'luis@prueba.local', 'h1'));
  perform pg_temp.prueba('código equivocado', 'wrong', contract_portal_verify_code(th, 'luis@prueba.local', 'mal', 'sesion-x'));
  perform pg_temp.prueba('código correcto abre la sesión', 'ok', contract_portal_verify_code(th, 'luis@prueba.local', 'h1', 'sesion-1'));
  r := contract_portal_data('sesion-1');
  perform pg_temp.prueba('el cliente ve número, empresa y su correo verificado', 'sent|Firma Prueba LLC|luis@prueba.local',
    (r->>'status') || '|' || (r->>'company') || '|' || (r->>'email'));
  perform pg_temp.prueba('sin consentimiento no firma (22023)', 'ERR:22023',
    pg_temp.directo('select contract_portal_sign(''sesion-1'', ''Luis Paz'', ''Owner'', false, null, null, null)::text'));
  perform pg_temp.prueba('sin cargo no firma (22023)', 'ERR:22023',
    pg_temp.directo('select contract_portal_sign(''sesion-1'', ''Luis Paz'', '' '', true, null, null, null)::text'));
  r := contract_portal_sign('sesion-1', 'Luis Paz', 'Owner', true, '5.6.7.8', 'UA firma', gen_random_uuid());
  perform pg_temp.prueba('firmado por el cliente: guarda nombre, cargo, correo, IP, navegador y consentimiento', 'client_signed|Luis Paz|Owner|luis@prueba.local|5.6.7.8|UA firma|true',
    (select concat_ws('|', status, client_signer_name, client_signer_title, client_signer_email, client_ip, client_user_agent, client_consent::text) from client_contracts where id = c));
  perform pg_temp.prueba('el jobsite queda "Firmado por el cliente" y aún no se programa', 'client_signed|false',
    (select contract_status::text from jobsites where id = j) || '|' || jobsite_contract_ready(j)::text);
  perform pg_temp.prueba('el link es de un solo uso: ya no abre para firmar', 'not_found', contract_portal_state(th)->>'state');
  perform pg_temp.prueba('no se firma dos veces', 'ERR:22023', pg_temp.directo('select contract_portal_sign(''sesion-1'', ''Luis Paz'', ''Owner'', true, null, null, null)::text'));
  perform pg_temp.prueba('anon no usa el portal directo', 'ERR:42501', pg_temp.valor('anon', format('select contract_portal_state(%L)::text', th)));
end $$;

-- C. Contrafirma ------------------------------------------------------------------------------------------------
do $$
declare
  j uuid := (select id from fx where k = 'j');
  c uuid := (select id from fx where k = 'c');
  r jsonb;
begin
  perform pg_temp.prueba('solo el Super Admin contrafirma (42501)', 'ERR:42501', pg_temp.valor('clientes', format('select contract_countersign_prepare(%L)::text', c)));
  r := pg_temp.valor('super', format('select contract_countersign_prepare(%L)::text', c))::jsonb;
  perform pg_temp.prueba('la contrafirma recibe la firma del cliente', 'Luis Paz', r->>'client_signer_name');
  r := pg_temp.valor('super', format('select contract_countersign_confirm(%L, %L, %L, %L, now(), %L, %L)::text', c, j || '/contract/csa-firmado.pdf', repeat('b', 64), gen_random_uuid(), '9.9.9.9', 'UA admin'))::jsonb;
  perform pg_temp.prueba('firmado por ambas partes, con quién contrafirmó y el cargo', 'signed|Managing Member|true',
    (r->>'status') || '|' || (r->>'cc_signer_title') || '|' || ((r->>'cc_signer_name') is not null)::text);
  perform pg_temp.prueba('el jobsite queda "Firmado por ambas partes" y se habilita el Schedule', 'both_signed|true',
    (select contract_status::text from jobsites where id = j) || '|' || jobsite_contract_ready(j)::text);
  perform pg_temp.prueba('el PDF firmado queda como contrato en los documentos del jobsite', '1',
    (select count(*)::text from jobsite_documents where jobsite_id = j and kind = 'contract' and file_path = j || '/contract/csa-firmado.pdf'));
  perform pg_temp.prueba('ya firmado no se edita', 'ERR:22023', pg_temp.valor('super', format('select contract_save_fields(%L, %L)::text', c, '{"storage":"x"}')));
  perform pg_temp.prueba('historial: preparado, enviado, firmado por el cliente y por ambas partes', '4',
    (select count(*)::text from change_log where entity_id = j and action in ('contrato_preparado', 'contrato_enviado', 'contrato_firmado_cliente', 'contrato_firmado')));
  insert into visits (jobsite_id, starts_at, minutes, local_date) values (j, now() + interval '1 day', 60, current_date + 1);
  perform pg_temp.prueba('ahora sí se programa una visita', '1', (select count(*)::text from visits where jobsite_id = j));
end $$;

-- D. Vence sin firmar: "Requiere actualización" cierra el link ----------------------------------------------------
do $$
declare
  l uuid; s uuid; w uuid := gen_random_uuid(); q uuid; v uuid; j uuid; c uuid;
  th text := encode(digest('token-2', 'sha256'), 'hex');
begin
  insert into leads (company) values ('Vence Prueba') returning id into l;
  insert into lead_sites (lead_id, name, address) values (l, 'Local', '30 Gulf St') returning id into s;
  insert into walkthroughs (id, site_id, status, current_version, closed_at) values (w, s, 'closed', 1, now());
  insert into walkthrough_versions (walkthrough_id, version, data) values (w, 1, '{"contact":{"address":"30 Gulf St"},"areas":[],"frequency":{"kind":"daily","days":[],"other":""}}');
  insert into quotes (site_id, lead_id, walkthrough_id) values (s, l, w) returning id into q;
  insert into quote_versions (quote_id, minor, walkthrough_version, lines, contact_email, sow_path) values (q, 0, 1, '{"services":[{"label":"L","amount":100,"taxable":true}],"addons":[],"discounts":[]}', 'v@prueba.local', 'x/s.pdf') returning id into v;
  perform confirm_send_quote(v, null, 'x/q.pdf', '{"company":"Vence Prueba"}');
  insert into quote_portal_sessions (token_hash, version_id, email, expires_at, sow_opened_at) values ('ses-d', v, 'v@prueba.local', now() + interval '1 hour', now());
  perform portal_decide('ses-d', 'accepted', 'Vera', 'CEO', null, null, true, null, null);
  select id into j from jobsites where site_id = s;
  c := (pg_temp.valor('super', format('select contract_prepare(%L)::text', j))::jsonb->>'id')::uuid;
  update client_contracts set status = 'sent', token_hash = th, email = 'v@prueba.local', expires_at = now() + interval '15 days' where id = c;
  perform pg_temp.prueba('frecuencia diaria en el contrato', '7 days per week, Monday–Sunday', (select fields->>'frequency' from client_contracts where id = c));
  update jobsites set contract_accepted_at = now() - interval '16 days' where id = j;
  perform jobsite_contracts_expire();
  perform pg_temp.prueba('a los 15 días sin firma: el contrato se anula y el link se cierra', 'void|not_found|needs_update',
    (select status from client_contracts where id = c) || '|' || (contract_portal_state(th)->>'state') || '|' || (select contract_status::text from jobsites where id = j));
  perform pg_temp.prueba('con "Requiere actualización" no se prepara contrato (22023)', 'ERR:22023', pg_temp.valor('super', format('select contract_prepare(%L)::text', j)));
end $$;

-- Resultado ------------------------------------------------------------------------------------------

select prueba, ok, detalle from resultados order by n;
-- FIN-DE-PRUEBAS
rollback;
