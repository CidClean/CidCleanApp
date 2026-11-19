-- Orden 151 (D-338 pendiente, D-339, D-340 (2)): reactivar un jobsite terminado.
--  · jobsite_periods: cada periodo terminado que se cierra al reactivar (inicio, fin y tarifa de entonces). El periodo
--    nuevo vive en jobsites.start_date y jobsite_rates como siempre; el anterior no se borra.
--  · reactivate_jobsite: de Terminado a Activo para quien hoy cambia el estado (clientes_cambiar_estado); la tarifa
--    nueva pide además ver tarifas (clientes_ver_tarifa); sin ese permiso se conserva la anterior (D-200). La fecha de
--    inicio es hoy o después (D-200, como asignar personal). Queda en el historial.
--  · Accounting, P&L y staff_cost_rows: no cuentan el hueco. El generador de ingresos ya parte desde el mes en que el
--    jobsite volvió a activo (status_changed_at) y desde la fecha de inicio nueva (income_due_day), así que los meses
--    terminados no generan ingreso; los meses ya generados conservan su monto (income_expected guarda la cifra) y el
--    costo de personal sale solo de trabajo aprobado y asignaciones vigentes, que en el hueco no existen.
--  · jobsite_period_summary: aviso y resumen del jobsite terminado (D-340 pantalla 3): fecha de fin, tarifa anterior,
--    visitas aprobadas, ingresos y personal del periodo. Tarifa e ingresos con clientes_ver_tarifa; personal solo con
--    empleados_ver_pagos (como hoy).
-- No toca Schedule and Work (D-340).

create table jobsite_periods (
  id           uuid primary key default gen_random_uuid(),
  jobsite_id   uuid not null references jobsites(id) on delete cascade,
  start_on     date,
  end_on       date not null,
  monthly_rate numeric(12, 2) check (monthly_rate is null or monthly_rate >= 0),
  created_by   uuid references profiles(id),
  created_at   timestamptz not null default now()
);
create index jobsite_periods_jobsite on jobsite_periods (jobsite_id, end_on);
alter table jobsite_periods enable row level security;
revoke all on jobsite_periods from anon, authenticated;

create function reactivate_jobsite(p_jobsite uuid, p_start_on date, p_monthly_rate numeric default null) returns void
language plpgsql security definer set search_path = public as $$
declare
  j jobsites;
  v_old numeric;
begin
  if not has_permission('clientes_cambiar_estado') then
    raise exception 'No tienes permiso para cambiar el estado' using errcode = '42501';
  end if;
  if p_monthly_rate is not null and not has_permission('clientes_ver_tarifa') then
    raise exception 'No tienes permiso para cambiar la tarifa' using errcode = '42501';
  end if;
  select * into j from jobsites where id = p_jobsite for update;
  if j.id is null then raise exception 'El jobsite no existe' using errcode = 'P0002'; end if;
  if j.status <> 'terminated' then
    raise exception 'Solo se reactiva un jobsite terminado' using errcode = '22023';
  end if;
  if p_start_on is null or p_start_on < cc_today() then
    raise exception 'La fecha de inicio no puede ser anterior a hoy' using errcode = '22023';
  end if;
  if p_monthly_rate is not null and (p_monthly_rate < 0 or p_monthly_rate > 9999999999) then
    raise exception 'Tarifa no válida' using errcode = '22023';
  end if;
  select monthly_rate into v_old from jobsite_rates where jobsite_id = p_jobsite;

  insert into jobsite_periods (jobsite_id, start_on, end_on, monthly_rate, created_by)
  values (p_jobsite, coalesce(j.start_date, local_day(j.created_at)),
          local_day(coalesce(j.status_changed_at, now())), v_old, current_profile_id());

  update jobsites set status = 'active', start_date = p_start_on, status_changed_at = now() where id = p_jobsite;
  if p_monthly_rate is not null then
    insert into jobsite_rates (jobsite_id, monthly_rate, set_by, set_at)
    values (p_jobsite, round(p_monthly_rate, 2), current_profile_id(), now())
    on conflict (jobsite_id) do update set monthly_rate = excluded.monthly_rate, set_by = excluded.set_by, set_at = excluded.set_at;
  end if;

  insert into change_log (actor_id, action, entity, entity_id, detail)
  values (current_profile_id(), 'jobsite_reactivado', 'jobsites', p_jobsite,
          jsonb_build_object('name', j.name, 'inicio', p_start_on, 'fin_anterior', local_day(coalesce(j.status_changed_at, now())),
                             'antes', 'terminated', 'despues', 'active'));
  if p_monthly_rate is not null and v_old is distinct from round(p_monthly_rate, 2) then
    insert into change_log (actor_id, action, entity, entity_id, detail)
    values (current_profile_id(), 'tarifa_cambiada', 'jobsites', p_jobsite,
            jsonb_build_object('name', j.name, 'antes', v_old, 'despues', round(p_monthly_rate, 2)));
  end if;
end $$;

create function jobsite_period_summary(p_jobsite uuid)
returns table (ended_on date, period_from date, period_to date, monthly_rate numeric, visits integer, income numeric, staff numeric)
language plpgsql stable security definer set search_path = public as $$
declare
  j jobsites;
  v_from date;
  v_to date;
  v_rate boolean := has_permission('clientes_ver_tarifa');
  v_pay boolean := has_permission('empleados_ver_pagos');
begin
  if not has_permission('clientes_ver') then
    raise exception 'No tienes permiso para ver clientes' using errcode = '42501';
  end if;
  select * into j from jobsites where id = p_jobsite;
  if j.id is null then raise exception 'El jobsite no existe' using errcode = 'P0002'; end if;
  if j.status <> 'terminated' then return; end if;
  v_to := local_day(coalesce(j.status_changed_at, now()));
  v_from := least(coalesce(j.start_date, local_day(j.created_at)), v_to);
  return query
    select v_to, v_from, v_to,
           case when v_rate then (select r.monthly_rate from jobsite_rates r where r.jobsite_id = j.id) end,
           (select count(*)::int from visits v
             where v.jobsite_id = j.id and not v.removed and v.approved_at is not null and v.local_date between v_from and v_to),
           case when v_rate then
             coalesce((select sum(coalesce(e.adjusted_amount, e.amount, 0)) from income_expected e
                        where e.jobsite_id = j.id and e.month between month_start(v_from) and month_start(v_to)), 0)
             + coalesce((select sum(x.amount) from income_extras x
                          where x.jobsite_id = j.id and x.month between month_start(v_from) and month_start(v_to)), 0)
           end,
           case when v_pay then
             coalesce((select sum(s.amount) from staff_cost_rows(v_from, v_to, j.id) s), 0)
           end;
end $$;

revoke execute on function reactivate_jobsite(uuid, date, numeric), jobsite_period_summary(uuid) from public, anon;
grant execute on function reactivate_jobsite(uuid, date, numeric), jobsite_period_summary(uuid) to authenticated;
