-- Pruebas de D-241 (migración 20261027000007): fechas pasadas solo en jobsites de clientes "Previo a la app" y turno que
-- cruza la medianoche. Repetibles: todo termina en rollback.
-- Uso: psql -f supabase/tests/fechas_previos.sql (la última consulta lista cada prueba con ok = true/false).

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
  foreach quien in array array['admin', 'w2'] loop
    aid := gen_random_uuid();
    insert into profiles (full_name, worker_type, role, email, has_app_access)
    values ('Prueba ' || quien, 'w2', 'employee', quien || '@prueba.local', true) returning id into pid;
    insert into auth.users (id, aud, role, email) values (aid, 'authenticated', 'authenticated', quien || '@prueba.local');
    insert into actores values (quien, aid, pid);
  end loop;
  insert into profile_permissions (profile_id, permission_key)
  select a.profile_id, k from actores a,
    unnest(array['clientes_ver', 'clientes_editar_datos', 'clientes_ver_tarifa', 'empleados_ver', 'empleados_ver_pagos',
                 'empleados_asignar_pago', 'schedule_ver_editar', 'work_registrar_por_otros', 'work_editar', 'work_aprobar']) k
   where a.nombre = 'admin';
end $$;

do $$
declare
  r text;
  cli uuid;
  previo uuid;
  nuevo uuid;
  asig uuid;
  asig2 uuid;
  v uuid;
  vn uuid;
  w2 uuid := (select profile_id from actores where nombre = 'w2');
  ayer text := quote_literal((current_date - 1)::text);
  antes text := quote_literal((current_date - 5)::text);
  hoy text := quote_literal(current_date::text);
  dia date := cc_today() - 3;
  noche timestamptz := (cc_today() - 3 + '23:00'::time) at time zone cc_tz();
begin
  r := pg_temp.valor('admin', $q$ select create_legacy_client('Prueba Previo', null, null, null, null)::text $q$);
  cli := r::uuid;
  previo := pg_temp.valor('admin', format($q$ select create_legacy_jobsite(%L, '{"name": "P", "address": "P st", "frequency": {"kind": "daily"}}', 1000)::text $q$, cli))::uuid;
  insert into clients (name) values ('Prueba Nuevo') returning id into cli;
  insert into jobsites (client_id, name, address, frequency) values (cli, 'N', 'N st', '{"kind": "daily", "days": [0,1,2,3,4,5,6]}') returning id into nuevo;

  -- Asignación de personal
  r := pg_temp.valor('admin', format('select assign_employee(%L, %L, %s)::text', previo, w2, antes));
  perform pg_temp.prueba('previo: se asigna con fecha pasada', 'ok', case when r like 'ERR%' then r else 'ok' end);
  asig := r::uuid;
  perform pg_temp.prueba('nuevo: no se asigna con fecha pasada', 'ERR:22023',
    pg_temp.valor('admin', format('select assign_employee(%L, %L, %s)::text', nuevo, w2, ayer)));
  asig2 := pg_temp.valor('admin', format('select assign_employee(%L, %L, %s)::text', nuevo, w2, hoy))::uuid;

  -- Pago
  perform pg_temp.prueba('previo: el pago empieza en una fecha pasada', '',
    pg_temp.valor('admin', format($q$ select set_assignment_pay(%L, 'hourly', 20, null, null, null, %s)::text $q$, asig, antes)));
  perform pg_temp.prueba('nuevo: el pago no empieza antes de hoy', 'ERR:22023',
    pg_temp.valor('admin', format($q$ select set_assignment_pay(%L, 'hourly', 20, null, null, null, %s)::text $q$, asig2, ayer)));
  perform pg_temp.prueba('previo: el mínimo W-2 sigue', 'ERR:23514',
    pg_temp.valor('admin', format($q$ select set_assignment_pay(%L, 'hourly', 14, null, null, null, %s)::text $q$, asig, ayer)));

  -- Visitas
  r := pg_temp.valor('admin', format('select add_visit(%L, %L, 240, %L)::text', previo, noche, array[w2]));
  perform pg_temp.prueba('previo: se agrega una visita pasada', 'ok', case when r like 'ERR%' then r else 'ok' end);
  v := r::uuid;
  perform pg_temp.prueba('nuevo: no se agrega una visita pasada', 'ERR:22023',
    pg_temp.valor('admin', format('select add_visit(%L, %L, 240, %L)::text', nuevo, noche, '{}')));
  perform pg_temp.prueba('previo: la duración sigue validándose', 'ERR:22023',
    pg_temp.valor('admin', format('select add_visit(%L, %L, 5, %L)::text', previo, noche, '{}')));
  vn := pg_temp.valor('admin', format('select add_visit(%L, %L, 240, %L)::text', nuevo, now() + interval '2 days', '{}'))::uuid;
  perform pg_temp.prueba('nuevo: una visita futura se sigue agregando', 'true', (vn is not null)::text);
  perform pg_temp.prueba('nuevo: una visita no se mueve al pasado', 'ERR:22023',
    pg_temp.valor('admin', format('select update_visit(%L, %L, 240)::text', vn, noche)));
  perform pg_temp.prueba('previo: una visita se mueve a otro día pasado', 'ok',
    case when pg_temp.valor('admin', format('select update_visit(%L, %L, 240)::text', v, noche - interval '1 day')) like 'ERR%' then 'err' else 'ok' end);
  perform pg_temp.valor('admin', format('select update_visit(%L, %L, 240)::text', v, noche));

  -- Trabajo por otros con turno que cruza la medianoche (11:00 PM a 3:00 AM del día siguiente) y aprobación
  perform pg_temp.prueba('previo: se registra el turno de 11 PM a 3 AM', '',
    pg_temp.valor('admin', format('select record_work(%L, %L)::text', v,
      jsonb_build_array(jsonb_build_object('profile_id', w2, 'clock_in', noche, 'clock_out', noche + interval '4 hours')))));
  perform pg_temp.prueba('previo: se aprueba', '', pg_temp.valor('admin', format('select approve_visit(%L)::text', v)));
  perform pg_temp.prueba('el pago sale de 240 minutos a $20/h', '240|80.00',
    (select pay_minutes || '|' || pay_amount from work_entries where visit_id = v));
  perform pg_temp.prueba('la visita queda en el día de la entrada', dia::text, (select local_date::text from visits where id = v));
end $$;

select n, prueba, ok, detalle from resultados order by n;
rollback;
