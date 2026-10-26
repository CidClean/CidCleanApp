-- Pruebas de Estadísticas y del Inicio del admin (migración 20261027000014, órdenes 38; D-252, D-253, D-053, D-200,
-- D-223). Repetibles: todo termina en rollback.
-- Uso: psql -f supabase/tests/estadisticas.sql (la última consulta lista cada prueba con ok = true/false).

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
    resultado := 'ERR:' || sqlstate;
  end;
  reset role;
  return resultado;
end $$;

create function pg_temp.prueba(nombre text, esperado text, obtenido text) returns void language sql as $$
  insert into resultados (prueba, ok, detalle) values (nombre, esperado is not distinct from obtenido,
    'esperado=' || coalesce(esperado, 'null') || ' obtenido=' || coalesce(obtenido, 'null'));
$$;

-- Actores: est (Ver estadísticas), sched (schedule), aprob (aprobar), dash (dashboard global), nada (un permiso
-- ajeno), e1 y e2 (empleados sin permisos).
do $$
declare
  quien text;
  pid uuid;
  aid uuid;
begin
  foreach quien in array array['est', 'sched', 'aprob', 'dash', 'nada', 'e1', 'e2'] loop
    aid := gen_random_uuid();
    insert into profiles (full_name, worker_type, role, email, has_app_access)
    values ('Prueba Est ' || quien, 'w2', 'employee', quien || '@prueba-est.local', true) returning id into pid;
    insert into auth.users (id, aud, role, email) values (aid, 'authenticated', 'authenticated', quien || '@prueba-est.local');
    insert into actores values (quien, aid, pid);
  end loop;
  insert into profile_permissions (profile_id, permission_key)
  select a.profile_id, p.k from actores a
    join (values ('est', 'estadisticas_ver'), ('sched', 'schedule_ver_editar'), ('aprob', 'work_aprobar'),
                 ('dash', 'dashboard_global'), ('nada', 'gastos_ver')) as p(n, k) on p.n = a.nombre;
end $$;

-- Permiso (D-252) ------------------------------------------------------------------------------------------
select pg_temp.prueba('estadisticas_ver existe en el área Accounting', 'accounting',
  (select area from permissions where key = 'estadisticas_ver'));
select pg_temp.prueba('la plantilla Admin lo trae', 'true', ('estadisticas_ver' = any (role_template_permissions('admin')))::text);
select pg_temp.prueba('la plantilla Supervisor no', 'false', ('estadisticas_ver' = any (role_template_permissions('supervisor')))::text);

-- Datos: una cuenta con dos empleados por hora (e1 con 4 h garantizadas) y dos visitas de septiembre de 2026.
--  V1 (10 sep, 9:00): e1 marca él mismo 9:06 a 12:36 (210 min reales, se pagan 240, llegó tarde); e2 lo registra
--  otra persona 9:10 a 13:10 (240). V2 (11 sep, 9:00): e1 marca él mismo 9:00 a 13:00 (a tiempo); e2 no va (falta).
do $$
declare
  cli uuid;
  j uuid;
  a1 uuid;
  a2 uuid;
  v1 uuid;
  v2 uuid;
  v3 uuid;
  vh uuid;
  p1 uuid := (select profile_id from actores where nombre = 'e1');
  p2 uuid := (select profile_id from actores where nombre = 'e2');
  reg uuid := (select profile_id from actores where nombre = 'sched');
begin
  insert into clients (name, legacy) values ('Cliente Prueba Estadísticas', true) returning id into cli;
  insert into jobsites (client_id, name, address, frequency, start_date, visit_minutes)
  values (cli, 'Sede Estadística', '9 Main St', '{"kind":"other","days":[]}', '2026-09-01', 240) returning id into j;
  insert into jobsite_rates (jobsite_id, monthly_rate) values (j, 1000);
  insert into jobsite_assignments (jobsite_id, profile_id, start_date) values (j, p1, '2026-09-01') returning id into a1;
  insert into jobsite_assignments (jobsite_id, profile_id, start_date) values (j, p2, '2026-09-01') returning id into a2;
  insert into assignment_pay (assignment_id, kind, hourly_rate, guaranteed_hours, effective_from) values (a1, 'hourly', 20, 4, '2026-09-01');
  insert into assignment_pay (assignment_id, kind, hourly_rate, effective_from) values (a2, 'hourly', 20, '2026-09-01');
  insert into visits (jobsite_id, starts_at, minutes, local_date) values (j, '2026-09-10 09:00-04', 240, '2026-09-10') returning id into v1;
  insert into visits (jobsite_id, starts_at, minutes, local_date) values (j, '2026-09-11 09:00-04', 240, '2026-09-11') returning id into v2;
  insert into visit_staff values (v1, p1), (v1, p2), (v2, p1), (v2, p2);
  insert into work_entries (visit_id, profile_id, clock_in, clock_out, in_status, out_status)
  values (v1, p1, '2026-09-10 09:06-04', '2026-09-10 12:36-04', 'ok', 'ok'),
         (v2, p1, '2026-09-11 09:00-04', '2026-09-11 13:00-04', 'ok', 'ok');
  insert into work_entries (visit_id, profile_id, clock_in, clock_out, in_status, out_status, recorded_by)
  values (v1, p2, '2026-09-10 09:10-04', '2026-09-10 13:10-04', 'manual', 'manual', reg);
  -- Octubre: e2 marca sin estar programado y queda sin aprobar.
  insert into visits (jobsite_id, starts_at, minutes, local_date) values (j, '2026-10-05 09:00-04', 240, '2026-10-05') returning id into v3;
  insert into work_entries (visit_id, profile_id, clock_in, clock_out, in_status, out_status, unscheduled)
  values (v3, p2, '2026-10-05 09:00-04', '2026-10-05 13:00-04', 'ok', 'ok', true);
  -- Una visita de hoy con e1 programado (Inicio: visitas de hoy y horas de la semana).
  insert into visits (jobsite_id, starts_at, minutes, local_date)
  values (j, (cc_today() + time '23:00') at time zone cc_tz(), 240, cc_today()) returning id into vh;
  insert into visit_staff values (vh, p1);
  insert into ids values ('j', j), ('v1', v1), ('v2', v2), ('vh', vh);
end $$;

-- Aprobar (D-053: solo lo aprobado cuenta para horas pagadas y costo).
select pg_temp.prueba('por aprobar en el Inicio: 3 visitas y 4 turnos (y lo real de la base)', 'true',
  (select ((h->'to_approve'->>'visits')::int >= 3 and (h->'to_approve'->>'shifts')::int >= 4)::text
     from (select pg_temp.valor('aprob', 'select admin_home()::text')::jsonb h) z));
select pg_temp.valor('aprob', format('select approve_visit(%L)::text', (select v from ids where k = 'v1')));
select pg_temp.valor('aprob', format('select approve_visit(%L)::text', (select v from ids where k = 'v2')));
select pg_temp.prueba('al aprobar se pagan las 4 h garantizadas de e1', '240|80.00',
  (select w.pay_minutes || '|' || w.pay_amount from work_entries w where w.visit_id = (select v from ids where k = 'v1')
      and w.profile_id = (select profile_id from actores where nombre = 'e1')));

-- Estadísticas -----------------------------------------------------------------------------------------------
select pg_temp.prueba('sin estadisticas_ver no se ven (42501)', 'ERR:42501',
  pg_temp.valor('nada', $q$ select statistics_report('2026-09-01', '2026-09-01')::text $q$));
select pg_temp.prueba('un empleado sin permisos tampoco (42501)', 'ERR:42501',
  pg_temp.valor('e1', $q$ select statistics_report('2026-09-01', '2026-09-01')::text $q$));
select pg_temp.prueba('rango al revés no vale (22023)', 'ERR:22023',
  pg_temp.valor('est', $q$ select statistics_report('2026-10-01', '2026-09-01')::text $q$));

create temp table rep as select pg_temp.valor('est', $q$ select statistics_report('2026-09-01', '2026-09-01')::text $q$)::jsonb r;
create temp table cuenta as
  select a from rep, jsonb_array_elements(r->'accounts') a where a->>'jobsite_id' = (select v::text from ids where k = 'j');

select pg_temp.prueba('abrir estadísticas queda en el historial (D-125)', 'true',
  (select count(*) > 0 from change_log where action = 'estadisticas_abiertas' and actor_id = (select profile_id from actores where nombre = 'est'))::text);
select pg_temp.prueba('la cuenta sale con su cliente', 'Sede Estadística|Cliente Prueba Estadísticas',
  (select (a->>'name') || '|' || (a->>'client') from cuenta));
select pg_temp.prueba('2 visitas con 3 turnos', '2|3', (select (a->>'visits') || '|' || (a->>'shifts') from cuenta));
select pg_temp.prueba('horas reales (clock in a out) 690 min; pagadas 720 con la garantizada', '690|720',
  (select (a->>'worked_minutes') || '|' || (a->>'paid_minutes') from cuenta));
select pg_temp.prueba('pagadas sin trabajar: 30 min y $10.00', '30|10.00',
  (select (a->>'unworked_minutes') || '|' || (a->>'unworked_amount') from cuenta));
select pg_temp.prueba('duración real promedio 230 min contra 240 estimados', '230.0|240',
  (select (a->>'avg_minutes') || '|' || (a->>'est_minutes') from cuenta));
select pg_temp.prueba('ingreso esperado como Accounting, costo, profit y margen', '1000.00|240.00|760.00|76.0',
  (select (a->>'expected') || '|' || (a->>'staff') || '|' || (a->>'profit') || '|' || (a->>'margin') from cuenta));
select pg_temp.prueba('puntualidad: solo las 2 entradas que marcó el propio empleado; 1 a tiempo (hasta 5 min)', '2|1',
  (select (a->>'punctual_self') || '|' || (a->>'punctual_on_time') from cuenta));
select pg_temp.prueba('turnos programados contra trabajados: 4 y 3', '4|3',
  (select (a->>'scheduled') || '|' || (a->>'scheduled_worked') from cuenta));
select pg_temp.prueba('la falta con su día, su visita y su persona', '1|2026-09-11|Prueba Est e2|true',
  (select jsonb_array_length(a->'absences') || '|' || (a->'absences'->0->>'day') || '|' || (a->'absences'->0->>'name') || '|'
          || ((a->'absences'->0->>'visit_id') = (select v::text from ids where k = 'v2')) from cuenta));
select pg_temp.prueba('por empleado dentro de la cuenta: e1 2/2, 450 min reales, 480 pagados, $160.00', '2|2|450|480|160.00',
  (select (e->>'scheduled_worked') || '|' || (e->>'scheduled') || '|' || (e->>'worked_minutes') || '|' || (e->>'paid_minutes') || '|' || (e->>'cost')
     from cuenta, jsonb_array_elements(a->'employees') e where e->>'name' = 'Prueba Est e1'));
select pg_temp.prueba('e2: 1 de 2 turnos, $80.00', '1|2|80.00',
  (select (e->>'scheduled_worked') || '|' || (e->>'scheduled') || '|' || (e->>'cost')
     from rep, jsonb_array_elements(r->'employees') e where e->>'name' = 'Prueba Est e2'));
select pg_temp.prueba('e2 en la pestaña Empleados con su falta', '1',
  (select jsonb_array_length(e->'absences')::text from rep, jsonb_array_elements(r->'employees') e where e->>'name' = 'Prueba Est e2'));
select pg_temp.prueba('la visita de hoy no cuenta como falta todavía (solo días pasados)', 'false',
  (select (r::text like '%' || (select v::text from ids where k = 'vh') || '%')::text from rep));
select pg_temp.prueba('tendencia de un mes: desde que hay Accounting (septiembre) hasta el mes', '2026-09-01',
  (select string_agg(m->>'month', ',') from rep, jsonb_array_elements(r->'trend') m));
select pg_temp.prueba('octubre: un turno sin aprobar cuenta como turno pero no suma horas ni costo (D-053)', '1|0|0|0',
  (select (a->>'shifts') || '|' || (a->>'worked_minutes') || '|' || (a->>'paid_minutes') || '|' || (a->>'staff')
     from jsonb_array_elements(pg_temp.valor('est', $q$ select statistics_report('2026-10-01', '2026-10-01')::text $q$)::jsonb->'accounts') a
    where a->>'jobsite_id' = (select v::text from ids where k = 'j')));

-- Inicio del admin (D-253): cada parte con su permiso; el staff nunca ve horas contra 32 h (D-223). ---------
select pg_temp.prueba('un empleado sin permisos no ve nada del Inicio del admin', 'true|true|true|true|true',
  (select ((h->'month') = 'null'::jsonb)::text || '|' || ((h->'week_hours') = 'null'::jsonb)::text || '|' || ((h->'today') = 'null'::jsonb)::text
          || '|' || ((h->'to_approve') = 'null'::jsonb)::text || '|' || ((h->'receivable') = 'null'::jsonb)::text
     from (select pg_temp.valor('e1', 'select admin_home()::text')::jsonb h) z));
select pg_temp.prueba('con el schedule: horas de la semana de e1, 240 programados', '240',
  (select x->>'programmed_minutes' from (select pg_temp.valor('sched', 'select admin_home()::text')::jsonb h) z,
     jsonb_array_elements(h->'week_hours') x where x->>'name' = 'Prueba Est e1'));
select pg_temp.prueba('con el schedule: la visita de hoy con e1 sin entrada', 'true',
  (select bool_or(s->>'name' = 'Prueba Est e1' and s->'clock_in' = 'null'::jsonb)::text
     from (select pg_temp.valor('sched', 'select admin_home()::text')::jsonb h) z,
     jsonb_array_elements(h->'today') v, jsonb_array_elements(v->'staff') s where v->>'id' = (select v::text from ids where k = 'vh')));
select pg_temp.prueba('el schedule no da el profit del mes', 'true',
  (select ((h->'month') = 'null'::jsonb)::text from (select pg_temp.valor('sched', 'select admin_home()::text')::jsonb h) z));
select pg_temp.prueba('con el dashboard global: profit del mes y por cobrar, sin horas de la semana', 'true|true|true',
  (select ((h->'month'->'profit') is not null)::text || '|' || ((h->'receivable'->'pending') is not null)::text || '|'
          || ((h->'week_hours') = 'null'::jsonb)::text
     from (select pg_temp.valor('dash', 'select admin_home()::text')::jsonb h) z));
select pg_temp.prueba('aprobar no ve Pipeline ni Cuentas sin sus permisos', 'true|true',
  (select ((h->'pipeline') = 'null'::jsonb)::text || '|' || ((h->'accounts') = 'null'::jsonb)::text
     from (select pg_temp.valor('aprob', 'select admin_home()::text')::jsonb h) z));
select pg_temp.prueba('las funciones de apoyo no se llaman desde la app (42501)', 'ERR:42501',
  pg_temp.valor('est', $q$ select count(*)::text from stats_entries('2026-09-01', '2026-09-30') $q$));

-- Resultado ------------------------------------------------------------------------------------------

select prueba, ok, detalle from resultados order by n;
-- FIN-DE-PRUEBAS
rollback;
