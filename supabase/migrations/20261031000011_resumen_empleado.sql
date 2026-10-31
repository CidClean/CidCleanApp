-- Orden 71 (D-294): resumen del empleado por año.

-- Resumen del empleado (D-294): cuentas (todas, vigentes y terminadas), por mes los días de servicio aprobados (u
--    horas si es W-2) y el monto (días y fijos semanales/mensuales, como staff_cost_rows), y el total del año.
--    Solo quien puede ver pagos (empleados_ver_pagos, D-194).
create function employee_summary(p_profile uuid, p_year int) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  p profiles;
  y0 date;
  y1 date;
begin
  if not has_permission('empleados_ver_pagos') then
    raise exception 'No tienes permiso para ver pagos' using errcode = '42501';
  end if;
  if p_year is null or p_year < 2000 or p_year > 2100 then
    raise exception 'Año no válido' using errcode = '22023';
  end if;
  select * into p from profiles where id = p_profile;
  if not found then
    raise exception 'Empleado no encontrado' using errcode = 'P0002';
  end if;
  y0 := make_date(p_year, 1, 1);
  y1 := make_date(p_year, 12, 31);
  return jsonb_build_object(
    'profile_id', p.id, 'name', p.full_name, 'worker_type', p.worker_type, 'year', p_year,
    'accounts', coalesce((
      select jsonb_agg(jsonb_build_object('jobsite_id', j.id, 'jobsite', j.name, 'client', c.name,
                                          'start_date', a.start_date, 'end_date', a.end_date,
                                          'current', a.end_date is null or a.end_date >= cc_today())
                       order by (a.end_date is null or a.end_date >= cc_today()) desc, a.end_date desc nulls first, c.name, j.name)
        from jobsite_assignments a join jobsites j on j.id = a.jobsite_id join clients c on c.id = j.client_id
       where a.profile_id = p.id), '[]'::jsonb),
    'months', coalesce((
      select jsonb_agg(jsonb_build_object('month', m.month, 'days', m.days, 'minutes', m.minutes, 'amount', m.amount) order by m.month)
        from (select s.month, sum(s.days)::int days, sum(s.minutes)::int minutes, round(sum(s.amount), 2) amount
                from staff_cost_rows(y0, y1, null) s where s.profile_id = p.id group by s.month) m), '[]'::jsonb),
    'days', coalesce((select sum(s.days)::int from staff_cost_rows(y0, y1, null) s where s.profile_id = p.id), 0),
    'minutes', coalesce((select sum(s.minutes)::int from staff_cost_rows(y0, y1, null) s where s.profile_id = p.id), 0),
    'amount', coalesce((select round(sum(s.amount), 2) from staff_cost_rows(y0, y1, null) s where s.profile_id = p.id), 0));
end $$;
revoke execute on function employee_summary(uuid, int) from public, anon;
grant execute on function employee_summary(uuid, int) to authenticated;

