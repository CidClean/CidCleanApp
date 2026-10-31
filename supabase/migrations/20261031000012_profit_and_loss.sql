-- Orden 72 (D-295): Profit & Loss por año (base de efectivo) y la línea del Schedule C de cada categoría de gasto.

-- 1. Línea del Schedule C (Form 1040) de cada categoría de gasto (D-295). Valores iniciales de D-295; el Super Admin
--    la cambia en Ajustes → Categorías de gastos (la política de update de la tabla ya es solo del Super Admin).
alter table expense_categories add column schedule_c_line text not null default '27a'
  check (schedule_c_line in ('8', '9', '10', '11', '13', '14', '15', '16a', '16b', '17', '18', '20a', '20b', '21', '22', '23',
                             '24a', '24b', '25', '26', '27a'));
update expense_categories set schedule_c_line = case label_es
  when 'Suministros' then '22' when 'Equipo' then '22' when 'Seguro' then '15' when 'Vehículos' then '9'
  when 'Software' then '18' else '27a' end;

-- Nombre en inglés de cada línea (lo usan el P&L, el PDF y el CSV).
create function schedule_c_name(p_line text) returns text language sql immutable set search_path = public as $$
  select case p_line
    when '1' then 'Gross receipts' when '8' then 'Advertising' when '9' then 'Car and truck expenses'
    when '10' then 'Commissions and fees' when '11' then 'Contract labor' when '13' then 'Depreciation'
    when '14' then 'Employee benefit programs' when '15' then 'Insurance' when '16a' then 'Mortgage interest'
    when '16b' then 'Other interest' when '17' then 'Legal and professional services' when '18' then 'Office expense'
    when '20a' then 'Rent or lease: vehicles, machinery, equipment' when '20b' then 'Rent or lease: other business property'
    when '21' then 'Repairs and maintenance' when '22' then 'Supplies' when '23' then 'Taxes and licenses'
    when '24a' then 'Travel' when '24b' then 'Deductible meals' when '25' then 'Utilities' when '26' then 'Wages'
    when '27a' then 'Other expenses' when '31' then 'Net profit' end
$$;

-- 2. Profit & Loss del año (D-295), base de efectivo:
--    - Ingresos: lo COBRADO en el año (income_expected.received_on dentro del año), con los extras cobrados como
--      income_figures, sin el sales tax. El tax de cada cobro sale del quote del que vino el monto (tax / total de la
--      versión); un monto puesto a mano, sin quote, se toma sin tax.
--    - Personal 1099 (días de servicio y fijos) como Contract labor (línea 11) y W-2 como Wages (línea 26), de
--      staff_cost_rows en el año.
--    - Gastos por categoría por spent_on, con la línea del Schedule C de la categoría.
--    Permiso: dashboard_global (el de Accounting que ya ve los totales del negocio: ingresos, personal, gastos y profit).
create function profit_and_loss(p_year int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  y0 date;
  y1 date;
  v_income numeric;
  v_1099 numeric;
  v_w2 numeric;
  v_exp jsonb;
  v_exp_total numeric;
  v_lines jsonb;
begin
  if not has_permission('dashboard_global') then
    raise exception 'No tienes permiso para ver el Profit & Loss' using errcode = '42501';
  end if;
  if p_year is null or p_year < 2000 or p_year > 2100 then
    raise exception 'Año no válido' using errcode = '22023';
  end if;
  y0 := make_date(p_year, 1, 1);
  y1 := make_date(p_year, 12, 31);

  select coalesce(round(sum(x.net), 2), 0) into v_income from (
    -- Mensualidad cobrada (ajustada si se ajustó), sin el tax del quote de la tarifa.
    select coalesce(e.adjusted_amount, e.amount, 0)
             * coalesce((select case when qv.total > 0 then (qv.total - qv.tax) / qv.total end
                           from jobsite_rates r join quote_versions qv on qv.id = r.quote_version_id
                          where r.jobsite_id = e.jobsite_id), 1) net
      from income_expected e
     where e.received and e.received_on between y0 and y1
    union all
    -- Extras cobrados con esa mensualidad (los creados antes de marcar recibido, como income_figures).
    select x.amount * coalesce((select case when qv.total > 0 then (qv.total - qv.tax) / qv.total end
                                  from quote_versions qv where qv.id = x.quote_version_id), 1)
      from income_expected e join income_extras x on x.jobsite_id = e.jobsite_id and x.month = e.month and x.created_at <= e.received_at
     where e.received and e.received_on between y0 and y1) x;

  select coalesce(sum(s.amount) filter (where p.worker_type = '1099'), 0),
         coalesce(sum(s.amount) filter (where p.worker_type is distinct from '1099'), 0)
    into v_1099, v_w2
    from staff_cost_rows(y0, y1, null) s join profiles p on p.id = s.profile_id;

  select coalesce(jsonb_agg(jsonb_build_object('category_id', z.id, 'label_es', z.label_es, 'label_en', z.label_en,
                                               'line', z.schedule_c_line, 'amount', z.amount) order by z.sort), '[]'::jsonb),
         coalesce(sum(z.amount), 0)
    into v_exp, v_exp_total
    from (select k.id, k.label_es, k.label_en, k.sort, k.schedule_c_line, round(sum(x.amount), 2) amount
            from expenses x join expense_categories k on k.id = x.category_id
           where x.spent_on between y0 and y1
           group by k.id) z;

  -- Vista por línea del Schedule C: 1, 11, 26 y las de gastos, en el orden del formulario; 31 es la ganancia neta.
  select jsonb_agg(jsonb_build_object('line', l.line, 'name', schedule_c_name(l.line), 'amount', l.amount)
                   order by l.ord, l.line)
    into v_lines
    from (
      select '1' line, 1 ord, v_income amount
      union all
      select ln, case when ln ~ '^\d+$' then ln::int else substring(ln from '^\d+')::int end, sum(amt)
        from (select '11' ln, v_1099 amt where v_1099 <> 0
              union all select '26', v_w2 where v_w2 <> 0
              union all select e->>'line', (e->>'amount')::numeric from jsonb_array_elements(v_exp) e) g
       group by ln
    ) l;

  insert into change_log (actor_id, action, entity, entity_id, detail)
  values (current_profile_id(), 'profit_and_loss_abierto', 'accounting', null, jsonb_build_object('year', p_year));

  return jsonb_build_object(
    'year', p_year, 'basis', 'cash',
    'income', v_income,
    'contract_labor', round(v_1099, 2),
    'wages', round(v_w2, 2),
    'expenses', v_exp,
    'expenses_total', round(v_exp_total, 2),
    'net', round(v_income - v_1099 - v_w2 - v_exp_total, 2),
    'schedule_c', v_lines || jsonb_build_array(jsonb_build_object('line', '31', 'name', schedule_c_name('31'),
                                                                  'amount', round(v_income - v_1099 - v_w2 - v_exp_total, 2))));
end $$;
revoke execute on function profit_and_loss(int) from public, anon;
grant execute on function profit_and_loss(int) to authenticated;
