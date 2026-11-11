-- Orden 83 (D-306): el Super Admin entra con dos pasos (código por correo + TOTP de Supabase Auth).
-- En la base, ser Super Admin solo cuenta con una sesión aal2 (auth.jwt()->>'aal' = 'aal2'). Todo lo que es solo del
-- Super Admin (W-9 y w9-file por open_profile_document, configuración, términos, transferir el rol, dar o quitar el
-- rol admin D-304, contratos, ICA, advertencias) ya pasa por is_super_admin(), también desde las Edge Functions, que
-- llaman a la base con el JWT de quien entra. has_permission() e is_admin_role() usaban la columna directamente: ahora
-- también pasan por is_super_admin(), para que una sesión aal1 del Super Admin no tenga todos los permisos.
-- Si se pierde el teléfono: ver current/arquitectura.md (el factor se borra desde el panel de Supabase o con la API
-- de administración).

create or replace function is_super_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(auth.jwt()->>'aal', '') = 'aal2'
     and coalesce((select is_super_admin from profiles where auth_user_id = auth.uid() and active), false)
$$;

create or replace function has_permission(perm text) returns boolean
language sql stable security definer set search_path = public as $$
  select is_super_admin()
      or exists (
        select 1 from profile_permissions pp join profiles p on p.id = pp.profile_id
        where p.auth_user_id = auth.uid() and p.active and pp.permission_key = perm)
$$;

create or replace function is_admin_role() returns boolean
language sql stable security definer set search_path = public as $$
  select is_super_admin()
      -- El Super Admin cuenta como admin solo con aal2 (aunque su rol diga admin).
      or coalesce((select p.active and p.role = 'admin' and not p.is_super_admin
                     from profiles p where p.id = current_profile_id()), false)
$$;
