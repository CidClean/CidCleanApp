-- Pruebas del Schedule y Work (migración 20261026000001, hito 6). Repetibles: todo termina en rollback.
-- Uso: psql -f supabase/tests/schedule_work.sql (la última consulta lista cada prueba con ok = true/false).

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
  foreach quien in array array['sched', 'sup', 'aprob', 'staff1', 'staff2', 'sin'] loop
    aid := gen_random_uuid();
    insert into profiles (full_name, worker_type, role, email, has_app_access)
    values ('Prueba ' || quien, 'w2', 'employee', quien || '@prueba.local', true) returning id into pid;
    insert into auth.users (id, aud, role, email) values (aid, 'authenticated', 'authenticated', quien || '@prueba.local');
    insert into actores values (quien, aid, pid);
  end loop;
  insert into profile_permissions (profile_id, permission_key)
  select a.profile_id, p.k from actores a
    join (values ('sched', 'schedule_ver_editar'),
                 ('sup', 'schedule_ver_editar'), ('sup', 'work_registrar_por_otros'), ('sup', 'work_editar'), ('sup', 'work_revisar_gps'),
                 ('aprob', 'work_aprobar')) as p(n, k) on p.n = a.nombre;
end $$;

do $$
declare
  r text;
  cli uuid;
  js uuid;
  js2 uuid;
  asig uuid;
  hoy uuid;
  w uuid;
  w2 uuid;
  lunes date := week_monday(cc_today()) + 7;  -- la semana siguiente
  s1 uuid := (select profile_id from actores where nombre = 'staff1');
  s2 uuid := (select profile_id from actores where nombre = 'staff2');
  sup uuid := (select profile_id from actores where nombre = 'sup');
begin
  insert into clients (name, legacy) values ('Cliente Prueba Schedule', true) returning id into cli;
  insert into jobsites (client_id, name, address, frequency, visit_start_time, visit_minutes, latitude, longitude)
  values (cli, 'Sede Prueba', '1 Main St, Naples, FL', '{"kind":"daily","days":[0,1,2,3,4,5,6]}', '00:01', 120, 26.142, -81.7948)
  returning id into js;
  insert into jobsites (client_id, name, address, frequency) values (cli, 'Sede Otra', '2 Main St', '{"kind":"other","days":[]}') returning id into js2;
  insert into jobsite_assignments (jobsite_id, profile_id, start_date) values (js, s1, cc_today()) returning id into asig;
  insert into assignment_pay (assignment_id, kind, hourly_rate, guaranteed_hours, effective_from) values (asig, 'hourly', 18, 3, cc_today());

  perform pg_temp.prueba('el generador crea 28 visitas de la frecuencia diaria', '28', generate_visits(js)::text);
  perform pg_temp.prueba('no repite días', '0', generate_visits(js)::text);
  perform pg_temp.prueba('frecuencia Otra no genera', '0', (select count(*) from visits where jobsite_id = js2)::text);
  perform pg_temp.prueba('programa al personal asignado', '28', (select count(*) from visit_staff s join visits v on v.id = s.visit_id where v.jobsite_id = js and s.profile_id = s1)::text);
  select id into hoy from visits where jobsite_id = js and local_date = cc_today();

  -- Permisos del schedule
  perform pg_temp.prueba('el staff no ve el schedule', 'ERR:42501', pg_temp.valor('staff1', format('select schedule_range(%L, %L)::text', cc_today(), cc_today() + 6)));
  perform pg_temp.prueba('schedule_ver_editar ve el schedule', 'true', (pg_temp.valor('sched', format('select jsonb_array_length(schedule_range(%L, %L)) > 0', cc_today(), cc_today() + 6))));
  perform pg_temp.prueba('el schedule lleva las horas de la semana de cada persona (para el admin)', 'true',
    pg_temp.valor('sched', format('select (schedule_range(%L, %L)->0->''staff''->0) ? ''week_minutes''', cc_today(), cc_today())));
  -- Horario del staff (D-012): semana actual y siguiente, sin horas contra 32 h (D-223)
  perform pg_temp.prueba('el staff ve solo esta semana y la siguiente', (week_monday(cc_today()) + 14 - cc_today())::text,
    pg_temp.valor('staff1', 'select jsonb_array_length(my_schedule())'));
  perform pg_temp.prueba('el horario del staff no trae horas de la semana', 'false', pg_temp.valor('staff1', 'select my_schedule()::text like ''%week_minutes%'''));

  -- 32 h (D-214): aviso desde 28 h, bloqueo con más de 32 h
  perform pg_temp.valor('sched', format('select add_visit(%L, %L, 600, %L)', js2, (lunes + '09:00'::time) at time zone cc_tz(), array[s2]));
  perform pg_temp.valor('sched', format('select add_visit(%L, %L, 600, %L)', js2, (lunes + 1 + '09:00'::time) at time zone cc_tz(), array[s2]));
  r := pg_temp.valor('sched', format('select add_visit(%L, %L, 600, %L)', js2, (lunes + 2 + '09:00'::time) at time zone cc_tz(), '{}'));
  perform pg_temp.prueba('con 30 h programadas avisa (desde 28 h)', '1', pg_temp.valor('sched', format('select jsonb_array_length(set_visit_staff(%L, %L))', r, array[s2])));
  r := pg_temp.valor('sched', format('select add_visit(%L, %L, 180, %L)', js2, (lunes + 3 + '09:00'::time) at time zone cc_tz(), '{}'));
  perform pg_temp.prueba('con más de 32 h no deja programar', 'ERR:22023', pg_temp.valor('sched', format('select set_visit_staff(%L, %L)::text', r, array[s2])));
  perform pg_temp.prueba('el staff no programa', 'ERR:42501', pg_temp.valor('staff1', format('select set_visit_staff(%L, %L)::text', r, array[s1])));

  -- Marcar entrada y salida (D-214)
  perform pg_temp.prueba('distancia antes de marcar: dentro de 150 m', 'ok', pg_temp.valor('staff1', format('select visit_distance(%L, 26.1421, -81.7948)->>''status''', hoy)));
  perform pg_temp.prueba('quien no está asignado no marca', 'ERR:42501', pg_temp.valor('sin', format('select clock_in(%L, gen_random_uuid(), now(), null, null, false)::text', hoy)));
  w := (pg_temp.valor('staff1', format('select clock_in(%L, %L, %L, 26.15, -81.7948, true)->>''id''', hoy, '11111111-1111-4111-8111-111111111111', now() - interval '2 hours')))::uuid;
  perform pg_temp.prueba('sin conexión guarda la hora del teléfono y queda marcado', 't',
    (select (clock_in <= now() - interval '119 minutes' and in_offline and in_status = 'out_of_range' and in_distance_m > 150)::text from work_entries where id = w)::char(1));
  perform pg_temp.prueba('la cola reintenta sin duplicar (mismo id del teléfono)', w::text,
    pg_temp.valor('staff1', format('select clock_in(%L, %L, now(), null, null, false)->>''id''', hoy, '11111111-1111-4111-8111-111111111111')));
  perform pg_temp.prueba('no marca dos veces la misma visita', 'ERR:22023', pg_temp.valor('staff1', format('select clock_in(%L, gen_random_uuid(), now(), null, null, false)::text', hoy)));
  perform pg_temp.prueba('salida validada igual: sin ubicación', 'no_location', pg_temp.valor('staff1', format('select clock_out(%L, now(), null, null, false)->>''status''', w)));

  -- Registro por otros (D-052) y quien no estaba programado
  insert into jobsite_assignments (jobsite_id, profile_id, start_date) values (js, s2, cc_today());
  perform pg_temp.prueba('el staff no registra por otros', 'ERR:42501', pg_temp.valor('staff2', format('select record_work(%L, ''[]'')::text', hoy)));
  perform pg_temp.valor('sup', format('select record_work(%L, %L)::text', hoy,
    jsonb_build_array(jsonb_build_object('profile_id', s2, 'clock_in', now() - interval '90 minutes', 'clock_out', null))::text));
  select id into w2 from work_entries where visit_id = hoy and profile_id = s2;
  perform pg_temp.prueba('registro por otros: manual y sin estar programado', 't', (select (in_status = 'manual' and unscheduled and recorded_by = sup)::text from work_entries where id = w2)::char(1));
  perform pg_temp.prueba('turno abierto en el Inicio del supervisor (hoy no cuenta como de días anteriores)', '0', pg_temp.valor('sup', 'select work_home_pending()->>''open_shifts'''));
  perform pg_temp.prueba('por aprobar en el Inicio de quien aprueba', 'true', pg_temp.valor('aprob', 'select (work_home_pending()->>''to_approve'')::int >= 1'));

  -- Aprobar (D-109): cerrado y GPS revisado
  perform pg_temp.prueba('con un turno abierto no se aprueba', 'ERR:22023', pg_temp.valor('aprob', format('select approve_visit(%L)::text', hoy)));
  perform pg_temp.valor('sup', format('select edit_work_entry(%L, %L, %L)::text', w2, now() - interval '90 minutes', now() - interval '10 minutes'));
  perform pg_temp.prueba('con GPS fuera de rango sin revisar no se aprueba', 'ERR:22023', pg_temp.valor('aprob', format('select approve_visit(%L)::text', hoy)));
  perform pg_temp.prueba('aprobar sin el permiso no', 'ERR:42501', pg_temp.valor('sup', format('select approve_visit(%L)::text', hoy)));
  perform pg_temp.prueba('revisar el GPS sin el permiso no', 'ERR:42501', pg_temp.valor('aprob', format('select review_work_gps(%L)::text', w)));
  perform pg_temp.valor('sup', format('select review_work_gps(%L)::text', w));
  perform pg_temp.prueba('aprobado', '', pg_temp.valor('aprob', format('select approve_visit(%L)::text', hoy)));
  perform pg_temp.prueba('horas garantizadas por visita: 2 h trabajadas se pagan 3 h a $18', '180|54.00',
    (select pay_minutes || '|' || pay_amount from work_entries where id = w));
  perform pg_temp.prueba('sin pago definido se cuentan los minutos y no hay monto', '80|', (select pay_minutes || '|' || coalesce(pay_amount::text, '') from work_entries where id = w2));
  perform pg_temp.prueba('aprobado ya no se edita', 'ERR:22023', pg_temp.valor('sup', format('select edit_work_entry(%L, %L, %L)::text', w2, now() - interval '3 hours', now())));
  perform pg_temp.prueba('aprobar queda en el historial', '1', (select count(*) from change_log where action = 'trabajo_aprobado' and entity_id = hoy)::text);

  -- Quitar una visita sin trabajo; pausar detiene las visitas futuras
  r := (select id::text from visits where jobsite_id = js and local_date = cc_today() + 3);
  perform pg_temp.valor('sched', format('select delete_visit(%L)::text', r));
  perform pg_temp.prueba('la visita generada quitada no vuelve', '0', (generate_visits(js) + (select count(*) from visits where id = r::uuid and not removed))::text);
  perform pg_temp.prueba('con trabajo no se quita', 'ERR:22023', pg_temp.valor('sched', format('select delete_visit(%L)::text', hoy)));
  update jobsites set status = 'paused' where id = js;
  perform pg_temp.prueba('al pausar se quitan las visitas futuras sin trabajo', '0',
    (select count(*) from visits where jobsite_id = js and starts_at > now() and not removed)::text);
  perform pg_temp.prueba('la pestaña Horario la ve quien ve clientes o el schedule', 'ERR:42501', pg_temp.valor('staff1', format('select jobsite_visits(%L)::text', js)));
end $$;

select n, prueba, ok, detalle from resultados order by n;
rollback;
