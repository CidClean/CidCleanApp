-- D-242: dar acceso a la app a un empleado que se creó sin acceso. Guarda su correo y marca el acceso; la invitación
-- la manda después la Edge Function resend-invitation (crea el usuario de Auth si falta), igual que al crearlo (D-172).
create or replace function public.grant_app_access(p_profile uuid, p_email text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  target profiles;
  v_email text := lower(btrim(coalesce(p_email, '')));
begin
  if not has_permission('empleados_invitar_crear') then
    raise exception 'No tienes permiso para invitar empleados' using errcode = '42501';
  end if;
  select * into target from profiles where id = p_profile for update;
  if not found then raise exception 'Empleado no encontrado' using errcode = 'P0002'; end if;
  if target.is_super_admin then raise exception 'El Super Admin ya tiene acceso' using errcode = '22023'; end if;
  if not target.active then raise exception 'El empleado está inactivo' using errcode = '22023'; end if;
  if target.has_app_access then raise exception 'Ya tiene acceso a la app' using errcode = '22023'; end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(v_email) > 254 then
    raise exception 'Correo no válido' using errcode = '22023';
  end if;
  if exists (select 1 from profiles where lower(email) = v_email and id <> p_profile)
     or exists (select 1 from auth.users where lower(email) = v_email) then
    raise exception 'email_taken' using errcode = '23505';
  end if;
  update profiles set email = v_email, has_app_access = true where id = p_profile;
  insert into change_log (actor_id, action, entity, entity_id, detail)
  values (current_profile_id(), 'acceso_app_dado', 'profiles', p_profile, '{}'::jsonb);
end $function$;

revoke all on function public.grant_app_access(uuid, text) from public, anon;
grant execute on function public.grant_app_access(uuid, text) to authenticated;
