-- Pruebas de las órdenes 150 y 151 (migraciones 20261121000001 y 20261121000002, D-339, D-340): documentos e historial
-- del jobsite, y reactivar un jobsite terminado. Todas las llamadas como `authenticated` (set local role +
-- request.jwt.claims con aal2), no como dueño de la base. Repetibles: terminan en rollback.
-- Uso: psql -f supabase/tests/jobsite_detalle.sql   (la última consulta lista cada prueba con ok = true/false).

begin;

create temp table resultados (n int generated always as identity, prueba text, ok boolean, detalle text);
create temp table actores (nombre text primary key, auth_id uuid, profile_id uuid);
create temp table ids (nombre text primary key, id uuid);
grant all on resultados, actores, ids to public;

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
    perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated', 'aal', 'aal2')::text, true);
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

create function pg_temp.id(n text) returns uuid language sql as $$ select id from ids where nombre = n $$;

-- cambia: clientes_ver + clientes_cambiar_estado (sin ver tarifa). cuentas: clientes_ver. tarifa: clientes_ver + clientes_ver_tarifa. historial: clientes_ver + historial_ver.
-- estado: clientes_ver + clientes_ver_tarifa + clientes_cambiar_estado. pagos: lo de estado + empleados_ver_pagos.
-- sin: ningún permiso. super: Super Admin (aal2).
do $$
declare
  quien text;
  pid uuid;
  aid uuid;
begin
  foreach quien in array array['cuentas', 'tarifa', 'historial', 'estado', 'pagos', 'cambia', 'sin'] loop
    aid := gen_random_uuid();
    insert into profiles (full_name, worker_type, role, email, has_app_access)
    values ('Prueba ' || quien, 'w2', 'employee', quien || '@prueba-jd.local', true) returning id into pid;
    insert into auth.users (id, aud, role, email) values (aid, 'authenticated', 'authenticated', quien || '@prueba-jd.local');
    update profiles set auth_user_id = aid where id = pid;
    insert into actores values (quien, aid, pid);
  end loop;
  -- El Super Admin es el que ya existe (hay uno solo).
  select id, auth_user_id into pid, aid from profiles where is_super_admin;
  if aid is null then
    aid := gen_random_uuid();
    insert into auth.users (id, aud, role, email) values (aid, 'authenticated', 'authenticated', 'super@prueba-jd.local');
    update profiles set auth_user_id = aid where id = pid;
  end if;
  insert into actores values ('super', aid, pid);
  insert into profile_permissions (profile_id, permission_key)
  select a.profile_id, p.k from actores a
    join (values ('cuentas', 'clientes_ver'),
                 ('tarifa', 'clientes_ver'), ('tarifa', 'clientes_ver_tarifa'),
                 ('historial', 'clientes_ver'), ('historial', 'historial_ver'),
                 ('estado', 'clientes_ver'), ('estado', 'clientes_ver_tarifa'), ('estado', 'clientes_cambiar_estado'),
                 ('pagos', 'clientes_ver'), ('pagos', 'clientes_ver_tarifa'), ('pagos', 'clientes_cambiar_estado'),
                 ('pagos', 'empleados_ver_pagos'),
                 ('cambia', 'clientes_ver'), ('cambia', 'clientes_cambiar_estado')) as p(n, k) on p.n = a.nombre;
end $$;

do $$
declare
  cli uuid;
  ja uuid;
  jb uuid;
begin
  insert into clients (name, legacy) values ('Cliente Prueba JD', true) returning id into cli;
  insert into jobsites (client_id, name, address, start_date) values (cli, 'Sede A JD', '1 Main St', '2026-09-17') returning id into ja;
  insert into jobsites (client_id, name, address, start_date) values (cli, 'Sede B JD', '2 Main St', '2026-09-17') returning id into jb;
  insert into jobsite_documents (jobsite_id, kind, file_path, title) values (ja, 'contract', 'x/contrato.pdf', 'Contract');
  insert into jobsite_documents (jobsite_id, kind, file_path, title) values (ja, 'other', 'x/otro.pdf', 'Permiso');
  insert into jobsite_documents (jobsite_id, kind, file_path, title, replaced_at) values (ja, 'other', 'x/viejo.pdf', 'Viejo', now());
  insert into jobsite_documents (jobsite_id, kind, file_path, title) values (jb, 'other', 'x/b.pdf', 'De otra sede');
  insert into change_log (actor_id, action, entity, entity_id, detail) values
    (null, 'jobsite_estado_cambiado', 'jobsites', ja, '{"name":"Sede A JD","antes":"active","despues":"paused"}'),
    (null, 'tarifa_abierta', 'jobsites', ja, '{"name":"Sede A JD"}'),
    (null, 'tarifa_cambiada', 'jobsites', ja, '{"name":"Sede A JD","antes":100,"despues":200}'),
    (null, 'jobsite_estado_cambiado', 'jobsites', jb, '{"name":"Sede B JD","antes":"active","despues":"paused"}'),
    (null, 'correo_plantilla', 'clients', cli, '{"plantilla":"Hola"}');
  insert into ids values ('cli', cli), ('ja', ja), ('jb', jb);
end $$;

-- (1) Documents del jobsite
select pg_temp.prueba('jobsite_library: con clientes_ver ve los documentos vigentes sin el contrato', 'Permiso v1',
  pg_temp.valor('cuentas', format('select string_agg(title, '','' order by title) from jobsite_library(%L)', pg_temp.id('ja'))));
select pg_temp.prueba('jobsite_library: con ver tarifa también el contrato', 'Contract v1,Permiso v1',
  pg_temp.valor('tarifa', format('select string_agg(title, '','' order by title) from jobsite_library(%L)', pg_temp.id('ja'))));
select pg_temp.prueba('jobsite_library: no mezcla documentos de otra sede', '0',
  pg_temp.valor('super', format('select count(*) from jobsite_library(%L) where title like ''De otra%%''', pg_temp.id('ja'))));
select pg_temp.prueba('jobsite_library: sin permiso no puede', 'ERR:42501',
  pg_temp.valor('sin', format('select count(*) from jobsite_library(%L)', pg_temp.id('ja'))));
select pg_temp.prueba('jobsite_library: anon no puede', 'ERR:42501',
  pg_temp.valor('anon', format('select count(*) from jobsite_library(%L)', pg_temp.id('ja'))));
select pg_temp.prueba('jobsite_library: jobsite que no existe', 'ERR:P0002',
  pg_temp.valor('cuentas', format('select count(*) from jobsite_library(%L)', gen_random_uuid())));

-- (2) History del jobsite
select pg_temp.prueba('jobsite_history: con historial ve cambios y correos, sin aperturas ni otra sede', 'correo_plantilla,jobsite_estado_cambiado,tarifa_cambiada',
  pg_temp.valor('historial', format('select string_agg(action, '','' order by action) from jobsite_history(%L)', pg_temp.id('ja'))));
select pg_temp.prueba('jobsite_history: sin historial_ver solo los correos', 'correo_plantilla',
  pg_temp.valor('cuentas', format('select string_agg(action, '','' order by action) from jobsite_history(%L)', pg_temp.id('ja'))));
select pg_temp.prueba('jobsite_history: sin montos en el detalle', '0',
  pg_temp.valor('historial', format('select count(*) from jobsite_history(%L) where info::text like ''%%200%%''', pg_temp.id('ja'))));
select pg_temp.prueba('jobsite_history: el estado nuevo va en el detalle', 'paused',
  pg_temp.valor('historial', format('select info->>''despues'' from jobsite_history(%L) where action = ''jobsite_estado_cambiado''', pg_temp.id('ja'))));
select pg_temp.prueba('jobsite_history: sin permiso no puede', 'ERR:42501',
  pg_temp.valor('sin', format('select count(*) from jobsite_history(%L)', pg_temp.id('ja'))));
select pg_temp.prueba('jobsite_history: anon no puede', 'ERR:42501',
  pg_temp.valor('anon', format('select count(*) from jobsite_history(%L)', pg_temp.id('ja'))));

-- (3) Orden 151: jobsite terminado, resumen y reactivar
do $$
declare
  cli uuid := pg_temp.id('cli');
  jt uuid;
  jt2 uuid;
  v uuid;
begin
  insert into jobsites (client_id, name, address, start_date, status, status_changed_at, contract_status)
  values (cli, 'Clinica JD', '3 Main St', '2026-08-01', 'terminated', '2026-08-31 15:00-04', 'both_signed') returning id into jt;
  insert into jobsite_rates (jobsite_id, monthly_rate) values (jt, 2038);
  insert into visits (jobsite_id, starts_at, minutes, local_date, approved_at) values
    (jt, '2026-08-03 09:00-04', 120, '2026-08-03', now()),
    (jt, '2026-08-05 09:00-04', 120, '2026-08-05', now()),
    (jt, '2026-08-07 09:00-04', 120, '2026-08-07', null);
  insert into income_expected (jobsite_id, month, amount) values (jt, '2026-08-01', 2038);
  insert into jobsites (client_id, name, address, start_date, status, status_changed_at)
  values (cli, 'Clinica 2 JD', '4 Main St', '2026-08-01', 'terminated', '2026-09-30 15:00-04') returning id into jt2;
  insert into jobsite_rates (jobsite_id, monthly_rate) values (jt2, 500);
  insert into ids values ('jt', jt), ('jt2', jt2);
end $$;

select pg_temp.prueba('jobsite_period_summary: fin, tarifa, visitas aprobadas, ingresos y personal (con ver pagos)', '2026-08-31|2026-08-01|2038.00|2|2038.00|0',
  pg_temp.valor('pagos', format('select concat_ws(''|'', ended_on, period_from, monthly_rate, visits, income, staff) from jobsite_period_summary(%L)', pg_temp.id('jt'))));
select pg_temp.prueba('jobsite_period_summary: sin ver pagos no sale el personal', 'null',
  pg_temp.valor('tarifa', format('select coalesce(staff::text, ''null'') from jobsite_period_summary(%L)', pg_temp.id('jt'))));
select pg_temp.prueba('jobsite_period_summary: sin ver tarifa no salen tarifa ni ingresos', 'null|null|2',
  pg_temp.valor('cuentas', format('select concat_ws(''|'', coalesce(monthly_rate::text, ''null''), coalesce(income::text, ''null''), visits) from jobsite_period_summary(%L)', pg_temp.id('jt'))));
select pg_temp.prueba('jobsite_period_summary: un jobsite activo no devuelve filas', '0',
  pg_temp.valor('pagos', format('select count(*) from jobsite_period_summary(%L)', pg_temp.id('ja'))));
select pg_temp.prueba('jobsite_period_summary: sin permiso no puede', 'ERR:42501',
  pg_temp.valor('sin', format('select count(*) from jobsite_period_summary(%L)', pg_temp.id('jt'))));
select pg_temp.prueba('jobsite_period_summary: anon no puede', 'ERR:42501',
  pg_temp.valor('anon', format('select count(*) from jobsite_period_summary(%L)', pg_temp.id('jt'))));

select pg_temp.prueba('reactivate_jobsite: sin clientes_cambiar_estado no puede', 'ERR:42501',
  pg_temp.valor('tarifa', format('select reactivate_jobsite(%L, %L, 2100)::text', pg_temp.id('jt'), cc_today())));
select pg_temp.prueba('reactivate_jobsite: anon no puede', 'ERR:42501',
  pg_temp.valor('anon', format('select reactivate_jobsite(%L, %L, 2100)::text', pg_temp.id('jt'), cc_today())));
select pg_temp.prueba('reactivate_jobsite: cambiar la tarifa pide ver tarifas', 'ERR:42501',
  pg_temp.valor('cambia', format('select reactivate_jobsite(%L, %L, 2100)::text', pg_temp.id('jt2'), cc_today())));
select pg_temp.prueba('reactivate_jobsite: fecha de inicio pasada no', 'ERR:22023',
  pg_temp.valor('estado', format('select reactivate_jobsite(%L, %L, 2100)::text', pg_temp.id('jt'), cc_today() - 1)));
select pg_temp.prueba('reactivate_jobsite: tarifa negativa no', 'ERR:22023',
  pg_temp.valor('estado', format('select reactivate_jobsite(%L, %L, -1)::text', pg_temp.id('jt'), cc_today())));
select pg_temp.prueba('reactivate_jobsite: un activo no se reactiva', 'ERR:22023',
  pg_temp.valor('estado', format('select reactivate_jobsite(%L, %L, 2100)::text', pg_temp.id('ja'), cc_today())));
select pg_temp.prueba('reactivate_jobsite: con permiso reactiva (sin error)', '',
  pg_temp.valor('estado', format('select reactivate_jobsite(%L, %L, 2100)::text', pg_temp.id('jt'), cc_today() + 3)));
select pg_temp.prueba('reactivado: Activo con inicio y tarifa nuevos', 'active|' || (cc_today() + 3) || '|2100.00',
  (select j.status || '|' || j.start_date || '|' || r.monthly_rate from jobsites j join jobsite_rates r on r.jobsite_id = j.id where j.id = pg_temp.id('jt')));
select pg_temp.prueba('reactivado: el periodo anterior se conserva con su tarifa', '2026-08-01|2026-08-31|2038.00',
  (select start_on || '|' || end_on || '|' || monthly_rate from jobsite_periods where jobsite_id = pg_temp.id('jt')));
select pg_temp.prueba('reactivado: queda en el historial', 'jobsite_reactivado,tarifa_cambiada',
  (select string_agg(action, ',' order by action) from change_log where entity_id = pg_temp.id('jt')));
select pg_temp.prueba('reactivado: el ingreso de agosto no cambia', '2038.00',
  (select amount::text from income_expected where jobsite_id = pg_temp.id('jt') and month = '2026-08-01'));
select pg_temp.prueba('reactivado: vuelve a Activas en Accounts (sin fecha de fin)', 'null',
  pg_temp.valor('cuentas', format('select coalesce(ended_on::text, ''null'') from accounts_overview() where jobsite_id = %L', pg_temp.id('jt'))));
select pg_temp.prueba('reactivado: el hueco no genera ingresos (solo desde el mes de reactivación y el inicio nuevo)', '0',
  (select count(*)::text from (select generate_accounting()) g, income_expected e
    where e.jobsite_id = pg_temp.id('jt') and e.month > '2026-08-01' and e.month < month_start(cc_today())));
select pg_temp.prueba('reactivado: el hueco no tiene costo de personal', '0',
  (select coalesce(sum(amount), 0)::text from staff_cost_rows('2026-09-01', month_end((month_start(cc_today()) - 1)), pg_temp.id('jt'))));
select pg_temp.prueba('reactivate_jobsite: sin ver tarifa reactiva sin mandar tarifa', '',
  pg_temp.valor('cambia', format('select reactivate_jobsite(%L, %L, null)::text', pg_temp.id('jt2'), cc_today())));
select pg_temp.prueba('reactivado sin tarifa: Activo con la tarifa anterior', 'active|500.00',
  (select j.status || '|' || r.monthly_rate from jobsites j join jobsite_rates r on r.jobsite_id = j.id where j.id = pg_temp.id('jt2')));
select pg_temp.prueba('reactivado sin tarifa: no registra cambio de tarifa', 'jobsite_reactivado',
  (select string_agg(action, ',') from change_log where entity_id = pg_temp.id('jt2')));

select n, prueba, ok, detalle from resultados order by n;

rollback;
