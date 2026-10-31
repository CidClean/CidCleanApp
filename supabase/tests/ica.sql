-- Pruebas del ICA (migraciones 20261031000002 y 20261031000005; órdenes 65 y 69). D-292: el ICA es opcional y no
-- bloquea asignar, programar, ofrecer ni registrar días.
-- Repetibles: todo termina en rollback. Uso (desde la raíz del repositorio): psql -f supabase/tests/ica.sql
-- (la última consulta lista cada prueba con ok = true/false).

begin;

create temp table resultados (n int generated always as identity, prueba text, ok boolean, detalle text);
create temp table actores (nombre text primary key, auth_id uuid, profile_id uuid);
create temp table ids (k text primary key, v uuid);
grant all on resultados, actores, ids to public;

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
    resultado := 'ERR:' || sqlstate || ':' || sqlerrm;
  end;
  reset role;
  return resultado;
end $$;
create function pg_temp.servicio(consulta text) returns text language plpgsql as $$
declare
  resultado text;
begin
  set local role service_role;
  begin
    execute consulta into resultado;
  exception when others then
    resultado := 'ERR:' || sqlstate || ':' || sqlerrm;
  end;
  reset role;
  return resultado;
end $$;
create function pg_temp.prueba(nombre text, esperado text, obtenido text) returns void language sql as $$
  insert into resultados (prueba, ok, detalle) values (nombre, esperado is not distinct from obtenido,
    'esperado=' || coalesce(esperado, 'null') || ' obtenido=' || coalesce(obtenido, 'null'));
$$;
create function pg_temp.id(k text) returns uuid language sql as $$ select v from ids where ids.k = $1 $$;
create function pg_temp.pid(n text) returns uuid language sql as $$ select profile_id from actores where nombre = $1 $$;
grant execute on function pg_temp.id(text), pg_temp.pid(text) to public;

-- Personas: admin (todo menos Super Admin), super; 1099 viejo (ya asignado antes, "anterior a la app"), nuevo (sin
-- nada), w2.
do $$
declare
  quien text;
  pid uuid;
  aid uuid;
  cli uuid;
  js uuid;
  js2 uuid;
begin
  insert into clients (name, legacy) values ('Cuenta ICA', true) returning id into cli;
  insert into jobsites (client_id, name, address, frequency) values (cli, 'Sede ICA', '1 Main St', '{"kind":"other","days":[]}') returning id into js;
  insert into jobsites (client_id, name, address, frequency) values (cli, 'Sede ICA 2', '2 Main St', '{"kind":"other","days":[]}') returning id into js2;
  update jobsites set contract_status = 'both_signed' where id in (js, js2);
  insert into ids values ('js', js), ('js2', js2);
  foreach quien in array array['admin', 'viejo', 'nuevo', 'w2'] loop
    aid := gen_random_uuid();
    insert into profiles (full_name, worker_type, role, email, has_app_access, phone, address_line1, city, state, zip)
    values ('Prueba ' || quien, case when quien in ('viejo', 'nuevo') then '1099' else 'w2' end::worker_type,
            'employee', quien || '@prueba-ica.local', true, '(239) 555-0100', '10 Palm Ave', 'Naples', 'FL', '34102')
    returning id into pid;
    insert into auth.users (id, aud, role, email) values (aid, 'authenticated', 'authenticated', quien || '@prueba-ica.local');
    insert into actores values (quien, aid, pid);
  end loop;
  aid := gen_random_uuid();
  insert into auth.users (id, aud, role, email) values (aid, 'authenticated', 'authenticated', 'super@prueba-ica.local');
  update profiles set auth_user_id = aid where is_super_admin and auth_user_id is null;
  insert into actores select 'super', auth_user_id, id from profiles where is_super_admin;
  update profiles p set auth_user_id = a.auth_id from actores a where a.profile_id = p.id and p.auth_user_id is null;
  insert into profile_permissions (profile_id, permission_key)
  select pg_temp.pid('admin'), k from unnest(array['empleados_ver', 'empleados_asignar_pago', 'empleados_ver_pagos', 'schedule_ver_editar',
                                                   'work_registrar_por_otros', 'work_aprobar', 'empleados_gestionar_documentos']) k;
end $$;

do $$
declare
  r text; js uuid := pg_temp.id('js'); js2 uuid := pg_temp.id('js2'); nuevo uuid := pg_temp.pid('nuevo'); viejo uuid := pg_temp.pid('viejo');
  ica uuid; v uuid; p text; tok text := repeat('a', 64); ses text := repeat('b', 64);
begin
  -- D-292: sin ICA ni W-9 no se frena nada
  perform pg_temp.prueba('1099 sin ICA ni W-9 se asigna', 'ok',
    case when pg_temp.valor('admin', format('select assign_employee(%L, %L, %L::date)', js, nuevo, cc_today())) like 'ERR%' then 'mal' else 'ok' end);
  insert into visits (jobsite_id, starts_at, minutes, local_date) values (js2, now() + interval '2 days', 120, local_day(now() + interval '2 days')) returning id into v;
  perform pg_temp.prueba('1099 sin ICA entra a una visita de otro jobsite', 'ok',
    case when pg_temp.valor('admin', format('select set_visit_staff(%L, array[%L]::uuid[])::text', v, viejo)) like 'ERR%' then 'mal' else 'ok' end);
  perform pg_temp.prueba('la regla ya no existe', '0|0',
    (select count(*) from pg_trigger where tgname in ('jobsite_assignments_ica', 'visit_staff_ica', 'service_days_ica'))::text || '|' ||
    (select count(*) from pg_proc where proname in ('ica_can_work', 'ica_check'))::text);
  perform pg_temp.prueba('ica_info: sin ICA = none (ficha "Sin ICA")', 'none', pg_temp.valor('admin', format($q$ select ica_info(%L)->>'state' $q$, nuevo)));
  perform pg_temp.prueba('ica_info: W-2 = not_required', 'not_required', pg_temp.valor('admin', format($q$ select ica_info(%L)->>'state' $q$, pg_temp.pid('w2'))));
  perform pg_temp.prueba('ica_info: otro empleado sin permiso no lo ve', 'ERR:42501', left(pg_temp.valor('w2', format('select ica_info(%L)', nuevo)), 9));

  -- Preparar
  perform pg_temp.prueba('solo el Super Admin prepara', 'ERR:42501', left(pg_temp.valor('admin', format('select ica_prepare(%L)', nuevo)), 9));
  perform pg_temp.prueba('no hay ICA para un W-2', 'ERR:22023', left(pg_temp.valor('super', format('select ica_prepare(%L)', pg_temp.pid('w2'))), 9));
  r := pg_temp.valor('super', format('select ica_prepare(%L)', nuevo));
  ica := (r::jsonb)->>'id';
  insert into ids values ('ica', ica);
  perform pg_temp.prueba('borrador ICA-#### con datos del perfil', 'draft|t|Prueba nuevo|10 Palm Ave, Naples, FL 34102|nuevo@prueba-ica.local|(239) 555-0100',
    (r::jsonb)->>'status' || '|' || ((r::jsonb)->>'ica' ~ '^ICA-\d{4}$')::text::char || '|' || ((r::jsonb)->'fields'->>'contractor_name') || '|' ||
    ((r::jsonb)->'fields'->>'contractor_address') || '|' || ((r::jsonb)->'fields'->>'contractor_email') || '|' || ((r::jsonb)->'fields'->>'contractor_phone'));
  perform pg_temp.prueba('sin W-9 falta el tipo (queda editable)', '["contractor_entity"]', ((r::jsonb)->'missing')::text);
  perform pg_temp.prueba('preparar otra vez devuelve el mismo', ica::text, (pg_temp.valor('super', format('select ica_prepare(%L)', nuevo))::jsonb)->>'id');
  perform pg_temp.prueba('no se envía con faltantes', 'ERR:22023:missing_fields:contractor_entity',
    pg_temp.valor('super', format('select ica_send_prepare(%L)', ica)));
  perform pg_temp.prueba('campo que no es de la plantilla', 'ERR:22023',
    left(pg_temp.valor('super', format($q$ select ica_save_fields(%L, '{"price":"1"}') $q$, ica)), 9));
  perform pg_temp.valor('super', format($q$ select ica_save_fields(%L, '{"contractor_entity":"an individual"}') $q$, ica));
  perform pg_temp.prueba('ya no falta nada', '[]', (pg_temp.valor('super', format('select ica_send_prepare(%L)', ica))::jsonb->'missing')::text);
  perform pg_temp.prueba('ruta del borrador validada', 'ERR:22023',
    left(pg_temp.valor('super', format('select ica_send_confirm(%L, %L, %L, %L, %L)', ica, 'otro/ica-draft/x.pdf', repeat('0', 64), tok, 'nuevo@prueba-ica.local')), 9));
  r := pg_temp.valor('super', format('select ica_send_confirm(%L, %L, %L, %L, %L)', ica, nuevo || '/ica-draft/ICA-x.pdf', repeat('0', 64), tok, 'nuevo@prueba-ica.local'));
  perform pg_temp.prueba('enviado por 15 días', 'sent|15', (r::jsonb)->>'status' || '|' ||
    extract(day from ((r::jsonb)->>'expires_at')::timestamptz - ((r::jsonb)->>'sent_at')::timestamptz)::int);

  -- Portal
  perform pg_temp.prueba('el portal no lo llama un usuario', 'ERR:42501', left(pg_temp.valor('nuevo', format('select ica_portal_state(%L)', tok)), 9));
  perform pg_temp.prueba('estado open', 'open', pg_temp.servicio(format($q$ select ica_portal_state(%L)->>'state' $q$, tok)));
  perform pg_temp.prueba('código solo al correo del ICA', 'not_recipient', pg_temp.servicio(format('select ica_portal_request_code(%L, %L, %L)', tok, 'otro@x.com', 'h')));
  perform pg_temp.prueba('código enviado', 'sent', pg_temp.servicio(format('select ica_portal_request_code(%L, %L, %L)', tok, 'nuevo@prueba-ica.local', 'h1')));
  perform pg_temp.prueba('código equivocado', 'wrong', pg_temp.servicio(format('select ica_portal_verify_code(%L, %L, %L, %L)', tok, 'nuevo@prueba-ica.local', 'x', ses)));
  perform pg_temp.prueba('código correcto', 'ok', pg_temp.servicio(format('select ica_portal_verify_code(%L, %L, %L, %L)', tok, 'nuevo@prueba-ica.local', 'h1', ses)));
  perform pg_temp.prueba('datos del portal sin la ruta interna a la vista', 'Prueba nuevo', pg_temp.servicio(format($q$ select ica_portal_data(%L)->>'contractor' $q$, ses)));
  perform pg_temp.prueba('no firma sin consentimiento', 'ERR:22023',
    left(pg_temp.servicio(format('select ica_portal_sign(%L, %L, false, null, null, null)', ses, 'Prueba Nuevo')), 9));
  r := pg_temp.servicio(format('select ica_portal_sign(%L, %L, true, %L, %L, null)', ses, 'Prueba Nuevo', '1.2.3.4', 'Test UA'));
  perform pg_temp.prueba('firmado por el contratista', 'contractor_signed|Prueba Nuevo|nuevo@prueba-ica.local|1.2.3.4|Test UA|t',
    (select status || '|' || contractor_signer_name || '|' || contractor_signer_email || '|' || contractor_ip || '|' || contractor_user_agent || '|' ||
            left(contractor_consent::text, 1) from contractor_agreements where id = ica));
  perform pg_temp.prueba('el link es de un solo uso', 'not_found', pg_temp.servicio(format($q$ select ica_portal_state(%L)->>'state' $q$, tok)));
  perform pg_temp.prueba('ica_info: contractor_signed', 'contractor_signed', pg_temp.valor('admin', format($q$ select ica_info(%L)->>'state' $q$, nuevo)));

  -- Contrafirma
  perform pg_temp.prueba('solo el Super Admin contrafirma', 'ERR:42501', left(pg_temp.valor('admin', format('select ica_countersign_prepare(%L)', ica)), 9));
  r := pg_temp.valor('super', format('select ica_countersign_confirm(%L, %L, %L, gen_random_uuid(), now(), %L, %L)',
                                      ica, nuevo || '/ica/ICA-signed.pdf', repeat('1', 64), '5.6.7.8', 'UA2'));
  perform pg_temp.prueba('firmado por ambas partes', 'signed', (r::jsonb)->>'status');
  perform pg_temp.prueba('ica_info: signed', 'signed', pg_temp.valor('admin', format($q$ select ica_info(%L)->>'state' $q$, nuevo)));
  perform pg_temp.prueba('abrir el ICA firmado: solo Super Admin', 'ERR:42501', left(pg_temp.valor('admin', format('select ica_open(%L)', ica)), 9));
  p := pg_temp.valor('super', format('select ica_open(%L)', ica));
  perform pg_temp.prueba('abrir el ICA firmado deja historial', nuevo || '/ica/ICA-signed.pdf|1',
    p || '|' || (select count(*) from change_log where action = 'ica_abierto' and entity_id = nuevo));
  perform pg_temp.prueba('historial del ICA', 'ica_enviado,ica_firmado,ica_firmado_contratista,ica_preparado',
    (select string_agg(distinct action, ',' order by action) from change_log where entity_id = nuevo and action like 'ica_%' and action <> 'ica_abierto'));

  -- Papel
  perform pg_temp.prueba('subir en papel: solo Super Admin', 'ERR:42501',
    left(pg_temp.valor('admin', format('select ica_upload_paper(%L, %L, %L)', viejo, viejo || '/ica/p.pdf', repeat('2', 64))), 9));
  r := pg_temp.valor('super', format('select ica_upload_paper(%L, %L, %L)', viejo, viejo || '/ica/p.pdf', repeat('2', 64)));
  perform pg_temp.prueba('papel: firmado por ambas partes, subido por', 'signed|paper|t',
    (r::jsonb)->>'status' || '|' || ((r::jsonb)->>'source') || '|' || (((r::jsonb)->>'uploaded_by') is not null)::text::char);
  perform pg_temp.prueba('ica_info del viejo: signed (papel)', 'signed|paper',
    pg_temp.valor('admin', format($q$ select ica_info(%L)->>'state' || '|' || (ica_info(%L)->'agreement'->>'source') $q$, viejo, viejo)));
  perform pg_temp.prueba('las tablas no se leen directo', 'ERR:42501', left(pg_temp.valor('super', 'select count(*) from contractor_agreements'), 9));
end $$;

select n, prueba, ok, detalle from resultados order by n;
rollback;
