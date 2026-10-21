-- Etapa 1: perfiles, permisos, historial de cambios.
-- Fuente: current/flujo.md (Roles y permisos), current/seguridad.md, D-014, D-125, D-139, D-144.

create type worker_type as enum ('w2', '1099');
create type role_template as enum ('admin', 'supervisor', 'employee');
create type app_language as enum ('en', 'es');

-- Catálogo de permisos (D-144). Las etiquetas viven en la app (inglés y español).
create table permissions (
  key  text primary key,
  area text not null check (area in ('ventas','clientes','empleados','schedule_work','accounting','sistema')),
  sort int  not null
);

insert into permissions (key, area, sort) values
  ('leads_ver','ventas',1), ('leads_editar','ventas',2), ('leads_eliminar','ventas',3),
  ('walkthroughs_hacer','ventas',4), ('quotes_ver','ventas',5), ('quotes_editar','ventas',6),
  ('quotes_enviar','ventas',7), ('quotes_ver_precios','ventas',8), ('sow_contratos_subir_ver','ventas',9),
  ('clientes_ver','clientes',1), ('clientes_editar_datos','clientes',2),
  ('clientes_editar_walkthrough_sow','clientes',3), ('clientes_ver_tarifa','clientes',4),
  ('clientes_cambiar_estado','clientes',5),
  ('empleados_ver','empleados',1), ('empleados_invitar_crear','empleados',2),
  ('empleados_editar_desactivar','empleados',3), ('empleados_ver_pagos','empleados',4),
  ('empleados_asignar_pago','empleados',5), ('empleados_gestionar_permisos','empleados',6),
  ('schedule_ver_editar','schedule_work',1), ('work_registrar_por_otros','schedule_work',2),
  ('work_editar','schedule_work',3), ('work_aprobar','schedule_work',4), ('work_revisar_gps','schedule_work',5),
  ('ingresos_ver_registrar','accounting',1), ('ingresos_marcar_recibidos','accounting',2),
  ('personal_ver_costo','accounting',3), ('gastos_ver','accounting',4),
  ('gastos_registrar_editar','accounting',5), ('gastos_recurrentes','accounting',6),
  ('dashboard_global','accounting',7), ('dashboard_cuenta','accounting',8), ('reportes_exportar','accounting',9),
  ('historial_ver','sistema',1);

-- Perfiles. auth_user_id es null para quien no tiene acceso a la app (un supervisor o admin registra su trabajo).
create table profiles (
  id                uuid primary key default gen_random_uuid(),
  auth_user_id      uuid unique references auth.users(id) on delete set null,
  email             text not null unique,
  full_name         text not null,
  worker_type       worker_type,
  role              role_template not null default 'employee',
  is_super_admin    boolean not null default false,
  has_app_access    boolean not null default true,
  language          app_language not null default 'en',
  active            boolean not null default true,
  terms_accepted_at timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint profiles_worker_type_required check (worker_type is not null or is_super_admin)
);
create unique index profiles_one_super_admin on profiles (is_super_admin) where is_super_admin;

create table profile_permissions (
  profile_id     uuid not null references profiles(id) on delete cascade,
  permission_key text not null references permissions(key),
  granted_by     uuid references profiles(id),
  granted_at     timestamptz not null default now(),
  primary key (profile_id, permission_key)
);

-- Historial de cambios: solo se agrega, nadie lo edita (D-139).
create table change_log (
  id         bigint generated always as identity primary key,
  at         timestamptz not null default now(),
  actor_id   uuid references profiles(id),
  action     text not null,
  entity     text not null,
  entity_id  uuid,
  detail     jsonb not null default '{}'::jsonb
);

-- Funciones de apoyo -------------------------------------------------------

create function current_profile_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from profiles where auth_user_id = auth.uid() and active
$$;

create function has_permission(perm text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where auth_user_id = auth.uid() and active and is_super_admin)
      or exists (
        select 1 from profile_permissions pp join profiles p on p.id = pp.profile_id
        where p.auth_user_id = auth.uid() and p.active and pp.permission_key = perm)
$$;

create function is_super_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_super_admin from profiles where auth_user_id = auth.uid() and active), false)
$$;

-- Al crearse el usuario de Auth (por invitación), se enlaza con el perfil que tiene ese correo.
create function link_auth_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update profiles set auth_user_id = new.id
   where lower(email) = lower(new.email) and auth_user_id is null;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function link_auth_user();

create function touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
create trigger profiles_touch before update on profiles
  for each row execute function touch_updated_at();

-- Dar y quitar permisos: nadie da un permiso que no tiene; gestionar permisos es un permiso (D-014).
create function grant_permission(target uuid, perm text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not has_permission('empleados_gestionar_permisos') then
    raise exception 'No tienes permiso para gestionar permisos' using errcode = '42501';
  end if;
  if not has_permission(perm) then
    raise exception 'No puedes dar un permiso que no tienes' using errcode = '42501';
  end if;
  if exists (select 1 from profiles where id = target and is_super_admin) then
    raise exception 'El Super Admin ya tiene todos los permisos' using errcode = '42501';
  end if;
  insert into profile_permissions (profile_id, permission_key, granted_by)
  values (target, perm, current_profile_id()) on conflict do nothing;
end $$;

create function revoke_permission(target uuid, perm text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not has_permission('empleados_gestionar_permisos') then
    raise exception 'No tienes permiso para gestionar permisos' using errcode = '42501';
  end if;
  if exists (select 1 from profiles where id = target and is_super_admin) then
    raise exception 'No se le quitan permisos al Super Admin' using errcode = '42501';
  end if;
  delete from profile_permissions where profile_id = target and permission_key = perm;
end $$;

-- Cada persona cambia solo su idioma y acepta los términos (D-086, D-087).
create function set_my_language(lang app_language) returns void
language sql security definer set search_path = public as $$
  update profiles set language = lang where auth_user_id = auth.uid() and active
$$;
create function accept_terms() returns void
language sql security definer set search_path = public as $$
  update profiles set terms_accepted_at = now() where auth_user_id = auth.uid() and active
$$;

-- Historial escrito por la base de datos (disparadores) -----------------------

create function log_profile_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into change_log (actor_id, action, entity, entity_id, detail)
    values (current_profile_id(), 'perfil_creado', 'profiles', new.id,
            jsonb_build_object('role', new.role, 'worker_type', new.worker_type));
  elsif (old.role, old.worker_type, old.active, old.is_super_admin, old.has_app_access)
        is distinct from (new.role, new.worker_type, new.active, new.is_super_admin, new.has_app_access) then
    insert into change_log (actor_id, action, entity, entity_id, detail)
    values (current_profile_id(), 'perfil_cambiado', 'profiles', new.id,
            jsonb_build_object(
              'antes', jsonb_build_object('role', old.role, 'worker_type', old.worker_type, 'active', old.active,
                                          'is_super_admin', old.is_super_admin, 'has_app_access', old.has_app_access),
              'despues', jsonb_build_object('role', new.role, 'worker_type', new.worker_type, 'active', new.active,
                                            'is_super_admin', new.is_super_admin, 'has_app_access', new.has_app_access)));
  end if;
  return new;
end $$;
create trigger profiles_log after insert or update on profiles
  for each row execute function log_profile_change();

create function log_permission_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into change_log (actor_id, action, entity, entity_id, detail)
    values (current_profile_id(), 'permiso_dado', 'profile_permissions', new.profile_id,
            jsonb_build_object('permiso', new.permission_key));
  else
    insert into change_log (actor_id, action, entity, entity_id, detail)
    values (current_profile_id(), 'permiso_quitado', 'profile_permissions', old.profile_id,
            jsonb_build_object('permiso', old.permission_key));
  end if;
  return null;
end $$;
create trigger profile_permissions_log after insert or delete on profile_permissions
  for each row execute function log_permission_change();

create function change_log_append_only() returns trigger language plpgsql as $$
begin raise exception 'El historial de cambios no se edita ni se borra'; end $$;
create trigger change_log_no_update before update or delete on change_log
  for each row execute function change_log_append_only();

-- Reglas por fila ------------------------------------------------------------

alter table permissions         enable row level security;
alter table profiles            enable row level security;
alter table profile_permissions enable row level security;
alter table change_log          enable row level security;

create policy permissions_read on permissions for select to authenticated using (true);

create policy profiles_read on profiles for select to authenticated
  using (auth_user_id = auth.uid() or has_permission('empleados_ver'));

create policy profile_permissions_read on profile_permissions for select to authenticated
  using (profile_id = current_profile_id() or has_permission('empleados_gestionar_permisos'));

create policy change_log_read on change_log for select to authenticated
  using (has_permission('historial_ver'));

-- Sin políticas de escritura: todo cambio pasa por funciones del servidor.
revoke all on permissions, profiles, profile_permissions, change_log from anon;
revoke insert, update, delete on permissions, profiles, profile_permissions, change_log from authenticated;
revoke execute on function grant_permission(uuid, text), revoke_permission(uuid, text),
  set_my_language(app_language), accept_terms() from anon, public;
grant  execute on function grant_permission(uuid, text), revoke_permission(uuid, text),
  set_my_language(app_language), accept_terms() to authenticated;
