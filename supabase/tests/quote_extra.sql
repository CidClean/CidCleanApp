-- Pruebas del quote de extra desde el jobsite (migración 20261027000002, hito 7, orden 26; D-238). Repetibles: rollback.
-- Uso: psql -f supabase/tests/quote_extra.sql (la última consulta lista cada prueba con ok = true/false).

begin;

create temp table resultados (n int generated always as identity, prueba text, ok boolean, detalle text);
create temp table actores (nombre text primary key, auth_id uuid, profile_id uuid);
grant all on resultados, actores to public;

create function pg_temp.valor(quien text, consulta text) returns text language plpgsql as $$
declare
  resultado text;
  uid uuid;
begin
  select auth_id into uid from actores where nombre = quien;
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  set local role authenticated;
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

do $$
declare
  quien text;
  pid uuid;
  aid uuid;
begin
  foreach quien in array array['ventas', 'ver', 'nada'] loop
    aid := gen_random_uuid();
    insert into profiles (full_name, worker_type, role, email, has_app_access)
    values ('Prueba ' || quien, 'w2', 'employee', quien || '@prueba.local', true) returning id into pid;
    insert into auth.users (id, aud, role, email) values (aid, 'authenticated', 'authenticated', quien || '@prueba.local');
    insert into actores values (quien, aid, pid);
  end loop;
  insert into profile_permissions (profile_id, permission_key)
  select a.profile_id, p.k from actores a
    join (values ('ventas', 'quotes_ver'), ('ventas', 'quotes_editar'), ('ventas', 'quotes_ver_precios'), ('ventas', 'quotes_enviar'),
                 ('ventas', 'sow_contratos_subir_ver'), ('ver', 'quotes_ver')) as p(n, k) on p.n = a.nombre;
end $$;

do $$
declare
  cli uuid;
  js uuid;
  js_off uuid;
  q uuid;
  q2 uuid;
  v uuid;
  v2 uuid;
  tok text;
  ventas uuid := (select profile_id from actores where nombre = 'ventas');
  clients_before int := (select count(*) from clients);
  jobsites_before int;
begin
  insert into clients (name, legacy) values ('Cliente Extra', true) returning id into cli;
  insert into jobsites (client_id, name, address, contact_email, frequency, start_date)
  values (cli, 'Sede Extra', '9 Bay St, Naples', 'Contacto@Prueba.local', '{"kind":"daily","days":[]}', '2026-10-01') returning id into js;
  insert into jobsite_rates (jobsite_id, monthly_rate) values (js, 250);
  insert into jobsites (client_id, name, address, status) values (cli, 'Sede Cerrada', '1 St', 'terminated') returning id into js_off;
  jobsites_before := (select count(*) from jobsites);

  perform pg_temp.prueba('crear un extra exige armar quotes', 'ERR:42501', pg_temp.valor('ver', format('select create_extra_quote(%L)::text', js)));
  perform pg_temp.prueba('no en un jobsite terminado', 'ERR:22023', pg_temp.valor('ventas', format('select create_extra_quote(%L)::text', js_off)));
  q := pg_temp.valor('ventas', format('select create_extra_quote(%L)::text', js))::uuid;
  perform pg_temp.prueba('nace el extra atado al jobsite, sin walkthrough, con el contacto del jobsite', 'extra|contacto@prueba.local|0',
    (select qq.kind || '|' || vv.contact_email || '|' || vv.walkthrough_version from quotes qq join quote_versions vv on vv.quote_id = qq.id where qq.id = q));
  perform pg_temp.prueba('"Nuevo quote" abre el borrador sin enviar que ya existe', q::text,
    pg_temp.valor('ventas', format('select create_extra_quote(%L)::text', js)));
  select id into v from quote_versions where quote_id = q;
  perform pg_temp.valor('ventas', format('select save_quote_draft(%L, %L, 6, 30, %L)::text', v,
    '{"services":[{"label":"Jueves extra","amount":25,"taxable":false}],"addons":[],"discounts":[]}', '{}'));
  perform pg_temp.prueba('mismas líneas y totales que el quote de siempre', '25.00|0.00|25.00',
    (select subtotal || '|' || tax || '|' || total from quote_versions where id = v));
  perform pg_temp.valor('ventas', format('select set_quote_service_date(%L, %L)::text', v, '2026-11-05'));
  perform pg_temp.prueba('fecha del servicio', '2026-11-05', (select service_date::text from quote_versions where id = v));
  perform pg_temp.prueba('el detalle del extra trae el jobsite y la versión', 'Sede Extra|Cliente Extra|1|2026-11-05',
    pg_temp.valor('ventas', format('select d->>''jobsite'' || ''|'' || (d->>''company'') || ''|'' || jsonb_array_length(d->''versions'') || ''|'' || (d->''versions''->0->>''service_date'') from (select get_extra_quote(%L) d) z', q)));
  perform pg_temp.prueba('sin ver precios no hay total', 'null',
    pg_temp.valor('ver', format('select coalesce(get_extra_quote(%L)->''versions''->0->>''total'', ''null'')', q)));
  perform pg_temp.prueba('la lista del jobsite muestra el extra con su estado', 'draft|1.0',
    pg_temp.valor('ver', format('select status || ''|'' || version from jobsite_extra_quotes(%L)', js)));

  -- Envío: el extra va sin SOW (D-239); el envío trae cliente, jobsite y la marca extra. La prueba sube un SOW igual
  -- para cubrir también el caso con SOW.
  insert into storage.objects (bucket_id, name) values ('quote-files', q || '/' || v || '/sow-a.pdf');
  perform pg_temp.valor('ventas', format('select set_quote_sow(%L, %L)::text', v, q || '/' || v || '/sow-a.pdf'));
  perform pg_temp.prueba('preparar el envío de un extra', 'Cliente Extra|Sede Extra|true|2026-11-05|en',
    pg_temp.valor('ventas', format('select p->>''company'' || ''|'' || (p->>''site'') || ''|'' || (p->>''extra'') || ''|'' || (p->>''service_date'') || ''|'' || (p->>''language'') from (select prepare_send_quote(%L) p) z', v)));
  tok := confirm_send_quote(v, ventas, q || '/' || v || '/quote-1.0.pdf', '{"language":"en","company":"Cliente Extra","site":"Sede Extra","address":"9 Bay St","frequency":null}')->>'token';
  perform pg_temp.prueba('enviado', 'sent', (select status::text from quote_versions where id = v));
  perform portal_request_code(tok, 'contacto@prueba.local', 'h1');
  perform portal_verify_code(tok, 'contacto@prueba.local', 'h1', 'sesx');
  perform pg_temp.prueba('el portal sabe que es un extra y su fecha', 'true|2026-11-05',
    (select (d->>'extra') || '|' || (d->>'service_date') from (select portal_quote('sesx') d) z));
  perform portal_file('sesx', 'sow');
  perform pg_temp.prueba('aceptar el extra', 'accepted|null|true',
    (select (d->>'kind') || '|' || coalesce(d->>'jobsite_id', 'null') || '|' || (d->>'extra')
       from (select portal_decide('sesx', 'accepted', 'Ana Ruiz', 'Gerente', null, null, true, '1.2.3.4', 'UA') d) z));
  perform pg_temp.prueba('no nace cliente ni jobsite', (clients_before + 1)::text || '|' || jobsites_before::text,
    (select count(*) from clients)::text || '|' || (select count(*) from jobsites)::text);
  perform pg_temp.prueba('nace la línea de extra en el mes del servicio', '2026-11-01|25.00|Jueves extra',
    (select month || '|' || amount || '|' || label from income_extras where quote_version_id = v));
  perform pg_temp.prueba('con su fila del mes (lo calculado se genera después)', 'null',
    (select coalesce(amount::text, 'null') from income_expected where jobsite_id = js and month = '2026-11-01'));
  perform generate_accounting('2026-11-01');
  perform pg_temp.prueba('el ingreso del mes = tarifa + extra', '275.00',
    (select (income_figures(e)).total::text from income_expected e where jobsite_id = js and month = '2026-11-01'));
  perform pg_temp.prueba('aceptar el extra queda en el historial', 'true', (select count(*) >= 1 from change_log where action = 'ingreso_extra_agregado' and entity_id = js)::text);

  -- Sin fecha del servicio: el mes en que se acepta (D-200).
  q2 := pg_temp.valor('ventas', format('select create_extra_quote(%L)::text', js))::uuid;
  perform pg_temp.prueba('después de enviar, "Nuevo quote" crea otro extra', 'true', (q2 <> q)::text);
  select id into v2 from quote_versions where quote_id = q2;
  perform pg_temp.valor('ventas', format('select save_quote_draft(%L, %L, 6, 30, %L)::text', v2,
    '{"services":[{"label":"Ventanas","amount":100,"taxable":true}],"addons":[],"discounts":[]}', '{}'));
  update quote_versions set sow_path = q2 || '/' || v2 || '/sow-b.pdf' where id = v2;
  tok := confirm_send_quote(v2, ventas, null, '{"language":"en"}')->>'token';
  perform portal_request_code(tok, 'contacto@prueba.local', 'h2');
  perform portal_verify_code(tok, 'contacto@prueba.local', 'h2', 'sesy');
  perform portal_file('sesy', 'sow');
  perform portal_decide('sesy', 'accepted', 'Ana Ruiz', 'Gerente', null, null, true, '1.2.3.4', 'UA');
  perform pg_temp.prueba('sin fecha del servicio va al mes de aceptación, con tax', month_start(cc_today())::text || '|106.00',
    (select month || '|' || amount from income_extras where quote_version_id = v2));
  perform pg_temp.prueba('los quotes del jobsite muestran el estado', 'accepted,accepted',
    pg_temp.valor('ver', format('select string_agg(status::text, '','') from jobsite_extra_quotes(%L)', js)));
  perform pg_temp.prueba('un extra aceptado no admite versión nueva', 'ERR:22023',
    pg_temp.valor('ventas', format('select new_quote_version(%L)::text', q)));
  perform pg_temp.prueba('el Inicio ve la decisión del extra con su jobsite', 'true',
    pg_temp.valor('ver', format('select count(*) > 0 from home_quote_pending() where jobsite_id = %L', js)));
end $$;

select n, prueba, ok, detalle from resultados order by n;
rollback;
