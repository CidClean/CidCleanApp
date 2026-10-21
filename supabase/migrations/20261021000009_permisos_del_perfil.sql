-- Orden 11, B7 (D-191, D-194): leer los permisos de un perfil para la pestaña Permisos.
-- Quien ve la lista de empleados (empleados_ver) ve la pestaña Permisos; sin empleados_gestionar_permisos solo la lee.
-- La política de lectura de profile_permissions solo deja leer lo ajeno con empleados_gestionar_permisos, así que esta
-- función devuelve los permisos del perfil limitados a los que quien consulta también tiene (nadie ve permisos que no tiene).
create function employee_permissions(p_profile uuid) returns text[]
language plpgsql stable security definer set search_path = public as $$
begin
  if not has_permission('empleados_ver') then
    raise exception 'No tienes permiso para ver empleados' using errcode = '42501';
  end if;
  return coalesce((select array_agg(pp.permission_key order by pp.permission_key)
                     from profile_permissions pp
                    where pp.profile_id = p_profile and has_permission(pp.permission_key)), '{}');
end $$;

revoke execute on function employee_permissions(uuid) from public, anon;
grant  execute on function employee_permissions(uuid) to authenticated;
