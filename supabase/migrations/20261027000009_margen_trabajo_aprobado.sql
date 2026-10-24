-- D-243: la alerta de margen (D-010) compara la tarifa mensual con el costo del trabajo APROBADO del mes en curso
-- (horas reales, garantizadas o tarifa fija, igual que Accounting), ya no con una proyección de todos los asignados
-- en todas las visitas. Misma firma: la usan la ficha del jobsite, Cuentas, Accounting y los avisos.
create or replace function jobsite_margin_calc(p_jobsite uuid, out cost numeric, out rate numeric, out incomplete boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  incomplete := false;
  select monthly_rate into rate from jobsite_rates where jobsite_id = p_jobsite;
  select coalesce(sum(r.amount), 0) into cost
    from staff_cost_rows(month_start(cc_today()), cc_today(), p_jobsite) r
   where r.month = month_start(cc_today());
end $$;
revoke execute on function jobsite_margin_calc(uuid) from public, anon, authenticated;
