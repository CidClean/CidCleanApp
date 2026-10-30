-- Pruebas del W-9 prellenado del 1099 (migración 20261027000016, D-255, D-256, D-257).
-- Repetibles: todo ocurre dentro de una transacción que termina en rollback, no queda nada en la base.
-- Simulan roles con `set local role` y `request.jwt.claims`, como hace la API.
-- Uso: psql -f supabase/tests/w9.sql   (la última consulta lista cada prueba con ok = true/false).

begin;

create temp table resultados (n int generated always as identity, prueba text, ok boolean, detalle text);
create temp table actores (nombre text primary key, auth_id uuid, profile_id uuid);
create temp table fx (k text primary key, id uuid, txt text);
grant all on resultados, actores, fx to public;

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

-- Como la service role (lo que hace la Edge Function w9-portal).
create function pg_temp.servicio(consulta text) returns text language plpgsql as $$
declare resultado text;
begin
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  set local role service_role;
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

-- Hash como el de la Edge Function (sha256 en hex).
create function pg_temp.h(t text) returns text language sql as $$ select encode(digest(t, 'sha256'), 'hex') $$;

grant execute on all functions in schema pg_temp to public;
grant usage on schema storage to service_role;
grant select, insert on storage.objects to service_role;

-- Personas de prueba -------------------------------------------------------------------------------
do $$
declare
  quien text;
  pid uuid;
  aid uuid;
begin
  foreach quien in array array['docs', 'pagos', 'sin_permisos'] loop
    aid := gen_random_uuid();
    insert into profiles (full_name, worker_type, role, email, has_app_access)
    values ('Prueba ' || quien, 'w2', 'employee', quien || '@prueba.local', true) returning id into pid;
    insert into auth.users (id, aud, role, email) values (aid, 'authenticated', 'authenticated', quien || '@prueba.local');
    insert into actores values (quien, aid, pid);
  end loop;
  insert into actores select 'super', auth_user_id, id from profiles where is_super_admin;
  insert into profile_permissions (profile_id, permission_key)
    select profile_id, 'empleados_gestionar_documentos' from actores where nombre = 'docs';
  insert into profile_permissions (profile_id, permission_key)
    select profile_id, k from actores, unnest(array['empleados_ver', 'empleados_ver_pagos']) k where nombre = 'pagos';
  insert into profiles (full_name, worker_type, role, language, has_app_access)
  values ('Karina López', '1099', 'employee', 'es', false) returning id into pid;
  insert into fx (k, id) values ('karina', pid);
  insert into profiles (full_name, worker_type, role, has_app_access) values ('Pedro W2', 'w2', 'employee', false) returning id into pid;
  insert into fx (k, id) values ('w2', pid);
end $$;

-- A. Datos del formulario -------------------------------------------------------------------------
select pg_temp.prueba('datos: individual con nombre y dirección es válido', 'true',
  w9_data_valid(w9_clean('{"name":"Karina","classification":"individual","address":"1520 Golden Gate Pkwy","city":"Naples, FL 34105"}'))::text);
select pg_temp.prueba('datos: sin nombre, sin dirección o sin ciudad no es válido', 'false|false|false',
  w9_data_valid(w9_clean('{"name":" ","classification":"individual","address":"A","city":"B"}'))::text || '|' ||
  w9_data_valid(w9_clean('{"name":"K","classification":"individual","address":"","city":"B"}'))::text || '|' ||
  w9_data_valid(w9_clean('{"name":"K","classification":"individual","address":"A"}'))::text);
select pg_temp.prueba('datos: LLC exige la letra C, S o P; Other exige el texto (D-257)', 'false|true|false|false|true',
  w9_data_valid(w9_clean('{"name":"K","classification":"llc","address":"A","city":"B"}'))::text || '|' ||
  w9_data_valid(w9_clean('{"name":"K","classification":"llc","llc":"s","address":"A","city":"B"}'))::text || '|' ||
  w9_data_valid(w9_clean('{"name":"K","classification":"llc","llc":"X","address":"A","city":"B"}'))::text || '|' ||
  w9_data_valid(w9_clean('{"name":"K","classification":"other","address":"A","city":"B"}'))::text || '|' ||
  w9_data_valid(w9_clean('{"name":"K","classification":"other","other":"Cooperative","address":"A","city":"B"}'))::text);
select pg_temp.prueba('datos: clasificación desconocida o campo que no es texto no es válido', 'false|false',
  w9_data_valid(w9_clean('{"name":"K","classification":"ngo","address":"A","city":"B"}'))::text || '|' ||
  w9_data_valid(w9_clean('{"name":123,"classification":"individual","address":"A","city":"B"}'))::text);
select pg_temp.prueba('datos: códigos de la línea 4 (exempt payee 1 a 13, FATCA A a M)', 'true|false|false',
  w9_data_valid(w9_clean('{"name":"K","classification":"c_corp","exempt_payee":"13","fatca":"m","address":"A","city":"B"}'))::text || '|' ||
  w9_data_valid(w9_clean('{"name":"K","classification":"c_corp","exempt_payee":"14","address":"A","city":"B"}'))::text || '|' ||
  w9_data_valid(w9_clean('{"name":"K","classification":"c_corp","fatca":"Z","address":"A","city":"B"}'))::text);
select pg_temp.prueba('datos: línea 4, casilla 3b y línea 7 se guardan con cualquier clasificación (D-258)', '5|A|true|ACC-1',
  (select (d->>'exempt_payee') || '|' || (d->>'fatca') || '|' || (d->>'foreign_partners') || '|' || (d->>'accounts')
     from w9_clean('{"name":"K","classification":"individual","exempt_payee":"5","fatca":"a","foreign_partners":true,"accounts":" ACC-1 ","address":"A","city":"B"}') d));
select pg_temp.prueba('datos: la letra del LLC y el texto de Other solo quedan con su clasificación', '|',
  (select (d->>'llc') || '|' || (d->>'other') from w9_clean('{"name":"K","classification":"individual","llc":"C","other":"x","address":"A","city":"B"}') d));
select pg_temp.prueba('datos: la línea 7 hasta 100 caracteres', 'true|false',
  w9_data_valid(w9_clean(jsonb_build_object('name','K','classification','individual','address','A','city','B','accounts',repeat('x',100))))::text || '|' ||
  w9_data_valid(w9_clean(jsonb_build_object('name','K','classification','individual','address','A','city','B','accounts',repeat('x',101))))::text);
select pg_temp.prueba('cambios: solo nombre, negocio, clasificación y dirección, con antes y después', 'name,address',
  (select string_agg(x->>'field', ',') from jsonb_array_elements(w9_changes(
     w9_clean('{"name":"Karina López","classification":"individual","address":"1520 Golden Gate Pkwy","city":"Naples, FL 34105","exempt_payee":""}'),
     w9_clean('{"name":"Karina M. López","classification":"individual","address":"1520 Golden Gate Pkwy","city":"Naples, FL 34109"}'))) x));

-- B. Ninguna columna ni argumento guarda el número (seguridad obligatoria) -------------------------
select pg_temp.prueba('ninguna columna de la base se llama ssn, itin, ein o tin (solo tin_type)', '0',
  (select count(*)::text from information_schema.columns
    where table_schema = 'public' and column_name ~* '(^|_)(ssn|itin|ein|tin)($|_)' and column_name <> 'tin_type'));
select pg_temp.prueba('las funciones del W-9 no reciben el número (solo el tipo)', '0',
  (select count(*)::text from pg_proc p, unnest(coalesce(p.proargnames, '{}')) a
    where p.proname like '%w9%' and a ~* '(ssn|itin|ein|tin)' and a <> 'p_tin_type'));

-- C. Crear y ver el estado (empleados_gestionar_documentos) ----------------------------------------
select pg_temp.prueba('crear: sin el permiso de documentos no se puede (ni con ver pagos)', 'ERR:42501|ERR:42501|ERR:42501',
  pg_temp.valor('sin_permisos', format($q$select create_w9_request(%L, '{"name":"K","classification":"individual","address":"A","city":"B"}', 'k@prueba.local', %L)$q$,
    (select id from fx where k = 'karina'), pg_temp.h('t0'))) || '|' ||
  pg_temp.valor('pagos', format($q$select create_w9_request(%L, '{"name":"K","classification":"individual","address":"A","city":"B"}', 'k@prueba.local', %L)$q$,
    (select id from fx where k = 'karina'), pg_temp.h('t0'))) || '|' ||
  pg_temp.valor('anon', format($q$select create_w9_request(%L, '{"name":"K","classification":"individual","address":"A","city":"B"}', 'k@prueba.local', %L)$q$,
    (select id from fx where k = 'karina'), pg_temp.h('t0'))));
select pg_temp.prueba('crear: solo para un 1099, con correo y datos válidos', 'ERR:22023|ERR:22023|ERR:22023',
  pg_temp.valor('docs', format($q$select create_w9_request(%L, '{"name":"K","classification":"individual","address":"A","city":"B"}', 'p@prueba.local', %L)$q$,
    (select id from fx where k = 'w2'), pg_temp.h('t0'))) || '|' ||
  pg_temp.valor('docs', format($q$select create_w9_request(%L, '{"name":"K","classification":"individual","address":"A","city":"B"}', 'no-es-correo', %L)$q$,
    (select id from fx where k = 'karina'), pg_temp.h('t0'))) || '|' ||
  pg_temp.valor('docs', format($q$select create_w9_request(%L, '{"name":"K","classification":"llc","address":"A","city":"B"}', 'k@prueba.local', %L)$q$,
    (select id from fx where k = 'karina'), pg_temp.h('t0'))));
select pg_temp.prueba('crear: devuelve correo y vencimiento a los 7 días', 'karina@email.com|7',
  pg_temp.valor('docs', format($q$select (r->>'email') || '|' || extract(day from ((r->>'expires_at')::timestamptz - now() + interval '1 minute'))::int
     from create_w9_request(%L, '{"name":"Karina López","business":"","classification":"individual","address":"1520 Golden Gate Pkwy","city":"Naples, FL 34105"}', ' Karina@Email.com ', %L) r$q$,
    (select id from fx where k = 'karina'), pg_temp.h('primero'))));
select pg_temp.prueba('las tablas del W-9 no se leen directo (ni con el permiso)', 'ERR:42501|ERR:42501',
  pg_temp.valor('docs', 'select count(*) from w9_requests') || '|' || pg_temp.valor('docs', 'select count(*) from w9_signatures'));
select pg_temp.prueba('historial: queda "w9_enviado" sin datos del formulario', 'karina@email.com|w9',
  (select (detail->>'email') || '|' || (detail->>'kind') from change_log where action = 'w9_enviado' order by at desc limit 1));
-- Mandar otra reemplaza a la anterior: una sola abierta por perfil.
select pg_temp.prueba('mandar otra: la anterior queda reemplazada', 'ok',
  case when pg_temp.valor('docs', format($q$select create_w9_request(%L, '{"name":"Karina López","business":"","classification":"individual","address":"1520 Golden Gate Pkwy","city":"Naples, FL 34105"}', 'karina@email.com', %L)->>'email'$q$,
    (select id from fx where k = 'karina'), pg_temp.h('segundo'))) = 'karina@email.com' then 'ok' end);
select pg_temp.prueba('mandar otra: el link anterior ya no sirve', 'replaced|open|es',
  pg_temp.servicio(format('select w9_portal_state(%L)->>''state''', pg_temp.h('primero'))) || '|' ||
  pg_temp.servicio(format('select w9_portal_state(%L)->>''state''', pg_temp.h('segundo'))) || '|' ||
  pg_temp.servicio(format('select w9_portal_state(%L)->>''language''', pg_temp.h('segundo'))));
select pg_temp.prueba('estado en el perfil: Enviado; sin el permiso no se ve', 'sent|ERR:42501',
  pg_temp.valor('docs', format('select w9_request_status(%L)->>''status''', (select id from fx where k = 'karina'))) || '|' ||
  pg_temp.valor('pagos', format('select w9_request_status(%L)->>''status''', (select id from fx where k = 'karina'))));

-- D. Portal: código y sesión -----------------------------------------------------------------------
select pg_temp.prueba('portal: anon y authenticated no llaman las funciones del portal', 'ERR:42501|ERR:42501',
  pg_temp.valor('anon', format('select w9_portal_state(%L)', pg_temp.h('segundo'))) || '|' ||
  pg_temp.valor('docs', format('select w9_portal_state(%L)', pg_temp.h('segundo'))));
select pg_temp.prueba('portal: el código solo va al correo de la solicitud', 'not_recipient|sent',
  pg_temp.servicio(format('select w9_portal_request_code(%L, %L, %L)', pg_temp.h('segundo'), 'otro@email.com', 'c1')) || '|' ||
  pg_temp.servicio(format('select w9_portal_request_code(%L, %L, %L)', pg_temp.h('segundo'), 'KARINA@email.com', 'c1')));
do $$
declare i int; last text;
begin
  for i in 1..5 loop
    last := pg_temp.servicio(format('select w9_portal_verify_code(%L, %L, %L, %L)', pg_temp.h('segundo'), 'karina@email.com', 'malo', 's-x'));
  end loop;
  perform pg_temp.prueba('portal: 5 intentos fallidos bloquean el código', 'locked', last);
  perform pg_temp.prueba('portal: bloqueado aunque después ponga el bueno', 'locked',
    pg_temp.servicio(format('select w9_portal_verify_code(%L, %L, %L, %L)', pg_temp.h('segundo'), 'karina@email.com', 'c1', 's-x')));
  -- Hasta 5 códigos por hora (ya pidió 1).
  for i in 1..4 loop
    last := pg_temp.servicio(format('select w9_portal_request_code(%L, %L, %L)', pg_temp.h('segundo'), 'karina@email.com', 'c' || (i + 1)));
  end loop;
  perform pg_temp.prueba('portal: el quinto código de la hora se manda', 'sent', last);
  perform pg_temp.prueba('portal: el sexto código de la hora no', 'rate_limited',
    pg_temp.servicio(format('select w9_portal_request_code(%L, %L, %L)', pg_temp.h('segundo'), 'karina@email.com', 'c9')));
  perform pg_temp.prueba('portal: un código anterior ya no vale', 'wrong',
    pg_temp.servicio(format('select w9_portal_verify_code(%L, %L, %L, %L)', pg_temp.h('segundo'), 'karina@email.com', 'c4', 's-x')));
  perform pg_temp.prueba('portal: el último código abre la sesión', 'ok',
    pg_temp.servicio(format('select w9_portal_verify_code(%L, %L, %L, %L)', pg_temp.h('segundo'), 'karina@email.com', 'c5', 'sesion-1')));
  perform pg_temp.prueba('portal: el código se usa una sola vez', 'expired',
    pg_temp.servicio(format('select w9_portal_verify_code(%L, %L, %L, %L)', pg_temp.h('segundo'), 'karina@email.com', 'c5', 'sesion-2')));
end $$;
select pg_temp.prueba('portal: con sesión ve los datos prellenados y el idioma del perfil', 'open|es|Karina López|individual',
  pg_temp.servicio($q$select (d->>'status') || '|' || (d->>'language') || '|' || (d->'data'->>'name') || '|' || (d->'data'->>'classification') from w9_portal_data('sesion-1') d$q$));
select pg_temp.prueba('portal: sin sesión válida no ve nada', null, pg_temp.servicio($q$select w9_portal_data('otra')::text$q$));

-- E. Firma -----------------------------------------------------------------------------------------
select pg_temp.prueba('revisar: datos no válidos o tipo de número desconocido', 'ERR:22023|ERR:22023',
  pg_temp.servicio($q$select w9_portal_check('sesion-1', '{"name":"","classification":"individual","address":"A","city":"B"}', 'ssn', 'K', true)::text$q$) || '|' ||
  pg_temp.servicio($q$select w9_portal_check('sesion-1', '{"name":"K","classification":"individual","address":"A","city":"B"}', 'passport', 'K', true)::text$q$));
insert into fx (k, txt) select 'path', pg_temp.servicio($q$select w9_portal_check('sesion-1',
  '{"name":"Karina M. López","business":"","classification":"individual","address":"1520 Golden Gate Pkwy","city":"Naples, FL 34109"}', 'ssn', 'Karina M. López', true)->>'path_prefix'$q$) || '-prueba1234.pdf.enc';
select pg_temp.prueba('revisar: la ruta del PDF va en la carpeta W-9 del empleado', 'true',
  ((select txt from fx where k = 'path') like (select id from fx where k = 'karina')::text || '/w9/signed-%.pdf.enc')::text);
select pg_temp.prueba('firmar: sin el PDF subido no se firma', 'ERR:22023',
  pg_temp.servicio(format($q$select w9_portal_sign('sesion-1', '{"name":"Karina M. López","classification":"individual","address":"1520 Golden Gate Pkwy","city":"Naples, FL 34109"}',
    'ssn', 'Karina M. López', true, 'Form W-9 (Rev. March 2024)', %L, '1.2.3.4', 'Prueba')::text$q$, (select txt from fx where k = 'path'))));
insert into storage.objects (bucket_id, name) select 'employee-docs', txt from fx where k = 'path';
select pg_temp.prueba('firmar: sin la casilla, sin nombre o con otra ruta no se firma', 'ERR:22023|ERR:22023|ERR:22023',
  pg_temp.servicio(format($q$select w9_portal_sign('sesion-1', '{"name":"K","classification":"individual","address":"A","city":"B"}',
    'ssn', 'K', false, 'Form W-9 (Rev. March 2024)', %L, null, null)::text$q$, (select txt from fx where k = 'path'))) || '|' ||
  pg_temp.servicio(format($q$select w9_portal_sign('sesion-1', '{"name":"K","classification":"individual","address":"A","city":"B"}',
    'ssn', '  ', true, 'Form W-9 (Rev. March 2024)', %L, null, null)::text$q$, (select txt from fx where k = 'path'))) || '|' ||
  pg_temp.servicio($q$select w9_portal_sign('sesion-1', '{"name":"K","classification":"individual","address":"A","city":"B"}',
    'ssn', 'K', true, 'Form W-9 (Rev. March 2024)', 'otra/w9/x.pdf', null, null)::text$q$));
-- Certificado (D-268 (4)): correo verificado y quién lo mandó; la firma guarda su id y el SHA-256 del PDF.
select pg_temp.prueba('certificado: correo verificado y quién lo mandó', 'karina@email.com|Prueba docs|true',
  pg_temp.servicio($q$select (c->>'email') || '|' || (c->>'sent_by') || '|' || ((c->>'sent_at') is not null)::text from w9_portal_certificate('sesion-1') c$q$));
select pg_temp.prueba('certificado: sin sesión no', 'ERR:42501', pg_temp.servicio($q$select w9_portal_certificate('otra')::text$q$));
select pg_temp.prueba('certificado: un hash mal formado no se firma', 'ERR:22023',
  pg_temp.servicio(format($q$select w9_portal_sign('sesion-1', '{"name":"Karina M. López","business":"","classification":"individual","address":"1520 Golden Gate Pkwy","city":"Naples, FL 34109"}',
    'ssn', 'Karina M. López', true, 'Form W-9 (Rev. March 2024)', %L, '1.2.3.4', 'Prueba UA', gen_random_uuid(), 'xyz')::text$q$, (select txt from fx where k = 'path'))));
select pg_temp.prueba('firmar: queda firmado', 'ok',
  case when pg_temp.servicio(format($q$select w9_portal_sign('sesion-1', '{"name":"Karina M. López","business":"","classification":"individual","address":"1520 Golden Gate Pkwy","city":"Naples, FL 34109"}',
    'ssn', 'Karina M. López', true, 'Form W-9 (Rev. March 2024)', %L, '1.2.3.4', 'Prueba UA', 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee', %L)->>'document_id'$q$,
    (select txt from fx where k = 'path'), repeat('ab', 32))) ~ '^[0-9a-f-]{36}$' then 'ok' end);
select pg_temp.prueba('certificado: la firma guarda el id dado y el SHA-256', 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee|' || repeat('ab', 32),
  (select id || '|' || pdf_sha256 from w9_signatures where profile_id = (select id from fx where k = 'karina')));
select pg_temp.prueba('firmar: el PDF queda como el W-9 vigente del perfil', 'w9|1',
  (select kind || '|' || count(*) over () from profile_documents where profile_id = (select id from fx where k = 'karina') and replaced_at is null));
select pg_temp.prueba('firmar: se registra nombre, IP, user agent, versión, tipo y cambios (nombre y dirección)', 'Karina M. López|1.2.3.4|Prueba UA|Form W-9 (Rev. March 2024)|ssn|name,address',
  (select signer_name || '|' || ip || '|' || user_agent || '|' || form_version || '|' || tin_type || '|' ||
          (select string_agg(x->>'field', ',') from jsonb_array_elements(changes) x) from w9_signatures where profile_id = (select id from fx where k = 'karina')));
select pg_temp.prueba('firmar: un solo uso (la segunda vez no)', 'ERR:22023|signed',
  pg_temp.servicio(format($q$select w9_portal_sign('sesion-1', '{"name":"K","classification":"individual","address":"A","city":"B"}',
    'ssn', 'K', true, 'Form W-9 (Rev. March 2024)', %L, null, null)::text$q$, (select txt from fx where k = 'path'))) || '|' ||
  pg_temp.servicio(format('select w9_portal_state(%L)->>''state''', pg_temp.h('segundo'))));
select pg_temp.prueba('firmado: ya no se piden códigos', 'closed',
  pg_temp.servicio(format('select w9_portal_request_code(%L, %L, %L)', pg_temp.h('segundo'), 'karina@email.com', 'c10')));
select pg_temp.prueba('firmado: el portal muestra la firma', 'signed|Karina M. López',
  pg_temp.servicio($q$select (d->>'status') || '|' || (d->>'signer_name') from w9_portal_data('sesion-1') d$q$));
select pg_temp.prueba('aviso dentro de la app a quien la envió', 'w9_signed|Karina López|/employees/[id]',
  (select kind || '|' || (data->>'name') || '|' || (link->>'pathname') from notifications
    where kind = 'w9_signed' and profile_id = (select profile_id from actores where nombre = 'docs')));
select pg_temp.prueba('texto del aviso en su idioma', 'W-9 firmado|W-9 signed',
  (notification_text('w9_signed', '{"name":"K"}', 'es')).title || '|' || (notification_text('w9_signed', '{"name":"K"}', 'en')).title);
select pg_temp.prueba('estado en el perfil: Firmado con el documento y lo que cambió', 'signed|true|2',
  (select split_part(x, '|', 1) || '|' || (split_part(x, '|', 2) = (select id::text from profile_documents where profile_id = (select id from fx where k = 'karina') and replaced_at is null))::text
          || '|' || split_part(x, '|', 3)
     from pg_temp.valor('docs', format($q$select (s->>'status') || '|' || (s->>'document_id') || '|' || jsonb_array_length(s->'changes')
       from w9_request_status(%L) s$q$, (select id from fx where k = 'karina'))) x));
select pg_temp.prueba('el PDF firmado solo lo abre el Super Admin (D-260)', 'ok|ERR:42501|ERR:42501',
  case when pg_temp.valor('super', format('select open_profile_document(%L)', (select id from profile_documents where profile_id = (select id from fx where k = 'karina') and replaced_at is null)))
            = (select txt from fx where k = 'path') then 'ok' end || '|' ||
  pg_temp.valor('pagos', format('select open_profile_document(%L)', (select id from profile_documents where profile_id = (select id from fx where k = 'karina') and replaced_at is null))) || '|' ||
  pg_temp.valor('docs', format('select open_profile_document(%L)', (select id from profile_documents where profile_id = (select id from fx where k = 'karina') and replaced_at is null))));
select pg_temp.prueba('historial: documento subido y w9_firmado, sin número', 'documento_subido,w9_firmado|0',
  (select string_agg(action, ',' order by action) from change_log where action in ('documento_subido', 'w9_firmado')
      and detail->>'profile_id' = (select id::text from fx where k = 'karina')) || '|' ||
  (select count(*)::text from change_log where detail::text ~ '\d{3}-?\d{2}-?\d{4}'));

-- F. Vencer y reenviar ------------------------------------------------------------------------------
select pg_temp.prueba('reenviar: una firmada no se reenvía', 'ERR:22023',
  pg_temp.valor('docs', format('select resend_w9_request(%L, %L)', (select id from w9_requests where status = 'signed' and profile_id = (select id from fx where k = 'karina')), pg_temp.h('tercero'))));
-- Una solicitud nueva que vence.
select pg_temp.valor('docs', format($q$select create_w9_request(%L, '{"name":"Karina M. López","classification":"llc","llc":"P","foreign_partners":true,"accounts":"A-1","address":"1520 Golden Gate Pkwy","city":"Naples, FL 34109"}', 'karina@email.com', %L)->>'id'$q$,
  (select id from fx where k = 'karina'), pg_temp.h('cuarto')));
select pg_temp.servicio(format('select w9_portal_request_code(%L, %L, %L)', pg_temp.h('cuarto'), 'karina@email.com', 'k1'));
select pg_temp.servicio(format('select w9_portal_verify_code(%L, %L, %L, %L)', pg_temp.h('cuarto'), 'karina@email.com', 'k1', 'sesion-4'));
update w9_requests set expires_at = now() - interval '1 minute' where token_hash = pg_temp.h('cuarto');
select pg_temp.prueba('vencido a los 7 días: el portal lo muestra vencido y no da códigos ni firma', 'expired|closed|ERR:22023',
  pg_temp.servicio(format('select w9_portal_state(%L)->>''state''', pg_temp.h('cuarto'))) || '|' ||
  pg_temp.servicio(format('select w9_portal_request_code(%L, %L, %L)', pg_temp.h('cuarto'), 'karina@email.com', 'k2')) || '|' ||
  pg_temp.servicio($q$select w9_portal_check('sesion-4', '{"name":"K","classification":"individual","address":"A","city":"B"}', 'ssn', 'K', true)::text$q$));
select pg_temp.prueba('vencido: el perfil lo ve vencido', 'expired',
  pg_temp.valor('docs', format('select w9_request_status(%L)->>''status''', (select id from fx where k = 'karina'))));
select pg_temp.prueba('reenviar: sin permiso no', 'ERR:42501',
  pg_temp.valor('pagos', format('select resend_w9_request(%L, %L)', (select id from w9_requests where token_hash = pg_temp.h('cuarto')), pg_temp.h('quinto'))));
select pg_temp.prueba('reenviar: link nuevo por 7 días más', 'karina@email.com',
  pg_temp.valor('docs', format('select resend_w9_request(%L, %L)->>''email''', (select id from w9_requests where token_hash = pg_temp.h('cuarto')), pg_temp.h('quinto'))));
select pg_temp.prueba('reenviar: el link anterior y su sesión dejan de servir; el nuevo abre', 'not_found|null|open|sent',
  pg_temp.servicio(format('select w9_portal_state(%L)->>''state''', pg_temp.h('cuarto'))) || '|' ||
  coalesce(pg_temp.servicio($q$select w9_portal_data('sesion-4')::text$q$), 'null') || '|' ||
  pg_temp.servicio(format('select w9_portal_state(%L)->>''state''', pg_temp.h('quinto'))) || '|' ||
  pg_temp.valor('docs', format('select w9_request_status(%L)->>''status''', (select id from fx where k = 'karina'))));
select pg_temp.prueba('historial: queda "w9_reenviado"', '1', (select count(*)::text from change_log where action = 'w9_reenviado'));

-- Resultado ------------------------------------------------------------------------------------------

select prueba, ok, detalle from resultados order by n;
-- FIN-DE-PRUEBAS
rollback;
