-- Pruebas de Clientes, Jobsites y pagos por jobsite (migración 20261025000001, hito 5).
-- Repetibles: todo ocurre dentro de una transacción que termina en rollback, no queda nada en la base
-- (tampoco en change_log). Simulan roles con `set local role` y `request.jwt.claims`, como hace la API.
-- Uso: psql -f supabase/tests/leads.sql   (la última consulta lista cada prueba con ok = true/false).

begin;

create temp table resultados (n int generated always as identity, prueba text, ok boolean, detalle text);
create temp table actores (nombre text primary key, auth_id uuid, profile_id uuid);
create temp table ids (nombre text primary key, id uuid);
grant all on resultados, actores, ids to public;

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

create function pg_temp.prueba(nombre text, esperado text, obtenido text) returns void language sql as $$
  insert into resultados (prueba, ok, detalle) values (nombre, esperado is not distinct from obtenido,
    'esperado=' || coalesce(esperado, 'null') || ' obtenido=' || coalesce(obtenido, 'null'));
$$;

create function pg_temp.id(nombre text) returns uuid language sql as $$ select id from ids where ids.nombre = $1 $$;

-- Personas de prueba -------------------------------------------------------------------------------
do $$
declare
  quien text;
  pid uuid;
  aid uuid;
begin
  foreach quien in array array['ver', 'tarifa', 'editor', 'datos', 'estado', 'sup', 'pagos', 'sow', 'sin', 'w2', 'c1099'] loop
    aid := gen_random_uuid();
    insert into profiles (full_name, worker_type, role, email, has_app_access)
    values ('Prueba ' || quien, (case when quien = 'c1099' then '1099' else 'w2' end)::worker_type, 'employee', quien || '@prueba.local', true)
    returning id into pid;
    insert into auth.users (id, aud, role, email) values (aid, 'authenticated', 'authenticated', quien || '@prueba.local');
    insert into actores values (quien, aid, pid);
  end loop;
  insert into profile_permissions (profile_id, permission_key)
  select a.profile_id, p.k from actores a
    join (values ('ver', 'clientes_ver'),
                 ('tarifa', 'clientes_ver'), ('tarifa', 'clientes_ver_tarifa'),
                 ('editor', 'clientes_ver'), ('editor', 'clientes_editar_datos'), ('editor', 'clientes_ver_tarifa'),
                 ('datos', 'clientes_ver'), ('datos', 'clientes_editar_datos'),
                 ('estado', 'clientes_ver'), ('estado', 'clientes_cambiar_estado'),
                 ('sup', 'clientes_ver'), ('sup', 'schedule_ver_editar'), ('sup', 'empleados_ver'),
                 ('pagos', 'clientes_ver'), ('pagos', 'clientes_ver_tarifa'), ('pagos', 'empleados_ver'),
                 ('pagos', 'empleados_ver_pagos'), ('pagos', 'empleados_asignar_pago'),
                 ('sow', 'clientes_ver'), ('sow', 'clientes_editar_walkthrough_sow')) as p(n, k) on p.n = a.nombre;
end $$;

-- Pruebas --------------------------------------------------------------------------------------------
do $$
declare
  r text;
  cliente uuid;
  js uuid;
  js2 uuid;
  asig uuid;
  asig2 uuid;
  w2 uuid := (select profile_id from actores where nombre = 'w2');
  c1099 uuid := (select profile_id from actores where nombre = 'c1099');
  editor_pid uuid := (select profile_id from actores where nombre = 'editor');
  hoy text := quote_literal(current_date::text);
  manana text := quote_literal((current_date + 1)::text);
  ayer text := quote_literal((current_date - 1)::text);
  datos text := $j$ '{"name": "Prueba 5th Ave", "address": "123 5th Ave S", "plus_code": "66G8+4P Naples, Florida",
     "contact_name": "Ana", "emergency_name": "Luis", "emergency_phone": "239", "emergency_relation": "Gerente",
     "emergency_email": "LUIS@X.COM", "frequency": {"kind": "weekly", "days": [0, 2, 4]}, "est_hours_per_visit": 3,
     "start_date": "2026-11-01"}' $j$;
begin
  -- Alta de clientes previos (D-210)
  perform pg_temp.prueba('quien edita datos sin ver tarifa no da de alta clientes', 'ERR:42501',
    pg_temp.valor('datos', $q$ select create_legacy_client('X', null, null, null, null)::text $q$));
  perform pg_temp.prueba('el nombre es obligatorio', 'ERR:22023',
    pg_temp.valor('editor', $q$ select create_legacy_client(' ', null, null, null, null)::text $q$));
  r := pg_temp.valor('editor', $q$ select create_legacy_client('Prueba Clinic', '(239) 1', 'A@B.COM', 'Naples', null)::text $q$);
  perform pg_temp.prueba('quien edita datos y ve tarifa da de alta un cliente previo', 'ok', case when r like 'ERR%' then r else 'ok' end);
  cliente := r::uuid;
  perform pg_temp.prueba('queda marcado Previo a la app, con el correo en minúsculas', 'true|a@b.com',
    (select legacy || '|' || email from clients where id = cliente));
  perform pg_temp.prueba('el alta queda en el historial', '1',
    (select count(*)::text from change_log where entity_id = cliente and action = 'cliente_creado' and actor_id = editor_pid));
  perform pg_temp.prueba('quien ve clientes ve el cliente', '1', pg_temp.valor('ver', format('select count(*) from clients where id = %L', cliente)));
  perform pg_temp.prueba('sin permisos no lo ve', '0', pg_temp.valor('sin', 'select count(*) from clients'));
  perform pg_temp.prueba('nadie escribe la tabla directo', 'ERR:42501',
    pg_temp.valor('editor', format($q$ with u as (update clients set name = 'x' where id = %L returning 1) select count(*) from u $q$, cliente)));

  -- Jobsite previo
  perform pg_temp.prueba('frecuencia no válida', 'ERR:22023',
    pg_temp.valor('editor', format($q$ select create_legacy_jobsite(%L, '{"name": "a", "address": "b", "frequency": {"kind": "x"}}', 100)::text $q$, cliente)));
  r := pg_temp.valor('editor', format('select create_legacy_jobsite(%L, %s, 1850)::text', cliente, datos));
  perform pg_temp.prueba('alta de un jobsite previo con tarifa', 'ok', case when r like 'ERR%' then r else 'ok' end);
  js := r::uuid;
  perform pg_temp.prueba('guarda Plus Code, contacto de emergencia y frecuencia', '66G8+4P Naples, Florida|luis@x.com|weekly',
    (select plus_code || '|' || emergency_email || '|' || (frequency->>'kind') from jobsites where id = js));

  -- Tarifa: nunca directo; con función y registro de cada apertura
  perform pg_temp.prueba('la tabla de tarifas no se lee directo', 'ERR:42501',
    pg_temp.valor('tarifa', 'select count(*) from jobsite_rates'));
  perform pg_temp.prueba('sin ver tarifa no hay tarifa', 'ERR:42501', pg_temp.valor('ver', format('select get_jobsite_rate(%L)::text', js)));
  perform pg_temp.prueba('con ver tarifa se lee', '1850.00', pg_temp.valor('tarifa', format('select get_jobsite_rate(%L)::text', js)));
  perform pg_temp.prueba('cada apertura de la tarifa queda en el historial', '1',
    (select count(*)::text from change_log where entity_id = js and action = 'tarifa_abierta'));
  perform pg_temp.prueba('la tarifa de un cliente previo se edita directo', '',
    pg_temp.valor('editor', format('select set_jobsite_rate(%L, 2000)::text', js)));
  perform pg_temp.prueba('...y queda la nueva', '2000.00', (select monthly_rate::text from jobsite_rates where jobsite_id = js));
  perform pg_temp.prueba('el cambio guarda antes y después', '1850.00|2000.00',
    (select (detail->>'antes') || '|' || (detail->>'despues') from change_log where entity_id = js and action = 'tarifa_cambiada'));

  -- Jobsite que nace de un quote (no previo): su tarifa no se edita directo
  insert into clients (name) values ('Prueba Quote') returning id into r;
  insert into jobsites (client_id, name, address) values (r::uuid, 'Q', 'Q st') returning id into js2;
  insert into jobsite_rates (jobsite_id, monthly_rate) values (js2, 900);
  perform pg_temp.prueba('la tarifa de un cliente con quote no se edita directo', 'ERR:22023',
    pg_temp.valor('editor', format('select set_jobsite_rate(%L, 1)::text', js2)));
  perform pg_temp.prueba('a un cliente con quote no se le dan de alta jobsites a mano', 'ERR:22023',
    pg_temp.valor('editor', format('select create_legacy_jobsite(%L, %s, 1)::text', r::uuid, datos)));

  -- Datos del jobsite
  perform pg_temp.prueba('quien solo ve no edita el jobsite', 'ERR:42501',
    pg_temp.valor('ver', format('select update_jobsite(%L, %s)::text', js, datos)));
  perform pg_temp.prueba('quien edita datos (sin ver tarifa) edita datos y contactos', '',
    pg_temp.valor('datos', format('select update_jobsite(%L, %s)::text', js, replace(datos, 'Ana', 'Ana Rivera'))));

  -- Asignar personal (sin cifras) y pago
  perform pg_temp.prueba('quien solo ve clientes no asigna', 'ERR:42501',
    pg_temp.valor('ver', format('select assign_employee(%L, %L, %s)::text', js, w2, hoy)));
  perform pg_temp.prueba('no se asigna con fecha pasada', 'ERR:22023',
    pg_temp.valor('sup', format('select assign_employee(%L, %L, %s)::text', js, w2, ayer)));
  r := pg_temp.valor('sup', format('select assign_employee(%L, %L, %s)::text', js, w2, hoy));
  perform pg_temp.prueba('el supervisor (schedule) asigna sin ver cifras', 'ok', case when r like 'ERR%' then r else 'ok' end);
  asig := r::uuid;
  perform pg_temp.prueba('el mismo empleado no se asigna dos veces abierto', 'ERR:23505',
    pg_temp.valor('sup', format('select assign_employee(%L, %L, %s)::text', js, w2, manana)));
  perform pg_temp.prueba('el supervisor ve el personal con nombres', 'Prueba w2',
    pg_temp.valor('sup', format('select string_agg(full_name, %L) from list_jobsite_staff(%L)', ',', js)));
  perform pg_temp.prueba('el supervisor no define pagos', 'ERR:42501',
    pg_temp.valor('sup', format($q$ select set_assignment_pay(%L, 'hourly', 18, 3, null, null, %s)::text $q$, asig, hoy)));
  perform pg_temp.prueba('el supervisor no ve pagos', 'ERR:42501',
    pg_temp.valor('sup', format('select count(*) from get_assignment_pay(%L, null)', js)));
  perform pg_temp.prueba('la tabla de pagos no se lee directo', 'ERR:42501',
    pg_temp.valor('pagos', 'select count(*) from assignment_pay'));
  perform pg_temp.prueba('un W-2 por hora no baja de $15.00 (D-061)', 'ERR:23514',
    pg_temp.valor('pagos', format($q$ select set_assignment_pay(%L, 'hourly', 14, null, null, null, %s)::text $q$, asig, hoy)));
  perform pg_temp.prueba('el pago no empieza antes de hoy (sin retroactivo)', 'ERR:22023',
    pg_temp.valor('pagos', format($q$ select set_assignment_pay(%L, 'hourly', 18, 3, null, null, %s)::text $q$, asig, ayer)));
  perform pg_temp.prueba('quien asigna pago define $18.00/h con 3 h garantizadas', '',
    pg_temp.valor('pagos', format($q$ select set_assignment_pay(%L, 'hourly', 18, 3, null, null, %s)::text $q$, asig, hoy)));
  perform pg_temp.valor('pagos', format($q$ select set_assignment_pay(%L, 'hourly', 20, null, null, null, %s)::text $q$, asig, manana));
  perform pg_temp.prueba('un cambio a futuro no reemplaza el vigente; se ve como próximo cambio', 'hourly|18.00|' || (current_date + 1),
    pg_temp.valor('pagos', format($q$ select kind || '|' || hourly_rate || '|' || next_change from get_assignment_pay(%L, null) $q$, js)));
  perform pg_temp.prueba('cada apertura de pagos queda en el historial', 'true',
    ((select count(*) from change_log where entity_id = js and action = 'pagos_abiertos') >= 1)::text);
  r := pg_temp.valor('sup', format('select assign_employee(%L, %L, %s)::text', js, c1099, hoy));
  asig2 := r::uuid;
  perform pg_temp.prueba('el mínimo no aplica a un 1099', '',
    pg_temp.valor('pagos', format($q$ select set_assignment_pay(%L, 'hourly', 12, null, null, null, %s)::text $q$, asig2, hoy)));
  perform pg_temp.prueba('tarifa fija por visita', '',
    pg_temp.valor('pagos', format($q$ select set_assignment_pay(%L, 'fixed', null, null, 120, 'visit', %s)::text $q$, asig2, hoy)));

  -- Margen (D-010, D-060): 3 visitas por semana = 13 al mes; W-2 $18 x 3 h x 13 = 702; 1099 $120 x 13 = 1560; total 2262 >= 2000
  perform pg_temp.prueba('margen en riesgo con cifras para quien ve tarifa y pagos', 'true|2262.00|2000.00',
    pg_temp.valor('pagos', format($q$ select (m->>'at_risk') || '|' || (m->>'cost') || '|' || (m->>'rate') from jobsite_margin(%L) m $q$, js)));
  perform pg_temp.prueba('quien ve tarifa sin pagos ve la ficha pero no las cifras', 'true|',
    pg_temp.valor('tarifa', format($q$ select (m->>'at_risk') || '|' || coalesce(m->>'cost', '') from jobsite_margin(%L) m $q$, js)));
  perform pg_temp.prueba('la lista de riesgo (sin cifras) incluye el jobsite', 'true',
    pg_temp.valor('tarifa', format('select %L in (select * from jobsites_at_risk())', js)));
  perform pg_temp.prueba('sin ver tarifa no hay margen', 'ERR:42501', pg_temp.valor('ver', format('select jobsite_margin(%L)::text', js)));
  perform pg_temp.prueba('reglas: visitas al mes (diaria, semanal, otra)', '30.33|13.00|8',
    jobsite_visits_per_month('{"kind": "daily"}', null) || '|' || jobsite_visits_per_month('{"kind": "weekly", "days": [0,2,4]}', null)
    || '|' || jobsite_visits_per_month('{"kind": "other"}', 8));
  perform pg_temp.prueba('regla de prorrateo por días (D-210): $600 al mes de noviembre desde el 16', '300.00',
    prorate_fixed(600, 'month', '2026-11-01', '2026-11-16', null)::text);
  perform pg_temp.prueba('prorrateo de una semana desde el miércoles', '50.00',
    prorate_fixed(70, 'week', '2026-11-02', '2026-11-04', null)::text);

  -- Quitar con fecha de fin
  perform pg_temp.prueba('no se quita con fecha pasada', 'ERR:22023',
    pg_temp.valor('sup', format('select end_assignment(%L, %s)::text', asig2, ayer)));
  perform pg_temp.prueba('se quita con fecha de fin', '',
    pg_temp.valor('sup', format('select end_assignment(%L, %s)::text', asig2, hoy)));
  perform pg_temp.prueba('...registrado', '1', (select count(*)::text from change_log where entity_id = js and action = 'personal_quitado'));

  -- Estado (D-056, D-210)
  perform pg_temp.prueba('sin el permiso no cambia el estado', 'ERR:42501',
    pg_temp.valor('editor', format($q$ select set_jobsite_status(%L, 'paused')::text $q$, js)));
  perform pg_temp.valor('estado', format($q$ select set_jobsite_status(%L, 'paused')::text $q$, js));
  perform pg_temp.prueba('pausado conserva el personal', 'paused|1',
    (select status::text from jobsites where id = js) || '|' || (select count(*) from jobsite_assignments where jobsite_id = js and end_date is null));
  perform pg_temp.valor('estado', format($q$ select set_jobsite_status(%L, 'terminated')::text $q$, js));
  perform pg_temp.prueba('terminado cierra las asignaciones abiertas', 'terminated|0',
    (select status::text from jobsites where id = js) || '|' || (select count(*) from jobsite_assignments where jobsite_id = js and end_date is null));
  perform pg_temp.prueba('un terminado no se reabre', 'ERR:22023',
    pg_temp.valor('estado', format($q$ select set_jobsite_status(%L, 'active')::text $q$, js)));
  perform pg_temp.prueba('el cambio de estado queda en el historial', '2',
    (select count(*)::text from change_log where entity_id = js and action = 'jobsite_estado_cambiado'));

  -- Documentos
  insert into storage.objects (bucket_id, name) values ('jobsite-docs', js || '/contract/c1.pdf'), ('jobsite-docs', js || '/sow/s1.pdf'),
    ('jobsite-docs', js || '/sow/s2.pdf');
  perform pg_temp.prueba('quien edita datos sin ver tarifa no sube el contrato', 'ERR:42501',
    pg_temp.valor('datos', format($q$ select register_jobsite_document(%L, 'contract', %L, null)::text $q$, js, js || '/contract/c1.pdf')));
  r := pg_temp.valor('editor', format($q$ select register_jobsite_document(%L, 'contract', %L, null)::text $q$, js, js || '/contract/c1.pdf'));
  perform pg_temp.prueba('quien edita datos y ve tarifa sube el contrato', 'ok', case when r like 'ERR%' then r else 'ok' end);
  perform pg_temp.prueba('quien solo ve clientes no ve el contrato', '0',
    pg_temp.valor('ver', format($q$ select count(*) from jobsite_documents where jobsite_id = %L and kind = 'contract' $q$, js)));
  perform pg_temp.prueba('quien solo ve clientes no abre el contrato', 'ERR:42501',
    pg_temp.valor('ver', format('select open_jobsite_document(%L)', r::uuid)));
  perform pg_temp.prueba('quien ve tarifa abre el contrato (devuelve la ruta)', js || '/contract/c1.pdf',
    pg_temp.valor('tarifa', format('select open_jobsite_document(%L)', r::uuid)));
  perform pg_temp.prueba('...registro de la apertura', '1', (select count(*)::text from change_log where entity_id = js and action = 'documento_abierto'));
  perform pg_temp.prueba('el contrato no se firma directo desde Storage', '0',
    pg_temp.valor('tarifa', format($q$ select count(*) from storage.objects where bucket_id = 'jobsite-docs' and name = %L $q$, js || '/contract/c1.pdf')));
  perform pg_temp.valor('sow', format($q$ select register_jobsite_document(%L, 'sow', %L, null)::text $q$, js, js || '/sow/s1.pdf'));
  perform pg_temp.valor('sow', format($q$ select register_jobsite_document(%L, 'sow', %L, null)::text $q$, js, js || '/sow/s2.pdf'));
  perform pg_temp.prueba('el SOW se versiona: la nueva es la 2 y la anterior queda reemplazada', '2|1',
    (select max(version) || '|' || count(*) filter (where replaced_at is not null) from jobsite_documents where jobsite_id = js and kind = 'sow'));
  perform pg_temp.prueba('quien ve clientes lee el SOW desde Storage', '1',
    pg_temp.valor('ver', format($q$ select count(*) from storage.objects where bucket_id = 'jobsite-docs' and name = %L $q$, js || '/sow/s2.pdf')));
  perform pg_temp.prueba('quien edita datos no sube a la carpeta del SOW', 'ERR:42501',
    pg_temp.valor('datos', format($q$ insert into storage.objects (bucket_id, name) values ('jobsite-docs', %L) returning name $q$, js || '/sow/x.pdf')));
end $$;

-- Resultado ------------------------------------------------------------------------------------------

select prueba, ok, detalle from resultados order by n;
-- FIN-DE-PRUEBAS
rollback;
