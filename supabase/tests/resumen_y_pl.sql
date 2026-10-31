-- Pruebas del resumen del empleado y del Profit & Loss (migraciones 20261031000011 y 20261031000012; D-294, D-295).
-- Repetibles: todo termina en rollback. Uso (desde la raíz del repositorio): psql -f supabase/tests/resumen_y_pl.sql
-- (la última consulta lista cada prueba con ok = true/false). Año de prueba: 2025.


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

create function pg_temp.prueba(nombre text, esperado text, obtenido text) returns void language sql as $$
  insert into resultados (prueba, ok, detalle) values (nombre, esperado is not distinct from obtenido,
    'esperado=' || coalesce(esperado, 'null') || ' obtenido=' || coalesce(obtenido, 'null'));
$$;
create function pg_temp.id(k text) returns uuid language sql as $$ select v from ids where ids.k = $1 $$;
create function pg_temp.pid(n text) returns uuid language sql as $$ select profile_id from actores where nombre = $1 $$;

-- Personas: admin (ver pagos y dashboard global), nob (sin permisos), estela y humbe (1099), ana (W-2).
do $$
declare
  quien text;
  pid uuid;
  aid uuid;
begin
  foreach quien in array array['admin', 'nob', 'estela', 'humbe', 'ana'] loop
    aid := gen_random_uuid();
    insert into profiles (full_name, worker_type, role, email, has_app_access)
    values ('Prueba ' || quien, case when quien in ('estela', 'humbe') then '1099' else 'w2' end::worker_type,
            'employee', quien || '@prueba-pl.local', true) returning id into pid;
    insert into auth.users (id, aud, role, email) values (aid, 'authenticated', 'authenticated', quien || '@prueba-pl.local');
    insert into actores values (quien, aid, pid);
  end loop;
  aid := gen_random_uuid();
  insert into auth.users (id, aud, role, email) values (aid, 'authenticated', 'authenticated', 'super@prueba-pl.local');
  update profiles set auth_user_id = aid where is_super_admin and auth_user_id is null;
  insert into actores select 'super', auth_user_id, id from profiles where is_super_admin;
  update profiles p set auth_user_id = a.auth_id from actores a where a.profile_id = p.id and p.auth_user_id is null;
  insert into profile_permissions (profile_id, permission_key)
  select pg_temp.pid('admin'), k from unnest(array['empleados_ver_pagos', 'dashboard_global']) k;
end $$;

-- Datos de 2025 (sin disparadores, solo para armar el caso).
set session_replication_role = replica;
do $$
declare
  cli uuid; js uuid; a uuid; v uuid; q uuid; qv1 uuid; qv2 uuid;
begin
  insert into clients (name, legacy) values ('Cliente PL', true) returning id into cli;
  insert into jobsites (client_id, name, address, frequency) values (cli, 'Sede PL', '1 Main St', '{"kind":"other","days":[]}') returning id into js;
  insert into quotes (kind, jobsite_id) values ('extra', js) returning id into q;
  insert into quote_versions (quote_id, minor, walkthrough_version, subtotal, tax, total) values (q, 0, 1, 1000, 60, 1060) returning id into qv1;
  insert into quote_versions (quote_id, minor, walkthrough_version, subtotal, tax, total) values (q, 1, 1, 100, 6, 106) returning id into qv2;
  insert into jobsite_rates (jobsite_id, monthly_rate, quote_version_id) values (js, 1060, qv1);
  -- Cobrados en 2025: diciembre 2024 (cobrado en enero) y marzo con un extra; no cuentan abril (sin cobrar) ni diciembre 2025 (cobrado en 2026).
  insert into income_expected (jobsite_id, month, amount, received, received_on, received_at) values
    (js, '2024-12-01', 1060, true, '2025-01-03', '2025-01-03 12:00'),
    (js, '2025-03-01', 1060, true, '2025-03-05', '2025-03-05 12:00'),
    (js, '2025-04-01', 1060, false, null, null),
    (js, '2025-12-01', 1060, true, '2026-01-02', '2026-01-02 12:00');
  insert into income_extras (jobsite_id, month, amount, label, quote_version_id, created_at) values
    (js, '2025-03-01', 106, 'Extra', qv2, '2025-03-01 12:00'),
    (js, '2025-03-01', 500, 'Extra tarde', null, '2025-03-20 12:00');
  -- Estela: fijo mensual $1,350 en agosto (cuenta terminada), un día aprobado.
  insert into jobsite_assignments (jobsite_id, profile_id, start_date, end_date) values (js, pg_temp.pid('estela'), '2025-08-01', '2025-08-31') returning id into a;
  insert into assignment_pay (assignment_id, kind, fixed_amount, fixed_period, effective_from) values (a, 'fixed', 1350, 'month', '2025-08-01');
  insert into visits (jobsite_id, starts_at, minutes, local_date) values (js, '2025-08-10 22:00Z', 240, '2025-08-10') returning id into v;
  insert into service_days (visit_id, profile_id, status, amount) values (v, pg_temp.pid('estela'), 'approved', 0);
  -- Humbe: $80 por día, dos aprobados y uno pendiente en octubre (cuenta vigente).
  insert into jobsite_assignments (jobsite_id, profile_id, start_date) values (js, pg_temp.pid('humbe'), '2025-09-01') returning id into a;
  insert into assignment_pay (assignment_id, kind, fixed_amount, fixed_period, effective_from) values (a, 'fixed', 80, 'visit', '2025-09-01');
  insert into visits (jobsite_id, starts_at, minutes, local_date) values (js, '2025-10-01 22:00Z', 240, '2025-10-01') returning id into v;
  insert into service_days (visit_id, profile_id, status, amount) values (v, pg_temp.pid('humbe'), 'approved', 80);
  insert into visits (jobsite_id, starts_at, minutes, local_date) values (js, '2025-10-02 22:00Z', 240, '2025-10-02') returning id into v;
  insert into service_days (visit_id, profile_id, status, amount) values (v, pg_temp.pid('humbe'), 'approved', 80);
  insert into visits (jobsite_id, starts_at, minutes, local_date) values (js, '2025-10-03 22:00Z', 240, '2025-10-03') returning id into v;
  insert into service_days (visit_id, profile_id, status, amount) values (v, pg_temp.pid('humbe'), 'pending', 80);
  -- Ana (W-2): 4 h aprobadas, $72.
  insert into jobsite_assignments (jobsite_id, profile_id, start_date) values (js, pg_temp.pid('ana'), '2025-09-01') returning id into a;
  insert into visits (jobsite_id, starts_at, minutes, local_date, approved_at) values (js, '2025-10-04 22:00Z', 240, '2025-10-04', '2025-10-05') returning id into v;
  insert into work_entries (visit_id, profile_id, clock_in, clock_out, in_status, pay_minutes, pay_amount)
  values (v, pg_temp.pid('ana'), '2025-10-04 22:00Z', '2025-10-05 02:00Z', 'ok', 240, 72);
  -- Gastos: 2025 suministros 100.50, equipo 50 (los dos línea 22), seguro 200 (15); vehículos de 2024 no cuenta.
  insert into expenses (category_id, spent_on, amount) values
    ((select id from expense_categories where label_es = 'Suministros'), '2025-05-01', 100.50),
    ((select id from expense_categories where label_es = 'Equipo'), '2025-07-01', 50),
    ((select id from expense_categories where label_es = 'Seguro'), '2025-06-01', 200),
    ((select id from expense_categories where label_es = 'Vehículos'), '2024-12-31', 999);
end $$;
set session_replication_role = origin;

-- 1. Línea del Schedule C (D-295)
select pg_temp.prueba('valores iniciales de D-295', 'Equipo 22, Otro 27a, Seguro 15, Software 18, Suministros 22, Vehículos 9',
  (select string_agg(label_es || ' ' || schedule_c_line, ', ' order by label_es) from expense_categories));
select pg_temp.prueba('solo líneas del Schedule C', 'ERR:23514',
  left(pg_temp.valor('super', $q$update expense_categories set schedule_c_line = '99' where label_es = 'Otro' returning schedule_c_line$q$), 9));
select pg_temp.prueba('nombre de la línea', 'Car and truck expenses', schedule_c_name('9'));

-- 2. Resumen del empleado (D-294)
select pg_temp.prueba('sin ver pagos no', 'ERR:42501', left(pg_temp.valor('nob', format('select employee_summary(%L, 2025)::text', pg_temp.pid('estela'))), 9));
select pg_temp.prueba('1099 fijo mensual: 1 día y $1,350', '1|1350.00',
  pg_temp.valor('admin', format($q$select (r->>'days') || '|' || (r->>'amount') from employee_summary(%L, 2025) r$q$, pg_temp.pid('estela'))));
select pg_temp.prueba('por mes: agosto', '2025-08-01|1|1350.00',
  pg_temp.valor('admin', format($q$select (m->>'month') || '|' || (m->>'days') || '|' || (m->>'amount') from employee_summary(%L, 2025) r, jsonb_array_elements(r->'months') m$q$, pg_temp.pid('estela'))));
select pg_temp.prueba('cuenta terminada con cliente y fechas', 'Cliente PL|2025-08-01|2025-08-31|false',
  pg_temp.valor('admin', format($q$select (a->>'client') || '|' || (a->>'start_date') || '|' || (a->>'end_date') || '|' || (a->>'current') from employee_summary(%L, 2025) r, jsonb_array_elements(r->'accounts') a$q$, pg_temp.pid('estela'))));
select pg_temp.prueba('1099 por día: solo los aprobados', '2|160.00|true',
  pg_temp.valor('admin', format($q$select (r->>'days') || '|' || (r->>'amount') || '|' || (r->'accounts'->0->>'current') from employee_summary(%L, 2025) r$q$, pg_temp.pid('humbe'))));
select pg_temp.prueba('W-2: horas', '240|72.00',
  pg_temp.valor('admin', format($q$select (r->>'minutes') || '|' || (r->>'amount') from employee_summary(%L, 2025) r$q$, pg_temp.pid('ana'))));
select pg_temp.prueba('otro año sin trabajo: ceros', '0|0|0',
  pg_temp.valor('admin', format($q$select (r->>'days') || '|' || (r->>'amount') || '|' || jsonb_array_length(r->'months') from employee_summary(%L, 2024) r$q$, pg_temp.pid('humbe'))));

-- 3. Profit & Loss (D-295)
select pg_temp.prueba('sin dashboard global no', 'ERR:42501', left(pg_temp.valor('nob', 'select profit_and_loss(2025)::text'), 9));
select pg_temp.prueba('ingresos cobrados en el año sin tax (con el extra cobrado, sin el tardío)', '2100.00',
  pg_temp.valor('admin', $q$select profit_and_loss(2025)->>'income'$q$));
select pg_temp.prueba('Contract labor (1099) y Wages (W-2)', '1510.00|72.00',
  pg_temp.valor('admin', $q$select (r->>'contract_labor') || '|' || (r->>'wages') from profit_and_loss(2025) r$q$));
select pg_temp.prueba('gastos del año por spent_on', '350.50',
  pg_temp.valor('admin', $q$select profit_and_loss(2025)->>'expenses_total'$q$));
select pg_temp.prueba('ganancia neta', '167.50', pg_temp.valor('admin', $q$select profit_and_loss(2025)->>'net'$q$));
select pg_temp.prueba('Schedule C por línea', '1:2100.00 11:1510.00 15:200.00 22:150.50 26:72.00 31:167.50',
  pg_temp.valor('admin', $q$select string_agg((l->>'line') || ':' || (l->>'amount'), ' ') from profit_and_loss(2025) r, jsonb_array_elements(r->'schedule_c') l$q$));
select pg_temp.prueba('el Super Admin cambia la línea en Ajustes', '18',
  pg_temp.valor('super', $q$update expense_categories set schedule_c_line = '18' where label_es = 'Seguro' returning schedule_c_line$q$));
select pg_temp.prueba('otro no la cambia', 'null',
  coalesce(pg_temp.valor('admin', $q$update expense_categories set schedule_c_line = '27a' where label_es = 'Seguro' returning schedule_c_line$q$), 'null'));
select pg_temp.prueba('cambiar la línea mueve el gasto', '1:2100.00 11:1510.00 18:200.00 22:150.50 26:72.00 31:167.50',
  pg_temp.valor('admin', $q$select string_agg((l->>'line') || ':' || (l->>'amount'), ' ') from profit_and_loss(2025) r, jsonb_array_elements(r->'schedule_c') l$q$));

select n, prueba, ok, detalle from resultados order by n;
rollback;
