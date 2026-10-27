-- Pruebas de la administración de empleados (migración 20261021000005).
-- Repetibles: todo ocurre dentro de una transacción que termina en rollback, no queda nada en la base.
-- Simulan roles con `set local role` y `request.jwt.claims`, como hace la API.
-- Uso: psql -f supabase/tests/empleados.sql   (la última consulta lista cada prueba con ok = true/false).

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

do $$
declare
  quien text;
  pid uuid;
  aid uuid;
begin
  foreach quien in array array['sin_permisos', 'ver', 'crear', 'editar', 'pagos', 'docs', 'otro_editor'] loop
    aid := gen_random_uuid();
    insert into profiles (full_name, worker_type, role, email, has_app_access)
    values ('Prueba ' || quien, 'w2', 'employee', quien || '@prueba.local', true) returning id into pid;
    insert into auth.users (id, aud, role, email) values (aid, 'authenticated', 'authenticated', quien || '@prueba.local');
    insert into actores values (quien, aid, pid);
  end loop;
  insert into profile_permissions (profile_id, permission_key)
    select profile_id, case nombre when 'ver' then 'empleados_ver' when 'crear' then 'empleados_invitar_crear'
      when 'editar' then 'empleados_editar_desactivar' when 'pagos' then 'empleados_ver_pagos'
      when 'docs' then 'empleados_gestionar_documentos'
      when 'otro_editor' then 'empleados_editar_desactivar' end
    from actores where nombre <> 'sin_permisos';
  -- El Super Admin real se usa solo para leer su identidad; no se modifica nada suyo salvo dentro de esta transacción.
  insert into actores select 'super', auth_user_id, id from profiles where is_super_admin;
  -- Empleado 1099 sin acceso a la app, objetivo de las pruebas.
  insert into profiles (full_name, worker_type, role, has_app_access, email)
  values ('Objetivo 1099', '1099', 'employee', false, null) returning id into pid;
  insert into actores values ('objetivo', null, pid);
  insert into profiles (full_name, worker_type, role, has_app_access, email)
  values ('Objetivo W-2', 'w2', 'employee', false, null);
end $$;

-- A1. Correo opcional sin acceso, obligatorio con acceso; unicidad sin distinguir mayúsculas -------------

do $$
declare got text;
begin
  begin
    insert into profiles (full_name, worker_type, has_app_access, email) values ('X', 'w2', true, null);
    got := 'ok';
  exception when others then got := 'ERR:' || sqlstate; end;
  perform pg_temp.prueba('con acceso a la app el correo es obligatorio (check)', 'ERR:23514', got);
  begin
    insert into profiles (full_name, worker_type, has_app_access, email) values ('Dup', 'w2', false, 'SIN_PERMISOS@prueba.local');
    got := 'ok';
  exception when others then got := 'ERR:' || sqlstate; end;
  perform pg_temp.prueba('correo repetido con otras mayúsculas: rechazado (23505)', 'ERR:23505', got);
  begin
    insert into profiles (full_name, worker_type, has_app_access, email) values ('Sin correo 2', 'w2', false, null);
    got := 'ok';
  exception when others then got := 'ERR:' || sqlstate; end;
  perform pg_temp.prueba('dos perfiles sin correo conviven (null no choca)', 'ok', got);
end $$;

-- El enlace con Auth se hizo por correo al crear los usuarios de prueba.
select pg_temp.prueba('el usuario de Auth quedó enlazado al perfil', '7',
  (select count(*)::text from profiles p join actores a on a.profile_id = p.id where p.auth_user_id = a.auth_id and a.nombre <> 'super'));

-- Primer ingreso -------------------------------------------------------------------------------------

select pg_temp.prueba('antes de entrar: first_login_at es null', 'null',
  (select coalesce(first_login_at::text, 'null') from profiles p join actores a on a.profile_id = p.id where a.nombre = 'ver'));
update auth.users set last_sign_in_at = timestamptz '2026-01-02 10:00:00+00' where id = (select auth_id from actores where nombre = 'ver');
select pg_temp.prueba('al primer inicio de sesión se llena first_login_at', '2026-01-02 10:00:00+00',
  (select first_login_at::text from profiles p join actores a on a.profile_id = p.id where a.nombre = 'ver'));
update auth.users set last_sign_in_at = timestamptz '2026-02-03 10:00:00+00' where id = (select auth_id from actores where nombre = 'ver');
select pg_temp.prueba('los inicios siguientes no lo cambian', '2026-01-02 10:00:00+00',
  (select first_login_at::text from profiles p join actores a on a.profile_id = p.id where a.nombre = 'ver'));

-- A2. Documentos 1099 --------------------------------------------------------------------------------

do $$
declare
  obj text := (select profile_id::text from actores where nombre = 'objetivo');
  w2 text := (select id::text from profiles where full_name = 'Objetivo W-2');
  doc1 uuid;
  doc2 uuid;
  got text;
begin
  -- Archivos en el bucket (como si ya se hubieran subido).
  insert into storage.objects (bucket_id, name) values ('employee-docs', obj || '/w9/a.pdf'), ('employee-docs', obj || '/w9/b.pdf'),
    ('employee-docs', w2 || '/w9/a.pdf');

  perform pg_temp.prueba('sin permiso: no se registra un documento', 'ERR:42501',
    pg_temp.valor('sin_permisos', format('select register_profile_document(%L, ''w9'', %L)', obj, obj || '/w9/a.pdf')));
  perform pg_temp.prueba('con empleados_ver y editar pero sin gestionar documentos: tampoco', 'ERR:42501',
    pg_temp.valor('editar', format('select register_profile_document(%L, ''w9'', %L)', obj, obj || '/w9/a.pdf')));
  perform pg_temp.prueba('con empleados_gestionar_documentos: se registra', 'ok',
    case when pg_temp.valor('docs', format('select register_profile_document(%L, ''w9'', %L)', obj, obj || '/w9/a.pdf')) like 'ERR%'
      then 'fallo' else 'ok' end);
  select id into doc1 from profile_documents where profile_id = obj::uuid and kind = 'w9' and replaced_at is null;
  perform pg_temp.prueba('queda un documento vigente', '1',
    (select count(*)::text from profile_documents where profile_id = obj::uuid and kind = 'w9' and replaced_at is null));
  perform pg_temp.prueba('el cambio quedó en el historial (documento_subido)', '1',
    (select count(*)::text from change_log where action = 'documento_subido' and entity_id = doc1
        and actor_id = (select profile_id from actores where nombre = 'super')));

  perform pg_temp.prueba('reemplazar: se registra el nuevo', 'ok',
    case when pg_temp.valor('docs', format('select register_profile_document(%L, ''w9'', %L)', obj, obj || '/w9/b.pdf')) like 'ERR%'
      then 'fallo' else 'ok' end);
  perform pg_temp.prueba('sigue habiendo un solo vigente', '1',
    (select count(*)::text from profile_documents where profile_id = obj::uuid and kind = 'w9' and replaced_at is null));
  perform pg_temp.prueba('el anterior se conserva como reemplazado', '1',
    (select count(*)::text from profile_documents where id = doc1 and replaced_at is not null));
  perform pg_temp.prueba('el reemplazo quedó en el historial', '1',
    (select count(*)::text from change_log where action = 'documento_reemplazado' and (detail->>'reemplaza')::uuid = doc1));
  select id into doc2 from profile_documents where profile_id = obj::uuid and kind = 'w9' and replaced_at is null;

  perform pg_temp.prueba('ruta de otro empleado: rechazada', 'ERR:22023',
    pg_temp.valor('docs', format('select register_profile_document(%L, ''w9'', %L)', obj, w2 || '/w9/a.pdf')));
  perform pg_temp.prueba('empleado W-2: no lleva documentos', 'ERR:22023',
    pg_temp.valor('docs', format('select register_profile_document(%L, ''w9'', %L)', w2, w2 || '/w9/a.pdf')));
  perform pg_temp.prueba('archivo que no existe en el bucket: rechazado', 'ERR:22023',
    pg_temp.valor('docs', format('select register_profile_document(%L, ''w9'', %L)', obj, obj || '/w9/no-existe.pdf')));
  perform pg_temp.prueba('tipo de documento inválido: rechazado', 'ERR:22023',
    pg_temp.valor('docs', format('select register_profile_document(%L, ''otro'', %L)', obj, obj || '/otro/a.pdf')));

  -- Ver
  perform pg_temp.prueba('sin permiso: no se ve ningún documento', '0',
    pg_temp.valor('sin_permisos', format('select count(*) from profile_documents where profile_id = %L', obj)));
  perform pg_temp.prueba('con empleados_ver (sin gestionar documentos): tampoco', '0',
    pg_temp.valor('ver', format('select count(*) from profile_documents where profile_id = %L', obj)));
  perform pg_temp.prueba('con empleados_gestionar_documentos: se ven', '2',
    pg_temp.valor('docs', format('select count(*) from profile_documents where profile_id = %L', obj)));
  perform pg_temp.prueba('anon: sin acceso a la tabla (42501)', 'ERR:42501',
    pg_temp.valor('anon', format('select count(*) from profile_documents where profile_id = %L', obj)));

  -- Abrir
  perform pg_temp.prueba('sin permiso: no se abre un documento', 'ERR:42501',
    pg_temp.valor('ver', format('select open_profile_document(%L)', doc2)));
  -- D-260: el W-9 solo lo abre el Super Admin.
  perform pg_temp.prueba('con permiso de documentos, el W-9 no se abre (D-260)', 'ERR:42501',
    pg_temp.valor('docs', format('select open_profile_document(%L)', doc2)));
  perform pg_temp.prueba('el Super Admin abre el W-9: devuelve la ruta', obj || '/w9/b.pdf',
    pg_temp.valor('super', format('select open_profile_document(%L)', doc2)));
  perform pg_temp.valor('super', format('select open_profile_document(%L)', doc2));
  perform pg_temp.prueba('cada apertura queda en el historial (2 aperturas)', '2',
    (select count(*)::text from change_log where action = 'documento_abierto' and entity_id = doc2
        and actor_id = (select profile_id from actores where nombre = 'docs')));
  perform pg_temp.prueba('la apertura guarda el empleado y el tipo', 'w9',
    (select detail->>'kind' from change_log where action = 'documento_abierto' and entity_id = doc2 limit 1));
  perform pg_temp.prueba('anon: no abre documentos (42501)', 'ERR:42501',
    pg_temp.valor('anon', format('select open_profile_document(%L)', doc2)));

  -- Almacenamiento: subir y leer solo con el permiso
  perform pg_temp.prueba('storage: sin permiso no se sube (42501)', 'ERR:42501',
    pg_temp.valor('sin_permisos', format('insert into storage.objects (bucket_id, name) values (''employee-docs'', %L) returning 1', obj || '/w9/x.pdf')));
  perform pg_temp.prueba('storage: con empleados_gestionar_documentos se sube', '1',
    pg_temp.valor('docs', format('insert into storage.objects (bucket_id, name) values (''employee-docs'', %L) returning 1', obj || '/insurance_certificate/x.pdf')));
  -- D-125 (migración 20261021000006): nadie lee employee-docs directo; los documentos se abren solo con open-document.
  perform pg_temp.prueba('storage: sin permiso no se listan archivos', '0',
    pg_temp.valor('ver', 'select count(*) from storage.objects where bucket_id = ''employee-docs'''));
  perform pg_temp.prueba('storage: ni con empleados_gestionar_documentos se leen archivos directo (no hay política de lectura)', '0',
    pg_temp.valor('docs', 'select count(*) from storage.objects where bucket_id = ''employee-docs'''));
  perform pg_temp.prueba('storage: ni el Super Admin lee archivos directo', '0',
    pg_temp.valor('super', 'select count(*) from storage.objects where bucket_id = ''employee-docs'''));
  perform pg_temp.prueba('storage: employee-docs no tiene ninguna política de lectura para usuarios autenticados', '0',
    (select count(*)::text from pg_policies where schemaname = 'storage' and tablename = 'objects'
       and cmd in ('SELECT', 'ALL') and (qual like '%employee-docs%' or with_check like '%employee-docs%')));
  perform pg_temp.prueba('storage: la política de subir se conserva', '1',
    (select count(*)::text from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'employee_docs_insert'));
  perform pg_temp.prueba('storage: nadie borra archivos desde la API (42501)', 'ERR:42501',
    pg_temp.valor('docs', 'with d as (delete from storage.objects where bucket_id = ''employee-docs'' returning 1) select count(*) from d'));
  perform pg_temp.prueba('storage: el bucket es privado', 'false',
    (select public::text from storage.buckets where id = 'employee-docs'));
  -- D-193: los pagos no abren los documentos; quien tiene empleados_ver_pagos sin gestionar documentos no ve ni sube.
  perform pg_temp.prueba('con empleados_ver_pagos y sin gestionar documentos: no se registra (42501)', 'ERR:42501',
    pg_temp.valor('pagos', format('select register_profile_document(%L, ''w9'', %L)', obj, obj || '/w9/a.pdf')));
  perform pg_temp.prueba('con empleados_ver_pagos y sin gestionar documentos: no se ve ningún documento', '0',
    pg_temp.valor('pagos', format('select count(*) from profile_documents where profile_id = %L', obj)));
  perform pg_temp.prueba('con empleados_ver_pagos y sin gestionar documentos: no se abre (42501)', 'ERR:42501',
    pg_temp.valor('pagos', format('select open_profile_document(%L)', doc2)));
  perform pg_temp.prueba('con empleados_ver_pagos y sin gestionar documentos: no sube al bucket (42501)', 'ERR:42501',
    pg_temp.valor('pagos', format('insert into storage.objects (bucket_id, name) values (''employee-docs'', %L) returning 1', obj || '/w9/y.pdf')));
  perform pg_temp.prueba('el permiso nuevo está en el catálogo (área empleados, orden 7)', 'empleados|7',
    (select area || '|' || sort from permissions where key = 'empleados_gestionar_documentos'));
end $$;

-- A3. Crear empleado ---------------------------------------------------------------------------------

do $$
declare
  nuevo text;
begin
  perform pg_temp.prueba('crear: sin permiso (42501)', 'ERR:42501',
    pg_temp.valor('ver', $q$ select create_employee('Nadie', null, 'w2', 'employee', 'en', false, null) $q$));
  perform pg_temp.prueba('crear: anon (42501)', 'ERR:42501',
    pg_temp.valor('anon', $q$ select create_employee('Nadie', null, 'w2', 'employee', 'en', false, null) $q$));
  perform pg_temp.prueba('crear: con acceso y sin correo (22023)', 'ERR:22023',
    pg_temp.valor('crear', $q$ select create_employee('Ana', null, 'w2', 'employee', 'en', true, null) $q$));
  perform pg_temp.prueba('crear: nombre vacío (22023)', 'ERR:22023',
    pg_temp.valor('crear', $q$ select create_employee('  ', null, 'w2', 'employee', 'en', false, null) $q$));
  perform pg_temp.prueba('crear: sin acceso y sin correo, ok', 'ok',
    case when pg_temp.valor('crear', $q$ select create_employee('Sin Acceso', '239 555 0100', '1099', 'employee', 'es', false, null) $q$) like 'ERR%'
      then 'fallo' else 'ok' end);
  perform pg_temp.prueba('crear: con acceso y correo, ok', 'ok',
    case when pg_temp.valor('crear', $q$ select create_employee('  Con Acceso ', null, 'w2', 'employee', 'es', true, '  Ana.Ruiz@Correo.COM ') $q$) like 'ERR%'
      then 'fallo' else 'ok' end);
  perform pg_temp.prueba('crear: el correo se guarda limpio y en minúsculas', 'ana.ruiz@correo.com',
    (select email from profiles where full_name = 'Con Acceso'));
  perform pg_temp.prueba('crear: el nombre se guarda sin espacios sobrantes y el teléfono vacío queda null', 'Con Acceso|null',
    (select full_name || '|' || coalesce(phone, 'null') from profiles where full_name = 'Con Acceso'));
  perform pg_temp.prueba('crear: correo repetido con otras mayúsculas (23505)', 'ERR:23505',
    pg_temp.valor('crear', $q$ select create_employee('Otra', null, 'w2', 'employee', 'en', true, 'ANA.RUIZ@correo.com') $q$));
  perform pg_temp.prueba('crear: queda en el historial con quien lo creó', '1',
    (select count(*)::text from change_log l join profiles p on p.id = l.entity_id
      where l.action = 'perfil_creado' and p.full_name = 'Con Acceso'
        and l.actor_id = (select profile_id from actores where nombre = 'crear')));
  -- Plantillas: nadie da un permiso que no tiene
  perform pg_temp.valor('crear', $q$ select create_employee('Sup por Crear', null, 'w2', 'supervisor', 'en', false, null) $q$);
  perform pg_temp.prueba('plantilla: quien crea sin esos permisos no los otorga (0)', '0',
    (select count(*)::text from profile_permissions pp join profiles p on p.id = pp.profile_id where p.full_name = 'Sup por Crear'));
  perform pg_temp.valor('super', $q$ select create_employee('Sup por Super', null, 'w2', 'supervisor', 'en', false, null) $q$);
  perform pg_temp.prueba('plantilla Supervisor por el Super Admin: 8 permisos', '8',
    (select count(*)::text from profile_permissions pp join profiles p on p.id = pp.profile_id where p.full_name = 'Sup por Super'));
  perform pg_temp.valor('super', $q$ select create_employee('Admin por Super', null, 'w2', 'admin', 'en', false, null) $q$);
  perform pg_temp.prueba('plantilla Admin por el Super Admin: 36 permisos (D-252)', '36',
    (select count(*)::text from profile_permissions pp join profiles p on p.id = pp.profile_id where p.full_name = 'Admin por Super'));
  perform pg_temp.prueba('plantilla Admin: sin empleados_gestionar_permisos', '0',
    (select count(*)::text from profile_permissions pp join profiles p on p.id = pp.profile_id
      where p.full_name = 'Admin por Super' and pp.permission_key = 'empleados_gestionar_permisos'));
  perform pg_temp.valor('super', $q$ select create_employee('Emp por Super', null, 'w2', 'employee', 'en', false, null) $q$);
  perform pg_temp.prueba('plantilla Empleado: sin permisos', '0',
    (select count(*)::text from profile_permissions pp join profiles p on p.id = pp.profile_id where p.full_name = 'Emp por Super'));
  perform pg_temp.prueba('los permisos otorgados quedan con quién los dio', '8',
    (select count(*)::text from profile_permissions pp join profiles p on p.id = pp.profile_id
      where p.full_name = 'Sup por Super' and pp.granted_by = (select profile_id from actores where nombre = 'super')));
end $$;

-- A4. Editar y desactivar ----------------------------------------------------------------------------

do $$
declare
  obj uuid := (select profile_id from actores where nombre = 'objetivo');
  sa uuid := (select profile_id from actores where nombre = 'super');
  yo uuid := (select profile_id from actores where nombre = 'editar');
begin
  perform pg_temp.prueba('editar: sin permiso (42501)', 'ERR:42501',
    pg_temp.valor('ver', format('select update_employee(%L, ''X'', null, ''w2'', ''en'')', obj)));
  perform pg_temp.prueba('editar: anon (42501)', 'ERR:42501',
    pg_temp.valor('anon', format('select update_employee(%L, ''X'', null, ''w2'', ''en'')', obj)));
  perform pg_temp.prueba('editar: con permiso, ok', 'ok',
    case when pg_temp.valor('editar', format('select update_employee(%L, ''  Nuevo Nombre '', ''(239) 555-0199'', ''1099'', ''es'')', obj)) like 'ERR%'
      then 'fallo' else 'ok' end);
  perform pg_temp.prueba('editar: se guardó nombre, teléfono, tipo e idioma', 'Nuevo Nombre|(239) 555-0199|1099|es',
    (select full_name || '|' || phone || '|' || worker_type || '|' || language from profiles where id = obj));
  perform pg_temp.prueba('editar: el cambio quedó en el historial con quien lo hizo', '1',
    (select count(*)::text from change_log where action = 'perfil_cambiado' and entity_id = obj and actor_id = yo
        and detail->'antes'->>'full_name' = 'Objetivo 1099' and detail->'despues'->>'full_name' = 'Nuevo Nombre'));
  perform pg_temp.prueba('editar: el nombre vacío se rechaza (22023)', 'ERR:22023',
    pg_temp.valor('editar', format('select update_employee(%L, '' '', null, ''w2'', ''en'')', obj)));
  perform pg_temp.prueba('editar: nadie más que el Super Admin edita al Super Admin (42501)', 'ERR:42501',
    pg_temp.valor('editar', format('select update_employee(%L, ''Hackeado'', null, null, ''en'')', sa)));
  perform pg_temp.prueba('editar: el Super Admin sí se edita a sí mismo', 'ok',
    case when pg_temp.valor('super', format('select update_employee(%L, ''Cid Clean (Super Admin)'', null, null, ''en'')', sa)) like 'ERR%'
      then 'fallo' else 'ok' end);

  perform pg_temp.prueba('desactivar: sin permiso (42501)', 'ERR:42501',
    pg_temp.valor('ver', format('select set_employee_active(%L, false)', obj)));
  perform pg_temp.prueba('desactivar: no al Super Admin (42501)', 'ERR:42501',
    pg_temp.valor('editar', format('select set_employee_active(%L, false)', sa)));
  perform pg_temp.prueba('desactivar: no a uno mismo (42501)', 'ERR:42501',
    pg_temp.valor('editar', format('select set_employee_active(%L, false)', yo)));
  perform pg_temp.prueba('desactivar: con permiso, ok', 'ok',
    case when pg_temp.valor('editar', format('select set_employee_active(%L, false)', obj)) like 'ERR%' then 'fallo' else 'ok' end);
  perform pg_temp.prueba('desactivar: quedó inactivo', 'false', (select active::text from profiles where id = obj));
  perform pg_temp.prueba('desactivar: quedó en el historial', '1',
    (select count(*)::text from change_log where action = 'perfil_cambiado' and entity_id = obj
        and detail->'antes'->>'active' = 'true' and detail->'despues'->>'active' = 'false' and actor_id = yo));
  perform pg_temp.valor('editar', format('select set_employee_active(%L, true)', obj));
  perform pg_temp.prueba('reactivar: con permiso, queda activo', 'true', (select active::text from profiles where id = obj));
end $$;

-- D-146: una persona desactivada pierde sus permisos y su identidad en el servidor; la app, además, cierra su sesión.
do $$
declare
  yo uuid := (select profile_id from actores where nombre = 'editar');
begin
  perform pg_temp.prueba('persona activa con permiso: has_permission es true', 'true',
    pg_temp.valor('editar', $q$ select has_permission('empleados_editar_desactivar') $q$));
  perform pg_temp.valor('otro_editor', format('select set_employee_active(%L, false)', yo));
  perform pg_temp.prueba('persona desactivada: has_permission es false', 'false',
    pg_temp.valor('editar', $q$ select has_permission('empleados_editar_desactivar') $q$));
  perform pg_temp.prueba('persona desactivada: current_profile_id es null', 'null',
    coalesce(pg_temp.valor('editar', $q$ select current_profile_id() $q$), 'null'));
  perform pg_temp.prueba('persona desactivada: sigue leyendo su propio perfil (la app lo ve inactivo y cierra la sesión)', 'false',
    pg_temp.valor('editar', $q$ select active from profiles where auth_user_id = auth.uid() $q$));
  perform pg_temp.prueba('persona desactivada: ya no puede editar (42501)', 'ERR:42501',
    pg_temp.valor('editar', format('select update_employee(%L, ''X'', null, ''w2'', ''en'')', yo)));
end $$;

-- Resultado ------------------------------------------------------------------------------------------

select prueba, ok, detalle from resultados order by n;
-- FIN-DE-PRUEBAS
rollback;
