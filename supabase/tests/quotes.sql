-- Pruebas del quote, el portal del cliente y el Cliente con Jobsite al aceptar (migración 20261024000001, D-209).
-- Repetibles: todo ocurre dentro de una transacción que termina en rollback, no queda nada en la base.
-- Simulan roles con `set local role` y `request.jwt.claims`, como hace la API.
-- Uso: psql -f supabase/tests/quotes.sql   (la última consulta lista cada prueba con ok = true/false).

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

-- Personas de prueba -------------------------------------------------------------------------------
do $$
declare
  quien text;
  pid uuid;
  aid uuid;
begin
  foreach quien in array array['ventas', 'ver', 'sin_permisos', 'clientes', 'tarifa'] loop
    aid := gen_random_uuid();
    insert into profiles (full_name, worker_type, role, email, has_app_access)
    values ('Prueba ' || quien, 'w2', 'employee', quien || '@prueba.local', true) returning id into pid;
    insert into auth.users (id, aud, role, email) values (aid, 'authenticated', 'authenticated', quien || '@prueba.local');
    insert into actores values (quien, aid, pid);
  end loop;
  insert into profile_permissions (profile_id, permission_key)
    select profile_id, k from actores, unnest(array['quotes_ver', 'quotes_editar', 'quotes_ver_precios', 'quotes_enviar',
      'sow_contratos_subir_ver', 'leads_ver', 'leads_editar', 'leads_eliminar']) k where nombre = 'ventas';
  insert into profile_permissions (profile_id, permission_key) select profile_id, 'quotes_ver' from actores where nombre = 'ver';
  insert into profile_permissions (profile_id, permission_key) select profile_id, 'clientes_ver' from actores where nombre in ('clientes', 'tarifa');
  insert into profile_permissions (profile_id, permission_key) select profile_id, 'clientes_ver_tarifa' from actores where nombre = 'tarifa';
end $$;

-- Lead con dos sitios y un walkthrough cerrado en el primero (como lo deja el hito 3).
create temp table fx (k text primary key, id uuid);
grant all on fx to public;
do $$
declare
  l uuid; s1 uuid; s2 uuid; w uuid := gen_random_uuid();
begin
  insert into leads (company, contact_name, email, language) values ('Oficinas Prueba', 'Marta', 'marta@prueba.local', 'es') returning id into l;
  insert into lead_sites (lead_id, name, address) values (l, 'Sede norte', '100 Main St') returning id into s1;
  insert into lead_sites (lead_id, name, address) values (l, 'Sede sur', '200 Main St') returning id into s2;
  insert into fx values ('lead', l), ('s1', s1), ('s2', s2), ('w1', w);
end $$;

-- A. Cálculos ------------------------------------------------------------------------------------------
select pg_temp.prueba('totales: servicios y add-ons, tax solo sobre lo gravable', '1000.00|0.00|36.00|1036.00',
  (select subtotal || '|' || discount || '|' || tax || '|' || total from quote_totals(
     '{"services":[{"label":"Limpieza","amount":600,"taxable":true}],"addons":[{"label":"Ventanas","amount":400,"taxable":false}],"discounts":[]}', 6)));
select pg_temp.prueba('totales: descuento en % antes del tax, repartido sobre lo gravable', '1000.00|100.00|32.40|932.40',
  (select subtotal || '|' || discount || '|' || tax || '|' || total from quote_totals(
     '{"services":[{"label":"Limpieza","amount":600,"taxable":true}],"addons":[{"label":"Ventanas","amount":400,"taxable":false}],"discounts":[{"label":"Promo","kind":"percent","value":10}]}', 6)));
select pg_temp.prueba('totales: descuento en monto que no pasa del subtotal', '100.00|100.00|0.00|0.00',
  (select subtotal || '|' || discount || '|' || tax || '|' || total from quote_totals(
     '{"services":[{"label":"Limpieza","amount":100,"taxable":true}],"addons":[],"discounts":[{"label":"X","kind":"amount","value":250}]}', 6)));
select pg_temp.prueba('renglones: sin nombre, monto negativo o % mayor a 100 no son válidos', 'false|false|false|true',
  quote_lines_valid('{"services":[{"label":" ","amount":1,"taxable":true}]}')::text || '|' ||
  quote_lines_valid('{"services":[{"label":"A","amount":-1,"taxable":true}]}')::text || '|' ||
  quote_lines_valid('{"services":[],"discounts":[{"label":"A","kind":"percent","value":101}]}')::text || '|' ||
  quote_lines_valid('{"services":[{"label":"A","amount":1.5,"taxable":false}],"addons":[],"discounts":[{"label":"B","kind":"amount","value":1}]}')::text);
-- D-251 (migración 20261027000013): descripción opcional de hasta 200 caracteres en servicios y add-ons.
select pg_temp.prueba('descripción: opcional, texto de hasta 200; más larga, no texto o en un descuento no es válida', 'true|true|true|false|false|false',
  quote_lines_valid('{"services":[{"label":"A","description":"Pisos y baños","amount":1,"taxable":true}]}')::text || '|' ||
  quote_lines_valid(jsonb_build_object('addons', jsonb_build_array(jsonb_build_object('label','B','description',repeat('x',200),'amount',1,'taxable',true))))::text || '|' ||
  quote_lines_valid('{"services":[{"label":"A","description":null,"amount":1,"taxable":true}]}')::text || '|' ||
  quote_lines_valid(jsonb_build_object('services', jsonb_build_array(jsonb_build_object('label','A','description',repeat('x',201),'amount',1,'taxable',true))))::text || '|' ||
  quote_lines_valid('{"services":[{"label":"A","description":5,"amount":1,"taxable":true}]}')::text || '|' ||
  quote_lines_valid('{"services":[],"discounts":[{"label":"D","description":"x","kind":"amount","value":1}]}')::text);

-- B. Armado --------------------------------------------------------------------------------------------
do $$
declare
  s1 uuid := (select id from fx where k = 's1');
  w uuid := (select id from fx where k = 'w1');
  q uuid; v uuid;
  lines jsonb := '{"services":[{"label":"Limpieza general","amount":1200,"taxable":true}],"addons":[{"label":"Ventanas","amount":300,"taxable":false}],"discounts":[{"label":"Primer mes","kind":"amount","value":100}]}';
begin
  perform pg_temp.prueba('sin permiso no se arma un quote (42501)', 'ERR:42501', pg_temp.valor('sin_permisos', format('select ensure_quote(%L)', s1)));
  perform pg_temp.prueba('solo con quotes_ver tampoco (42501)', 'ERR:42501', pg_temp.valor('ver', format('select ensure_quote(%L)', s1)));
  perform pg_temp.prueba('sin walkthrough cerrado no hay quote (22023)', 'ERR:22023', pg_temp.valor('ventas', format('select ensure_quote(%L)', s1)));
  insert into walkthroughs (id, site_id, status, current_version, closed_at) values (w, s1, 'closed', 1, now());
  insert into walkthrough_versions (walkthrough_id, version, data) values (w, 1,
    '{"contact":{"address":"100 Main St, Naples","contactName":"Marta Gil","phone":"239 555 0100","email":"Marta@Prueba.local","general":""},"areas":[],"frequency":{"kind":"weekly","days":[0,2,4],"other":""},"internal":{"staff":"2","time":"3 h","supplies":"x"}}');
  perform pg_temp.prueba('con walkthrough cerrado nace el quote con su borrador 1.0', 'ok',
    case when pg_temp.valor('ventas', format('select ensure_quote(%L)', s1)) like 'ERR%' then 'fallo' else 'ok' end);
  select id into q from quotes where site_id = s1;
  select id into v from quote_versions where quote_id = q;
  insert into fx values ('q1', q), ('v10', v);
  perform pg_temp.prueba('llamarlo de nuevo devuelve el mismo quote', q::text, pg_temp.valor('ventas', format('select ensure_quote(%L)', s1)));
  perform pg_temp.prueba('el borrador toma el correo del contacto del walkthrough, en minúsculas', 'marta@prueba.local|0|draft',
    (select contact_email || '|' || minor || '|' || status from quote_versions where id = v));
  perform pg_temp.prueba('renglones no válidos: rechazado (22023)', 'ERR:22023',
    pg_temp.valor('ventas', format('select save_quote_draft(%L, %L, 6, 30, null)', v, '{"services":[{"label":"","amount":1,"taxable":true}]}')));
  perform pg_temp.prueba('correo opcional no válido: rechazado (22023)', 'ERR:22023',
    pg_temp.valor('ventas', format('select save_quote_draft(%L, %L, 6, 30, array[''no-es-correo''])', v, lines)));
  perform pg_temp.prueba('solo con quotes_ver no se guarda (42501)', 'ERR:42501',
    pg_temp.valor('ver', format('select save_quote_draft(%L, %L, 6, 30, null)', v, lines)));
  perform pg_temp.prueba('guardar el borrador calcula los totales en la base', 'ok',
    case when pg_temp.valor('ventas', format('select save_quote_draft(%L, %L, 6, 45, array['' Socio@Prueba.local '', ''socio@prueba.local''])', v, lines)) like 'ERR%' then 'fallo' else 'ok' end);
  perform pg_temp.prueba('totales: 1500 - 100, tax 6% sobre 1200 menos su parte del descuento', '1500.00|100.00|67.20|1467.20|45|{socio@prueba.local}',
    (select subtotal || '|' || discount || '|' || tax || '|' || total || '|' || valid_days || '|' || recipients::text from quote_versions where id = v));
  perform pg_temp.prueba('quien solo ve quotes no ve montos', 'null|null|false',
    pg_temp.valor('ver', format($q$ select coalesce((get_site_quote(%L)->'versions'->0->>'total'), 'null') || '|' ||
      coalesce((get_site_quote(%L)->'versions'->0->'lines'->'services'->0->>'amount'), 'null') || '|' ||
      (get_site_quote(%L)->'versions'->0 ? 'sow_path' and get_site_quote(%L)->'versions'->0->>'sow_path' is not null)::text $q$, s1, s1, s1, s1)));
  perform pg_temp.prueba('quien tiene ver precios ve el total', '1467.20',
    pg_temp.valor('ventas', format($q$ select get_site_quote(%L)->'versions'->0->>'total' $q$, s1)));
  perform pg_temp.prueba('las tablas del quote no se leen directo (42501)', 'ERR:42501', pg_temp.valor('ventas', 'select count(*) from quote_versions'));

  -- SOW obligatorio
  perform pg_temp.prueba('sin SOW no se envía (22023)', 'ERR:22023', pg_temp.valor('ventas', format('select prepare_send_quote(%L)', v)));
  perform pg_temp.prueba('SOW con ruta de otro quote: rechazado (22023)', 'ERR:22023',
    pg_temp.valor('ventas', format('select set_quote_sow(%L, %L)', v, gen_random_uuid() || '/' || v || '/sow-a.pdf')));
  perform pg_temp.prueba('subir el SOW al bucket con permiso', '1',
    pg_temp.valor('ventas', format('insert into storage.objects (bucket_id, name) values (''quote-files'', %L) returning 1', q || '/' || v || '/sow-a.pdf')));
  perform pg_temp.prueba('sin permiso no se sube al bucket (42501)', 'ERR:42501',
    pg_temp.valor('ver', format('insert into storage.objects (bucket_id, name) values (''quote-files'', %L) returning 1', q || '/' || v || '/sow-b.pdf')));
  perform pg_temp.prueba('registrar el SOW', 'ok',
    case when pg_temp.valor('ventas', format('select set_quote_sow(%L, %L)', v, q || '/' || v || '/sow-a.pdf')) like 'ERR%' then 'fallo' else 'ok' end);
  perform pg_temp.prueba('sin quotes_enviar no se envía (42501)', 'ERR:42501', pg_temp.valor('ver', format('select prepare_send_quote(%L)', v)));
  perform pg_temp.prueba('preparar el envío: destinatarios = contacto + opcionales, idioma del lead', 'es|2|1.0',
    pg_temp.valor('ventas', format($q$ select (prepare_send_quote(%L)->>'language') || '|' || jsonb_array_length(prepare_send_quote(%L)->'recipients') || '|' || (prepare_send_quote(%L)->>'version') $q$, v, v, v)));
  perform pg_temp.prueba('preparar no cambia el estado', 'draft', (select status::text from quote_versions where id = v));
  perform pg_temp.prueba('confirm_send_quote no se llama desde la app (42501)', 'ERR:42501',
    pg_temp.valor('ventas', format('select confirm_send_quote(%L, null, null, null)', v)));
end $$;

-- C. Envío y portal ---------------------------------------------------------------------------------------
do $$
declare
  v uuid := (select id from fx where k = 'v10');
  q uuid := (select id from fx where k = 'q1');
  lead uuid := (select id from fx where k = 'lead');
  ventas uuid := (select profile_id from actores where nombre = 'ventas');
  tok text;
  r text;
  i int;
  d jsonb;
begin
  tok := confirm_send_quote(v, ventas, q || '/' || v || '/quote-1.0.pdf', '{"language":"es","company":"Oficinas Prueba","site":"Sede norte","address":"100 Main St, Naples","frequency":{"kind":"weekly","days":[0,2,4],"other":""}}')->>'token';
  insert into fx values ('tok10', null);
  update fx set k = 'tok10:' || tok where k = 'tok10';
  perform pg_temp.prueba('enviado: estado, enlace y vencimiento según la vigencia', 'sent|true|45',
    (select status || '|' || (length(public_token) >= 30)::text || '|' || extract(day from (expires_at - sent_at))::int from quote_versions where id = v));
  perform pg_temp.prueba('el lead pasa a Quote enviado', 'quote_sent', (select status::text from leads where id = lead));
  perform pg_temp.prueba('el envío queda en el historial', '1', (select count(*)::text from change_log where action = 'quote_enviado' and entity_id = q));
  perform pg_temp.prueba('un quote enviado ya no se edita (22023)', 'ERR:22023',
    pg_temp.valor('ventas', format('select save_quote_draft(%L, %L, 6, 30, null)', v, '{"services":[],"addons":[],"discounts":[]}')));
  perform pg_temp.prueba('un lead con quote enviado no se borra (23514)', 'ERR:23514',
    pg_temp.valor('ventas', format('with d as (delete from leads where id = %L returning 1) select count(*) from d', lead)));

  perform pg_temp.prueba('portal: anon no llama las funciones del portal (42501)', 'ERR:42501', pg_temp.valor('anon', format('select portal_state(%L)', tok)));
  perform pg_temp.prueba('portal: tampoco un usuario de la app (42501)', 'ERR:42501', pg_temp.valor('ventas', format('select portal_state(%L)', tok)));
  perform pg_temp.prueba('portal: estado abierto y en el idioma del lead', 'open|es', (select (portal_state(tok)->>'state') || '|' || (portal_state(tok)->>'language')));
  perform pg_temp.prueba('portal: enlace inexistente', 'not_found', portal_state('nada')->>'state');
  perform pg_temp.prueba('portal: un correo que no es del quote no recibe código', 'not_recipient', portal_request_code(tok, 'otro@prueba.local', 'h1'));
  perform pg_temp.prueba('portal: el contacto recibe código (sin distinguir mayúsculas)', 'sent', portal_request_code(tok, ' MARTA@prueba.local', 'h1'));
  for i in 1..4 loop r := portal_verify_code(tok, 'marta@prueba.local', 'malo', 's0'); end loop;
  perform pg_temp.prueba('portal: 4 intentos fallidos', 'wrong', r);
  perform pg_temp.prueba('portal: el 5º fallido bloquea', 'locked', portal_verify_code(tok, 'marta@prueba.local', 'malo', 's0'));
  perform pg_temp.prueba('portal: bloqueado aunque el código sea correcto, hasta pedir otro', 'locked', portal_verify_code(tok, 'marta@prueba.local', 'h1', 's0'));
  perform pg_temp.prueba('portal: código nuevo', 'sent', portal_request_code(tok, 'marta@prueba.local', 'h2'));
  perform pg_temp.prueba('portal: el código anterior ya no vale', 'wrong', portal_verify_code(tok, 'marta@prueba.local', 'h1', 's0'));
  perform pg_temp.prueba('portal: código correcto abre sesión', 'ok', portal_verify_code(tok, 'marta@prueba.local', 'h2', 'ses1'));
  perform pg_temp.prueba('portal: un código usado no se reutiliza', 'expired', portal_verify_code(tok, 'marta@prueba.local', 'h2', 'ses9'));
  perform pg_temp.prueba('portal: al entrar pasa a Visto y queda en el historial', 'viewed|1',
    (select status || '|' || (select count(*) from change_log where action = 'quote_visto' and entity_id = q) from quote_versions where id = v));
  perform portal_request_code(tok, 'socio@prueba.local', 'x'); perform portal_request_code(tok, 'marta@prueba.local', 'x');
  perform portal_request_code(tok, 'marta@prueba.local', 'x'); perform portal_request_code(tok, 'marta@prueba.local', 'x');
  perform pg_temp.prueba('portal: más de 5 códigos por hora para el mismo correo: limitado', 'rate_limited', portal_request_code(tok, 'marta@prueba.local', 'x'));
  perform pg_temp.prueba('portal: el correo opcional también entra', 'sent', portal_request_code(tok, 'socio@prueba.local', 'y'));

  d := portal_quote('ses1');
  perform pg_temp.prueba('portal: lo que ve el cliente', 'Oficinas Prueba|Sede norte|1.0|1467.20|false',
    (d->>'company') || '|' || (d->>'site') || '|' || (d->>'version') || '|' || (d->>'total') || '|' || (d->>'sow_opened'));
  perform pg_temp.prueba('portal: sin datos internos (ni notas internas, ni quién lo armó, ni el walkthrough)', '0',
    (select count(*)::text from jsonb_object_keys(d) k where k in ('internal', 'sent_by', 'created_by', 'walkthrough_version', 'contact_email', 'recipients', 'sow_path', 'pdf_path')));
  perform pg_temp.prueba('portal: los motivos van en el idioma del lead', 'Precio',
    (select x->>'label' from jsonb_array_elements(d->'reasons') x where x->>'label' = 'Precio'));
  perform pg_temp.prueba('portal: sesión inválida no ve nada', 'null', coalesce(portal_quote('nada')::text, 'null'));
end $$;

-- D. Decisiones ----------------------------------------------------------------------------------------
do $$
declare
  v uuid := (select id from fx where k = 'v10');
  q uuid := (select id from fx where k = 'q1');
  lead uuid := (select id from fx where k = 'lead');
  s1 uuid := (select id from fx where k = 's1');
  reason uuid := (select id from lost_reasons where label_es = 'Precio');
  d jsonb;
  j uuid;
begin
  perform pg_temp.prueba('aceptar sin abrir el SOW: rechazado (22023)', 'ERR:22023',
    pg_temp.directo($q$ select portal_decide('ses1', 'accepted', 'Marta Gil', 'Gerente', null, null, true, '1.2.3.4', 'UA') $q$));
  perform pg_temp.prueba('abrir el SOW devuelve su ruta y marca la lectura', 'true|true',
    ((portal_file('ses1', 'sow') like '%/sow-a.pdf')::text) || '|' || ((portal_quote('ses1')->>'sow_opened')));
  perform pg_temp.prueba('aceptar sin la casilla de lectura: rechazado (22023)', 'ERR:22023',
    pg_temp.directo($q$ select portal_decide('ses1', 'accepted', 'Marta Gil', 'Gerente', null, null, false, '1.2.3.4', 'UA') $q$));
  perform pg_temp.prueba('aceptar sin cargo: rechazado (22023)', 'ERR:22023',
    pg_temp.directo($q$ select portal_decide('ses1', 'accepted', 'Marta Gil', ' ', null, null, true, '1.2.3.4', 'UA') $q$));
  perform pg_temp.prueba('el PDF del quote se entrega al cliente', 'true', (portal_file('ses1', 'pdf') like '%/quote-1.0.pdf')::text);
  d := portal_decide('ses1', 'accepted', 'Marta Gil', 'Gerente', null, null, true, '1.2.3.4', 'Navegador X');
  perform pg_temp.prueba('aceptar: queda Aceptado con su decisión (nombre, cargo, IP, SOW leído)', 'accepted|Marta Gil|Gerente|1.2.3.4|true|marta@prueba.local',
    (select v2.status || '|' || dd.signer_name || '|' || dd.signer_title || '|' || dd.ip || '|' || (dd.sow_read_at is not null)::text || '|' || dd.email
       from quote_versions v2 join quote_decisions dd on dd.version_id = v2.id where v2.id = v));
  perform pg_temp.prueba('aceptar: el lead pasa a Ganado', 'won', (select status::text from leads where id = lead));
  perform pg_temp.prueba('aceptar: nace el Cliente (uno por lead)', '1|Oficinas Prueba', (select count(*) || '|' || max(name) from clients where lead_id = lead));
  select (d->>'jobsite_id')::uuid into j;
  perform pg_temp.prueba('aceptar: nace el Jobsite con el contacto y la frecuencia del walkthrough', 'Sede norte|100 Main St, Naples|Marta Gil|marta@prueba.local|weekly|active',
    (select name || '|' || address || '|' || contact_name || '|' || contact_email || '|' || (frequency->>'kind') || '|' || status from jobsites where id = j));
  perform pg_temp.prueba('aceptar: la tarifa del jobsite es el total mensual', '1467.20', (select monthly_rate::text from jobsite_rates where jobsite_id = j));
  perform pg_temp.prueba('aceptar: devuelve el correo de quien envió para avisarle', 'ventas@prueba.local', d->>'sender_email');
  perform pg_temp.prueba('aceptar: queda en el historial', '1', (select count(*)::text from change_log where action = 'quote_aceptado' and entity_id = q));
  perform pg_temp.prueba('una segunda decisión no se acepta (22023)', 'ERR:22023',
    pg_temp.directo($q$ select portal_decide('ses1', 'rejected', null, null, (select id from lost_reasons limit 1), null, false, null, null) $q$));
  perform pg_temp.prueba('el portal muestra el estado decidido', 'decided', portal_state(substring((select k from fx where k like 'tok10:%') from 7))->>'state');
  perform pg_temp.prueba('un quote aceptado no admite versión nueva (22023)', 'ERR:22023', pg_temp.valor('ventas', format('select new_quote_version(%L)', q)));
  perform portal_attach_jobsite_sow(j, 'x/sow.pdf', v);
  -- Clientes y tarifas según permisos (D-125, D-210)
  perform pg_temp.prueba('el Cliente lo ve quien tiene clientes_ver', '1', pg_temp.valor('clientes', format('select count(*) from clients where lead_id = %L', lead)));
  perform pg_temp.prueba('sin clientes_ver no', '0', pg_temp.valor('ventas', format('select count(*) from clients where lead_id = %L', lead)));
  -- Hito 5 (20261025000001): la tarifa ya no se lee directo; get_jobsite_rate registra cada apertura (D-210).
  perform pg_temp.prueba('la tarifa no la ve quien solo tiene clientes_ver', 'ERR:42501', pg_temp.valor('clientes', format('select get_jobsite_rate(%L)::text', j)));
  perform pg_temp.prueba('la tarifa sí con clientes_ver_tarifa', 't', (pg_temp.valor('tarifa', format('select get_jobsite_rate(%L)::text', j)) is not null)::text::char(1));
  perform pg_temp.prueba('el SOW del jobsite lo ve quien tiene clientes_ver', '1', pg_temp.valor('clientes', format('select count(*) from jobsite_documents where jobsite_id = %L', j)));
  perform pg_temp.prueba('nadie escribe clientes directo (42501)', 'ERR:42501', pg_temp.valor('tarifa', 'insert into clients (name) values (''X'') returning 1'));
  perform pg_temp.prueba('pendiente en el Inicio: quote aceptado sin ver', 'accepted', pg_temp.valor('ver', format('select kind from home_quote_pending() where lead_id = %L limit 1', lead)));
  perform pg_temp.valor('ver', format('select get_site_quote(%L)', s1));
  perform pg_temp.prueba('al abrir el quote el pendiente desaparece', '0', pg_temp.valor('ver', format('select count(*) from home_quote_pending() where kind = ''accepted'' and lead_id = %L', lead)));
end $$;

-- E. Rechazo, cambios, versiones y vencimiento con un segundo lead de dos sitios ---------------------------
do $$
declare
  l uuid; sa uuid; sb uuid; wa uuid := gen_random_uuid(); wb uuid := gen_random_uuid();
  qa uuid; qb uuid; va uuid; vb uuid; vb2 uuid;
  ventas uuid := (select profile_id from actores where nombre = 'ventas');
  ta text; tb text; tb2 text;
  reason uuid := (select id from lost_reasons where label_es = 'Precio');
  lines jsonb := '{"services":[{"label":"Limpieza","amount":500,"taxable":true}],"addons":[],"discounts":[]}';
begin
  insert into leads (company, email) values ('Dos Sitios SA', 'x@prueba.local') returning id into l;
  insert into lead_sites (lead_id, name, address) values (l, 'A', '1 A St') returning id into sa;
  insert into lead_sites (lead_id, name, address) values (l, 'B', '2 B St') returning id into sb;
  insert into walkthroughs (id, site_id, status, current_version) values (wa, sa, 'closed', 1), (wb, sb, 'closed', 1);
  insert into walkthrough_versions (walkthrough_id, version, data) values
    (wa, 1, '{"contact":{"email":"a@prueba.local","address":"1 A St"},"frequency":{"kind":"daily","days":[0,1,2,3,4,5,6],"other":""}}'),
    (wb, 1, '{"contact":{"email":"b@prueba.local","address":"2 B St"},"frequency":{"kind":"other","days":[],"other":"Dos veces al mes"}}');
  perform pg_temp.valor('ventas', format('select ensure_quote(%L)', sa));
  perform pg_temp.valor('ventas', format('select ensure_quote(%L)', sb));
  select id into qa from quotes where site_id = sa; select id into qb from quotes where site_id = sb;
  select id into va from quote_versions where quote_id = qa; select id into vb from quote_versions where quote_id = qb;
  perform pg_temp.valor('ventas', format('select save_quote_draft(%L, %L, 6, 30, null)', va, lines));
  perform pg_temp.valor('ventas', format('select save_quote_draft(%L, %L, 6, 30, null)', vb, lines));
  insert into storage.objects (bucket_id, name) values ('quote-files', qa || '/' || va || '/sow-a.pdf'), ('quote-files', qb || '/' || vb || '/sow-b.pdf');
  perform pg_temp.valor('ventas', format('select set_quote_sow(%L, %L)', va, qa || '/' || va || '/sow-a.pdf'));
  perform pg_temp.valor('ventas', format('select set_quote_sow(%L, %L)', vb, qb || '/' || vb || '/sow-b.pdf'));
  ta := confirm_send_quote(va, ventas, null, '{"language":"en"}')->>'token';
  tb := confirm_send_quote(vb, ventas, null, '{"language":"en"}')->>'token';
  perform portal_request_code(ta, 'a@prueba.local', 'ca'); perform portal_verify_code(ta, 'a@prueba.local', 'ca', 'sesa');
  perform portal_request_code(tb, 'b@prueba.local', 'cb'); perform portal_verify_code(tb, 'b@prueba.local', 'cb', 'sesb');
  perform pg_temp.prueba('rechazar sin motivo: no (22023)', 'ERR:22023',
    pg_temp.directo($q$ select portal_decide('sesa', 'rejected', null, null, null, 'caro', false, null, null) $q$));
  perform portal_decide('sesa', 'rejected', null, null, reason, 'Muy caro', false, null, null);
  perform pg_temp.prueba('rechazo de un sitio con otro abierto: el lead no pasa a Perdido', 'quote_sent', (select status::text from leads where id = l));
  perform pg_temp.prueba('pedir cambios sin motivo ni nota: no (22023)', 'ERR:22023',
    pg_temp.directo($q$ select portal_decide('sesb', 'changes_requested', null, null, null, '  ', false, null, null) $q$));
  perform portal_decide('sesb', 'changes_requested', null, null, null, 'Menos días', false, null, null);
  perform pg_temp.prueba('pedir cambios: Cambios pedidos, lead en Negociación, portal en solo lectura', 'changes_requested|negotiation|changes_requested',
    (select status::text from quote_versions where id = vb) || '|' || (select status::text from leads where id = l) || '|' || (portal_state(tb)->>'state'));
  vb2 := (pg_temp.valor('ventas', format('select new_quote_version(%L)', qb)))::uuid;
  perform pg_temp.prueba('versión nueva 1.1: copia renglones y SOW y queda en borrador', '1|draft|500.00|true',
    (select minor || '|' || status || '|' || subtotal || '|' || (sow_path is not null)::text from quote_versions where id = vb2));
  tb2 := confirm_send_quote(vb2, ventas, null, '{"language":"en"}')->>'token';
  perform pg_temp.prueba('al enviar la 1.1, la 1.0 queda Reemplazada y su enlace lo dice', 'superseded|superseded',
    (select status::text from quote_versions where id = vb) || '|' || (portal_state(tb)->>'state'));
  perform pg_temp.prueba('el enlace viejo ya no da códigos', 'closed', portal_request_code(tb, 'b@prueba.local', 'z'));
  -- Vencimiento y renovar
  update quote_versions set expires_at = now() - interval '1 minute' where id = vb2;
  perform pg_temp.prueba('vencido: el portal lo dice y no da códigos', 'expired|closed', (portal_state(tb2)->>'state') || '|' || portal_request_code(tb2, 'b@prueba.local', 'z'));
  ta := pg_temp.valor('ventas', format('select new_quote_version(%L)', qb));
  perform pg_temp.prueba('renovar un vencido crea la versión 1.2', '2', (select minor::text from quote_versions where id::text = ta));
  -- Perdido cuando no queda ningún sitio abierto
  perform pg_temp.prueba('lead_quotes: estado por sitio', 'rejected,draft',
    pg_temp.valor('ver', format('select string_agg(status::text, '','' order by site_id = %L desc) from lead_quotes(%L)', sa, l)));
end $$;

do $$
declare
  l uuid; sa uuid; sb uuid; wa uuid := gen_random_uuid(); wb uuid := gen_random_uuid(); qa uuid; qb uuid; va uuid; vb uuid;
  ventas uuid := (select profile_id from actores where nombre = 'ventas');
  reason uuid := (select id from lost_reasons where label_es = 'Precio');
  lines jsonb := '{"services":[{"label":"Limpieza","amount":500,"taxable":true}],"addons":[],"discounts":[]}';
  t text;
begin
  insert into leads (company) values ('Pierde Todo SA') returning id into l;
  insert into lead_sites (lead_id, address) values (l, '1 A') returning id into sa;
  insert into lead_sites (lead_id, address) values (l, '2 B') returning id into sb;
  insert into walkthroughs (id, site_id, status, current_version) values (wa, sa, 'closed', 1), (wb, sb, 'closed', 1);
  insert into walkthrough_versions (walkthrough_id, version, data) values (wa, 1, '{"contact":{"email":"a@prueba.local"}}'), (wb, 1, '{"contact":{"email":"b@prueba.local"}}');
  perform pg_temp.valor('ventas', format('select ensure_quote(%L)', sa)); perform pg_temp.valor('ventas', format('select ensure_quote(%L)', sb));
  select id into qa from quotes where site_id = sa; select id into qb from quotes where site_id = sb;
  select id into va from quote_versions where quote_id = qa; select id into vb from quote_versions where quote_id = qb;
  update quote_versions set lines = '{"services":[{"label":"L","amount":5,"taxable":true}],"addons":[],"discounts":[]}', sow_path = 'x' where id in (va, vb);
  t := confirm_send_quote(va, ventas, null, '{}')->>'token'; perform portal_request_code(t, 'a@prueba.local', 'c'); perform portal_verify_code(t, 'a@prueba.local', 'c', 'p1');
  t := confirm_send_quote(vb, ventas, null, '{}')->>'token'; perform portal_request_code(t, 'b@prueba.local', 'c'); perform portal_verify_code(t, 'b@prueba.local', 'c', 'p2');
  perform portal_decide('p1', 'rejected', null, null, reason, null, false, null, null);
  perform pg_temp.prueba('primer sitio rechazado: el lead sigue abierto', 'quote_sent', (select status::text from leads where id = l));
  perform portal_decide('p2', 'rejected', null, null, reason, 'Nota final', false, null, null);
  perform pg_temp.prueba('todos los sitios rechazados: el lead pasa a Perdido con el motivo', 'lost|Precio|Nota final',
    (select l2.status || '|' || r.label_es || '|' || l2.lost_note from leads l2 join lost_reasons r on r.id = l2.lost_reason_id where l2.id = l));
end $$;

-- Resultado ------------------------------------------------------------------------------------------

select prueba, ok, detalle from resultados order by n;
-- FIN-DE-PRUEBAS
rollback;
