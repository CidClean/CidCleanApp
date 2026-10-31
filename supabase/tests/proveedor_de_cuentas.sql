-- Pruebas de los clientes proveedores de cuentas (migración 20261031000004, orden 68, D-291).
-- Repetibles: todo termina en rollback. Uso (desde la raíz del repositorio): psql -f supabase/tests/proveedor_de_cuentas.sql
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

do $$
declare
  quien text; pid uuid; aid uuid;
begin
  foreach quien in array array['editor', 'ver'] loop
    aid := gen_random_uuid();
    insert into profiles (full_name, worker_type, role, email, has_app_access)
    values ('Prueba ' || quien, 'w2', 'employee', quien || '@prueba-prov.local', true) returning id into pid;
    insert into auth.users (id, aud, role, email) values (aid, 'authenticated', 'authenticated', quien || '@prueba-prov.local');
    insert into actores values (quien, aid, pid);
  end loop;
  update profiles p set auth_user_id = a.auth_id from actores a where a.profile_id = p.id and p.auth_user_id is null;
  insert into profile_permissions (profile_id, permission_key)
  values (pg_temp.pid('editor'), 'clientes_ver'), (pg_temp.pid('editor'), 'clientes_editar_datos'), (pg_temp.pid('editor'), 'clientes_ver_tarifa'),
         (pg_temp.pid('ver'), 'clientes_ver');
end $$;

do $$
declare
  cli uuid; js uuid; js2 uuid; jt uuid; r text; k uuid;
begin
  -- Cliente nuevo de la app (no previo) con un jobsite con contrato pendiente y otro terminado.
  insert into clients (name, legacy) values ('Cuenta Proveedor', false) returning id into cli;
  insert into jobsites (client_id, name, address, frequency) values (cli, 'Sitio final A', '1 Main St', '{"kind":"other","days":[]}') returning id into js;
  insert into jobsites (client_id, name, address, frequency, status) values (cli, 'Sitio viejo', '2 Main St', '{"kind":"other","days":[]}', 'terminated') returning id into jt;
  perform pg_temp.prueba('sin marcar, el jobsite nace pendiente', 'pending', (select contract_status::text from jobsites where id = js));
  perform pg_temp.prueba('sin marcar no se da de alta un jobsite a mano', 'ERR:22023',
    left(pg_temp.valor('editor', format($q$ select create_legacy_jobsite(%L, '{"name":"X","address":"Y","frequency":{"kind":"other","days":[]}}', 100)::text $q$, cli)), 9));
  perform pg_temp.prueba('quien solo ve clientes no marca', 'ERR:42501', left(pg_temp.valor('ver', format('select set_client_account_provider(%L, true)', cli)), 9));
  perform pg_temp.valor('editor', format('select set_client_account_provider(%L, true)', cli));
  perform pg_temp.prueba('marcado: sus jobsites pasan a firmados (el terminado no)', 't|both_signed|pending',
    (select left(account_provider::text, 1) from clients where id = cli) || '|' || (select contract_status::text from jobsites where id = js) || '|' ||
    (select contract_status::text from jobsites where id = jt));
  perform pg_temp.prueba('historial del marcado', '1', (select count(*)::text from change_log where entity_id = cli and action = 'cliente_proveedor_marcado'));
  r := pg_temp.valor('editor', format($q$ select create_legacy_jobsite(%L, '{"name":"Sitio final B","address":"3 Main St","frequency":{"kind":"other","days":[]}}', 900)::text $q$, cli));
  js2 := r::uuid;
  perform pg_temp.prueba('jobsite nuevo sin quote: nace firmado, con la tarifa del proveedor', 'both_signed|900.00',
    (select contract_status::text from jobsites where id = js2) || '|' || (select to_char(monthly_rate, 'FM990.00') from jobsite_rates where jobsite_id = js2));
  perform pg_temp.valor('editor', format('select set_client_account_provider(%L, false)', cli));
  perform pg_temp.prueba('desmarcar no deshace las firmas', 'f|both_signed', (select left(account_provider::text, 1) from clients where id = cli) || '|' ||
    (select contract_status::text from jobsites where id = js));
  perform pg_temp.prueba('historial del desmarcado', '1', (select count(*)::text from change_log where entity_id = cli and action = 'cliente_proveedor_desmarcado'));
  -- La migración marca a Wilson Franquicia: se repite el bloque sobre un cliente de prueba con ese nombre.
  insert into clients (name, legacy) values ('Wilson Franquicia', false) returning id into k;
  insert into jobsites (client_id, name, address, frequency) values (k, 'Sitio W', '4 Main St', '{"kind":"other","days":[]}');
  perform client_provider_sign_jobsites(k);
  perform pg_temp.prueba('client_provider_sign_jobsites firma los de Wilson', 'both_signed', (select contract_status::text from jobsites where client_id = k));
  perform pg_temp.prueba('la función interna no la llama un usuario', 'ERR:42501', left(pg_temp.valor('editor', format('select client_provider_sign_jobsites(%L)', k)), 9));
end $$;

select n, prueba, ok, detalle from resultados order by n;
rollback;
