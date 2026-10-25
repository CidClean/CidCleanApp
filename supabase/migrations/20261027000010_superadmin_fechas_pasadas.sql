-- D-244: el Super Admin puede poner fechas pasadas en cualquier jobsite (asignación, pago, visitas y trabajo). La
-- regla de D-241 vive en esta función, que usan assign_employee, set_assignment_pay, add_visit y update_visit:
-- "se permiten fechas pasadas" = cliente previo a la app, o quien llama es el Super Admin.
create or replace function jobsite_is_legacy(p_jobsite uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_super_admin()
      or coalesce((select c.legacy from jobsites j join clients c on c.id = j.client_id where j.id = p_jobsite), false)
$$;
revoke execute on function jobsite_is_legacy(uuid) from public, anon, authenticated;
