-- Pruebas de las ofertas de trabajo y las advertencias escritas (migración 20261031000003, orden 66, D-285).
-- Repetibles: todo termina en rollback. Uso (desde la raíz del repositorio): psql -f supabase/tests/ofertas_advertencias.sql
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
  foreach quien in array array['admin', 'viejo', 'nuevo', 'w2', 'sinapp'] loop
    aid := gen_random_uuid();
    insert into profiles (full_name, worker_type, role, email, has_app_access, phone, address_line1, city, state, zip)
    values ('Prueba ' || quien, case when quien in ('viejo', 'nuevo', 'sinapp') then '1099' else 'w2' end::worker_type,
            'employee', quien || '@prueba-ica.local', quien <> 'sinapp', '(239) 555-0100', '10 Palm Ave', 'Naples', 'FL', '34102')
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

-- nuevo y sinapp: ICA firmado por ambas partes y W-9 firmado (desde D-292 no hace falta para ofrecer).
insert into contractor_agreements (profile_id, source, status, signed_path, signed_sha256, uploaded_by, uploaded_at)
select pg_temp.pid(x), 'paper', 'signed', pg_temp.pid(x) || '/ica/p.pdf', repeat('0', 64), pg_temp.pid(x), now() from unnest(array['nuevo', 'sinapp']) x;
insert into profile_documents (profile_id, kind, file_path) select pg_temp.pid(x), 'w9', pg_temp.pid(x) || '/w9/p.pdf' from unnest(array['nuevo', 'sinapp']) x;
update jobsites set visit_start_time = '22:00', visit_minutes = 180, status = 'active' where id in (pg_temp.id('js'), pg_temp.id('js2'));

do $$
declare
  r text; js uuid := pg_temp.id('js'); js2 uuid := pg_temp.id('js2'); nuevo uuid := pg_temp.pid('nuevo'); viejo uuid := pg_temp.pid('viejo');
  sinapp uuid := pg_temp.pid('sinapp'); hoy date := cc_today(); o uuid; o2 uuid; o3 uuid; v uuid; w1 uuid; i int;
begin
  -- Ofertas
  perform pg_temp.prueba('sin permiso no ofrece', 'ERR:42501', left(pg_temp.valor('w2', format('select create_job_offer(%L, %L, null, 90, %L::date, null)', nuevo, js, hoy)), 9));
  perform pg_temp.prueba('no se ofrece a un W-2', 'ERR:22023:not_contractor', pg_temp.valor('admin', format('select create_job_offer(%L, %L, null, 90, %L::date, null)', pg_temp.pid('w2'), js, hoy)));
  perform pg_temp.prueba('D-292: a un 1099 sin ICA ni W-9 se le ofrece trabajo', 'pending',
    (pg_temp.valor('admin', format('select create_job_offer(%L, %L, null, 90, %L::date, null)', viejo, js2, hoy))::jsonb)->>'status');
  r := pg_temp.valor('admin', format('select create_job_offer(%L, %L, null, 90, %L::date, %L)', nuevo, js, hoy, 'Lobby y baños'));
  o := (r::jsonb)->>'id';
  perform pg_temp.prueba('oferta de jobsite con franja y pago', 'pending|jobsite|22:00|01:00|90.00',
    (r::jsonb)->>'status' || '|' || ((r::jsonb)->>'kind') || '|' || ((r::jsonb)->>'window_start') || '|' || ((r::jsonb)->>'window_end') || '|' ||
    to_char(((r::jsonb)->>'rate')::numeric, 'FM990.00'));
  perform pg_temp.prueba('aviso al 1099 en la app', '1', (select count(*)::text from notifications where profile_id = nuevo and kind = 'job_offer'));
  perform pg_temp.prueba('no se repite la oferta pendiente', 'ERR:23505', left(pg_temp.valor('admin', format('select create_job_offer(%L, %L, null, 90, %L::date, null)', nuevo, js, hoy)), 9));
  perform pg_temp.prueba('el 1099 ve su oferta', '1', pg_temp.valor('nuevo', 'select jsonb_array_length(my_job_offers())::text'));
  perform pg_temp.prueba('otro 1099 no la responde', 'ERR:42501', left(pg_temp.valor('viejo', format('select respond_job_offer(%L, true)', o)), 9));
  perform pg_temp.prueba('el admin no responde por quien tiene acceso', 'ERR:42501', left(pg_temp.valor('admin', format('select respond_job_offer(%L, true)', o)), 9));
  r := pg_temp.valor('nuevo', format('select respond_job_offer(%L, true)', o));
  perform pg_temp.prueba('aceptar crea la asignación con pago por visita', 'accepted|app|1|90.00',
    (r::jsonb)->>'status' || '|' || ((r::jsonb)->>'response_source') || '|' ||
    (select count(*) from jobsite_assignments where jobsite_id = js and profile_id = nuevo) || '|' ||
    (select to_char(x.fixed_amount, 'FM990.00') from jobsite_assignments a join assignment_pay x on x.assignment_id = a.id where a.jobsite_id = js and a.profile_id = nuevo and x.fixed_period = 'visit'));
  perform pg_temp.prueba('ya no se responde otra vez', 'ERR:22023', left(pg_temp.valor('nuevo', format('select respond_job_offer(%L, false)', o)), 9));

  -- Visita puntual, rechazo y registro del admin
  insert into visits (jobsite_id, starts_at, minutes, local_date) values (js2, now() + interval '3 days', 120, local_day(now() + interval '3 days')) returning id into v;
  o2 := (pg_temp.valor('admin', format('select create_job_offer(%L, %L, %L, 110, null, null)', sinapp, js2, v))::jsonb)->>'id';
  perform pg_temp.prueba('el 1099 sin acceso no recibe aviso en la app', '0', (select count(*)::text from notifications where profile_id = sinapp));
  r := pg_temp.valor('admin', format('select respond_job_offer(%L, true)', o2));
  perform pg_temp.prueba('el admin registra la respuesta de quien no tiene acceso', 'accepted|admin|1',
    (r::jsonb)->>'status' || '|' || ((r::jsonb)->>'response_source') || '|' || (select count(*) from visit_staff where visit_id = v and profile_id = sinapp));
  perform pg_temp.prueba('el día de la visita puntual se paga con la tarifa de la oferta', '110.00', (select to_char(service_day_pay(v, sinapp), 'FM990.00')));
  o3 := (pg_temp.valor('admin', format('select create_job_offer(%L, %L, null, 95, %L::date, null)', nuevo, js2, hoy))::jsonb)->>'id';
  r := pg_temp.valor('nuevo', format('select respond_job_offer(%L, false)', o3));
  perform pg_temp.prueba('rechazar no asigna nada', 'declined|0', (r::jsonb)->>'status' || '|' || (select count(*) from jobsite_assignments where jobsite_id = js2 and profile_id = nuevo));
  o3 := (pg_temp.valor('admin', format('select create_job_offer(%L, %L, null, 95, %L::date, null)', nuevo, js2, hoy))::jsonb)->>'id';
  perform pg_temp.prueba('después de rechazar se puede ofrecer otra vez y retirar', 'withdrawn',
    (pg_temp.valor('admin', format('select withdraw_job_offer(%L)', o3))::jsonb)->>'status');
  perform pg_temp.prueba('historial de ofertas', 'oferta_aceptada,oferta_creada,oferta_rechazada,oferta_retirada',
    (select string_agg(distinct action, ',' order by action) from change_log where entity_id = nuevo and action like 'oferta_%'));
  perform pg_temp.prueba('el admin ve las ofertas del contratista', '3', pg_temp.valor('admin', format('select jsonb_array_length(job_offers_for(%L))::text', nuevo)));

  -- Advertencias
  perform pg_temp.prueba('solo el Super Admin crea advertencias', 'ERR:42501',
    left(pg_temp.valor('admin', format('select create_written_warning(%L, %L::date, %L, null, null)', nuevo, hoy, 'Trabajo incompleto')), 9));
  perform pg_temp.prueba('falta el motivo', 'ERR:22023', left(pg_temp.valor('super', format('select create_written_warning(%L, %L::date, %L, null, null)', nuevo, hoy, ' ')), 9));
  perform pg_temp.prueba('documento en otra carpeta', 'ERR:22023',
    left(pg_temp.valor('super', format('select create_written_warning(%L, %L::date, %L, %L, %L)', nuevo, hoy, 'x', viejo || '/warnings/a.pdf', 'application/pdf')), 9));
  r := pg_temp.valor('super', format('select create_written_warning(%L, %L::date, %L, %L, %L)', nuevo, hoy - 20, 'Trabajo incompleto', nuevo || '/warnings/a.pdf', 'application/pdf'));
  w1 := (r::jsonb)->>'id';
  perform pg_temp.prueba('primera advertencia con documento', '1|true', ((r::jsonb)->>'active_count') || '|' || ((r::jsonb)->>'has_document'));
  perform pg_temp.valor('super', format('select create_written_warning(%L, %L::date, %L, null, null)', nuevo, hoy - 10, 'Llegó fuera de la franja'));
  perform pg_temp.prueba('con 2 no hay aviso', '0', (select count(*)::text from notifications where kind = 'warnings_3'));
  r := pg_temp.valor('super', format('select create_written_warning(%L, %L::date, %L, null, null)', nuevo, hoy, 'Registro falso'));
  perform pg_temp.prueba('con 3 vigentes, aviso al Super Admin y no se desactiva', '3|1|Prueba nuevo tiene 3 advertencias escritas|t',
    ((r::jsonb)->>'active_count') || '|' ||
    (select count(*) from notifications n join profiles p on p.id = n.profile_id where n.kind = 'warnings_3' and p.is_super_admin) || '|' ||
    (select t.title from notifications n, notification_text(n.kind, n.data, 'es') t where n.kind = 'warnings_3' limit 1) || '|' ||
    (select left(active::text, 1) from profiles where id = nuevo));
  perform pg_temp.prueba('aviso en inglés', 'Prueba nuevo has 3 written warnings',
    (select t.title from notifications n, notification_text(n.kind, n.data, 'en') t where n.kind = 'warnings_3' limit 1));
  perform pg_temp.prueba('un empleado sin permiso no las ve', 'ERR:42501', left(pg_temp.valor('w2', format('select written_warnings_for(%L)', nuevo)), 9));
  perform pg_temp.prueba('el 1099 no ve sus advertencias por aquí', 'ERR:42501', left(pg_temp.valor('nuevo', format('select written_warnings_for(%L)', nuevo)), 9));
  perform pg_temp.prueba('anular: solo el Super Admin', 'ERR:42501', left(pg_temp.valor('admin', format('select void_written_warning(%L, %L)', w1, 'Error')), 9));
  perform pg_temp.prueba('anular pide motivo', 'ERR:22023', left(pg_temp.valor('super', format('select void_written_warning(%L, %L)', w1, '')), 9));
  perform pg_temp.valor('super', format('select void_written_warning(%L, %L)', w1, 'Se registró por error'));
  perform pg_temp.prueba('anulada: quedan 2 vigentes y la anulada en la lista', '2|3',
    pg_temp.valor('super', format($q$ select (written_warnings_for(%L)->>'active_count') || '|' || jsonb_array_length(written_warnings_for(%L)->'items') $q$, nuevo, nuevo)));
  perform pg_temp.prueba('abrir el documento deja historial', nuevo || '/warnings/a.pdf', pg_temp.valor('super', format('select open_warning_document(%L)', w1)));
  perform pg_temp.prueba('historial de advertencias', '3|1|1',
    (select count(*) filter (where action = 'advertencia_creada') || '|' || count(*) filter (where action = 'advertencia_anulada') || '|' ||
            count(*) filter (where action = 'advertencia_documento_abierto') from change_log where entity_id = nuevo));
  perform pg_temp.prueba('las tablas no se leen directo', 'ERR:42501', left(pg_temp.valor('super', 'select count(*) from written_warnings'), 9));
end $$;

select n, prueba, ok, detalle from resultados order by n;
rollback;
