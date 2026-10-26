-- Órdenes 38 (D-252, D-253): permiso "Ver estadísticas", centro de Estadísticas (por cuenta, por empleado y
-- tendencia) e Inicio nuevo del admin. Fuente: decisions.md D-053, D-200, D-214, D-215, D-223, D-243, D-245,
-- D-252 y D-253; diseño surveys/dashboard-estadisticas-aprobado.html.
-- Todo por funciones security definer que validan el permiso; nada se lee directo de las tablas.

-- 1. Permiso nuevo (D-252): área Accounting, después de reportes_exportar. 37 permisos delegables. ----------
-- La plantilla Admin (role_template_permissions) toma todos los de la tabla menos empleados_gestionar_permisos, así
-- que lo incluye sola; el Super Admin lo tiene por has_permission. "De partida" (D-252) es para los perfiles nuevos:
-- a los Admin que ya existían no se les agrega (la regla más estricta ante la duda, D-200); se marca en su perfil.
insert into permissions (key, area, sort) values ('estadisticas_ver', 'accounting', 10) on conflict (key) do nothing;

-- 2. Base de las estadísticas ------------------------------------------------------------------------------

-- Registros de trabajo de un rango de días (por el día local de la visita), con lo que mide cada número:
--  * approved: la visita está aprobada (solo eso cuenta para horas, pago y costo, D-053);
--  * worked_minutes: minutos reales de clock in a clock out (D-245: se guardan aunque se paguen garantizadas);
--  * pay_minutes / pay_amount: lo que se pagó al aprobar (con las horas garantizadas, D-214);
--  * self_marked: la entrada la marcó el propio empleado (recorded_by is null);
--  * on_time: entró a más tardar 5 minutos después de la hora de la visita (D-200).
create function stats_entries(p_from date, p_to date)
returns table (entry_id uuid, visit_id uuid, jobsite_id uuid, profile_id uuid, local_date date, approved boolean,
               worked_minutes int, pay_minutes int, pay_amount numeric, self_marked boolean, on_time boolean)
language sql stable security definer set search_path = public as $$
  select w.id, v.id, v.jobsite_id, w.profile_id, v.local_date, v.approved_at is not null,
         case when w.clock_out is not null then round(extract(epoch from (w.clock_out - w.clock_in)) / 60)::int end,
         w.pay_minutes, w.pay_amount, w.recorded_by is null, w.clock_in <= v.starts_at + interval '5 minutes'
    from work_entries w join visits v on v.id = w.visit_id
   where v.local_date between p_from and p_to
$$;

-- Turnos programados ya pasados: personal de visitas no quitadas de un día anterior a hoy (y dentro del rango).
-- worked = tiene cualquier registro de trabajo en esa visita (para las faltas cuenta cualquier registro, D-253).
create function stats_shifts(p_from date, p_to date)
returns table (visit_id uuid, jobsite_id uuid, profile_id uuid, local_date date, worked boolean)
language sql stable security definer set search_path = public as $$
  select v.id, v.jobsite_id, s.profile_id, v.local_date,
         exists (select 1 from work_entries w where w.visit_id = v.id and w.profile_id = s.profile_id)
    from visit_staff s join visits v on v.id = s.visit_id
   where not v.removed and v.local_date between p_from and least(p_to, cc_today() - 1)
$$;

-- Cifras de un grupo de registros (una cuenta, un empleado o los dos): horas reales y pagadas del trabajo
-- aprobado, lo pagado sin trabajar en minutos y en dinero (la parte del pago que pasa de lo real), duración real
-- promedio por turno y puntualidad.
create function stats_entry_figures(p_from date, p_to date, p_jobsite uuid, p_profile uuid)
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'visits', count(distinct e.visit_id),
    'shifts', count(*),
    'worked_minutes', coalesce(sum(e.worked_minutes) filter (where e.approved), 0),
    'paid_minutes', coalesce(sum(e.pay_minutes) filter (where e.approved), 0),
    'unworked_minutes', coalesce(sum(greatest(coalesce(e.pay_minutes, 0) - coalesce(e.worked_minutes, 0), 0)) filter (where e.approved), 0),
    'unworked_amount', round(coalesce(sum(case when e.approved and e.pay_minutes > 0 and e.pay_amount is not null
                                               then e.pay_amount * greatest(e.pay_minutes - coalesce(e.worked_minutes, 0), 0) / e.pay_minutes end), 0), 2),
    'avg_minutes', round(avg(e.worked_minutes) filter (where e.approved and e.worked_minutes is not null), 1),
    'punctual_self', count(*) filter (where e.self_marked),
    'punctual_on_time', count(*) filter (where e.self_marked and e.on_time))
    from stats_entries(p_from, p_to) e
   where (p_jobsite is null or e.jobsite_id = p_jobsite) and (p_profile is null or e.profile_id = p_profile)
$$;

-- Turnos programados contra trabajados y la lista de faltas (D-253), de una cuenta, un empleado o los dos.
create function stats_shift_figures(p_from date, p_to date, p_jobsite uuid, p_profile uuid)
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'scheduled', count(*),
    'scheduled_worked', count(*) filter (where s.worked),
    'absences', coalesce(jsonb_agg(jsonb_build_object('visit_id', s.visit_id, 'jobsite_id', s.jobsite_id, 'jobsite', j.name,
                                                      'profile_id', s.profile_id, 'name', p.full_name, 'day', s.local_date)
                                   order by s.local_date, p.full_name) filter (where not s.worked), '[]'::jsonb))
    from stats_shifts(p_from, p_to) s join jobsites j on j.id = s.jobsite_id join profiles p on p.id = s.profile_id
   where (p_jobsite is null or s.jobsite_id = p_jobsite) and (p_profile is null or s.profile_id = p_profile)
$$;

-- 3. Estadísticas (D-253): por cuenta, por empleado y tendencia, por mes o rango de meses ---------------------
-- Ingreso esperado y profit como en Accounting (accounting_totals: lo esperado del mes, D-215); costo de personal
-- de staff_cost_rows (solo trabajo aprobado, con garantizadas y tarifas fijas, D-053). Abrirlas queda en el
-- historial porque muestran tarifas y pagos (D-125).
create function statistics_report(p_from date, p_to date) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  f date;
  t date;
  v_accounts jsonb;
  v_employees jsonb;
  v_trend jsonb;
  m date;
  trend_from date;
begin
  if not has_permission('estadisticas_ver') then
    raise exception 'No tienes permiso para ver estadísticas' using errcode = '42501';
  end if;
  perform accounting_range_valid(p_from, p_to);
  f := month_start(p_from);
  t := month_end(p_to);
  perform generate_accounting();
  insert into change_log (actor_id, action, entity, entity_id, detail)
  values (current_profile_id(), 'estadisticas_abiertas', 'statistics', null, jsonb_build_object('desde', f, 'hasta', month_start(t)));

  -- Por cuenta: los jobsites con ingreso, trabajo o turnos programados en el rango.
  select coalesce(jsonb_agg(x.doc order by x.name), '[]'::jsonb) into v_accounts
    from (
      select j.name, jsonb_build_object(
          'jobsite_id', j.id, 'name', j.name, 'client', c.name, 'status', j.status,
          'est_minutes', coalesce(j.visit_minutes, round(j.est_hours_per_visit * 60)::int),
          'expected', tot.expected, 'staff', tot.staff, 'expenses', tot.expenses, 'profit', tot.profit,
          'margin', case when tot.expected > 0 then round(tot.profit * 100 / tot.expected, 1) end,
          'employees', coalesce((
            select jsonb_agg(jsonb_build_object('profile_id', p.id, 'name', p.full_name,
                     'cost', coalesce((select sum(r.amount) from staff_cost_rows(f, t, j.id) r where r.profile_id = p.id), 0))
                     || stats_entry_figures(f, t, j.id, p.id) || stats_shift_figures(f, t, j.id, p.id) order by p.full_name)
              from profiles p
             where p.id in (select e.profile_id from stats_entries(f, t) e where e.jobsite_id = j.id
                            union select s.profile_id from stats_shifts(f, t) s where s.jobsite_id = j.id)), '[]'::jsonb))
          || stats_entry_figures(f, t, j.id, null) || stats_shift_figures(f, t, j.id, null) as doc
        from jobsites j join clients c on c.id = j.client_id, lateral accounting_totals(f, t, j.id) tot
       where tot.expected > 0 or tot.staff > 0 or tot.expenses > 0
          or exists (select 1 from stats_entries(f, t) e where e.jobsite_id = j.id)
          or exists (select 1 from stats_shifts(f, t) s where s.jobsite_id = j.id)
    ) x;

  -- Por empleado: quien trabajó o estuvo programado en el rango, en todas las cuentas.
  select coalesce(jsonb_agg(jsonb_build_object('profile_id', p.id, 'name', p.full_name, 'worker_type', p.worker_type,
             'cost', coalesce((select sum(r.amount) from staff_cost_rows(f, t) r where r.profile_id = p.id), 0))
             || stats_entry_figures(f, t, null, p.id) || stats_shift_figures(f, t, null, p.id) order by p.full_name), '[]'::jsonb)
    into v_employees
    from profiles p
   where p.id in (select e.profile_id from stats_entries(f, t) e union select s.profile_id from stats_shifts(f, t) s);

  -- Tendencia por mes: el rango, y con un solo mes los 5 anteriores para comparar (desde que hay Accounting).
  trend_from := greatest(accounting_floor(), case when month_start(p_from) = month_start(p_to)
                                                  then (month_start(p_from) - interval '5 months')::date else month_start(p_from) end);
  v_trend := '[]'::jsonb;
  m := trend_from;
  while m <= month_start(t) loop
    v_trend := v_trend || (select jsonb_build_object('month', m, 'expected', x.expected, 'staff', x.staff, 'expenses', x.expenses, 'profit', x.profit)
                             from accounting_totals(m, m) x);
    m := (m + interval '1 month')::date;
  end loop;

  return jsonb_build_object('from', f, 'to', month_start(t), 'accounts', v_accounts, 'employees', v_employees, 'trend', v_trend);
end $$;

-- 4. Inicio del admin (D-253): cada parte solo con el permiso de su área; sin permiso, null. ------------------
-- Reutiliza accounting_totals (profit y por cobrar del mes), work_to_approve (por aprobar), programmed_minutes
-- (horas de la semana, solo con el schedule: el staff nunca ve sus horas contra 32 h, D-223) y jobsites_at_risk.
create function admin_home() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_today date := cc_today();
  v_week date := week_monday(cc_today());
  tot record;
  v_month jsonb;
  v_receivable jsonb;
  v_approve jsonb;
  v_visits jsonb;
  v_hours jsonb;
  v_pipeline jsonb;
  v_accounts jsonb;
  v_rate boolean := has_permission('clientes_ver_tarifa');
begin
  if current_profile_id() is null then raise exception 'Sin sesión' using errcode = '42501'; end if;

  if has_permission('dashboard_global') or (has_permission('ingresos_ver_registrar') and v_rate) then
    perform generate_accounting();
    select * into tot from accounting_totals(v_today, v_today);
    if has_permission('dashboard_global') then
      v_month := jsonb_build_object('month', month_start(v_today), 'expected', tot.expected, 'staff', tot.staff,
                                    'expenses', tot.expenses, 'profit', tot.profit,
                                    'margin', case when tot.expected > 0 then round(tot.profit * 100 / tot.expected, 1) end);
    end if;
    v_receivable := jsonb_build_object('month', month_start(v_today), 'pending', tot.pending,
      'count', (select count(*) from income_expected e where e.month = month_start(v_today) and not e.received));
  end if;

  if has_permission('work_aprobar') then
    select jsonb_build_object('visits', count(distinct v.id), 'shifts', count(w.id),
                              'urgent', count(distinct v.id) filter (where v.local_date < v_today - 1))
      into v_approve
      from visits v join work_entries w on w.visit_id = v.id where v.approved_at is null;
  end if;

  -- Visitas de hoy con quién marcó entrada: el programado y quien marcó sin estar programado.
  if has_permission('schedule_ver_editar') or has_permission('work_registrar_por_otros') then
    select coalesce(jsonb_agg(jsonb_build_object('id', v.id, 'jobsite', j.name, 'starts_at', v.starts_at, 'minutes', v.minutes,
             'staff', coalesce((
               select jsonb_agg(jsonb_build_object('profile_id', p.id, 'name', p.full_name, 'clock_in', w.clock_in, 'clock_out', w.clock_out)
                                order by p.full_name)
                 from profiles p left join work_entries w on w.visit_id = v.id and w.profile_id = p.id
                where p.id in (select s.profile_id from visit_staff s where s.visit_id = v.id
                               union select x.profile_id from work_entries x where x.visit_id = v.id)), '[]'::jsonb))
             order by v.starts_at), '[]'::jsonb)
      into v_visits
      from visits v join jobsites j on j.id = v.jobsite_id
     where not v.removed and v.local_date = v_today;
  end if;

  -- Horas de esta semana (domingo a sábado, D-231): reales de clock in a clock out contra lo programado; tope 32 h.
  if has_permission('schedule_ver_editar') then
    select coalesce(jsonb_agg(jsonb_build_object('profile_id', z.id, 'name', z.full_name, 'programmed_minutes', z.prog,
             'worked_minutes', z.worked) order by z.prog desc, z.full_name), '[]'::jsonb)
      into v_hours
      from (select p.id, p.full_name, programmed_minutes(p.id, v_week) prog,
                   coalesce((select sum(round(extract(epoch from (w.clock_out - w.clock_in)) / 60))::int
                               from work_entries w join visits v on v.id = w.visit_id
                              where w.profile_id = p.id and w.clock_out is not null
                                and v.local_date between v_week and v_week + 6), 0) worked
              from profiles p where p.active) z
     where z.prog > 0 or z.worked > 0;
  end if;

  -- Pipeline: las mismas cifras de la pantalla Pipeline (Abiertos y Quote enviado, D-226).
  if has_permission('leads_ver') then
    v_pipeline := jsonb_build_object('open', (select count(*) from leads where status not in ('won', 'lost')),
                                     'quote_sent', (select count(*) from leads where status = 'quote_sent'));
  end if;

  if has_permission('clientes_ver') then
    v_accounts := jsonb_build_object('active', (select count(*) from jobsites where status = 'active'),
                                     'at_risk', case when v_rate then (select count(*) from jobsites_at_risk()) end);
  end if;

  return jsonb_build_object('month', v_month, 'receivable', v_receivable, 'to_approve', v_approve, 'today', v_visits,
                            'week_hours', v_hours, 'week_start', v_week, 'pipeline', v_pipeline, 'accounts', v_accounts);
end $$;

-- Permisos de ejecución: solo las dos de entrada; las de apoyo no se llaman desde la app.
revoke execute on function stats_entries(date, date), stats_shifts(date, date), stats_entry_figures(date, date, uuid, uuid),
  stats_shift_figures(date, date, uuid, uuid) from public, anon, authenticated;
revoke execute on function statistics_report(date, date), admin_home() from public, anon;
grant execute on function statistics_report(date, date), admin_home() to authenticated;
