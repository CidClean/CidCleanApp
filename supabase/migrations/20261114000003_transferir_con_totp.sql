-- Orden 102 (N6 de la revisión de seguridad n.º 2, D-306): el rol de Super Admin solo se transfiere a una persona que ya
-- tiene un factor TOTP verificado en Supabase Auth. Si no, error claro (código P0010) y la app lo explica antes.
-- super_admin_candidates() devuelve además has_totp para que el botón lo diga sin intentarlo.

create function profile_has_totp(p_profile uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles p join auth.mfa_factors f on f.user_id = p.auth_user_id
     where p.id = p_profile and f.factor_type::text = 'totp' and f.status::text = 'verified')
$$;
revoke execute on function profile_has_totp(uuid) from public, anon, authenticated;

create or replace function transfer_super_admin(p_new uuid, p_worker_type worker_type default null) returns void
language plpgsql security definer set search_path = public as $$
declare
  me profiles;
  target profiles;
begin
  if not is_super_admin() then
    raise exception 'Solo el Super Admin transfiere el rol' using errcode = '42501';
  end if;
  select * into me from profiles where id = current_profile_id() for update;
  if p_new = me.id then
    raise exception 'No puedes transferirte el rol a ti mismo' using errcode = '22023';
  end if;
  select * into target from profiles where id = p_new for update;
  if not found then
    raise exception 'Empleado no encontrado' using errcode = 'P0002';
  end if;
  if not target.active or not target.has_app_access or target.auth_user_id is null or target.first_login_at is null then
    raise exception 'Solo a un empleado activo, con acceso a la app y que ya entró' using errcode = '22023';
  end if;
  -- Quien deja de ser Super Admin debe tener tipo de trabajador (regla de profiles: solo el Super Admin va sin tipo).
  -- Si no lo tiene, se elige en la pantalla y se guarda aquí, en la misma transacción (D-206).
  if me.worker_type is null and p_worker_type is null then
    raise exception 'Falta el tipo de trabajador de quien transfiere' using errcode = '23514';
  end if;
  -- Orden 102 (N6): quien recibe el rol ya debe tener la app de autenticación (TOTP verificado, D-306).
  if not profile_has_totp(target.id) then
    raise exception 'La persona debe activar primero la app de autenticación' using errcode = 'P0010';
  end if;

  -- Primero se quita al anterior: el índice permite un solo Super Admin.
  update profiles set is_super_admin = false, role = 'admin', worker_type = coalesce(me.worker_type, p_worker_type)
   where id = me.id;
  update profiles set is_super_admin = true where id = target.id;
  insert into profile_permissions (profile_id, permission_key, granted_by)
  select me.id, p.key, me.id from permissions p
  on conflict do nothing;

  insert into change_log (actor_id, action, entity, entity_id, detail)
  values (me.id, 'super_admin_transferido', 'profiles', target.id, jsonb_build_object('anterior', me.id));
end $$;

drop function super_admin_candidates();
create function super_admin_candidates() returns table (id uuid, full_name text, has_totp boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_super_admin() then
    raise exception 'Solo el Super Admin transfiere el rol' using errcode = '42501';
  end if;
  return query
    select p.id, p.full_name, profile_has_totp(p.id) from profiles p
     where p.active and p.has_app_access and p.auth_user_id is not null and p.first_login_at is not null
       and not p.is_super_admin
     order by p.full_name;
end $$;
revoke execute on function super_admin_candidates() from public, anon;
grant execute on function super_admin_candidates() to authenticated;
