-- Pruebas de la orden 61 (migración 20261030000012, D-283): vigencia de 30 días, tipo de limpieza, aceptación de rev. 3,
-- estados del contrato del jobsite y bloqueo del Schedule. Repetibles: terminan en rollback.
-- Uso: psql -f supabase/tests/quote_no_es_contrato.sql   (la última consulta lista cada prueba con ok = true/false).

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
  quien text; pid uuid; aid uuid;
begin
  foreach quien in array array['ventas', 'clientes', 'schedule'] loop
    aid := gen_random_uuid();
    insert into profiles (full_name, worker_type, role, email, has_app_access)
    values ('Prueba ' || quien, 'w2', 'employee', quien || '@prueba.local', true) returning id into pid;
    insert into auth.users (id, aud, role, email) values (aid, 'authenticated', 'authenticated', quien || '@prueba.local');
    insert into actores values (quien, aid, pid);
  end loop;
  insert into profile_permissions (profile_id, permission_key)
    select profile_id, k from actores, unnest(array['quotes_ver', 'quotes_editar', 'quotes_ver_precios', 'quotes_enviar',
      'sow_contratos_subir_ver', 'leads_ver', 'leads_editar']) k where nombre = 'ventas';
  insert into profile_permissions (profile_id, permission_key)
    select profile_id, k from actores, unnest(array['clientes_ver', 'clientes_editar_datos', 'clientes_ver_tarifa']) k where nombre = 'clientes';
  insert into profile_permissions (profile_id, permission_key)
    select profile_id, k from actores, unnest(array['schedule_ver_editar', 'clientes_ver']) k where nombre = 'schedule';
end $$;

create temp table fx (k text primary key, id uuid);
grant all on fx to public;

-- Lead con un sitio, walkthrough cerrado, quote enviado y sesión del portal con el SOW abierto.
do $$
declare
  l uuid; s uuid; w uuid := gen_random_uuid(); q uuid; v uuid;
  ln jsonb := '{"services":[{"label":"Limpieza","amount":1000,"taxable":true}],"addons":[{"label":"Ventanas","amount":200,"taxable":true}],"discounts":[]}';
begin
  insert into leads (company, contact_name, email) values ('Contrato Prueba LLC', 'Ana', 'ana@prueba.local') returning id into l;
  insert into lead_sites (lead_id, name, address) values (l, 'Oficina', '10 Main St') returning id into s;
  insert into walkthroughs (id, site_id, status, current_version, closed_at) values (w, s, 'closed', 1, now());
  insert into walkthrough_versions (walkthrough_id, version, data) values (w, 1,
    '{"contact":{"address":"10 Main St, Naples, FL 34102","contactName":"Ana Ruiz","phone":"239 555 0101","email":"ana@prueba.local","general":""},"areas":[],"frequency":{"kind":"weekly","days":[1,3],"other":""},"internal":{"staff":"1","time":"2 h","supplies":""}}');
  perform pg_temp.valor('ventas', format('select ensure_quote(%L)', s));
  select id into q from quotes where site_id = s;
  select id into v from quote_versions where quote_id = q;
  insert into fx values ('lead', l), ('site', s), ('q', q), ('v', v);
  perform pg_temp.prueba('vigencia de 31 días: rechazada (22023)', 'ERR:22023',
    pg_temp.valor('ventas', format('select save_quote_draft(%L, %L, 6, 31, null)', v, ln)));
  perform pg_temp.prueba('vigencia de 30 días: se guarda', 'ok',
    case when pg_temp.valor('ventas', format('select save_quote_draft(%L, %L, 6, 30, null)', v, ln)) like 'ERR%' then 'fallo' else 'ok' end);
  perform pg_temp.prueba('no residencial: el 6 % sobre lo gravable', '1200.00|72.00|1272.00',
    (select subtotal || '|' || tax || '|' || total from quote_versions where id = v));
  perform pg_temp.prueba('el quote tiene número Q-', 'true', (select (quote_number_label(number) ~ '^Q-\d{4,}$')::text from quotes where id = q));
end $$;

-- A. Tipo de limpieza --------------------------------------------------------------------------------------
do $$
declare
  l uuid := (select id from fx where k = 'lead');
  v uuid := (select id from fx where k = 'v');
  ln jsonb := '{"services":[{"label":"Limpieza","amount":1000,"taxable":true}],"addons":[{"label":"Ventanas","amount":200,"taxable":true}],"discounts":[]}';
begin
  perform pg_temp.prueba('por defecto, No residencial', 'non_residential', (select cleaning_type from leads where id = l));
  perform pg_temp.prueba('tipo no válido: rechazado (22023)', 'ERR:22023', pg_temp.valor('ventas', format('select set_lead_cleaning_type(%L, %L)', l, 'casa')));
  perform pg_temp.prueba('sin leads_editar no se cambia (42501)', 'ERR:42501', pg_temp.valor('schedule', format('select set_lead_cleaning_type(%L, %L)', l, 'residential')));
  perform pg_temp.valor('ventas', format('select set_lead_cleaning_type(%L, %L)', l, 'residential'));
  perform pg_temp.prueba('al pasar a Residencial el borrador queda sin impuesto', '1200.00|0.00|1200.00|false',
    (select subtotal || '|' || tax || '|' || total || '|' || (lines->'services'->0->>'taxable') from quote_versions where id = v));
  perform pg_temp.valor('ventas', format('select save_quote_draft(%L, %L, 6, 30, null)', v, ln));
  perform pg_temp.prueba('residencial: el servidor quita el gravable aunque la línea venga marcada', '0.00|false|false',
    (select tax || '|' || (lines->'services'->0->>'taxable') || '|' || (lines->'addons'->0->>'taxable') from quote_versions where id = v));
  perform pg_temp.prueba('el cambio de tipo queda en el historial', '1',
    (select count(*)::text from change_log where action = 'tipo_limpieza_cambiado' and entity_id = l));
  perform pg_temp.valor('ventas', format('select set_lead_cleaning_type(%L, %L)', l, 'non_residential'));
  perform pg_temp.valor('ventas', format('select save_quote_draft(%L, %L, 6, 30, null)', v, ln));
  perform pg_temp.prueba('de vuelta a No residencial, la casilla gravable vale otra vez', '72.00',
    (select tax::text from quote_versions where id = v));
end $$;

-- B. Envío, vigencia y aceptación -----------------------------------------------------------------------------
do $$
declare
  v uuid := (select id from fx where k = 'v');
  s uuid := (select id from fx where k = 'site');
  r jsonb; j uuid;
begin
  update quote_versions set sow_path = 'x/y/sow-a.pdf', valid_days = 30 where id = v;
  perform confirm_send_quote(v, (select profile_id from actores where nombre = 'ventas'), 'x/y/quote-a.pdf', '{"company":"Contrato Prueba LLC","site":"Oficina","address":"10 Main St, Naples, FL 34102","language":"en"}');
  perform pg_temp.prueba('enviado: vence a los 30 días', '30', (select extract(day from (expires_at - sent_at))::int::text from quote_versions where id = v));
  insert into quote_portal_sessions (token_hash, version_id, email, expires_at, sow_opened_at) values ('ses-a', v, 'ana@prueba.local', now() + interval '1 hour', now());
  r := portal_quote('ses-a');
  perform pg_temp.prueba('el portal recibe el texto de rev. 3 con quote, versión y empresa', 'true|1.0',
    ((r->>'acceptance_text') = format('I have read the Scope of Work and accept quote %s version 1.0 and these Client Portal Terms version 1.0. I understand this acceptance is not a contract and that services begin only after both parties sign the Commercial Service Agreement. I am authorized to accept on behalf of Contrato Prueba LLC.', r->>'quote_number'))::text
      || '|' || (r->>'portal_terms_version'));
  -- Pasaron 31 días desde el envío: ya no se acepta.
  update quote_versions set sent_at = now() - interval '31 days', expires_at = now() + interval '1 day' where id = v;
  perform pg_temp.prueba('después de 30 días desde el envío no se acepta (22023)', 'ERR:22023',
    pg_temp.directo(format('select portal_decide(%L, %L, %L, %L, null, null, true, %L, %L)::text', 'ses-a', 'accepted', 'Ana Ruiz', 'Manager', '1.2.3.4', 'Mozilla/5.0 Prueba')));
  perform expire_quotes();
  perform pg_temp.prueba('y el quote queda Expirado', 'expired', (select status::text from quote_versions where id = v));
  update quote_versions set status = 'viewed', sent_at = now() - interval '2 days', expires_at = now() + interval '28 days' where id = v;
  r := portal_decide('ses-a', 'accepted', 'Ana Ruiz', 'Manager', null, null, true, '1.2.3.4', 'Mozilla/5.0 Prueba');
  perform pg_temp.prueba('aceptar devuelve los datos de la copia para el cliente', 'ana@prueba.local|Ana Ruiz|x/y/quote-a.pdf',
    (r->>'client_email') || '|' || (r->>'signer_name') || '|' || (r->>'pdf_path'));
  perform pg_temp.prueba('la aceptación guarda navegador, IP, versión de los términos y el texto exacto', 'Mozilla/5.0 Prueba|1.2.3.4|1.0|true',
    (select user_agent || '|' || ip || '|' || portal_terms_version || '|' || (acceptance_text like 'I have read the Scope of Work and accept quote Q-%')::text
       from quote_decisions where version_id = v));
  select id into j from jobsites where site_id = s;
  insert into fx values ('j', j);
  perform pg_temp.prueba('al aceptar: "Quote aceptado – contrato pendiente"', 'pending|true|non_residential',
    (select contract_status::text || '|' || (contract_accepted_at is not null)::text || '|' || cleaning_type from jobsites where id = j));
  perform pg_temp.prueba('el quote aceptado muestra el estado del contrato', 'pending', quote_contract_status(v));
  perform pg_temp.directo(format('select portal_mark_acceptance_copy(%L)', r->>'decision_id'));
  perform pg_temp.prueba('la copia enviada queda marcada', 'true', (select (copy_sent_at is not null)::text from quote_decisions where version_id = v));
end $$;

-- C. Schedule y personal bloqueados hasta "Firmado por ambas partes" ----------------------------------------
do $$
declare
  j uuid := (select id from fx where k = 'j');
  e uuid := (select profile_id from actores where nombre = 'clientes');
  vis uuid;
begin
  perform pg_temp.prueba('no se programa una visita con el contrato pendiente', 'ERR:22023',
    pg_temp.directo(format('insert into visits (jobsite_id, starts_at, minutes, local_date) values (%L, now() + interval ''1 day'', 60, current_date + 1) returning id::text', j)));
  perform pg_temp.prueba('el error dice contract_pending con el jobsite', 'contract_pending:Oficina',
    null);
  begin
    insert into visits (jobsite_id, starts_at, minutes, local_date) values (j, now() + interval '1 day', 60, current_date + 1);
  exception when others then
    update resultados set ok = (sqlerrm = 'contract_pending:Oficina'), detalle = 'obtenido=' || sqlerrm where prueba = 'el error dice contract_pending con el jobsite';
  end;
  perform pg_temp.prueba('tampoco se asigna personal (assign_employee, 22023)', 'ERR:22023',
    pg_temp.valor('schedule', format('select assign_employee(%L, %L, current_date)::text', j, e)));
  update jobsites set contract_status = 'both_signed', contract_signed_at = now() where id = j;
  perform pg_temp.prueba('con el contrato firmado por ambas partes sí se asigna', 'ok',
    case when pg_temp.valor('schedule', format('select assign_employee(%L, %L, current_date)::text', j, e)) like 'ERR%' then 'fallo' else 'ok' end);
  insert into visits (jobsite_id, starts_at, minutes, local_date) values (j, now() + interval '1 day', 60, current_date + 1) returning id into vis;
  perform pg_temp.prueba('y se programa la visita', 'true', (vis is not null)::text);
  update jobsites set contract_status = 'pending' where id = j;
end $$;

-- D. "Requiere actualización" a los 15 días y versión nueva ---------------------------------------------------
do $$
declare
  j uuid := (select id from fx where k = 'j');
  q uuid := (select id from fx where k = 'q');
  v uuid := (select id from fx where k = 'v');
  nv text;
begin
  perform pg_temp.prueba('aceptado y pendiente: no admite versión nueva (22023)', 'ERR:22023', pg_temp.valor('ventas', format('select new_quote_version(%L)', q)));
  update jobsites set contract_accepted_at = now() - interval '14 days' where id = j;
  perform jobsite_contracts_expire();
  perform pg_temp.prueba('a los 14 días sigue pendiente', 'pending', (select contract_status::text from jobsites where id = j));
  update jobsites set contract_accepted_at = now() - interval '15 days 1 minute' where id = j;
  perform pg_temp.prueba('a los 15 días la tarea marca un jobsite', '1', jobsite_contracts_expire()::text);
  perform pg_temp.prueba('y pasa a "Requiere actualización"', 'needs_update', (select contract_status::text from jobsites where id = j));
  perform pg_temp.prueba('queda en el historial', '1', (select count(*)::text from change_log where action = 'contrato_requiere_actualizacion' and entity_id = j));
  perform pg_temp.prueba('la tarea diaria está programada', '1', (select count(*)::text from cron.job where jobname = 'cidclean-contratos-vencidos'));
  nv := pg_temp.valor('ventas', format('select new_quote_version(%L)', q));
  perform pg_temp.prueba('"Requiere actualización" admite una versión nueva', 'ok', case when nv like 'ERR%' then 'fallo:' || nv else 'ok' end);
  update quote_versions set sow_path = 'x/y/sow-b.pdf' where id = nv::uuid;
  perform confirm_send_quote(nv::uuid, (select profile_id from actores where nombre = 'ventas'), 'x/y/quote-b.pdf', '{"company":"Contrato Prueba LLC","site":"Oficina","address":"10 Main St","language":"en"}');
  perform pg_temp.prueba('al enviarla, la versión aceptada vencida queda reemplazada', 'superseded', (select status::text from quote_versions where id = v));
  insert into quote_portal_sessions (token_hash, version_id, email, expires_at, sow_opened_at) values ('ses-b', nv::uuid, 'ana@prueba.local', now() + interval '1 hour', now());
  perform portal_decide('ses-b', 'accepted', 'Ana Ruiz', 'Manager', null, null, true, null, 'UA');
  perform pg_temp.prueba('aceptar la versión nueva reabre los 15 días en el mismo jobsite', 'pending|1|true',
    (select contract_status::text from jobsites where id = j) || '|' ||
    (select count(*)::text from jobsites where site_id = (select id from fx where k = 'site')) || '|' ||
    (select (quote_version_id = nv::uuid)::text from jobsite_rates where jobsite_id = j));
end $$;

-- E. Datos existentes y Accounting ---------------------------------------------------------------------------
do $$
declare
  c uuid; jl uuid;
begin
  insert into clients (name, legacy) values ('Previo Prueba', true) returning id into c;
  insert into jobsites (client_id, name, address) values (c, 'Previo', '1 A St') returning id into jl;
  perform pg_temp.prueba('el jobsite de un cliente previo a la app nace firmado', 'both_signed', (select contract_status::text from jobsites where id = jl));
  insert into jobsite_rates (jobsite_id, monthly_rate) values ((select id from fx where k = 'j'), 500)
    on conflict (jobsite_id) do update set monthly_rate = 500;
  perform generate_accounting();
  perform pg_temp.prueba('Accounting no genera ingreso de un jobsite con el contrato pendiente', '0',
    (select count(*)::text from income_expected where jobsite_id = (select id from fx where k = 'j')));
  perform pg_temp.prueba('anon no ejecuta las funciones del contrato', 'ERR:42501', pg_temp.valor('anon', 'select jobsite_contracts_expire()::text'));
end $$;

-- Resultado ------------------------------------------------------------------------------------------

select prueba, ok, detalle from resultados order by n;
-- FIN-DE-PRUEBAS
rollback;
