-- Orden 51 (D-272, D-274): "Mis horas" de cualquier empleado activo con sesión (W2 y 1099).
-- Solo lo suyo y solo el trabajo aprobado del mes (por visits.local_date): una fila por registro con la fecha, la
-- cuenta (nombre del jobsite), los minutos trabajados (salida − entrada) y los asegurados (pay_minutes, lo que se
-- paga aunque termine antes), más los totales del mes. Nunca dinero ni el tope de 32 h (D-223).

create function my_hours(p_month date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  me uuid := current_profile_id();
  m0 date := date_trunc('month', p_month)::date;
  rows jsonb;
begin
  if me is null then raise exception 'Sin sesión' using errcode = '42501'; end if;
  if p_month is null then raise exception 'Mes no válido' using errcode = '22023'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'date', x.local_date,
           'account', x.account,
           'worked_minutes', x.worked,
           'insured_minutes', x.insured
         ) order by x.local_date desc, x.clock_in desc), '[]'::jsonb)
    into rows
    from (
      select v.local_date, j.name as account, w.clock_in,
             round(extract(epoch from (w.clock_out - w.clock_in)) / 60)::int as worked,
             -- D-200: sin pay_minutes guardado (no debería pasar al aprobar) se toman las horas trabajadas.
             coalesce(w.pay_minutes, round(extract(epoch from (w.clock_out - w.clock_in)) / 60)::int) as insured
        from work_entries w
        join visits v on v.id = w.visit_id
        join jobsites j on j.id = v.jobsite_id
       where w.profile_id = me
         and w.clock_out is not null
         and v.approved_at is not null
         and not v.removed
         and v.local_date >= m0 and v.local_date < (m0 + interval '1 month')::date
    ) x;

  return jsonb_build_object(
    'month', m0,
    'rows', rows,
    'worked_minutes', coalesce((select sum((r->>'worked_minutes')::int) from jsonb_array_elements(rows) r), 0),
    'insured_minutes', coalesce((select sum((r->>'insured_minutes')::int) from jsonb_array_elements(rows) r), 0)
  );
end $$;

revoke execute on function my_hours(date) from public, anon;
grant execute on function my_hours(date) to authenticated;
