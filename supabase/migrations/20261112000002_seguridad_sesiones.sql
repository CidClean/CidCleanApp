-- Orden 81 (revisión de seguridad del hito 8): sesiones (M2, B7, D-126).
-- Al desactivar a alguien se cierra su sesión al instante también en el servidor: se borran sus filas de
-- auth.sessions y auth.refresh_tokens, y el refresh token deja de servir. El JWT que ya tiene vale hasta que vence
-- (como mucho una hora), pero has_permission, current_profile_id e is_admin_role ya exigen active.
-- La política walkthrough_photos_select también exige active en la cláusula de las fotos propias de 24 h.

-- Borra todas las sesiones de un usuario de Auth. Solo la usan otras funciones de la base (nadie la ejecuta
-- desde la API).
create function revoke_auth_sessions(p_auth_user uuid) returns int
language plpgsql security definer set search_path = public, auth as $$
declare
  n int;
begin
  if p_auth_user is null then return 0; end if;
  delete from auth.refresh_tokens where user_id = p_auth_user::text;
  delete from auth.sessions where user_id = p_auth_user;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function revoke_auth_sessions(uuid) from public, anon, authenticated;

create or replace function set_employee_active(p_profile uuid, p_active boolean) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_auth uuid;
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
  update profiles set active = p_active where id = p_profile returning auth_user_id into v_auth;
  if not found then
    raise exception 'Empleado no encontrado' using errcode = 'P0002';
  end if;
  -- D-126: al desactivar se cierra la sesión al instante.
  if not p_active then
    perform revoke_auth_sessions(v_auth);
  end if;
end $$;

drop policy walkthrough_photos_select on storage.objects;
create policy walkthrough_photos_select on storage.objects for select to authenticated
  using (bucket_id = 'walkthrough-photos'
         and (is_admin_role()
              or (owner = auth.uid() and created_at > now() - interval '24 hours' and current_profile_id() is not null)));
