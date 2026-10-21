-- Hito 1, parte 1: administración de empleados.
-- Fuente: D-057, D-083, D-125, D-152, D-171 a D-175, D-181 a D-186, D-146.

-- A1. Perfiles: teléfono, correo opcional sin acceso a la app y primer ingreso ---------------------

alter table profiles add column phone text;
alter table profiles add column first_login_at timestamptz;

-- El correo pasa a ser opcional: solo es obligatorio con acceso a la app.
-- La unicidad pasa a ser insensible a mayúsculas, igual que el enlace con Auth (link_auth_user).
alter table profiles alter column email drop not null;
alter table profiles drop constraint profiles_email_key;
create unique index profiles_email_lower_key on profiles (lower(email)) where email is not null;
alter table profiles add constraint profiles_email_required_with_access
  check (not has_app_access or email is not null);

-- Primer ingreso: se llena la primera vez que Auth registra un inicio de sesión.
create function set_first_login() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.last_sign_in_at is not null and (tg_op = 'INSERT' or old.last_sign_in_at is null) then
    update profiles set first_login_at = new.last_sign_in_at
     where auth_user_id = new.id and first_login_at is null;
  end if;
  return new;
end $$;
create trigger on_auth_user_first_login after insert or update of last_sign_in_at on auth.users
  for each row execute function set_first_login();
revoke execute on function set_first_login() from public, anon, authenticated;

-- Quien ya había entrado antes de esta migración.
update profiles p set first_login_at = u.last_sign_in_at
  from auth.users u
 where u.id = p.auth_user_id and u.last_sign_in_at is not null and p.first_login_at is null;

-- Historial: el disparador de perfiles cubre también los campos nuevos y los editables.
create or replace function log_profile_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  antes jsonb;
  despues jsonb;
begin
  if tg_op = 'INSERT' then
    insert into change_log (actor_id, action, entity, entity_id, detail)
    values (current_profile_id(), 'perfil_creado', 'profiles', new.id,
            jsonb_build_object('role', new.role, 'worker_type', new.worker_type,
                               'has_app_access', new.has_app_access));
    return new;
  end if;

  antes := jsonb_build_object('full_name', old.full_name, 'phone', old.phone, 'email', old.email,
    'role', old.role, 'worker_type', old.worker_type, 'active', old.active,
    'is_super_admin', old.is_super_admin, 'has_app_access', old.has_app_access,
    'language', old.language, 'first_login_at', old.first_login_at);
  despues := jsonb_build_object('full_name', new.full_name, 'phone', new.phone, 'email', new.email,
    'role', new.role, 'worker_type', new.worker_type, 'active', new.active,
    'is_super_admin', new.is_super_admin, 'has_app_access', new.has_app_access,
    'language', new.language, 'first_login_at', new.first_login_at);
  if antes is distinct from despues then
    insert into change_log (actor_id, action, entity, entity_id, detail)
    values (current_profile_id(), 'perfil_cambiado', 'profiles', new.id,
            jsonb_build_object('antes', antes, 'despues', despues));
  end if;
  return new;
end $$;

-- A2. Documentos de los 1099 (D-125, D-175, D-183) ------------------------------------------------

create table profile_documents (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references profiles(id) on delete cascade,
  kind        text not null check (kind in ('w9', 'insurance_certificate')),
  file_path   text not null unique,
  uploaded_at timestamptz not null default now(),
  uploaded_by uuid references profiles(id),
  replaced_at timestamptz
);
-- Un documento vigente por perfil y tipo; los reemplazados se conservan.
create unique index profile_documents_current on profile_documents (profile_id, kind) where replaced_at is null;

alter table profile_documents enable row level security;
create policy profile_documents_read on profile_documents for select to authenticated
  using (has_permission('empleados_ver_pagos'));
revoke all on profile_documents from anon;
revoke insert, update, delete on profile_documents from authenticated;

-- Bucket privado: solo quien ve pagos sube y firma enlaces (D-125).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('employee-docs', 'employee-docs', false, 10485760,
        array['application/pdf', 'image/jpeg', 'image/png', 'image/heic', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
                               allowed_mime_types = excluded.allowed_mime_types;

create policy employee_docs_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'employee-docs' and has_permission('empleados_ver_pagos'));
create policy employee_docs_select on storage.objects for select to authenticated
  using (bucket_id = 'employee-docs' and has_permission('empleados_ver_pagos'));

-- Registra un archivo ya subido al bucket como el documento vigente del tipo; el anterior queda reemplazado.
create function register_profile_document(p_profile uuid, p_kind text, p_path text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  new_id uuid;
  old_id uuid;
begin
  if not has_permission('empleados_ver_pagos') then
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

-- Cada apertura queda en el historial: quién y cuándo (D-125). Devuelve la ruta para la URL firmada.
create function open_profile_document(doc_id uuid) returns text
language plpgsql security definer set search_path = public as $$
declare
  doc profile_documents;
begin
  if not has_permission('empleados_ver_pagos') then
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

-- A3. Crear empleado (lo llama la Edge Function create-employee con el JWT de quien crea) ----------

-- Plantillas de partida (D-152, current/permisos.md). Nadie da un permiso que no tiene.
create function create_employee(
  p_full_name text, p_phone text, p_worker_type worker_type, p_role role_template,
  p_language app_language, p_has_app_access boolean, p_email text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  new_id uuid;
  clean_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  template text[];
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

  template := case p_role
    when 'supervisor' then array['leads_ver', 'walkthroughs_hacer', 'clientes_ver', 'empleados_ver',
      'schedule_ver_editar', 'work_registrar_por_otros', 'work_editar', 'work_revisar_gps']
    when 'admin' then (select coalesce(array_agg(key order by area, sort), '{}') from permissions
                        where key <> 'empleados_gestionar_permisos')
    else '{}'
  end;
  insert into profile_permissions (profile_id, permission_key, granted_by)
  select new_id, k, current_profile_id() from unnest(template) k where has_permission(k);

  return new_id;
end $$;

-- A4. Desactivar y editar -------------------------------------------------------------------------

create function set_employee_active(p_profile uuid, p_active boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not has_permission('empleados_editar_desactivar') then
    raise exception 'No tienes permiso para desactivar empleados' using errcode = '42501';
  end if;
  if exists (select 1 from profiles where id = p_profile and is_super_admin) then
    raise exception 'No se puede desactivar al Super Admin' using errcode = '42501';
  end if;
  if p_profile = current_profile_id() then
    raise exception 'No puedes desactivarte a ti mismo' using errcode = '42501';
  end if;
  update profiles set active = p_active where id = p_profile;
  if not found then
    raise exception 'Empleado no encontrado' using errcode = 'P0002';
  end if;
end $$;

create function update_employee(
  p_profile uuid, p_full_name text, p_phone text, p_worker_type worker_type, p_language app_language
) returns void
language plpgsql security definer set search_path = public as $$
declare
  target profiles;
begin
  if not has_permission('empleados_editar_desactivar') then
    raise exception 'No tienes permiso para editar empleados' using errcode = '42501';
  end if;
  select * into target from profiles where id = p_profile;
  if not found then
    raise exception 'Empleado no encontrado' using errcode = 'P0002';
  end if;
  if target.is_super_admin and not is_super_admin() then
    raise exception 'Solo el Super Admin edita al Super Admin' using errcode = '42501';
  end if;
  if btrim(coalesce(p_full_name, '')) = '' then
    raise exception 'El nombre es obligatorio' using errcode = '22023';
  end if;
  if p_worker_type is null and not target.is_super_admin then
    raise exception 'El tipo de trabajador es obligatorio' using errcode = '22023';
  end if;
  update profiles
     set full_name = btrim(p_full_name),
         phone = nullif(btrim(coalesce(p_phone, '')), ''),
         worker_type = p_worker_type,
         language = p_language
   where id = p_profile;
end $$;

-- Permisos de ejecución: solo quien ya entró; nada para anon. ------------------------------------------

revoke execute on function register_profile_document(uuid, text, text), open_profile_document(uuid),
  create_employee(text, text, worker_type, role_template, app_language, boolean, text),
  set_employee_active(uuid, boolean),
  update_employee(uuid, text, text, worker_type, app_language) from public, anon;
grant execute on function register_profile_document(uuid, text, text), open_profile_document(uuid),
  create_employee(text, text, worker_type, role_template, app_language, boolean, text),
  set_employee_active(uuid, boolean),
  update_employee(uuid, text, text, worker_type, app_language) to authenticated;
