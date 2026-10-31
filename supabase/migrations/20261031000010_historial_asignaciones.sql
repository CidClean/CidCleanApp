-- Pedido del dueño (2026-10-31): en el perfil del empleado (pestaña Pago) se ven también las cuentas donde ya no está
-- asignado (por ejemplo Estela en Clinica Quirúrgica, hasta 2026-08-31). Antes solo salían las vigentes.
-- Primero las vigentes y después las terminadas, de la más reciente a la más antigua. El resto es igual a 20261025000001.
create or replace function list_profile_assignments(p_profile uuid)
returns table (assignment_id uuid, jobsite_id uuid, jobsite_name text, client_name text, start_date date, end_date date)
language plpgsql stable security definer set search_path = public as $$
begin
  if not has_permission('empleados_ver') then
    raise exception 'No tienes permiso para ver empleados' using errcode = '42501';
  end if;
  return query
    select a.id, j.id, j.name, c.name, a.start_date, a.end_date
      from jobsite_assignments a join jobsites j on j.id = a.jobsite_id join clients c on c.id = j.client_id
     where a.profile_id = p_profile
     order by (a.end_date is null or a.end_date >= current_date) desc, a.end_date desc nulls first, c.name, j.name;
end $$;
