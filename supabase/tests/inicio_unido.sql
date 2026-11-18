-- Pruebas de las órdenes 140 y 142 (migración 20261120000001, D-336, D-337): nombre real en los pendientes del quote
-- (antes "Quote accepted: null"), fila Actividad del Inicio y datos de la lista de Accounts. Todas las llamadas como
-- `authenticated` (set local role + request.jwt.claims), no como dueño de la base. Repetibles: terminan en rollback.
-- Uso: psql -f supabase/tests/inicio_unido.sql   (la última consulta lista cada prueba con ok = true/false).

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

-- quotes: quotes_ver. cuentas: clientes_ver. sin: ningún permiso.
do $$
declare
  quien text;
  pid uuid;
  aid uuid;
begin
  foreach quien in array array['quotes', 'cuentas', 'sin'] loop
    aid := gen_random_uuid();
    insert into profiles (full_name, worker_type, role, email, has_app_access)
    values ('Prueba ' || quien, 'w2', 'employee', quien || '@prueba-iu.local', true) returning id into pid;
    insert into auth.users (id, aud, role, email) values (aid, 'authenticated', 'authenticated', quien || '@prueba-iu.local');
    insert into actores values (quien, aid, pid);
  end loop;
  insert into profile_permissions (profile_id, permission_key)
  select a.profile_id, p.k from actores a
    join (values ('quotes', 'quotes_ver'), ('cuentas', 'clientes_ver')) as p(n, k) on p.n = a.nombre;
end $$;

do $$
declare
  lead uuid;
  s uuid;
  w uuid := gen_random_uuid();
  q uuid;
  cli uuid;
  ja uuid;
  jt uuid;
  emp uuid := (select profile_id from actores where nombre = 'sin');
begin
  -- Lead del sitio web sin empresa (20261117000001): antes salía "Quote accepted: null".
  insert into leads (company, contact_name, email) values (null, 'Rosa Pérez', 'rosa@prueba-iu.local') returning id into lead;
  insert into lead_sites (lead_id, name, address) values (lead, null, '10 Palm St, Naples') returning id into s;
  insert into walkthroughs (id, site_id, status, current_version, closed_at) values (w, s, 'closed', 1, now());
  insert into quotes (site_id, lead_id, walkthrough_id) values (s, lead, w) returning id into q;
  insert into quote_versions (quote_id, minor, status, walkthrough_version, sent_at, expires_at, decided_at)
  values (q, 0, 'accepted', 1, now() - interval '2 days', now() + interval '28 days', now() - interval '1 hour');

  -- Cliente con un jobsite activo (2 personas hoy, una que ya terminó) y otro terminado.
  insert into clients (name, legacy) values ('Cliente Prueba IU', true) returning id into cli;
  insert into jobsites (client_id, name, address, start_date) values (cli, 'Sede Activa IU', '1 Main St', '2026-09-17') returning id into ja;
  insert into jobsites (client_id, name, address, start_date, status, status_changed_at)
  values (cli, 'Sede Terminada IU', '2 Main St', '2026-08-01', 'terminated', '2026-08-31 15:00-04') returning id into jt;
  insert into jobsite_assignments (jobsite_id, profile_id, start_date) values (ja, emp, cc_today() - 10);
  insert into jobsite_assignments (jobsite_id, profile_id, start_date)
  values (ja, (select profile_id from actores where nombre = 'cuentas'), cc_today() - 5);
  insert into jobsite_assignments (jobsite_id, profile_id, start_date, end_date)
  values (ja, (select profile_id from actores where nombre = 'quotes'), cc_today() - 30, cc_today() - 2);
  insert into ids values ('ja', ja), ('jt', jt), ('lead', lead);
end $$;

-- (1) Pendientes del quote con el nombre real
select pg_temp.prueba('home_quote_pending: lead sin empresa usa la persona de contacto', 'accepted|Rosa Pérez|10 Palm St, Naples',
  pg_temp.valor('quotes', format($q$select kind || '|' || company || '|' || site from home_quote_pending() where lead_id = %L$q$, (select id from ids where nombre = 'lead'))));
select pg_temp.prueba('home_quote_pending: ningún nombre sale null', '0',
  pg_temp.valor('quotes', 'select count(*) from home_quote_pending() where company is null or site is null'));
select pg_temp.prueba('home_quote_pending: sin permiso no devuelve nada', '0',
  pg_temp.valor('sin', 'select count(*) from home_quote_pending()'));
select pg_temp.prueba('home_quote_pending: anon no puede', 'ERR:42501',
  pg_temp.valor('anon', 'select count(*) from home_quote_pending()'));

-- (2) Actividad
select pg_temp.prueba('home_activity: el último hecho con su nombre real y sin ver', 'accepted|Rosa Pérez|false',
  pg_temp.valor('quotes', 'select kind || ''|'' || name || ''|'' || seen from home_activity()'));
select pg_temp.prueba('home_activity: una sola fila', '1', pg_temp.valor('quotes', 'select count(*) from home_activity()'));
select pg_temp.prueba('home_activity: sin permiso no devuelve nada', '0', pg_temp.valor('sin', 'select count(*) from home_activity()'));
select pg_temp.prueba('home_activity: con clientes_ver tampoco (no es su área)', '0', pg_temp.valor('cuentas', 'select count(*) from home_activity()'));
select pg_temp.prueba('home_activity: anon no puede', 'ERR:42501', pg_temp.valor('anon', 'select count(*) from home_activity()'));

-- (3) Accounts
select pg_temp.prueba('accounts_overview: personal asignado hoy (sin el que ya terminó)', '2',
  pg_temp.valor('cuentas', format('select staff_count from accounts_overview() where jobsite_id = %L', (select id from ids where nombre = 'ja'))));
select pg_temp.prueba('accounts_overview: el activo no tiene fecha de fin', null,
  pg_temp.valor('cuentas', format('select ended_on from accounts_overview() where jobsite_id = %L', (select id from ids where nombre = 'ja'))));
select pg_temp.prueba('accounts_overview: el terminado lleva su fecha (día de Naples)', '2026-08-31',
  pg_temp.valor('cuentas', format('select ended_on from accounts_overview() where jobsite_id = %L', (select id from ids where nombre = 'jt'))));
select pg_temp.prueba('accounts_overview: sin clientes_ver no puede', 'ERR:42501', pg_temp.valor('sin', 'select count(*) from accounts_overview()'));
select pg_temp.prueba('accounts_overview: con quotes_ver tampoco', 'ERR:42501', pg_temp.valor('quotes', 'select count(*) from accounts_overview()'));
select pg_temp.prueba('accounts_overview: anon no puede', 'ERR:42501', pg_temp.valor('anon', 'select count(*) from accounts_overview()'));

select n, prueba, ok, detalle from resultados order by n;

rollback;
