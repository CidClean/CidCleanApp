-- Pruebas de plantillas y guardado de permisos (migración 20261021000008, D-188 a D-193).
-- Repetibles: todo ocurre dentro de una transacción que termina en rollback, no queda nada en la base.
-- Simulan roles con `set local role` y `request.jwt.claims`, como hace la API.
-- Uso: psql -f supabase/tests/permisos.sql   (la última consulta lista cada prueba con ok = true/false).

begin;

create temp table resultados (n int generated always as identity, prueba text, ok boolean, detalle text);
create temp table actores (nombre text primary key, auth_id uuid, profile_id uuid);
grant all on resultados, actores to public;

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

-- Personas de prueba -------------------------------------------------------------------------------
-- gestor: puede gestionar permisos y tiene 3 permisos más. otro_gestor: igual de gestor. ver: solo ve empleados.
do $$
declare
  quien text;
  pid uuid;
  aid uuid;
begin
  foreach quien in array array['gestor', 'otro_gestor', 'ver', 'sin_permisos'] loop
    aid := gen_random_uuid();
    insert into profiles (full_name, worker_type, role, email, has_app_access)
    values ('Prueba ' || quien, 'w2', 'employee', quien || '@prueba.local', true) returning id into pid;
    insert into auth.users (id, aud, role, email) values (aid, 'authenticated', 'authenticated', quien || '@prueba.local');
    insert into actores values (quien, aid, pid);
  end loop;
  insert into profile_permissions (profile_id, permission_key)
    select profile_id, k from actores, unnest(array['empleados_ver', 'empleados_gestionar_permisos', 'leads_ver', 'clientes_ver', 'work_editar']) k
    where nombre in ('gestor', 'otro_gestor');
  insert into profile_permissions (profile_id, permission_key) select profile_id, 'empleados_ver' from actores where nombre = 'ver';
  insert into actores select 'super', auth_user_id, id from profiles where is_super_admin;
  insert into profiles (full_name, worker_type, role, has_app_access) values ('Objetivo', 'w2', 'employee', false) returning id into pid;
  insert into actores values ('objetivo', null, pid);
end $$;

-- Plantillas -----------------------------------------------------------------------------------------

select pg_temp.prueba('catálogo: 37 permisos delegables (D-252)', '37', (select count(*)::text from permissions));
select pg_temp.prueba('plantilla Admin: 36 (todos menos empleados_gestionar_permisos, con estadisticas_ver)', '36',
  (select cardinality(role_template_permissions('admin'))::text));
select pg_temp.prueba('plantilla Admin: sin empleados_gestionar_permisos', 'false',
  (select ('empleados_gestionar_permisos' = any (role_template_permissions('admin')))::text));
select pg_temp.prueba('plantilla Admin: incluye empleados_gestionar_documentos', 'true',
  (select ('empleados_gestionar_documentos' = any (role_template_permissions('admin')))::text));
select pg_temp.prueba('plantilla Supervisor: 8', '8', (select cardinality(role_template_permissions('supervisor'))::text));
select pg_temp.prueba('plantilla Empleado: 0', '0', (select cardinality(role_template_permissions('employee'))::text));
select pg_temp.prueba('plantillas: la plantilla Admin solo usa claves del catálogo', '0',
  (select count(*)::text from unnest(role_template_permissions('admin')) k where k not in (select key from permissions)));
select pg_temp.prueba('plantillas: la de Supervisor solo usa claves del catálogo', '0',
  (select count(*)::text from unnest(role_template_permissions('supervisor')) k where k not in (select key from permissions)));
select pg_temp.prueba('anon no ejecuta role_template_permissions (42501)', 'ERR:42501',
  pg_temp.valor('anon', $q$ select role_template_permissions('admin') $q$));

-- Guardar permisos -----------------------------------------------------------------------------------

do $$
declare
  obj uuid := (select profile_id from actores where nombre = 'objetivo');
  sa uuid := (select profile_id from actores where nombre = 'super');
  yo uuid := (select profile_id from actores where nombre = 'gestor');
  otro uuid := (select profile_id from actores where nombre = 'otro_gestor');
begin
  perform pg_temp.prueba('las funciones viejas grant_permission y revoke_permission ya no existen', '0',
    (select count(*)::text from pg_proc where pronamespace = 'public'::regnamespace and proname in ('grant_permission', 'revoke_permission')));
  perform pg_temp.prueba('anon: no guarda permisos (42501)', 'ERR:42501',
    pg_temp.valor('anon', format('select save_employee_permissions(%L, array[''leads_ver''], ''{}'', null)', obj)));
  perform pg_temp.prueba('sin empleados_gestionar_permisos (solo ver): 42501', 'ERR:42501',
    pg_temp.valor('ver', format('select save_employee_permissions(%L, array[''empleados_ver''], ''{}'', null)', obj)));
  perform pg_temp.prueba('sin ningún permiso: 42501', 'ERR:42501',
    pg_temp.valor('sin_permisos', format('select save_employee_permissions(%L, array[''empleados_ver''], ''{}'', null)', obj)));

  -- Nadie edita sus propios permisos (D-192)
  perform pg_temp.prueba('nadie edita sus propios permisos: gestor sobre sí mismo (42501)', 'ERR:42501',
    pg_temp.valor('gestor', format('select save_employee_permissions(%L, array[''leads_ver''], ''{}'', null)', yo)));
  perform pg_temp.prueba('nadie edita sus propios permisos: ni quitarse uno (42501)', 'ERR:42501',
    pg_temp.valor('gestor', format('select save_employee_permissions(%L, ''{}'', array[''leads_ver''], null)', yo)));
  perform pg_temp.prueba('nadie edita sus propios permisos: ni el Super Admin (42501)', 'ERR:42501',
    pg_temp.valor('super', format('select save_employee_permissions(%L, ''{}'', array[''leads_ver''], ''admin'')', sa)));
  perform pg_temp.prueba('los permisos del Super Admin no cambian (42501)', 'ERR:42501',
    pg_temp.valor('gestor', format('select save_employee_permissions(%L, ''{}'', array[''leads_ver''], null)', sa)));

  perform pg_temp.prueba('empleado que no existe (P0002)', 'ERR:P0002',
    pg_temp.valor('gestor', format('select save_employee_permissions(%L, array[''leads_ver''], ''{}'', null)', gen_random_uuid())));
  perform pg_temp.prueba('permiso que no existe en el catálogo (22023)', 'ERR:22023',
    pg_temp.valor('gestor', format('select save_employee_permissions(%L, array[''inventado''], ''{}'', null)', obj)));
  perform pg_temp.prueba('dar y quitar el mismo permiso a la vez (22023)', 'ERR:22023',
    pg_temp.valor('gestor', format('select save_employee_permissions(%L, array[''leads_ver''], array[''leads_ver''], null)', obj)));

  -- Nadie da ni quita lo que no tiene (D-191)
  perform pg_temp.prueba('dar un permiso que no se tiene (42501)', 'ERR:42501',
    pg_temp.valor('gestor', format('select save_employee_permissions(%L, array[''gastos_ver''], ''{}'', null)', obj)));
  perform pg_temp.prueba('dar la plantilla Admin completa sin tenerla (42501)', 'ERR:42501',
    pg_temp.valor('gestor', format('select save_employee_permissions(%L, role_template_permissions(''admin''), ''{}'', ''admin'')', obj)));
  perform pg_temp.prueba('quitar un permiso que no se tiene (42501)', 'ERR:42501',
    pg_temp.valor('gestor', format('select save_employee_permissions(%L, ''{}'', array[''gastos_ver''], null)', obj)));
  perform pg_temp.prueba('todo o nada: un permiso ajeno en la lista no deja dar ninguno', '0',
    (select count(*)::text from profile_permissions where profile_id = obj));

  -- Guardar lo que sí se tiene
  perform pg_temp.prueba('dar permisos que se tienen: ok', 'ok',
    case when pg_temp.valor('gestor', format('select save_employee_permissions(%L, array[''leads_ver'', ''clientes_ver''], ''{}'', null)', obj)) like 'ERR%'
      then 'fallo' else 'ok' end);
  perform pg_temp.prueba('quedaron 2 permisos', '2', (select count(*)::text from profile_permissions where profile_id = obj));
  perform pg_temp.prueba('cada permiso dado quedó en el historial con quien lo dio', '2',
    (select count(*)::text from change_log where action = 'permiso_dado' and entity_id = obj and actor_id = yo));
  perform pg_temp.prueba('granted_by guarda quien lo dio', '2',
    (select count(*)::text from profile_permissions where profile_id = obj and granted_by = yo));
  perform pg_temp.prueba('dar de nuevo lo mismo no duplica ni falla', 'ok',
    case when pg_temp.valor('gestor', format('select save_employee_permissions(%L, array[''leads_ver''], ''{}'', null)', obj)) like 'ERR%'
      then 'fallo' else 'ok' end);
  perform pg_temp.prueba('el rol no cambia si no se manda (employee)', 'employee', (select role::text from profiles where id = obj));
  perform pg_temp.prueba('quitar un permiso que se tiene: ok', 'ok',
    case when pg_temp.valor('gestor', format('select save_employee_permissions(%L, ''{}'', array[''clientes_ver''], null)', obj)) like 'ERR%'
      then 'fallo' else 'ok' end);
  perform pg_temp.prueba('quedó 1 permiso', '1', (select count(*)::text from profile_permissions where profile_id = obj));
  perform pg_temp.prueba('la baja quedó en el historial', '1',
    (select count(*)::text from change_log where action = 'permiso_quitado' and entity_id = obj and actor_id = yo and detail->>'permiso' = 'clientes_ver'));

  -- Plantilla aplicada desde la app: solo lo que quien guarda tiene (D-189 a D-191)
  perform pg_temp.prueba('plantilla Supervisor recortada a lo que tiene el gestor: ok y el rol cambia', 'ok',
    case when pg_temp.valor('gestor', format(
      $q$ select save_employee_permissions(%L,
            array(select k from unnest(role_template_permissions('supervisor')) k where has_permission(k)),
            array(select permission_key from profile_permissions where profile_id = %L
                    and permission_key <> all (role_template_permissions('supervisor')) and has_permission(permission_key)),
            'supervisor') $q$, obj, obj)) like 'ERR%' then 'fallo' else 'ok' end);
  perform pg_temp.prueba('solo se dieron los de la plantilla que el gestor tiene (empleados_ver, leads_ver, clientes_ver, work_editar)', 'clientes_ver,empleados_ver,leads_ver,work_editar',
    (select string_agg(permission_key, ',' order by permission_key) from profile_permissions where profile_id = obj));
  perform pg_temp.prueba('el rol quedó en supervisor (D-190)', 'supervisor', (select role::text from profiles where id = obj));
  perform pg_temp.prueba('el cambio de rol quedó en el historial con quien lo hizo', '1',
    (select count(*)::text from change_log where action = 'perfil_cambiado' and entity_id = obj and actor_id = yo
        and detail->'despues'->>'role' = 'supervisor'));

  -- Lo que el gestor no tiene queda intacto aunque no esté en su plantilla
  insert into profile_permissions (profile_id, permission_key) values (obj, 'gastos_ver');
  perform pg_temp.prueba('el gestor no puede quitar gastos_ver que no tiene (42501)', 'ERR:42501',
    pg_temp.valor('gestor', format('select save_employee_permissions(%L, ''{}'', array[''gastos_ver''], null)', obj)));
  perform pg_temp.prueba('gastos_ver sigue puesto', '1',
    (select count(*)::text from profile_permissions where profile_id = obj and permission_key = 'gastos_ver'));

  -- Super Admin: puede dar lo que sea, también la plantilla Admin completa
  perform pg_temp.prueba('el Super Admin aplica la plantilla Admin completa', 'ok',
    case when pg_temp.valor('super', format(
      $q$ select save_employee_permissions(%L, role_template_permissions('admin'),
            array(select permission_key from profile_permissions where profile_id = %L
                    and permission_key <> all (role_template_permissions('admin'))), 'admin') $q$, obj, obj)) like 'ERR%' then 'fallo' else 'ok' end);
  perform pg_temp.prueba('quedaron los 36 permisos del Admin', '36', (select count(*)::text from profile_permissions where profile_id = obj));
  perform pg_temp.prueba('el rol quedó en admin', 'admin', (select role::text from profiles where id = obj));
  perform pg_temp.prueba('el Super Admin puede dar empleados_gestionar_permisos', 'ok',
    case when pg_temp.valor('super', format('select save_employee_permissions(%L, array[''empleados_gestionar_permisos''], ''{}'', null)', otro)) like 'ERR%'
      then 'fallo' else 'ok' end);
  perform pg_temp.prueba('el gestor no puede quitar al otro gestor un permiso que no tiene y sí uno que tiene', 'ok',
    case when pg_temp.valor('gestor', format('select save_employee_permissions(%L, ''{}'', array[''work_editar''], null)', otro)) like 'ERR%'
      then 'fallo' else 'ok' end);
  perform pg_temp.prueba('un gestor puede cambiar a otro gestor (no es el Super Admin ni él mismo)', '0',
    (select count(*)::text from profile_permissions where profile_id = otro and permission_key = 'work_editar'));
  perform pg_temp.prueba('el Super Admin sigue con todos los permisos (has_permission)', 'true',
    pg_temp.valor('super', $q$ select has_permission('empleados_gestionar_documentos') $q$));
end $$;


-- Leer los permisos de un perfil (migración 20261021000009) -----------------------------------------------

do $$
declare
  obj uuid;
begin
  insert into profiles (full_name, worker_type, role, has_app_access) values ('Objetivo lectura', 'w2', 'employee', false) returning id into obj;
  insert into profile_permissions (profile_id, permission_key)
    select obj, k from unnest(array['empleados_ver', 'leads_ver', 'gastos_ver', 'work_editar']) k;
  perform pg_temp.prueba('employee_permissions: anon (42501)', 'ERR:42501',
    pg_temp.valor('anon', format('select employee_permissions(%L)', obj)));
  perform pg_temp.prueba('employee_permissions: sin empleados_ver (42501)', 'ERR:42501',
    pg_temp.valor('sin_permisos', format('select employee_permissions(%L)', obj)));
  perform pg_temp.prueba('employee_permissions: solo con empleados_ver ve únicamente lo que también tiene', '{empleados_ver}',
    pg_temp.valor('ver', format('select employee_permissions(%L)', obj)));
  perform pg_temp.prueba('employee_permissions: el gestor ve los 3 que tiene (no gastos_ver)', '{empleados_ver,leads_ver,work_editar}',
    pg_temp.valor('gestor', format('select employee_permissions(%L)', obj)));
  perform pg_temp.prueba('employee_permissions: el Super Admin ve todos', '{empleados_ver,gastos_ver,leads_ver,work_editar}',
    pg_temp.valor('super', format('select employee_permissions(%L)', obj)));
  perform pg_temp.prueba('employee_permissions: otro gestor: todo lo suyo, el gestor lo tiene', '{clientes_ver,empleados_gestionar_permisos,empleados_ver,leads_ver}',
    pg_temp.valor('gestor', format('select employee_permissions(%L)', (select profile_id from actores where nombre = 'otro_gestor'))));
end $$;

-- Resultado ------------------------------------------------------------------------------------------

select prueba, ok, detalle from resultados order by n;
-- FIN-DE-PRUEBAS
rollback;
