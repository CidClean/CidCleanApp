-- Pruebas de Ajustes → Categorías de gastos (orden 40; D-113, D-114, D-130, D-254; migración 20261027000015).
-- Repetibles: todo termina en rollback. Uso: psql -f supabase/tests/categorias_gastos.sql (ok = true/false por prueba).

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
  pid uuid;
  aid uuid;
begin
  -- El Super Admin real; si en esta base no tiene usuario de entrada, se le crea uno dentro de la transacción.
  select id, auth_user_id into pid, aid from profiles where is_super_admin;
  if aid is null then
    aid := gen_random_uuid();
    insert into auth.users (id, aud, role, email) values (aid, 'authenticated', 'authenticated', 'super@prueba.local');
    update profiles set auth_user_id = aid where id = pid;
  end if;
  insert into actores values ('super', aid, pid);
  -- Quien registra gastos (lee las categorías, no las cambia).
  aid := gen_random_uuid();
  insert into profiles (full_name, worker_type, role, email, has_app_access)
  values ('Prueba gastos', 'w2', 'employee', 'gas@prueba.local', true) returning id into pid;
  insert into auth.users (id, aud, role, email) values (aid, 'authenticated', 'authenticated', 'gas@prueba.local');
  insert into actores values ('gas', aid, pid);
  insert into profile_permissions (profile_id, permission_key) values (pid, 'gastos_registrar_editar');
end $$;

do $$
declare
  usada uuid := (select id from expense_categories where label_en = 'Supplies');
  libre uuid;
  editada text;
begin
  perform pg_temp.prueba('el Super Admin lee las seis categorías de partida', '6',
    pg_temp.valor('super', 'select count(*)::text from expense_categories where active'));
  libre := pg_temp.valor('super', 'insert into expense_categories (label_es, label_en, sort) values (''Comida'', ''Food'', 7) returning id::text')::uuid;
  perform pg_temp.prueba('el Super Admin agrega una categoría', 'true', (select exists (select 1 from expense_categories where id = libre))::text);
  editada := pg_temp.valor('super', format('update expense_categories set label_es = %L, label_en = %L where id = %L returning label_es || ''|'' || label_en',
    'Comidas', 'Meals', libre));
  perform pg_temp.prueba('el Super Admin la edita', 'Comidas|Meals', editada);
  perform pg_temp.prueba('quien registra gastos no la edita', null,
    pg_temp.valor('gas', format('update expense_categories set label_es = %L where id = %L returning id::text', 'X', libre)));
  perform pg_temp.prueba('quien registra gastos no usa la papelera', 'ERR:42501',
    pg_temp.valor('gas', format('select remove_expense_category(%L)', libre)));

  -- Una categoría que usa un gasto se desactiva; una que nadie usa se borra.
  insert into expenses (category_id, spent_on, amount) values (usada, date '2026-10-05', 10);
  perform pg_temp.prueba('la papelera desactiva la que usa un gasto', 'deactivated',
    pg_temp.valor('super', format('select remove_expense_category(%L)', usada)));
  perform pg_temp.prueba('la desactivada sigue existiendo para sus gastos', 'false', (select active::text from expense_categories where id = usada));
  perform pg_temp.prueba('la papelera borra la que nadie usa', 'deleted',
    pg_temp.valor('super', format('select remove_expense_category(%L)', libre)));
  perform pg_temp.prueba('la borrada ya no está', 'false', (select exists (select 1 from expense_categories where id = libre))::text);
  perform pg_temp.prueba('una que no existe', 'ERR:P0002',
    pg_temp.valor('super', format('select remove_expense_category(%L)', gen_random_uuid())));
  perform pg_temp.prueba('borrar queda en el historial', 'true',
    (select exists (select 1 from change_log where action = 'categoria_eliminada' and entity_id = libre))::text);
  perform pg_temp.prueba('desactivar queda en el historial', 'true',
    (select exists (select 1 from change_log where action = 'categoria_desactivada' and entity_id = usada))::text);
  perform pg_temp.prueba('authenticated puede ejecutar la papelera', 'true',
    has_function_privilege('authenticated', 'remove_expense_category(uuid)', 'execute')::text);
  perform pg_temp.prueba('anon no', 'false', has_function_privilege('anon', 'remove_expense_category(uuid)', 'execute')::text);
end $$;

select n, prueba, ok, detalle from resultados order by n;
rollback;
