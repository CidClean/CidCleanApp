-- Orden 11: permiso nuevo de documentos (D-193) y guardar permisos del perfil (D-188 a D-192).

-- A1. Permiso nuevo: 36 permisos delegables ---------------------------------------------------------------
insert into permissions (key, area, sort) values ('empleados_gestionar_documentos', 'empleados', 7);

-- Plantillas de partida (D-152, D-193; current/permisos.md): un solo lugar para el servidor.
-- Empleado sin permisos; Supervisor con 8; Admin con todos menos empleados_gestionar_permisos (35).
create function role_template_permissions(p_role role_template) returns text[]
language sql stable set search_path = public as $$
  select case p_role
    when 'supervisor' then array['leads_ver', 'walkthroughs_hacer', 'clientes_ver', 'empleados_ver',
      'schedule_ver_editar', 'work_registrar_por_otros', 'work_editar', 'work_revisar_gps']
    when 'admin' then (select coalesce(array_agg(key order by area, sort), '{}') from permissions
                        where key <> 'empleados_gestionar_permisos')
    else '{}'::text[]
  end
$$;

-- Los Admin que ya existían (aparte del Super Admin; hoy no hay ninguno) parten con el permiso nuevo.
insert into profile_permissions (profile_id, permission_key)
select id, 'empleados_gestionar_documentos' from profiles where role = 'admin' and not is_super_admin
on conflict do nothing;

-- Crear empleado: aplica la plantilla con role_template_permissions (nadie da un permiso que no tiene).
create or replace function create_employee(
  p_full_name text, p_phone text, p_worker_type worker_type, p_role role_template,
  p_language app_language, p_has_app_access boolean, p_email text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  new_id uuid;
  clean_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
begin
  if not has_permission('empleados_invitar_crear') then
    raise exception 'No tienes permiso para crear empleados' using errcode = '42501';
  end if;
  if btrim(coalesce(p_full_name, '')) = '' then
    raise exception 'El nombre es obligatorio' using errcode = '22023';
  end if;
  if p_worker_type is null then
    raise exception 'El tipo de trabajador es obligatorio' using errcode = '22023';
  end if;
  if p_has_app_access and clean_email is null then
    raise exception 'El correo es obligatorio con acceso a la app' using errcode = '22023';
  end if;

  insert into profiles (full_name, phone, worker_type, role, language, has_app_access, email)
  values (btrim(p_full_name), nullif(btrim(coalesce(p_phone, '')), ''), p_worker_type, p_role, p_language,
          p_has_app_access, clean_email)
  returning id into new_id;

  insert into profile_permissions (profile_id, permission_key, granted_by)
  select new_id, k, current_profile_id() from unnest(role_template_permissions(p_role)) k where has_permission(k);

  return new_id;
end $$;

-- A2. Documentos de los 1099: ver, subir y reemplazar exigen solo empleados_gestionar_documentos -----------
-- (antes empleados_ver_pagos; las tarifas y los pagos siguen con empleados_ver_pagos, D-125, D-193).
drop policy employee_docs_insert on storage.objects;
create policy employee_docs_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'employee-docs' and has_permission('empleados_gestionar_documentos'));

drop policy profile_documents_read on profile_documents;
create policy profile_documents_read on profile_documents for select to authenticated
  using (has_permission('empleados_gestionar_documentos'));

create or replace function register_profile_document(p_profile uuid, p_kind text, p_path text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  new_id uuid;
  old_id uuid;
begin
  if not has_permission('empleados_gestionar_documentos') then
    raise exception 'No tienes permiso para subir documentos' using errcode = '42501';
  end if;
  if p_kind not in ('w9', 'insurance_certificate') then
    raise exception 'Tipo de documento no válido' using errcode = '22023';
  end if;
  if not exists (select 1 from profiles where id = p_profile and worker_type = '1099') then
    raise exception 'Solo los empleados 1099 llevan estos documentos' using errcode = '22023';
  end if;
  if p_path is null or p_path not like p_profile::text || '/' || p_kind || '/%' then
    raise exception 'La ruta del archivo no corresponde al empleado' using errcode = '22023';
  end if;
  if not exists (select 1 from storage.objects where bucket_id = 'employee-docs' and name = p_path) then
    raise exception 'El archivo no está en el almacenamiento' using errcode = '22023';
  end if;

  select id into old_id from profile_documents
   where profile_id = p_profile and kind = p_kind and replaced_at is null;
  if old_id is not null then
    update profile_documents set replaced_at = now() where id = old_id;
  end if;

  insert into profile_documents (profile_id, kind, file_path, uploaded_by)
  values (p_profile, p_kind, p_path, current_profile_id())
  returning id into new_id;

  insert into change_log (actor_id, action, entity, entity_id, detail)
  values (current_profile_id(),
          case when old_id is null then 'documento_subido' else 'documento_reemplazado' end,
          'profile_documents', new_id,
          jsonb_build_object('profile_id', p_profile, 'kind', p_kind, 'reemplaza', old_id));
  return new_id;
end $$;

-- Cada apertura sigue en el historial: quién y cuándo (D-125). Devuelve la ruta para la URL firmada.
create or replace function open_profile_document(doc_id uuid) returns text
language plpgsql security definer set search_path = public as $$
declare
  doc profile_documents;
begin
  if not has_permission('empleados_gestionar_documentos') then
    raise exception 'No tienes permiso para ver documentos' using errcode = '42501';
  end if;
  select * into doc from profile_documents where id = doc_id;
  if not found then
    raise exception 'Documento no encontrado' using errcode = 'P0002';
  end if;
  insert into change_log (actor_id, action, entity, entity_id, detail)
  values (current_profile_id(), 'documento_abierto', 'profile_documents', doc.id,
          jsonb_build_object('profile_id', doc.profile_id, 'kind', doc.kind));
  return doc.file_path;
end $$;

-- B. Guardar los permisos de un perfil de una vez (D-188 a D-192) ---------------------------------------
-- Reemplaza a grant_permission y revoke_permission (que dejaban a alguien cambiar sus propios permisos y
-- quitar permisos que no tiene). Todo se aplica o nada. Cada alta y cada baja queda en change_log por los
-- disparadores de profile_permissions y el cambio de rol (D-190) por el de profiles.
--  * Quien guarda necesita empleados_gestionar_permisos.
--  * Nadie cambia sus propios permisos ni los del Super Admin (que tiene todos, D-192).
--  * Nadie da ni quita un permiso que no tiene (D-014, D-191).
--  * p_role: el rol de la última plantilla aplicada (D-190); null lo deja igual.
drop function grant_permission(uuid, text);
drop function revoke_permission(uuid, text);

create function save_employee_permissions(p_profile uuid, p_grant text[], p_revoke text[], p_role role_template default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  me uuid := current_profile_id();
  target profiles;
  k text;
  to_grant text[] := coalesce(p_grant, '{}');
  to_revoke text[] := coalesce(p_revoke, '{}');
begin
  if not has_permission('empleados_gestionar_permisos') then
    raise exception 'No tienes permiso para gestionar permisos' using errcode = '42501';
  end if;
  if p_profile = me then
    raise exception 'No puedes cambiar tus propios permisos' using errcode = '42501';
  end if;
  select * into target from profiles where id = p_profile;
  if not found then
    raise exception 'Empleado no encontrado' using errcode = 'P0002';
  end if;
  if target.is_super_admin then
    raise exception 'El Super Admin tiene todos los permisos y nadie los cambia' using errcode = '42501';
  end if;
  if to_grant && to_revoke then
    raise exception 'Un permiso no puede darse y quitarse a la vez' using errcode = '22023';
  end if;
  foreach k in array to_grant || to_revoke loop
    if not exists (select 1 from permissions where key = k) then
      raise exception 'Permiso desconocido: %', k using errcode = '22023';
    end if;
    if not has_permission(k) then
      raise exception 'No puedes dar ni quitar un permiso que no tienes: %', k using errcode = '42501';
    end if;
  end loop;

  insert into profile_permissions (profile_id, permission_key, granted_by)
  select p_profile, g, me from unnest(to_grant) g
  on conflict do nothing;
  delete from profile_permissions where profile_id = p_profile and permission_key = any (to_revoke);

  if p_role is not null and p_role is distinct from target.role then
    update profiles set role = p_role where id = p_profile;
  end if;
end $$;

revoke execute on function role_template_permissions(role_template), save_employee_permissions(uuid, text[], text[], role_template)
  from public, anon;
grant  execute on function role_template_permissions(role_template), save_employee_permissions(uuid, text[], text[], role_template)
  to authenticated;
