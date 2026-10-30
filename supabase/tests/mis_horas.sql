-- Pruebas de "Mis horas" (migración 20261030000005, D-272, D-274).
-- Repetibles: todo ocurre dentro de una transacción que termina en rollback, no queda nada en la base.
-- Simulan roles con `set local role` y `request.jwt.claims`, como hace la API.
-- Uso: psql -f supabase/tests/mis_horas.sql   (la última consulta lista cada prueba con ok = true/false).

begin;

create temp table resultados (n int generated always as identity, prueba text, ok boolean, detalle text);
create temp table actores (nombre text primary key, auth_id uuid, profile_id uuid);
grant all on resultados, actores to public;

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

create function pg_temp.prueba(nombre text, esperado text, obtenido text) returns void language sql as $$
  insert into resultados (prueba, ok, detalle) values (nombre, esperado is not distinct from obtenido,
    'esperado=' || coalesce(esperado, 'null') || ' obtenido=' || coalesce(obtenido, 'null'));
$$;

create function pg_temp.pid(n text) returns uuid language sql as $$ select profile_id from actores where nombre = $1 $$;
grant execute on all functions in schema pg_temp to public;

-- Personas: un W2 (humbe), un 1099 (karina), otra persona (otro) y una inactiva.
do $$
declare
  quien text;
  pid uuid;
  aid uuid;
begin
  foreach quien in array array['humbe', 'karina', 'otro', 'inactiva'] loop
    aid := gen_random_uuid();
    insert into auth.users (id, aud, role, email) values (aid, 'authenticated', 'authenticated', quien || '@prueba-mh.local');
    insert into profiles (full_name, worker_type, role, email, has_app_access, auth_user_id)
    values ('Prueba ' || quien, case when quien = 'karina' then '1099' else 'w2' end::worker_type,
            'employee', quien || '@prueba-mh.local', true, aid) returning id into pid;
    insert into actores values (quien, aid, pid);
  end loop;
end $$;

-- Visitas de Naples YC: 21 y 26 oct aprobadas, 27 oct sin aprobar, 30 sep aprobada, 22 oct aprobada pero quitada.
do $$
declare
  cli uuid;
  js uuid;
  v21 uuid; v26 uuid; v27 uuid; v30s uuid; v22 uuid; v28 uuid;
  t timestamptz;
begin
  insert into clients (name, legacy) values ('Cuenta Prueba MH', true) returning id into cli;
  insert into jobsites (client_id, name, address, frequency) values (cli, 'Naples YC Prueba', '1 Main St', '{"kind":"other","days":[]}') returning id into js;
  t := '2026-10-21 18:00-04';
  insert into visits (jobsite_id, starts_at, minutes, local_date, approved_at) values (js, t, 240, '2026-10-21', now()) returning id into v21;
  insert into work_entries (visit_id, profile_id, clock_in, clock_out, in_status, out_status, pay_minutes, pay_amount)
  values (v21, pg_temp.pid('humbe'), t, t + interval '4 hours', 'ok', 'ok', 240, 80),
         (v21, pg_temp.pid('otro'), t, t + interval '2 hours', 'ok', 'ok', 240, 80),
         (v21, pg_temp.pid('karina'), t, t + interval '1 hour 30 minutes', 'ok', 'ok', 240, 99);
  t := '2026-10-26 18:00-04';
  insert into visits (jobsite_id, starts_at, minutes, local_date, approved_at) values (js, t, 240, '2026-10-26', now()) returning id into v26;
  insert into work_entries (visit_id, profile_id, clock_in, clock_out, in_status, out_status, pay_minutes, pay_amount)
  values (v26, pg_temp.pid('humbe'), t, t + interval '3 hours 13 minutes', 'ok', 'ok', 240, 80);
  t := '2026-10-27 18:00-04';
  insert into visits (jobsite_id, starts_at, minutes, local_date) values (js, t, 240, '2026-10-27') returning id into v27;
  insert into work_entries (visit_id, profile_id, clock_in, clock_out, in_status, out_status)
  values (v27, pg_temp.pid('humbe'), t, t + interval '4 hours', 'ok', 'ok');
  t := '2026-09-30 18:00-04';
  insert into visits (jobsite_id, starts_at, minutes, local_date, approved_at) values (js, t, 240, '2026-09-30', now()) returning id into v30s;
  insert into work_entries (visit_id, profile_id, clock_in, clock_out, in_status, out_status, pay_minutes, pay_amount)
  values (v30s, pg_temp.pid('humbe'), t, t + interval '5 hours', 'ok', 'ok', 300, 100);
  t := '2026-10-22 18:00-04';
  insert into visits (jobsite_id, starts_at, minutes, local_date, approved_at, removed) values (js, t, 240, '2026-10-22', now(), true) returning id into v22;
  insert into work_entries (visit_id, profile_id, clock_in, clock_out, in_status, out_status, pay_minutes, pay_amount)
  values (v22, pg_temp.pid('humbe'), t, t + interval '4 hours', 'ok', 'ok', 240, 80);
  -- Turno abierto (sin salida) en una visita aprobada: no cuenta.
  t := '2026-10-28 18:00-04';
  insert into visits (jobsite_id, starts_at, minutes, local_date, approved_at) values (js, t, 240, '2026-10-28', now()) returning id into v28;
  insert into work_entries (visit_id, profile_id, clock_in, in_status) values (v28, pg_temp.pid('humbe'), t, 'ok');
  update profiles set active = false where id = pg_temp.pid('inactiva');
end $$;

-- Quién puede llamarla
select pg_temp.prueba('anon no la llama', 'ERR:42501', pg_temp.valor('anon', $q$select my_hours('2026-10-01')::text$q$));
select pg_temp.prueba('un empleado inactivo no la llama', 'ERR:42501', pg_temp.valor('inactiva', $q$select my_hours('2026-10-01')::text$q$));
select pg_temp.prueba('sin mes, error', 'ERR:22023', pg_temp.valor('humbe', $q$select my_hours(null)::text$q$));

-- Solo lo suyo, solo aprobado, el mes correcto
select pg_temp.prueba('humbe en octubre: 2 filas (aprobadas, con salida, no quitadas)', '2',
  pg_temp.valor('humbe', $q$select jsonb_array_length(my_hours('2026-10-15')->'rows')::text$q$));
select pg_temp.prueba('filas del más reciente al más antiguo, con la cuenta', '2026-10-26|Naples YC Prueba,2026-10-21|Naples YC Prueba',
  pg_temp.valor('humbe', $q$select string_agg((r->>'date') || '|' || (r->>'account'), ',' order by n) from jsonb_array_elements(my_hours('2026-10-01')->'rows') with ordinality x(r, n)$q$));
select pg_temp.prueba('trabajados y asegurados por fila', '193/240,240/240',
  pg_temp.valor('humbe', $q$select string_agg((r->>'worked_minutes') || '/' || (r->>'insured_minutes'), ',' order by n) from jsonb_array_elements(my_hours('2026-10-01')->'rows') with ordinality x(r, n)$q$));
select pg_temp.prueba('totales del mes', '433|480|2026-10-01',
  pg_temp.valor('humbe', $q$select (h->>'worked_minutes') || '|' || (h->>'insured_minutes') || '|' || (h->>'month') from my_hours('2026-10-31') h$q$));
select pg_temp.prueba('septiembre: solo la del 30', '1|300|300',
  pg_temp.valor('humbe', $q$select jsonb_array_length(h->'rows') || '|' || (h->>'worked_minutes') || '|' || (h->>'insured_minutes') from my_hours('2026-09-01') h$q$));
-- D-279: "Mis horas" solo para W-2; el 1099 ve "Mis días de servicio".
select pg_temp.prueba('el 1099 no usa Mis horas (contractor_no_hours)', 'ERR:42501',
  pg_temp.valor('karina', $q$select my_hours('2026-10-01')::text$q$));
select pg_temp.prueba('otra persona no ve las de humbe', '120',
  pg_temp.valor('otro', $q$select my_hours('2026-10-01')->>'worked_minutes'$q$));
select pg_temp.prueba('mes sin trabajo: vacío y 0', '0|0|0',
  pg_temp.valor('humbe', $q$select jsonb_array_length(h->'rows') || '|' || (h->>'worked_minutes') || '|' || (h->>'insured_minutes') from my_hours('2026-11-01') h$q$));

-- Sin montos ni tope de 32 h (D-223)
select pg_temp.prueba('la respuesta no lleva dinero ni tope', 'false',
  pg_temp.valor('humbe', $q$select (my_hours('2026-10-01')::text ~* 'amount|rate|money|pay_|32|limit|cap')::text$q$));
select pg_temp.prueba('cada fila lleva solo fecha, cuenta, trabajados y asegurados', 'account,date,insured_minutes,worked_minutes',
  pg_temp.valor('humbe', $q$select string_agg(k, ',' order by k) from jsonb_object_keys(my_hours('2026-10-01')->'rows'->0) k$q$));

select n, prueba, ok, detalle from resultados order by n;
rollback;
