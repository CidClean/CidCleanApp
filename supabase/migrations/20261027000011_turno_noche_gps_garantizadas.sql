-- D-245: turno de noche (salida después de la medianoche), aviso de GPS y horas garantizadas.
CREATE OR REPLACE FUNCTION public.notify_gps_out()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  -- D-245: coalesce, para que una salida todavía vacía no cuente como fuera de rango.
  if not (coalesce(new.in_status = 'out_of_range', false) or coalesce(new.out_status = 'out_of_range', false)) then return new; end if;
  begin
    perform notify_permission(array['work_revisar_gps'], 'gps_out',
      (select jsonb_build_object('jobsite', j.name, 'name', p.full_name, 'day', v.local_date)
         from visits v join jobsites j on j.id = v.jobsite_id, profiles p where v.id = new.visit_id and p.id = new.profile_id),
      jsonb_build_object('pathname', '/schedule/work/[id]', 'params', jsonb_build_object('id', new.visit_id)), false, 'gps:' || new.id);
  exception when others then null;
  end;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.notifications_scan()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  n int := 0;
  r record;
  v_today date := cc_today();
  v_sunday date := week_monday(cc_today());
begin
  perform expire_quotes();

  for r in
    select v.id, v.starts_at, j.name jobsite, s.profile_id from visits v join jobsites j on j.id = v.jobsite_id join visit_staff s on s.visit_id = v.id
     where not v.removed and v.starts_at > now() and v.starts_at <= now() + interval '2 hours'
  loop
    n := n + notify_profiles(array[r.profile_id], 'visit_soon', jsonb_build_object('jobsite', r.jobsite, 'time', cc_time(r.starts_at)),
                             jsonb_build_object('pathname', '/'), false, 'soon:' || r.id);
  end loop;

  for r in
    select v.id, j.name jobsite, p.full_name, s.profile_id from visit_staff s join visits v on v.id = s.visit_id
      join jobsites j on j.id = v.jobsite_id join profiles p on p.id = s.profile_id
     where not v.removed and v.local_date = v_today and v.starts_at + interval '30 minutes' <= now()
       and not exists (select 1 from work_entries w where w.visit_id = v.id and w.profile_id = s.profile_id)
  loop
    n := n + notify_permission(array['work_registrar_por_otros'], 'clock_in_forgotten', jsonb_build_object('jobsite', r.jobsite, 'name', r.full_name),
                               jsonb_build_object('pathname', '/schedule', 'params', jsonb_build_object('tab', 'schedule')), false,
                               'cin:' || r.id || ':' || r.profile_id);
  end loop;

  for r in
    select w.id, j.name jobsite, p.full_name, v.local_date from work_entries w join visits v on v.id = w.visit_id
      join jobsites j on j.id = v.jobsite_id join profiles p on p.id = w.profile_id
     where w.clock_out is null
       -- D-245: 30 minutos después de que termina la visita (un turno de noche cruza la medianoche).
       and v.starts_at + make_interval(mins => v.minutes) + interval '30 minutes' <= now()
  loop
    n := n + notify_permission(array['work_editar'], 'clock_out_forgotten', jsonb_build_object('jobsite', r.jobsite, 'name', r.full_name, 'day', r.local_date),
                               jsonb_build_object('pathname', '/schedule', 'params', jsonb_build_object('tab', 'approve')), false, 'cout:' || r.id);
  end loop;

  for r in
    select v.id, v.status, v.expires_at, q.kind, q.lead_id, q.jobsite_id,
           coalesce(l.company, c.name) company, coalesce(nullif(btrim(s.name), ''), s.address, j.name) site
      from quote_versions v join quotes q on q.id = v.quote_id
      left join leads l on l.id = q.lead_id left join lead_sites s on s.id = q.site_id
      left join jobsites j on j.id = q.jobsite_id left join clients c on c.id = j.client_id
     where (v.status in ('sent', 'viewed') and v.expires_at <= now() + interval '3 days')
        or (v.status = 'expired' and v.expires_at > now() - interval '2 days')
  loop
    n := n + notify_permission(array['quotes_ver'], case when r.status = 'expired' then 'quote_expired' else 'quote_expiring' end,
      jsonb_build_object('company', r.company, 'site', r.site, 'day', local_day(r.expires_at)),
      case when r.kind = 'extra' then jsonb_build_object('pathname', '/jobsites/[id]', 'params', jsonb_build_object('id', r.jobsite_id))
           else jsonb_build_object('pathname', '/leads/[id]', 'params', jsonb_build_object('id', r.lead_id)) end,
      true, (case when r.status = 'expired' then 'qexpd:' else 'qexp:' end) || r.id);
  end loop;

  for r in
    select f.id, f.due_on, f.lead_id, l.company from lead_followups f join leads l on l.id = f.lead_id
     where f.done_at is null and f.due_on <= v_today and l.status not in ('won', 'lost')
  loop
    n := n + notify_permission(array['leads_ver'], 'followup_due', jsonb_build_object('company', r.company, 'day', r.due_on),
      jsonb_build_object('pathname', '/leads/[id]', 'params', jsonb_build_object('id', r.lead_id)), true, 'fu:' || r.id || ':' || r.due_on);
  end loop;

  for r in
    select v.id, j.name jobsite, v.local_date from visits v join jobsites j on j.id = v.jobsite_id
     where v.approved_at is null and exists (select 1 from work_entries w where w.visit_id = v.id)
       and not exists (select 1 from work_entries w where w.visit_id = v.id and w.clock_out is null)
  loop
    n := n + notify_permission(array['work_aprobar'], 'work_to_approve', jsonb_build_object('jobsite', r.jobsite, 'day', r.local_date),
      jsonb_build_object('pathname', '/schedule/work/[id]', 'params', jsonb_build_object('id', r.id)), true, 'appr:' || r.id);
  end loop;

  for r in
    select j.id, j.name from jobsites j, lateral jobsite_margin_calc(j.id) m
     where j.status = 'active' and m.rate is not null and m.cost > 0 and m.cost >= m.rate
  loop
    n := n + notify_permission(array['clientes_ver_tarifa'], 'margin_alert', jsonb_build_object('jobsite', r.name),
      jsonb_build_object('pathname', '/jobsites/[id]', 'params', jsonb_build_object('id', r.id)), false,
      'margin:' || r.id || ':' || month_start(v_today));
  end loop;

  for r in
    select p.id, p.full_name, wk.sunday, programmed_minutes(p.id, wk.sunday) mins
      from profiles p, (values (v_sunday), (v_sunday + 7)) wk(sunday)
     where p.active and not p.is_super_admin and programmed_minutes(p.id, wk.sunday) >= 28 * 60
  loop
    n := n + notify_permission(array['schedule_ver_editar'], 'hours_32',
      jsonb_build_object('name', r.full_name, 'hours', trim(to_char(round(r.mins / 60.0, 2), 'FM990.99'), '.')),
      jsonb_build_object('pathname', '/schedule'), false, 'h32:' || r.id || ':' || r.sunday);
  end loop;

  if v_today = month_end(v_today) and extract(hour from now() at time zone cc_tz()) >= 8 then
    perform generate_accounting();
    if (select count(*) from income_expected e where e.month = month_start(v_today) and not e.received) > 0 then
      n := n + notify_permission(array['ingresos_marcar_recibidos', 'clientes_ver_tarifa'], 'income_unmarked',
        jsonb_build_object('month', month_start(v_today),
                           'count', (select count(*) from income_expected e where e.month = month_start(v_today) and not e.received)),
        jsonb_build_object('pathname', '/accounting/income',
                           'params', jsonb_build_object('from', to_char(v_today, 'YYYY-MM'), 'to', to_char(v_today, 'YYYY-MM'))),
        false, 'inc:' || month_start(v_today));
    end if;
  end if;
  return n;
end $function$;

CREATE OR REPLACE FUNCTION public.my_schedule()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  me uuid := current_profile_id();
  mon date := week_monday(cc_today());
begin
  if me is null then raise exception 'Sin sesión' using errcode = '42501'; end if;
  perform generate_visits();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', v.id, 'jobsite', j.name, 'address', j.address, 'day', v.local_date, 'starts_at', v.starts_at, 'minutes', v.minutes,
      'scheduled', exists (select 1 from visit_staff s where s.visit_id = v.id and s.profile_id = me),
      'entry', (select jsonb_build_object('id', w.id, 'clock_in', w.clock_in, 'clock_out', w.clock_out)
                  from work_entries w where w.visit_id = v.id and w.profile_id = me))
      order by v.starts_at)
      from visits v join jobsites j on j.id = v.jobsite_id
     where not v.removed and (v.local_date between mon and mon + 13
            -- D-245: el turno abierto de un día anterior sigue a la vista para marcar la salida.
            or exists (select 1 from work_entries w where w.visit_id = v.id and w.profile_id = me and w.clock_out is null))
       and (exists (select 1 from visit_staff s where s.visit_id = v.id and s.profile_id = me)
            -- Hoy también las visitas de sus jobsites aunque no esté programado (D-214: queda para revisión).
            or (v.local_date = cc_today() and exists (select 1 from jobsite_assignments a where a.jobsite_id = v.jobsite_id and a.profile_id = me
                                                     and a.start_date <= v.local_date and (a.end_date is null or a.end_date >= v.local_date)))
            or exists (select 1 from work_entries w where w.visit_id = v.id and w.profile_id = me))), '[]'::jsonb);
end $function$;

CREATE OR REPLACE FUNCTION public.clock_in(p_visit uuid, p_client_id uuid, p_at timestamp with time zone, p_lat double precision, p_lng double precision, p_offline boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  me uuid := current_profile_id();
  v visits;
  w work_entries;
  v_at timestamptz;
  loc record;
begin
  if me is null then raise exception 'Sin sesión' using errcode = '42501'; end if;
  if p_client_id is not null then
    select * into w from work_entries where client_id = p_client_id;
    if w.id is not null then
      if w.profile_id <> me then raise exception 'Registro de otra persona' using errcode = '42501'; end if;
      return jsonb_build_object('id', w.id, 'status', w.in_status, 'distance_m', w.in_distance_m);
    end if;
  end if;
  select * into v from visits where id = p_visit and not removed;
  if v.id is null then raise exception 'La visita no existe' using errcode = 'P0002'; end if;
  v_at := case when coalesce(p_offline, false) and p_at is not null and p_at <= now() + interval '5 minutes' then p_at else now() end;
  -- D-245: también vale después de la medianoche mientras dure la visita (turno de noche).
  if local_day(v_at) <> v.local_date and not (v_at < v.starts_at + make_interval(mins => v.minutes)) then
    raise exception 'not_today' using errcode = '22023';
  end if;
  if exists (select 1 from work_entries where visit_id = v.id and profile_id = me) then
    raise exception 'already_in' using errcode = '22023';
  end if;
  -- Marca quien está programado o asignado a ese jobsite ese día (sin estar programado queda para revisión, D-214).
  if not exists (select 1 from visit_staff s where s.visit_id = v.id and s.profile_id = me)
     and not exists (select 1 from jobsite_assignments a where a.jobsite_id = v.jobsite_id and a.profile_id = me
                       and a.start_date <= v.local_date and (a.end_date is null or a.end_date >= v.local_date)) then
    raise exception 'No estás asignado a este jobsite' using errcode = '42501';
  end if;
  select * into loc from location_status(v.id, p_lat, p_lng);
  insert into work_entries (client_id, visit_id, profile_id, clock_in, in_status, in_distance_m, in_offline, unscheduled)
  values (p_client_id, v.id, me, v_at, loc.status, loc.dist, coalesce(p_offline, false),
          not exists (select 1 from visit_staff s where s.visit_id = v.id and s.profile_id = me))
  returning * into w;
  return jsonb_build_object('id', w.id, 'status', w.in_status, 'distance_m', w.in_distance_m, 'clock_in', w.clock_in);
end $function$;

-- D-245: las 4 h garantizadas de Naples Yacht Club (pedido del dueño) en el pago por hora de sus asignados, y se
-- recalcula lo ya aprobado de ese jobsite con lo mayor entre lo real y lo garantizado (como calcula la aprobación).
update assignment_pay p set guaranteed_hours = 4
  from jobsite_assignments a join jobsites j on j.id = a.jobsite_id
 where p.assignment_id = a.id and j.name = 'Naples Yacht Club' and p.kind = 'hourly' and p.guaranteed_hours is null;
update work_entries w set pay_minutes = 240, pay_amount = round(4 * p.hourly_rate, 2), updated_at = now()
  from visits v, jobsite_assignments a, lateral (select * from assignment_pay x where x.assignment_id = a.id
                                                   and x.effective_from <= v.local_date order by x.effective_from desc limit 1) p
 where v.id = w.visit_id and a.jobsite_id = v.jobsite_id and a.profile_id = w.profile_id
   and v.approved_at is not null and w.pay_minutes < 240 and p.kind = 'hourly' and p.guaranteed_hours = 4
   and v.jobsite_id = (select id from jobsites where name = 'Naples Yacht Club');
