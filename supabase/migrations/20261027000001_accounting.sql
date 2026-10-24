-- Hito 7, orden 25: Accounting (ingresos esperados, extras, gastos, gastos recurrentes, costo de personal, profit,
-- dashboard y exportes).
-- Fuente: current/flujo.md ("Operaciones 4: Accounting", "Listas de partida"), current/permisos.md, D-010, D-053,
-- D-063 a D-069, D-098, D-101 a D-103, D-125, D-130, D-210, D-214, D-215, D-238.
-- Permisos (current/permisos.md): ingresos_ver_registrar (ver ingresos y ajustarlos, D-238), ingresos_marcar_recibidos,
-- personal_ver_costo, gastos_ver, gastos_registrar_editar, gastos_recurrentes, dashboard_global, dashboard_cuenta,
-- reportes_exportar. Las cifras de una cuenta (ingreso por jobsite = su tarifa) exigen además clientes_ver_tarifa
-- (D-125, D-200: la regla más estricta ante una duda).
-- Nada se lee ni se escribe directo: todo por funciones security definer que validan el permiso y dejan historial.

-- Apoyo ------------------------------------------------------------------------------------------------------
create function month_start(p date) returns date language sql immutable as $$
  select date_trunc('month', p)::date
$$;
create function month_end(p date) returns date language sql immutable as $$
  select (date_trunc('month', p) + interval '1 month' - interval '1 day')::date
$$;
-- Día "d" de un mes; si el mes es más corto, su último día (un contrato del 31 se genera el 30 o el 28).
create function month_day(p_month date, p_day int) returns date language sql immutable as $$
  select least(date_trunc('month', p_month)::date + (p_day - 1), (date_trunc('month', p_month) + interval '1 month' - interval '1 day')::date)
$$;
-- D-200: Accounting empieza en octubre de 2026; no se crean ingresos ni gastos de meses anteriores.
create function accounting_floor() returns date language sql immutable as $$ select date '2026-10-01' $$;

-- Categorías de gastos (D-130): lista de Ajustes, solo la edita el Super Admin (D-113, D-114) ----------------------
create table expense_categories (
  id         uuid primary key default gen_random_uuid(),
  label_es   text not null check (btrim(label_es) <> ''),
  label_en   text not null check (btrim(label_en) <> ''),
  sort       int  not null,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);
insert into expense_categories (label_es, label_en, sort) values
  ('Suministros', 'Supplies', 1),
  ('Equipo', 'Equipment', 2),
  ('Seguro', 'Insurance', 3),
  ('Vehículos', 'Vehicles', 4),
  ('Software', 'Software', 5),
  ('Otro', 'Other', 6);

-- Ingresos esperados: uno por jobsite y mes (D-215). amount es lo calculado con la tarifa vigente; null mientras el
-- mes solo tiene extras y aún no se genera. El ajuste a mano (D-238) va aparte, con nota obligatoria.
create table income_expected (
  id              uuid primary key default gen_random_uuid(),
  jobsite_id      uuid not null references jobsites(id) on delete cascade,
  month           date not null check (month = date_trunc('month', month)::date),
  amount          numeric(12, 2) check (amount is null or amount >= 0),
  generated_at    timestamptz,
  adjusted_amount numeric(12, 2) check (adjusted_amount is null or adjusted_amount >= 0),
  adjust_note     text,
  adjusted_by     uuid references profiles(id),
  adjusted_at     timestamptz,
  received        boolean not null default false,
  received_on     date,
  received_by     uuid references profiles(id),
  received_at     timestamptz,
  created_at      timestamptz not null default now(),
  unique (jobsite_id, month),
  constraint income_adjust_note check ((adjusted_amount is null) = (adjust_note is null)),
  constraint income_received_on check (received = (received_on is not null))
);

-- Líneas de extra (D-238): un quote de extra aceptado suma su total al ingreso del mes del servicio.
create table income_extras (
  id               uuid primary key default gen_random_uuid(),
  jobsite_id       uuid not null references jobsites(id) on delete cascade,
  month            date not null check (month = date_trunc('month', month)::date),
  amount           numeric(12, 2) not null check (amount >= 0),
  label            text not null,
  service_date     date,
  quote_version_id uuid unique references quote_versions(id) on delete set null,
  created_at       timestamptz not null default now()
);
create index income_extras_month on income_extras (jobsite_id, month);

-- Gastos recurrentes (D-066, D-103, D-215): mensuales o anuales, con pausa; generan su gasto solos.
create table recurring_expenses (
  id           uuid primary key default gen_random_uuid(),
  name         text not null check (btrim(name) <> '' and length(name) <= 120),
  category_id  uuid not null references expense_categories(id),
  jobsite_id   uuid references jobsites(id) on delete cascade,
  amount       numeric(12, 2) not null check (amount >= 0),
  frequency    text not null check (frequency in ('monthly', 'yearly')),
  day          int not null check (day between 1 and 31),
  month        int check (month between 1 and 12),
  active       boolean not null default true,
  -- Desde cuándo genera: al crearlo y al reactivarlo (lo pausado no se recupera después).
  active_since date not null,
  created_by   uuid references profiles(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint recurring_month check ((frequency = 'yearly') = (month is not null))
);

-- Gastos (D-065, D-098): categoría, fecha, monto, nota y jobsite opcional (sin jobsite = global de Cid Clean).
create table expenses (
  id           uuid primary key default gen_random_uuid(),
  category_id  uuid not null references expense_categories(id),
  spent_on     date not null,
  amount       numeric(12, 2) not null check (amount >= 0),
  note         text check (note is null or length(note) <= 500),
  jobsite_id   uuid references jobsites(id) on delete cascade,
  recurring_id uuid references recurring_expenses(id) on delete set null,
  period       date,
  created_by   uuid references profiles(id),
  created_at   timestamptz not null default now(),
  updated_by   uuid references profiles(id),
  updated_at   timestamptz not null default now(),
  unique (recurring_id, period)
);
create index expenses_spent_on on expenses (spent_on);

create trigger recurring_expenses_touch before update on recurring_expenses for each row execute function touch_updated_at();
create trigger expenses_touch before update on expenses for each row execute function touch_updated_at();

alter table expense_categories enable row level security;
alter table income_expected enable row level security;
alter table income_extras enable row level security;
alter table recurring_expenses enable row level security;
alter table expenses enable row level security;
-- Categorías: las leen quienes ven o registran gastos y el Super Admin; solo el Super Admin las cambia (D-114).
create policy expense_categories_read on expense_categories for select to authenticated
  using (has_permission('gastos_ver') or has_permission('gastos_registrar_editar') or has_permission('gastos_recurrentes')
         or has_permission('reportes_exportar'));
create policy expense_categories_insert on expense_categories for insert to authenticated with check (is_super_admin());
create policy expense_categories_update on expense_categories for update to authenticated
  using (is_super_admin()) with check (is_super_admin());
create policy expense_categories_delete on expense_categories for delete to authenticated using (is_super_admin());
revoke all on expense_categories, income_expected, income_extras, recurring_expenses, expenses from anon;
revoke truncate, references, trigger on expense_categories from authenticated;
revoke all on income_expected, income_extras, recurring_expenses, expenses from authenticated;

-- Historial de las categorías (cambio de configuración del Super Admin), como los motivos de lead perdido.
create function log_expense_category_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into change_log (actor_id, action, entity, entity_id, detail)
    values (current_profile_id(), 'categoria_creada', 'expense_categories', new.id,
            jsonb_build_object('label_es', new.label_es, 'label_en', new.label_en));
    return new;
  elsif tg_op = 'UPDATE' then
    if (old.label_es, old.label_en, old.active, old.sort) is distinct from (new.label_es, new.label_en, new.active, new.sort) then
      insert into change_log (actor_id, action, entity, entity_id, detail)
      values (current_profile_id(), case when old.active and not new.active then 'categoria_desactivada' else 'categoria_editada' end,
              'expense_categories', new.id,
              jsonb_build_object('antes', jsonb_build_object('label_es', old.label_es, 'label_en', old.label_en, 'active', old.active),
                                 'despues', jsonb_build_object('label_es', new.label_es, 'label_en', new.label_en, 'active', new.active)));
    end if;
    return new;
  end if;
  insert into change_log (actor_id, action, entity, entity_id, detail)
  values (current_profile_id(), 'categoria_eliminada', 'expense_categories', old.id,
          jsonb_build_object('label_es', old.label_es, 'label_en', old.label_en));
  return old;
end $$;
create trigger expense_categories_log after insert or update or delete on expense_categories
  for each row execute function log_expense_category_change();

-- Papelera de Ajustes (D-113): borra la categoría si nadie la usa; si la usa algún gasto, la desactiva.
create function remove_expense_category(p_id uuid) returns text
language plpgsql security invoker set search_path = public as $$
begin
  if not is_super_admin() then
    raise exception 'Solo el Super Admin edita las categorías' using errcode = '42501';
  end if;
  if not exists (select 1 from expense_categories where id = p_id) then
    raise exception 'La categoría no existe' using errcode = 'P0002';
  end if;
  if exists (select 1 from expenses where category_id = p_id) or exists (select 1 from recurring_expenses where category_id = p_id) then
    update expense_categories set active = false where id = p_id;
    return 'deactivated';
  end if;
  delete from expense_categories where id = p_id;
  return 'deleted';
end $$;

-- Reglas de cálculo -------------------------------------------------------------------------------------------

-- Día en que se genera el ingreso de un mes (D-215): el día de inicio del contrato, mes completo, sin prorrateo.
create function income_due_day(p_start date, p_month date) returns date language sql immutable as $$
  select case when month_start(p_start) = month_start(p_month) then p_start else month_day(p_month, extract(day from p_start)::int) end
$$;

-- Total de un mes de un jobsite: lo calculado (o lo ajustado, D-238) más los extras aceptados.
-- Lo recibido: si el mes está marcado recibido, lo calculado o ajustado más los extras que ya existían al marcarlo
-- (un extra aceptado después queda pendiente, D-200).
create function income_figures(e income_expected, out base numeric, out extras numeric, out total numeric, out received numeric)
language sql stable security definer set search_path = public as $$
  select coalesce(e.adjusted_amount, e.amount, 0),
         coalesce((select sum(x.amount) from income_extras x where x.jobsite_id = e.jobsite_id and x.month = e.month), 0),
         coalesce(e.adjusted_amount, e.amount, 0)
           + coalesce((select sum(x.amount) from income_extras x where x.jobsite_id = e.jobsite_id and x.month = e.month), 0),
         case when e.received then coalesce(e.adjusted_amount, e.amount, 0)
           + coalesce((select sum(x.amount) from income_extras x where x.jobsite_id = e.jobsite_id and x.month = e.month
                         and x.created_at <= e.received_at), 0) else 0 end
$$;

-- Generación (D-215) ------------------------------------------------------------------------------------------

-- Crea lo que falte, sin repetir: el ingreso esperado de cada jobsite activo con tarifa (el día de inicio del contrato
-- de cada mes, mes completo, con la tarifa vigente) y el gasto de cada recurrente activo. Pausado o terminado no
-- genera; al reactivarse no se recuperan los meses en pausa. Sin fecha de inicio cuenta el día en que nació el
-- jobsite (D-200). Devuelve cuántos ingresos y gastos creó.
create function generate_accounting(p_today date default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  d date := coalesce(p_today, cc_today());
  j record;
  r recurring_expenses;
  m date;
  v_start date;
  v_floor date;
  v_due date;
  v_id uuid;
  n_income int := 0;
  n_expense int := 0;
begin
  for j in
    select x.id, x.name, x.start_date, x.created_at, x.status_changed_at, rt.monthly_rate
      from jobsites x join jobsite_rates rt on rt.jobsite_id = x.id
     where x.status = 'active'
  loop
    v_start := coalesce(j.start_date, local_day(j.created_at));
    v_floor := greatest(month_start(v_start), accounting_floor());
    -- Reactivado después de una pausa: desde el mes en que volvió a activo.
    if j.status_changed_at is not null then v_floor := greatest(v_floor, month_start(local_day(j.status_changed_at))); end if;
    m := v_floor;
    while m <= month_start(d) loop
      v_due := income_due_day(v_start, m);
      if v_due <= d and v_due >= v_start then
        v_id := null;
        insert into income_expected (jobsite_id, month, amount, generated_at)
        values (j.id, m, j.monthly_rate, now())
        on conflict (jobsite_id, month) do update set amount = excluded.amount, generated_at = excluded.generated_at
          where income_expected.amount is null and not income_expected.received
        returning id into v_id;
        if v_id is not null then
          n_income := n_income + 1;
          insert into change_log (actor_id, action, entity, entity_id, detail)
          values (null, 'ingreso_generado', 'jobsites', j.id, jsonb_build_object('name', j.name, 'month', m));
        end if;
      end if;
      m := (m + interval '1 month')::date;
    end loop;
  end loop;

  for r in select * from recurring_expenses where active loop
    m := greatest(month_start(r.active_since), accounting_floor());
    while m <= month_start(d) loop
      if r.frequency = 'monthly' or extract(month from m)::int = r.month then
        v_due := month_day(m, r.day);
        if v_due <= d and v_due >= r.active_since then
          v_id := null;
          insert into expenses (category_id, spent_on, amount, note, jobsite_id, recurring_id, period)
          values (r.category_id, v_due, r.amount, r.name, r.jobsite_id, r.id, m)
          on conflict (recurring_id, period) do nothing
          returning id into v_id;
          if v_id is not null then
            n_expense := n_expense + 1;
            insert into change_log (actor_id, action, entity, entity_id, detail)
            values (null, 'gasto_recurrente_generado', 'expenses', v_id,
                    jsonb_build_object('name', r.name, 'amount', r.amount, 'day', v_due));
          end if;
        end if;
      end if;
      m := (m + interval '1 month')::date;
    end loop;
  end loop;
  return jsonb_build_object('income', n_income, 'expenses', n_expense);
end $$;

-- Al abrir Accounting (D-215): cualquiera con un permiso de Accounting crea lo que falte.
create function accounting_refresh() returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not (has_permission('ingresos_ver_registrar') or has_permission('ingresos_marcar_recibidos') or has_permission('personal_ver_costo')
          or has_permission('gastos_ver') or has_permission('gastos_registrar_editar') or has_permission('gastos_recurrentes')
          or has_permission('dashboard_global') or has_permission('dashboard_cuenta') or has_permission('reportes_exportar')) then
    raise exception 'No tienes permiso para Accounting' using errcode = '42501';
  end if;
  return generate_accounting();
end $$;

-- Costo de personal (D-053, D-214, D-215) ---------------------------------------------------------------------

-- Lo que se debe por mes, empleado y jobsite, solo del trabajo aprobado:
--  * por hora (con horas garantizadas) y tarifa fija por visita: el pago que se calculó al aprobar cada registro;
--  * tarifa fija por semana o por mes: la tarifa de cada semana (domingo a sábado, D-231) o mes con algún trabajo
--    aprobado en ese jobsite, prorrateada por días si la asignación o el pago empiezan o terminan a mitad (D-210);
--    una semana que cruza dos meses se reparte por días entre ambos (D-200).
-- minutes: los minutos que se pagan (horas reales o garantizadas) de los registros aprobados.
create function staff_cost_rows(p_from date, p_to date, p_jobsite uuid default null)
returns table (month date, profile_id uuid, jobsite_id uuid, minutes int, amount numeric)
language sql stable security definer set search_path = public as $$
  with rng as (select month_start(p_from) f, month_end(p_to) t),
  approved as (
    select w.*, v.jobsite_id, v.local_date
      from work_entries w join visits v on v.id = w.visit_id, rng
     where v.approved_at is not null and v.local_date between rng.f and rng.t
       and (p_jobsite is null or v.jobsite_id = p_jobsite)
  ),
  per_entry as (
    select month_start(a.local_date) as month, a.profile_id, a.jobsite_id,
           coalesce(a.pay_minutes, 0) minutes, coalesce(a.pay_amount, 0) amount
      from approved a
  ),
  -- Tramos de pago fijo por semana o por mes: cada fila de pago vale hasta el día antes de la siguiente.
  segs as (
    select a.id assignment_id, a.profile_id, a.jobsite_id, p.fixed_amount, p.fixed_period,
           greatest(p.effective_from, a.start_date) seg_from,
           -- least() ignora los null: sin pago siguiente ni fecha de fin, el tramo sigue abierto (null).
           least(lead(p.effective_from) over (partition by a.id order by p.effective_from) - 1, a.end_date) seg_to,
           p.kind
      from jobsite_assignments a join assignment_pay p on p.assignment_id = a.id
     where (p_jobsite is null or a.jobsite_id = p_jobsite)
  ),
  fixed_segs as (select * from segs where kind = 'fixed' and fixed_period in ('week', 'month')),
  monthly as (
    select m::date as month, s.profile_id, s.jobsite_id,
           prorate_fixed(s.fixed_amount, 'month', m::date, s.seg_from, s.seg_to) amount
      from fixed_segs s, rng, generate_series(rng.f, rng.t, interval '1 month') m
     where s.fixed_period = 'month'
       and s.seg_from <= month_end(m::date) and (s.seg_to is null or s.seg_to >= m::date)
       and exists (select 1 from approved a where a.profile_id = s.profile_id and a.jobsite_id = s.jobsite_id
                     and a.local_date between m::date and month_end(m::date))
  ),
  weeks as (
    select wk::date sunday from rng, generate_series(week_monday(rng.f), rng.t, interval '7 days') wk
  ),
  weekly as (
    select month_start(dd.part_from) as month, s.profile_id, s.jobsite_id,
           prorate_fixed(s.fixed_amount, 'week', w.sunday, greatest(s.seg_from, dd.part_from), least(coalesce(s.seg_to, dd.part_to), dd.part_to)) amount
      from fixed_segs s cross join weeks w
      cross join lateral (
        -- La parte de la semana dentro de cada mes del rango.
        select greatest(w.sunday, month_start(x::date), (select f from rng)) part_from,
               least(w.sunday + 6, month_end(x::date), (select t from rng)) part_to
          from generate_series(month_start(w.sunday), month_start(w.sunday + 6), interval '1 month') x) dd
     where s.fixed_period = 'week'
       and dd.part_from <= dd.part_to
       and s.seg_from <= w.sunday + 6 and (s.seg_to is null or s.seg_to >= w.sunday)
       and exists (select 1 from approved a where a.profile_id = s.profile_id and a.jobsite_id = s.jobsite_id
                     and a.local_date between w.sunday and w.sunday + 6)
  ),
  all_rows as (
    select month, profile_id, jobsite_id, minutes, amount from per_entry
    union all select month, profile_id, jobsite_id, 0, amount from monthly
    union all select month, profile_id, jobsite_id, 0, amount from weekly
  )
  select r.month, r.profile_id, r.jobsite_id, sum(r.minutes)::int, round(sum(r.amount), 2)
    from all_rows r
   group by 1, 2, 3
  having sum(r.amount) > 0 or sum(r.minutes) > 0
$$;

-- Resumen de un rango (meses completos) global o de una cuenta: esperado, recibido, pendiente, personal, gastos y
-- profit sobre lo esperado (D-215). Sin permisos ni historial: lo usan las funciones de abajo.
create function accounting_totals(p_from date, p_to date, p_jobsite uuid default null,
  out expected numeric, out received numeric, out pending numeric, out staff numeric, out expenses numeric, out profit numeric)
language plpgsql stable security definer set search_path = public as $$
declare
  f date := month_start(p_from);
  t date := month_end(p_to);
begin
  select coalesce(sum((income_figures(e)).total), 0), coalesce(sum((income_figures(e)).received), 0)
    into expected, received
    from income_expected e
   where e.month between f and t and (p_jobsite is null or e.jobsite_id = p_jobsite);
  pending := expected - received;
  select coalesce(sum(s.amount), 0) into staff from staff_cost_rows(f, t, p_jobsite) s;
  select coalesce(sum(x.amount), 0) into expenses
    from expenses x where x.spent_on between f and t and (p_jobsite is null or x.jobsite_id = p_jobsite);
  profit := expected - staff - expenses;
end $$;

-- Lecturas ---------------------------------------------------------------------------------------------------

create function accounting_range_valid(p_from date, p_to date) returns void
language plpgsql immutable as $$
begin
  if p_from is null or p_to is null or p_to < p_from or p_to > p_from + interval '5 years' then
    raise exception 'Rango no válido' using errcode = '22023';
  end if;
end $$;

-- Jobsites para los selectores de Accounting (cuenta, gasto de un jobsite). Sin cifras.
create function accounting_jobsites() returns table (jobsite_id uuid, jobsite_name text, client_name text, status jobsite_status)
language plpgsql stable security definer set search_path = public as $$
begin
  if not (has_permission('ingresos_ver_registrar') or has_permission('gastos_ver') or has_permission('gastos_registrar_editar')
          or has_permission('gastos_recurrentes') or has_permission('dashboard_cuenta') or has_permission('dashboard_global')
          or has_permission('personal_ver_costo') or has_permission('reportes_exportar')) then
    raise exception 'No tienes permiso para Accounting' using errcode = '42501';
  end if;
  return query select j.id, j.name, c.name, j.status from jobsites j join clients c on c.id = j.client_id order by c.name, j.name;
end $$;

-- Dashboard (D-068, D-069, D-102): global con dashboard_global; por cuenta con dashboard_cuenta (o global) y ver
-- tarifa. Devuelve el total del rango y cada mes, y la alerta de margen (D-010: costo proyectado de personal igual o
-- mayor que lo que cobra el cliente). Abrir una cuenta queda en el historial (D-125).
create function accounting_dashboard(p_from date, p_to date, p_jobsite uuid default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  tot record;
  v_months jsonb;
  v_risk jsonb;
  m date;
begin
  perform accounting_range_valid(p_from, p_to);
  if p_jobsite is null then
    if not has_permission('dashboard_global') then
      raise exception 'No tienes permiso para ver el dashboard global' using errcode = '42501';
    end if;
  else
    if not ((has_permission('dashboard_cuenta') or has_permission('dashboard_global')) and has_permission('clientes_ver_tarifa')) then
      raise exception 'No tienes permiso para ver el dashboard de la cuenta' using errcode = '42501';
    end if;
    if not exists (select 1 from jobsites where id = p_jobsite) then raise exception 'El jobsite no existe' using errcode = 'P0002'; end if;
    insert into change_log (actor_id, action, entity, entity_id, detail)
    values (current_profile_id(), 'dashboard_cuenta_abierto', 'jobsites', p_jobsite,
            jsonb_build_object('name', (select name from jobsites where id = p_jobsite), 'desde', month_start(p_from), 'hasta', month_start(p_to)));
  end if;
  perform generate_accounting();
  select * into tot from accounting_totals(p_from, p_to, p_jobsite);
  v_months := '[]'::jsonb;
  m := month_start(p_from);
  while m <= month_start(p_to) loop
    v_months := v_months || (select jsonb_build_object('month', m, 'expected', x.expected, 'received', x.received, 'pending', x.pending,
                                                       'staff', x.staff, 'expenses', x.expenses, 'profit', x.profit)
                               from accounting_totals(m, m, p_jobsite) x);
    m := (m + interval '1 month')::date;
  end loop;
  select coalesce(jsonb_agg(jsonb_build_object('jobsite_id', j.id, 'name', j.name) order by j.name), '[]'::jsonb) into v_risk
    from jobsites j, lateral jobsite_margin_calc(j.id) mc
   where j.status = 'active' and (p_jobsite is null or j.id = p_jobsite) and mc.rate is not null and mc.cost > 0 and mc.cost >= mc.rate;
  return jsonb_build_object('expected', tot.expected, 'received', tot.received, 'pending', tot.pending, 'staff', tot.staff,
                            'expenses', tot.expenses, 'profit', tot.profit, 'months', v_months, 'at_risk', v_risk);
end $$;

-- Ingresos (D-063, D-064, D-238): por jobsite y mes, con lo calculado, el ajuste y su nota, Recibido con su fecha
-- real y los extras debajo. Exige ingresos_ver_registrar y ver tarifa; la apertura queda en el historial.
create function list_income(p_from date, p_to date, p_jobsite uuid default null) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform accounting_range_valid(p_from, p_to);
  if not (has_permission('ingresos_ver_registrar') and has_permission('clientes_ver_tarifa')) then
    raise exception 'No tienes permiso para ver ingresos' using errcode = '42501';
  end if;
  perform generate_accounting();
  insert into change_log (actor_id, action, entity, entity_id, detail)
  values (current_profile_id(), 'ingresos_abiertos', case when p_jobsite is null then 'income_expected' else 'jobsites' end, p_jobsite,
          jsonb_build_object('desde', month_start(p_from), 'hasta', month_start(p_to)));
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', e.id, 'jobsite_id', e.jobsite_id, 'jobsite', j.name, 'client', c.name, 'month', e.month,
      'amount', e.amount, 'adjusted_amount', e.adjusted_amount, 'adjust_note', e.adjust_note,
      'adjusted_by', (select full_name from profiles where id = e.adjusted_by), 'adjusted_at', e.adjusted_at,
      'base', f.base, 'extras_total', f.extras, 'total', f.total, 'received_amount', f.received,
      'received', e.received, 'received_on', e.received_on,
      'extras', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'label', x.label, 'amount', x.amount,
                                                              'service_date', x.service_date, 'created_at', x.created_at,
                                                              'after_received', e.received and x.created_at > e.received_at)
                                           order by x.created_at)
                            from income_extras x where x.jobsite_id = e.jobsite_id and x.month = e.month), '[]'::jsonb))
      order by e.month desc, c.name, j.name)
      from income_expected e
      join jobsites j on j.id = e.jobsite_id
      join clients c on c.id = j.client_id
      cross join lateral income_figures(e) f
     where e.month between month_start(p_from) and month_start(p_to) and (p_jobsite is null or e.jobsite_id = p_jobsite)), '[]'::jsonb);
end $$;

-- Gastos (D-065, D-098): con gastos_ver. Global (todos) o de un jobsite.
create function list_expenses(p_from date, p_to date, p_jobsite uuid default null) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform accounting_range_valid(p_from, p_to);
  if not has_permission('gastos_ver') then
    raise exception 'No tienes permiso para ver gastos' using errcode = '42501';
  end if;
  perform generate_accounting();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', x.id, 'category_id', x.category_id, 'category_es', k.label_es, 'category_en', k.label_en,
      'spent_on', x.spent_on, 'amount', x.amount, 'note', x.note, 'jobsite_id', x.jobsite_id, 'jobsite', j.name,
      'recurring', x.recurring_id is not null)
      order by x.spent_on desc, x.created_at desc)
      from expenses x join expense_categories k on k.id = x.category_id left join jobsites j on j.id = x.jobsite_id
     where x.spent_on between month_start(p_from) and month_end(p_to) and (p_jobsite is null or x.jobsite_id = p_jobsite)), '[]'::jsonb);
end $$;

-- Gastos recurrentes (D-066, D-103): con gastos_recurrentes.
create function list_recurring_expenses() returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not has_permission('gastos_recurrentes') then
    raise exception 'No tienes permiso para gestionar gastos recurrentes' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', r.id, 'name', r.name, 'category_id', r.category_id, 'category_es', k.label_es, 'category_en', k.label_en,
      'jobsite_id', r.jobsite_id, 'jobsite', j.name, 'amount', r.amount, 'frequency', r.frequency, 'day', r.day,
      'month', r.month, 'active', r.active)
      order by r.active desc, r.name)
      from recurring_expenses r join expense_categories k on k.id = r.category_id left join jobsites j on j.id = r.jobsite_id), '[]'::jsonb);
end $$;

-- Costo de personal (D-067, D-215): lo que se debe a cada empleado por mes, con su detalle por jobsite. Montos y
-- horas, sin tarifas. Con personal_ver_costo; la apertura queda en el historial (D-125).
create function staff_cost(p_from date, p_to date, p_jobsite uuid default null) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform accounting_range_valid(p_from, p_to);
  if not has_permission('personal_ver_costo') then
    raise exception 'No tienes permiso para ver el costo de personal' using errcode = '42501';
  end if;
  insert into change_log (actor_id, action, entity, entity_id, detail)
  values (current_profile_id(), 'costo_personal_abierto', case when p_jobsite is null then 'profiles' else 'jobsites' end, p_jobsite,
          jsonb_build_object('desde', month_start(p_from), 'hasta', month_start(p_to)));
  return coalesce((
    select jsonb_agg(x order by x->>'name') from (
      select jsonb_build_object(
        'profile_id', s.profile_id, 'name', p.full_name, 'worker_type', p.worker_type,
        'minutes', sum(s.minutes), 'amount', sum(s.amount),
        'jobsites', jsonb_agg(jsonb_build_object('jobsite_id', s.jobsite_id, 'jobsite', j.name, 'month', s.month,
                                                 'minutes', s.minutes, 'amount', s.amount) order by s.month, j.name)) x
        from staff_cost_rows(p_from, p_to, p_jobsite) s
        join profiles p on p.id = s.profile_id
        join jobsites j on j.id = s.jobsite_id
       group by s.profile_id, p.full_name, p.worker_type) z), '[]'::jsonb);
end $$;

-- Exportes (D-215): profit, costo de personal por empleado, gastos por categoría e ingresos recibidos y pendientes,
-- por mes o rango. Devuelve las filas; el CSV y el PDF se arman en la app. Cada exporte exige reportes_exportar y el
-- permiso de lo que muestra, y queda en el historial.
create function accounting_export(p_kind text, p_from date, p_to date) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  rows jsonb;
  m date;
begin
  perform accounting_range_valid(p_from, p_to);
  if not has_permission('reportes_exportar') then
    raise exception 'No tienes permiso para exportar reportes' using errcode = '42501';
  end if;
  if p_kind = 'profit' and not has_permission('dashboard_global')
     or p_kind = 'staff' and not has_permission('personal_ver_costo')
     or p_kind = 'expenses' and not has_permission('gastos_ver')
     or p_kind = 'income' and not (has_permission('ingresos_ver_registrar') and has_permission('clientes_ver_tarifa')) then
    raise exception 'No tienes permiso para este reporte' using errcode = '42501';
  end if;
  perform generate_accounting();
  if p_kind = 'profit' then
    rows := '[]'::jsonb;
    m := month_start(p_from);
    while m <= month_start(p_to) loop
      rows := rows || (select jsonb_build_object('month', m, 'expected', x.expected, 'received', x.received, 'pending', x.pending,
                                                 'staff', x.staff, 'expenses', x.expenses, 'profit', x.profit)
                         from accounting_totals(m, m, null) x);
      m := (m + interval '1 month')::date;
    end loop;
  elsif p_kind = 'staff' then
    select coalesce(jsonb_agg(jsonb_build_object('month', s.month, 'employee', p.full_name, 'worker_type', p.worker_type,
                                                 'jobsite', j.name, 'hours', round(s.minutes / 60.0, 2), 'amount', s.amount)
                              order by s.month, p.full_name, j.name), '[]'::jsonb) into rows
      from staff_cost_rows(p_from, p_to, null) s join profiles p on p.id = s.profile_id join jobsites j on j.id = s.jobsite_id;
  elsif p_kind = 'expenses' then
    select coalesce(jsonb_agg(jsonb_build_object('month', z.month, 'category_es', z.label_es, 'category_en', z.label_en, 'amount', z.amount)
                              order by z.month, z.sort), '[]'::jsonb) into rows
      from (select month_start(x.spent_on) as month, k.label_es, k.label_en, k.sort, sum(x.amount) amount
              from expenses x join expense_categories k on k.id = x.category_id
             where x.spent_on between month_start(p_from) and month_end(p_to)
             group by 1, 2, 3, 4) z;
  elsif p_kind = 'income' then
    select coalesce(jsonb_agg(jsonb_build_object('month', e.month, 'client', c.name, 'jobsite', j.name, 'expected', f.total,
                                                 'received', f.received, 'pending', f.total - f.received,
                                                 'received_on', e.received_on, 'adjust_note', e.adjust_note)
                              order by e.month, c.name, j.name), '[]'::jsonb) into rows
      from income_expected e join jobsites j on j.id = e.jobsite_id join clients c on c.id = j.client_id
      cross join lateral income_figures(e) f
     where e.month between month_start(p_from) and month_start(p_to);
  else
    raise exception 'Reporte no válido' using errcode = '22023';
  end if;
  insert into change_log (actor_id, action, entity, entity_id, detail)
  values (current_profile_id(), 'reporte_exportado', 'accounting', null,
          jsonb_build_object('kind', p_kind, 'desde', month_start(p_from), 'hasta', month_start(p_to)));
  return rows;
end $$;

-- Escrituras ---------------------------------------------------------------------------------------------------

-- Ajuste a mano (D-238): solo antes de marcar recibido, con el permiso de ingresos y nota obligatoria. Un monto
-- igual a lo calculado y sin nota quita el ajuste.
create function adjust_income(p_id uuid, p_amount numeric, p_note text) returns void
language plpgsql security definer set search_path = public as $$
declare
  e income_expected;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if not (has_permission('ingresos_ver_registrar') and has_permission('clientes_ver_tarifa')) then
    raise exception 'No tienes permiso para ajustar ingresos' using errcode = '42501';
  end if;
  select * into e from income_expected where id = p_id for update;
  if e.id is null then raise exception 'El ingreso no existe' using errcode = 'P0002'; end if;
  if e.received then raise exception 'El ingreso ya está marcado como recibido' using errcode = '22023'; end if;
  if p_amount is null or p_amount < 0 or p_amount > 10000000 then raise exception 'Monto no válido' using errcode = '22023'; end if;
  if v_note is null then raise exception 'La nota es obligatoria' using errcode = '22023'; end if;
  if length(v_note) > 500 then raise exception 'Nota muy larga' using errcode = '22023'; end if;
  update income_expected
     set adjusted_amount = round(p_amount, 2), adjust_note = v_note, adjusted_by = current_profile_id(), adjusted_at = now()
   where id = p_id;
  insert into change_log (actor_id, action, entity, entity_id, detail)
  values (current_profile_id(), 'ingreso_ajustado', 'jobsites', e.jobsite_id,
          jsonb_build_object('name', (select name from jobsites where id = e.jobsite_id), 'month', e.month,
                             'antes', coalesce(e.adjusted_amount, e.amount), 'despues', round(p_amount, 2), 'nota', v_note));
end $$;

-- Recibido con la fecha real del cobro (D-064). Quitar la marca la deja pendiente otra vez (interruptor de la fila).
create function set_income_received(p_id uuid, p_received boolean, p_on date) returns void
language plpgsql security definer set search_path = public as $$
declare
  e income_expected;
begin
  if not (has_permission('ingresos_marcar_recibidos') and has_permission('ingresos_ver_registrar') and has_permission('clientes_ver_tarifa')) then
    raise exception 'No tienes permiso para marcar ingresos' using errcode = '42501';
  end if;
  select * into e from income_expected where id = p_id for update;
  if e.id is null then raise exception 'El ingreso no existe' using errcode = 'P0002'; end if;
  if p_received then
    if p_on is null or p_on > cc_today() then raise exception 'Fecha de cobro no válida' using errcode = '22023'; end if;
    update income_expected set received = true, received_on = p_on, received_by = current_profile_id(), received_at = now() where id = p_id;
  else
    if not e.received then return; end if;
    update income_expected set received = false, received_on = null, received_by = null, received_at = null where id = p_id;
  end if;
  insert into change_log (actor_id, action, entity, entity_id, detail)
  values (current_profile_id(), case when p_received then 'ingreso_recibido' else 'ingreso_pendiente' end, 'jobsites', e.jobsite_id,
          jsonb_build_object('name', (select name from jobsites where id = e.jobsite_id), 'month', e.month, 'fecha', p_on));
end $$;

-- Gasto nuevo o editado (D-065, D-098). p_id null crea uno nuevo.
create function save_expense(p_id uuid, p_category uuid, p_on date, p_amount numeric, p_note text, p_jobsite uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  old expenses;
  v_id uuid;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if not has_permission('gastos_registrar_editar') then
    raise exception 'No tienes permiso para registrar gastos' using errcode = '42501';
  end if;
  if p_on is null or p_on < accounting_floor() - interval '1 year' or p_on > cc_today() + interval '1 year' then
    raise exception 'Fecha no válida' using errcode = '22023';
  end if;
  if p_amount is null or p_amount < 0 or p_amount > 10000000 then raise exception 'Monto no válido' using errcode = '22023'; end if;
  if v_note is not null and length(v_note) > 500 then raise exception 'Nota muy larga' using errcode = '22023'; end if;
  if p_jobsite is not null and not exists (select 1 from jobsites where id = p_jobsite) then
    raise exception 'El jobsite no existe' using errcode = 'P0002';
  end if;
  if p_id is null then
    if not exists (select 1 from expense_categories where id = p_category and active) then
      raise exception 'Categoría no válida' using errcode = '22023';
    end if;
    insert into expenses (category_id, spent_on, amount, note, jobsite_id, created_by, updated_by)
    values (p_category, p_on, round(p_amount, 2), v_note, p_jobsite, current_profile_id(), current_profile_id())
    returning id into v_id;
    insert into change_log (actor_id, action, entity, entity_id, detail)
    values (current_profile_id(), 'gasto_registrado', 'expenses', v_id,
            jsonb_build_object('amount', round(p_amount, 2), 'day', p_on, 'jobsite', (select name from jobsites where id = p_jobsite)));
    return v_id;
  end if;
  select * into old from expenses where id = p_id for update;
  if old.id is null then raise exception 'El gasto no existe' using errcode = 'P0002'; end if;
  -- Una categoría desactivada se conserva en el gasto que ya la tenía.
  if p_category <> old.category_id and not exists (select 1 from expense_categories where id = p_category and active) then
    raise exception 'Categoría no válida' using errcode = '22023';
  end if;
  update expenses set category_id = p_category, spent_on = p_on, amount = round(p_amount, 2), note = v_note, jobsite_id = p_jobsite,
                      updated_by = current_profile_id()
   where id = p_id;
  insert into change_log (actor_id, action, entity, entity_id, detail)
  values (current_profile_id(), 'gasto_editado', 'expenses', p_id,
          jsonb_build_object('antes', jsonb_build_object('amount', old.amount, 'day', old.spent_on, 'category', old.category_id, 'jobsite', old.jobsite_id),
                             'despues', jsonb_build_object('amount', round(p_amount, 2), 'day', p_on, 'category', p_category, 'jobsite', p_jobsite)));
  return p_id;
end $$;

-- Gasto recurrente nuevo o editado (D-103, D-215). El cambio vale para lo que se genere después.
create function save_recurring_expense(p_id uuid, p_name text, p_category uuid, p_jobsite uuid, p_amount numeric,
                                       p_frequency text, p_day int, p_month int, p_active boolean) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  old recurring_expenses;
  v_id uuid;
  v_name text := btrim(coalesce(p_name, ''));
begin
  if not has_permission('gastos_recurrentes') then
    raise exception 'No tienes permiso para gestionar gastos recurrentes' using errcode = '42501';
  end if;
  if v_name = '' or length(v_name) > 120 then raise exception 'El nombre es obligatorio' using errcode = '22023'; end if;
  if p_amount is null or p_amount < 0 or p_amount > 10000000 then raise exception 'Monto no válido' using errcode = '22023'; end if;
  if p_frequency not in ('monthly', 'yearly') or p_day is null or p_day not between 1 and 31
     or (p_frequency = 'yearly') <> (p_month is not null) or (p_month is not null and p_month not between 1 and 12) then
    raise exception 'Frecuencia no válida' using errcode = '22023';
  end if;
  if p_jobsite is not null and not exists (select 1 from jobsites where id = p_jobsite) then
    raise exception 'El jobsite no existe' using errcode = 'P0002';
  end if;
  if p_id is null then
    if not exists (select 1 from expense_categories where id = p_category and active) then
      raise exception 'Categoría no válida' using errcode = '22023';
    end if;
    insert into recurring_expenses (name, category_id, jobsite_id, amount, frequency, day, month, active, active_since, created_by)
    values (v_name, p_category, p_jobsite, round(p_amount, 2), p_frequency, p_day, p_month, coalesce(p_active, true), cc_today(),
            current_profile_id())
    returning id into v_id;
    insert into change_log (actor_id, action, entity, entity_id, detail)
    values (current_profile_id(), 'gasto_recurrente_creado', 'recurring_expenses', v_id,
            jsonb_build_object('name', v_name, 'amount', round(p_amount, 2), 'frequency', p_frequency));
  else
    select * into old from recurring_expenses where id = p_id for update;
    if old.id is null then raise exception 'El gasto recurrente no existe' using errcode = 'P0002'; end if;
    if p_category <> old.category_id and not exists (select 1 from expense_categories where id = p_category and active) then
      raise exception 'Categoría no válida' using errcode = '22023';
    end if;
    update recurring_expenses
       set name = v_name, category_id = p_category, jobsite_id = p_jobsite, amount = round(p_amount, 2), frequency = p_frequency,
           day = p_day, month = p_month, active = coalesce(p_active, old.active),
           active_since = case when coalesce(p_active, old.active) and not old.active then cc_today() else old.active_since end
     where id = p_id;
    v_id := p_id;
    insert into change_log (actor_id, action, entity, entity_id, detail)
    values (current_profile_id(),
            case when old.active and not coalesce(p_active, old.active) then 'gasto_recurrente_pausado'
                 when not old.active and coalesce(p_active, old.active) then 'gasto_recurrente_reactivado'
                 else 'gasto_recurrente_editado' end,
            'recurring_expenses', p_id,
            jsonb_build_object('name', v_name, 'antes', jsonb_build_object('amount', old.amount, 'active', old.active),
                               'despues', jsonb_build_object('amount', round(p_amount, 2), 'active', coalesce(p_active, old.active))));
  end if;
  perform generate_accounting();
  return v_id;
end $$;

-- Pausar o reactivar (D-103: interruptor Activo). Al reactivar no se recupera lo pausado.
create function set_recurring_active(p_id uuid, p_active boolean) returns void
language plpgsql security definer set search_path = public as $$
declare
  r recurring_expenses;
begin
  if not has_permission('gastos_recurrentes') then
    raise exception 'No tienes permiso para gestionar gastos recurrentes' using errcode = '42501';
  end if;
  select * into r from recurring_expenses where id = p_id for update;
  if r.id is null then raise exception 'El gasto recurrente no existe' using errcode = 'P0002'; end if;
  if r.active = p_active then return; end if;
  update recurring_expenses set active = p_active, active_since = case when p_active then cc_today() else active_since end where id = p_id;
  insert into change_log (actor_id, action, entity, entity_id, detail)
  values (current_profile_id(), case when p_active then 'gasto_recurrente_reactivado' else 'gasto_recurrente_pausado' end,
          'recurring_expenses', p_id, jsonb_build_object('name', r.name));
  if p_active then perform generate_accounting(); end if;
end $$;

-- Generación diaria (D-215): 6:20 AM de Naples (10:20 UTC en horario de verano). También corre al abrir Accounting.
select cron.schedule('cidclean-accounting', '20 10 * * *', $$select public.generate_accounting()$$);

-- Permisos de ejecución -----------------------------------------------------------------------------------------
revoke execute on function month_start(date), month_end(date), month_day(date, int), accounting_floor(), income_due_day(date, date),
  accounting_range_valid(date, date) from public, anon;
grant execute on function month_start(date), month_end(date), month_day(date, int), accounting_floor(), income_due_day(date, date)
  to authenticated;
revoke execute on function log_expense_category_change(), income_figures(income_expected), generate_accounting(date),
  staff_cost_rows(date, date, uuid), accounting_totals(date, date, uuid), accounting_range_valid(date, date)
  from public, anon, authenticated;
grant execute on function generate_accounting(date) to service_role;
revoke execute on function remove_expense_category(uuid), accounting_refresh(), accounting_jobsites(),
  accounting_dashboard(date, date, uuid), list_income(date, date, uuid), list_expenses(date, date, uuid), list_recurring_expenses(),
  staff_cost(date, date, uuid), accounting_export(text, date, date), adjust_income(uuid, numeric, text),
  set_income_received(uuid, boolean, date), save_expense(uuid, uuid, date, numeric, text, uuid),
  save_recurring_expense(uuid, text, uuid, uuid, numeric, text, int, int, boolean), set_recurring_active(uuid, boolean)
  from public, anon;
grant execute on function remove_expense_category(uuid), accounting_refresh(), accounting_jobsites(),
  accounting_dashboard(date, date, uuid), list_income(date, date, uuid), list_expenses(date, date, uuid), list_recurring_expenses(),
  staff_cost(date, date, uuid), accounting_export(text, date, date), adjust_income(uuid, numeric, text),
  set_income_received(uuid, boolean, date), save_expense(uuid, uuid, date, numeric, text, uuid),
  save_recurring_expense(uuid, text, uuid, uuid, numeric, text, int, int, boolean), set_recurring_active(uuid, boolean)
  to authenticated;
