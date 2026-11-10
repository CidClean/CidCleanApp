-- Orden 75 (D-298): pestaña "Aprobados" / "Approved" de Schedule & Work.
-- D-299 no necesita cambios aquí: admin_home ya devuelve to_approve.visits (cuenta las visitas con
-- visit_pending_approval, también la de un 1099 que terminó y nadie marcó) y work_to_approve ya la lista
-- (fila del 1099 con status 'day_missing'); lo prueba supabase/tests/aprobados.sql.

-- Quita los montos de una tarjeta (para quien no tiene empleados_ver_pagos).
create function work_card_strip_pay(p_card jsonb) returns jsonb
language sql immutable set search_path = public as $$
  select p_card || jsonb_build_object('rows', coalesce((
    select jsonb_agg(case when jsonb_typeof(r->'service_day') = 'object'
                          then r || jsonb_build_object('pay_amount', null, 'service_day',
                                      (r->'service_day') || jsonb_build_object('amount', null, 'expected_amount', null))
                          else r || jsonb_build_object('pay_amount', null) end
                     order by ord)
      from jsonb_array_elements(p_card->'rows') with ordinality as t(r, ord)), '[]'::jsonb))
$$;

-- Visitas aprobadas del mes de p_month (por local_date), la más reciente primero. Mismas tarjetas que To approve
-- (visit_card) más quién aprobó y cuándo. Mismo permiso que To approve. Los montos solo con empleados_ver_pagos
-- (D-200: la regla de seguridad más estricta; la pantalla tampoco los muestra sin el permiso).
create function work_approved(p_month date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_from date := date_trunc('month', coalesce(p_month, cc_today()))::date;
  v_pay boolean := has_permission('empleados_ver_pagos');
begin
  if not (has_permission('work_aprobar') or has_permission('work_editar') or has_permission('work_revisar_gps')) then
    raise exception 'No tienes permiso para ver el trabajo aprobado' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(case when v_pay then x.card else work_card_strip_pay(x.card) end order by x.starts_at desc, x.id)
      from (select v.id, v.starts_at,
                   visit_card(v) || jsonb_build_object('approved_at', v.approved_at, 'approved_by', p.full_name) as card
              from visits v left join profiles p on p.id = v.approved_by
             where v.approved_at is not null and not v.removed
               and v.local_date >= v_from and v.local_date < (v_from + interval '1 month')::date) x), '[]'::jsonb);
end $$;

revoke all on function work_card_strip_pay(jsonb) from public, anon, authenticated;
revoke all on function work_approved(date) from public, anon;
grant execute on function work_approved(date) to authenticated;
