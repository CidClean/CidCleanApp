-- Pruebas de la pestaña Aprobados (D-298, migración 20261110000001) y del conteo de visitas por aprobar (D-299).
-- Repetibles: todo termina en rollback. Uso (desde la raíz del repositorio): psql -f supabase/tests/aprobados.sql
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

create function pg_temp.prueba(nombre text, esperado text, obtenido text) returns void language sql as $$
  insert into resultados (prueba, ok, detalle) values (nombre, esperado is not distinct from obtenido,
    'esperado=' || coalesce(esperado, 'null') || ' obtenido=' || coalesce(obtenido, 'null'));
$$;
create function pg_temp.id(k text) returns uuid language sql as $$ select v from ids where ids.k = $1 $$;
create function pg_temp.pid(n text) returns uuid language sql as $$ select profile_id from actores where nombre = $1 $$;

-- Personas: aprob (aprueba, sin ver pagos), admin (registra, aprueba y ve pagos), nadie (sin permisos de Work).
-- 1099: humbe (con acceso, $80 por visita, nadie marca su día). W-2: ana.
do $$
declare
  quien text;
  pid uuid;
  aid uuid;
begin
  foreach quien in array array['aprob', 'admin', 'nadie', 'humbe', 'ana'] loop
    aid := gen_random_uuid();
    insert into profiles (full_name, worker_type, role, email, has_app_access)
    values ('Prueba ' || quien, case when quien = 'humbe' then '1099' else 'w2' end::worker_type,
            'employee', quien || '@prueba-ap.local', true) returning id into pid;
    insert into auth.users (id, aud, role, email) values (aid, 'authenticated', 'authenticated', quien || '@prueba-ap.local');
    update profiles set auth_user_id = aid where id = pid;
    insert into actores values (quien, aid, pid);
  end loop;
  insert into profile_permissions (profile_id, permission_key)
  select a.profile_id, p.k from actores a
    join (values ('aprob', 'work_aprobar'), ('admin', 'work_aprobar'), ('admin', 'work_registrar_por_otros'),
                 ('admin', 'empleados_ver_pagos')) as p(n, k) on p.n = a.nombre;
end $$;

-- Jobsite; vn: visita de ayer (terminada) solo con el 1099, que nadie marcó. Más visitas fijas de octubre y septiembre.
do $$
declare
  cli uuid;
  js uuid;
  a uuid;
  v uuid;
begin
  insert into clients (name, legacy) values ('Cuenta Prueba AP', true) returning id into cli;
  insert into jobsites (client_id, name, address, frequency, latitude, longitude)
  values (cli, 'Sede AP', '1 Main St', '{"kind":"other","days":[]}', 26.1421, -81.7948) returning id into js;
  insert into ids values ('js', js);
  insert into jobsite_assignments (jobsite_id, profile_id, start_date) values (js, pg_temp.pid('humbe'), '2026-01-01') returning id into a;
  insert into assignment_pay (assignment_id, kind, fixed_amount, fixed_period, effective_from) values (a, 'fixed', 80, 'visit', '2026-01-01');
  insert into visits (jobsite_id, starts_at, minutes, local_date)
  values (js, now() - interval '30 hours', 240, local_day(now() - interval '30 hours')) returning id into v;
  insert into ids values ('vn', v);
  insert into visit_staff (visit_id, profile_id) values (v, pg_temp.pid('humbe'));
  -- Aprobadas a mano (como superusuario): oct-20 y oct-25 (con horas de ana) y sep-30.
  insert into visits (jobsite_id, starts_at, minutes, local_date, approved_at, approved_by)
  values (js, '2026-10-20 23:00-04', 240, '2026-10-20', '2026-10-22 10:00-04', pg_temp.pid('aprob')) returning id into v;
  insert into ids values ('v20', v);
  insert into visits (jobsite_id, starts_at, minutes, local_date, approved_at, approved_by)
  values (js, '2026-10-25 23:00-04', 240, '2026-10-25', '2026-10-26 10:00-04', pg_temp.pid('admin')) returning id into v;
  insert into ids values ('v25', v);
  insert into work_entries (visit_id, profile_id, clock_in, clock_out, in_status, out_status, pay_minutes, pay_amount)
  values (v, pg_temp.pid('ana'), '2026-10-25 23:00-04', '2026-10-26 03:00-04', 'ok', 'ok', 240, 72);
  insert into visits (jobsite_id, starts_at, minutes, local_date, approved_at, approved_by)
  values (js, '2026-09-30 23:00-04', 240, '2026-09-30', '2026-10-01 10:00-04', pg_temp.pid('aprob')) returning id into v;
  insert into ids values ('v30', v);
  -- Una aprobada pero quitada no aparece.
  insert into visits (jobsite_id, starts_at, minutes, local_date, approved_at, approved_by, removed)
  values (js, '2026-10-21 23:00-04', 240, '2026-10-21', '2026-10-22 10:00-04', pg_temp.pid('aprob'), true);
end $$;

-- 1. D-299: la visita del 1099 que terminó y nadie marcó está por aprobar y se lista en To approve
select pg_temp.prueba('1099 sin marcar: visit_pending_approval', 'true',
  (select visit_pending_approval(v)::text from visits v where id = pg_temp.id('vn')));
select pg_temp.prueba('1099 sin marcar: sale en work_to_approve con la fila day_missing', 'day_missing',
  pg_temp.valor('aprob', format($q$select c->'rows'->0->>'status' from jsonb_array_elements(work_to_approve()) c where c->>'id' = %L$q$, pg_temp.id('vn'))));
select pg_temp.prueba('1099 sin marcar: la fila es del 1099', 'Prueba humbe|1099',
  pg_temp.valor('aprob', format($q$select (c->'rows'->0->>'name') || '|' || (c->'rows'->0->>'worker_type') from jsonb_array_elements(work_to_approve()) c where c->>'id' = %L$q$, pg_temp.id('vn'))));
select pg_temp.prueba('Inicio: to_approve.visits cuenta las visitas por aprobar (incluye la del 1099 sin marcar)',
  (select count(*)::text from visits v where visit_pending_approval(v)),
  pg_temp.valor('aprob', $q$select admin_home()->'to_approve'->>'visits'$q$));
select pg_temp.prueba('Inicio: hay al menos una visita aunque no haya turnos ni días marcados en ella', 'true',
  pg_temp.valor('aprob', $q$select ((admin_home()->'to_approve'->>'visits')::int >= 1)::text$q$));

-- 2. Al registrar y aprobar el día, la visita se cierra y pasa a Aprobados
select pg_temp.valor('admin', format('select record_and_approve_service_day(%L, %L)::text', pg_temp.id('vn'), pg_temp.pid('humbe')));
select pg_temp.prueba('la visita se cerró, aprobada por admin', 'Prueba admin',
  (select p.full_name from visits v join profiles p on p.id = v.approved_by where v.id = pg_temp.id('vn')));
select pg_temp.prueba('ya no está en To approve', '0',
  pg_temp.valor('aprob', format($q$select count(*)::text from jsonb_array_elements(work_to_approve()) c where c->>'id' = %L$q$, pg_temp.id('vn'))));
select pg_temp.prueba('está en Aprobados de su mes, con quién aprobó y la fila del día aprobado', 'Prueba admin|day_approved|80.00',
  pg_temp.valor('admin', format($q$select (c->>'approved_by') || '|' || (c->'rows'->0->>'status') || '|' || (c->'rows'->0->>'pay_amount')
                                 from jsonb_array_elements(work_approved(%L)) c where c->>'id' = %L$q$, (select local_date from visits where id = pg_temp.id('vn')), pg_temp.id('vn'))));
select pg_temp.prueba('trae approved_at', 'true',
  pg_temp.valor('admin', format($q$select ((c->>'approved_at') is not null)::text
                                 from jsonb_array_elements(work_approved(%L)) c where c->>'id' = %L$q$, (select local_date from visits where id = pg_temp.id('vn')), pg_temp.id('vn'))));

-- 3. Por mes, la más reciente primero; sin quitadas; otro mes no
select pg_temp.prueba('octubre: oct-25 y oct-20, en ese orden (sin la quitada ni septiembre)',
  pg_temp.id('v25') || ',' || pg_temp.id('v20'),
  pg_temp.valor('admin', $q$select string_agg(c->>'id', ',' order by o) from jsonb_array_elements(work_approved('2026-10-15')) with ordinality t(c, o)$q$));
select pg_temp.prueba('septiembre: solo sep-30', pg_temp.id('v30')::text,
  pg_temp.valor('admin', $q$select string_agg(c->>'id', ',') from jsonb_array_elements(work_approved('2026-09-01')) c$q$));
select pg_temp.prueba('mes sin aprobadas: lista vacía', '[]', pg_temp.valor('admin', $q$select work_approved('2025-01-01')::text$q$));
select pg_temp.prueba('las horas del W-2 vienen en la tarjeta', '72.00',
  pg_temp.valor('admin', format($q$select c->'rows'->0->>'pay_amount' from jsonb_array_elements(work_approved('2026-10-01')) c where c->>'id' = %L$q$, pg_temp.id('v25'))));

-- 4. Permisos y montos
select pg_temp.prueba('sin permiso de Work: no', 'ERR:42501',
  left(pg_temp.valor('nadie', $q$select work_approved('2026-10-01')::text$q$), 9));
select pg_temp.prueba('aprobar sin ver pagos: ve las tarjetas', '2',
  pg_temp.valor('aprob', $q$select jsonb_array_length(work_approved('2026-10-01'))::text$q$));
select pg_temp.prueba('aprobar sin ver pagos: sin monto del W-2', 'null',
  pg_temp.valor('aprob', format($q$select coalesce(c->'rows'->0->>'pay_amount', 'null') from jsonb_array_elements(work_approved('2026-10-01')) c where c->>'id' = %L$q$, pg_temp.id('v25'))));
select pg_temp.prueba('aprobar sin ver pagos: sin monto del día del 1099', 'null|null|null',
  pg_temp.valor('aprob', format($q$select coalesce(c->'rows'->0->>'pay_amount', 'null') || '|' || coalesce(c->'rows'->0->'service_day'->>'amount', 'null') || '|' || coalesce(c->'rows'->0->'service_day'->>'expected_amount', 'null')
                                 from jsonb_array_elements(work_approved(%L)) c where c->>'id' = %L$q$, (select local_date from visits where id = pg_temp.id('vn')), pg_temp.id('vn'))));
select pg_temp.prueba('anon no ejecuta work_approved', 'false', has_function_privilege('anon', 'work_approved(date)', 'execute')::text);
select pg_temp.prueba('authenticated no ejecuta work_card_strip_pay', 'false', has_function_privilege('authenticated', 'work_card_strip_pay(jsonb)', 'execute')::text);

select n, prueba, ok, detalle from resultados order by n;
rollback;
