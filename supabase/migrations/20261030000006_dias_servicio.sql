-- Días de servicio de los 1099 y ubicación obligatoria para los W-2 (legal rev. 3, fase A).
-- D-275, D-276, D-277 (2), D-279, D-286; D-262 (el Super Admin corrige siempre); D-266 (No show y "+ Agregar persona").
-- Decisión de implementación (D-200): tabla nueva `service_days` en lugar de extender `work_entries`. Así `work_entries`
-- queda solo para horas de W-2 (sin columnas nulas ni estados mezclados), la conversión (migración aparte
-- 20261030000007_convertir_1099.sql) solo borra filas y lo que sumaba `pay_amount` de 1099 ahora suma los días aprobados.
-- Un día se aprueba por persona; la visita (`visits.approved_at`) se cierra cuando ya no queda nada por aprobar.

-- 1. Tabla ------------------------------------------------------------------------------------------------------------

create table service_days (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid not null references visits(id) on delete restrict,
  profile_id uuid not null references profiles(id),
  status text not null check (status in ('pending', 'needs_correction', 'approved')),
  note text,                                  -- nota del admin al devolver (obligatoria con needs_correction)
  unscheduled boolean not null default false,
  marked_by uuid references profiles(id),     -- quien marcó "Completado" (el 1099 o el admin al registrar)
  marked_at timestamptz,
  reviewed_by uuid references profiles(id),   -- quien aprobó o devolvió por última vez
  reviewed_at timestamptz,
  amount numeric(12,2) check (amount is null or amount >= 0),
  amount_edited boolean not null default false,
  amount_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (visit_id, profile_id),
  constraint service_days_note check (status <> 'needs_correction' or btrim(coalesce(note, '')) <> '')
);
create index service_days_profile on service_days (profile_id);
alter table service_days enable row level security;
revoke all on service_days from anon, authenticated;

create function is_contractor(p_profile uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select worker_type = '1099' from profiles where id = p_profile), false)
$$;

-- 2. Pago por día (D-276) ---------------------------------------------------------------------------------------------
-- El pago por hora de los 1099 pasa a fijo por día: tarifa × horas garantizadas; sin garantizadas, 4 h (D-200).
-- Los fijos por semana o mes siguen igual.
with conv as (
  update assignment_pay x
     set kind = 'fixed', fixed_period = 'visit', fixed_amount = round(x.hourly_rate * coalesce(x.guaranteed_hours, 4), 2),
         hourly_rate = null, guaranteed_hours = null
    from jobsite_assignments a join profiles p on p.id = a.profile_id
   where a.id = x.assignment_id and p.worker_type = '1099' and x.kind = 'hourly'
  returning x.assignment_id, x.effective_from, x.fixed_amount, a.jobsite_id, p.full_name)
insert into change_log (actor_id, action, entity, entity_id, detail)
select null, 'pago_convertido_por_dia', 'jobsites', c.jobsite_id,
       jsonb_build_object('employee', c.full_name, 'desde', c.effective_from, 'monto', c.fixed_amount)
  from conv c;

-- Monto de un día según el pago del jobsite vigente ese día: fijo por visita = su monto; fijo por semana o mes = 0
-- (se cuenta aparte, como hoy); por hora (no debería quedar en un 1099) = tarifa × garantizadas o 4 h (D-200).
create function service_day_pay(p_visit uuid, p_profile uuid) returns numeric
language plpgsql stable security definer set search_path = public as $$
declare
  v visits;
  p assignment_pay;
begin
  select * into v from visits where id = p_visit;
  select x.* into p from jobsite_assignments a join assignment_pay x on x.assignment_id = a.id
   where a.jobsite_id = v.jobsite_id and a.profile_id = p_profile and a.start_date <= v.local_date
     and (a.end_date is null or a.end_date >= v.local_date) and x.effective_from <= v.local_date
   order by x.effective_from desc limit 1;
  if p.id is null then return null; end if;
  if p.kind = 'fixed' then
    return case when p.fixed_period = 'visit' then p.fixed_amount else 0 end;
  end if;
  return round(p.hourly_rate * coalesce(p.guaranteed_hours, 4), 2);
end $$;

create or replace function set_assignment_pay(p_assignment uuid, p_kind text, p_hourly numeric, p_guaranteed numeric,
                                              p_amount numeric, p_period text, p_from date) returns void
language plpgsql security definer set search_path = public as $$
declare
  a jobsite_assignments;
  v_type worker_type;
begin
  if not (has_permission('empleados_asignar_pago') and has_permission('empleados_ver_pagos')) then
    raise exception 'No tienes permiso para definir pagos' using errcode = '42501';
  end if;
  select * into a from jobsite_assignments where id = p_assignment;
  if a.id is null then raise exception 'La asignación no existe' using errcode = 'P0002'; end if;
  if p_from is null or (p_from < current_date and not jobsite_is_legacy(a.jobsite_id)) then
    raise exception 'El pago no puede empezar antes de hoy' using errcode = '22023';
  end if;
  select worker_type into v_type from profiles where id = a.profile_id;
  if p_kind = 'hourly' then
    -- D-276: los 1099 no cobran por hora, cobran por día de servicio.
    if v_type = '1099' then raise exception 'contractor_no_hours' using errcode = '22023'; end if;
    if p_hourly is null or p_hourly < 0 or (p_guaranteed is not null and p_guaranteed <= 0) then
      raise exception 'Pago por hora no válido' using errcode = '22023';
    end if;
    if v_type = 'w2' and p_hourly < 15 then
      raise exception 'El mínimo para W-2 es $15.00 por hora' using errcode = '23514';
    end if;
  elsif p_kind = 'fixed' then
    if p_amount is null or p_amount < 0 or p_period not in ('visit', 'week', 'month') then
      raise exception 'Tarifa fija no válida' using errcode = '22023';
    end if;
  else
    raise exception 'Tipo de pago no válido' using errcode = '22023';
  end if;
  insert into assignment_pay (assignment_id, kind, hourly_rate, guaranteed_hours, fixed_amount, fixed_period,
                              effective_from, created_by)
  values (p_assignment, p_kind,
          case when p_kind = 'hourly' then round(p_hourly, 2) end,
          case when p_kind = 'hourly' then p_guaranteed end,
          case when p_kind = 'fixed' then round(p_amount, 2) end,
          case when p_kind = 'fixed' then p_period end, p_from, current_profile_id())
  on conflict (assignment_id, effective_from) do update
     set kind = excluded.kind, hourly_rate = excluded.hourly_rate, guaranteed_hours = excluded.guaranteed_hours,
         fixed_amount = excluded.fixed_amount, fixed_period = excluded.fixed_period, created_by = excluded.created_by,
         created_at = now();
  insert into change_log (actor_id, action, entity, entity_id, detail)
  values (current_profile_id(), 'pago_definido', 'jobsites', a.jobsite_id,
          jsonb_build_object('name', (select name from jobsites where id = a.jobsite_id),
                             'employee', (select full_name from profiles where id = a.profile_id),
                             'kind', p_kind, 'desde', p_from));
end $$;

-- 3. 1099 sin horas ni ubicación; W-2 con ubicación obligatoria -------------------------------------------------------

create or replace function clock_in(p_visit uuid, p_client_id uuid, p_at timestamptz, p_lat double precision, p_lng double precision,
                                    p_offline boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := current_profile_id();
  v visits;
  w work_entries;
  v_at timestamptz;
  loc record;
begin
  if me is null then raise exception 'Sin sesión' using errcode = '42501'; end if;
  -- D-275: un 1099 no marca entrada ni salida.
  if is_contractor(me) then raise exception 'contractor_no_hours' using errcode = '42501'; end if;
  if p_client_id is not null then
    select * into w from work_entries where client_id = p_client_id;
    if w.id is not null then
      if w.profile_id <> me then raise exception 'Registro de otra persona' using errcode = '42501'; end if;
      return jsonb_build_object('id', w.id, 'status', w.in_status, 'distance_m', w.in_distance_m);
    end if;
  end if;
  -- D-277 (2): el W-2 con acceso marca solo con su ubicación.
  if p_lat is null or p_lng is null then raise exception 'location_required' using errcode = '22023'; end if;
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
end $$;

create or replace function clock_out(p_entry uuid, p_at timestamptz, p_lat double precision, p_lng double precision, p_offline boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me uuid := current_profile_id();
  w work_entries;
  v_at timestamptz;
  loc record;
begin
  if me is null then raise exception 'Sin sesión' using errcode = '42501'; end if;
  if is_contractor(me) then raise exception 'contractor_no_hours' using errcode = '42501'; end if;
  select * into w from work_entries where id = p_entry for update;
  if w.id is null or w.profile_id <> me then raise exception 'El registro no existe' using errcode = 'P0002'; end if;
  if w.clock_out is not null then
    return jsonb_build_object('id', w.id, 'status', w.out_status, 'clock_out', w.clock_out);
  end if;
  if p_lat is null or p_lng is null then raise exception 'location_required' using errcode = '22023'; end if;
  v_at := case when coalesce(p_offline, false) and p_at is not null and p_at <= now() + interval '5 minutes' then p_at else now() end;
  if v_at <= w.clock_in then raise exception 'La salida debe ser después de la entrada' using errcode = '22023'; end if;
  select * into loc from location_status(w.visit_id, p_lat, p_lng);
  update work_entries set clock_out = v_at, out_status = loc.status, out_distance_m = loc.dist, out_offline = coalesce(p_offline, false),
         updated_at = now() where id = w.id returning * into w;
  return jsonb_build_object('id', w.id, 'status', w.out_status, 'distance_m', w.out_distance_m, 'clock_out', w.clock_out);
end $$;

create or replace function visit_distance(p_visit uuid, p_lat double precision, p_lng double precision) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  j jobsites;
  d int;
begin
  if current_profile_id() is null then raise exception 'Sin sesión' using errcode = '42501'; end if;
  if is_contractor(current_profile_id()) then raise exception 'contractor_no_hours' using errcode = '42501'; end if;
  select jb.* into j from visits v join jobsites jb on jb.id = v.jobsite_id where v.id = p_visit;
  if j.id is null then raise exception 'La visita no existe' using errcode = 'P0002'; end if;
  if p_lat is null or j.latitude is null then return jsonb_build_object('status', 'no_location'); end if;
  d := distance_m(p_lat, p_lng, j.latitude, j.longitude);
  return jsonb_build_object('status', case when d <= geofence_m() then 'ok' else 'out_of_range' end, 'distance_m', d);
end $$;

-- El admin tampoco registra horas a un 1099: para ellos es "Registrar y aprobar" el día.
create or replace function record_work(p_visit uuid, p_rows jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  v visits;
  r jsonb;
  pid uuid;
  cin timestamptz;
  cout timestamptz;
  eid uuid;
begin
  if not has_permission('work_registrar_por_otros') then
    raise exception 'No tienes permiso para registrar trabajo por otros' using errcode = '42501';
  end if;
  select * into v from visits where id = p_visit and not removed for update;
  if v.id is null then raise exception 'La visita no existe' using errcode = 'P0002'; end if;
  if not work_can_change(v) then raise exception 'La visita ya está aprobada' using errcode = '22023'; end if;
  if v.local_date > cc_today() then raise exception 'La visita todavía no ocurre' using errcode = '22023'; end if;
  for r in select * from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) loop
    pid := (r->>'profile_id')::uuid;
    cin := (r->>'clock_in')::timestamptz;
    cout := nullif(r->>'clock_out', '')::timestamptz;
    if pid is null or cin is null or (cout is not null and cout <= cin) or not exists (select 1 from profiles where id = pid and active) then
      raise exception 'Fila no válida' using errcode = '22023';
    end if;
    if is_contractor(pid) then raise exception 'contractor_no_hours' using errcode = '22023'; end if;
    if v.approved_at is not null and cout is null then raise exception 'open_shift' using errcode = '22023'; end if;
    update visit_staff set no_show = false where visit_id = v.id and profile_id = pid and no_show;
    insert into work_entries (visit_id, profile_id, clock_in, clock_out, in_status, out_status, recorded_by, unscheduled)
    values (v.id, pid, cin, cout, 'manual', case when cout is null then null else 'manual' end, current_profile_id(),
            not exists (select 1 from visit_staff s where s.visit_id = v.id and s.profile_id = pid))
    on conflict (visit_id, profile_id) do update
      set clock_in = excluded.clock_in, clock_out = excluded.clock_out, recorded_by = excluded.recorded_by, updated_at = now(),
          in_status = case when work_entries.recorded_by is null and work_entries.in_status <> 'auto' then work_entries.in_status else 'manual' end,
          out_status = case when excluded.clock_out is null then null
                            when work_entries.recorded_by is null and work_entries.clock_out is not null
                                 and work_entries.out_status <> 'auto' then work_entries.out_status
                            else 'manual' end
    returning id into eid;
    perform work_repay(eid);
  end loop;
  insert into change_log (actor_id, action, entity, entity_id, detail)
  values (current_profile_id(), case when v.approved_at is null then 'trabajo_registrado' else 'trabajo_corregido' end, 'visits', v.id,
          jsonb_build_object('name', (select name from jobsites where id = v.jobsite_id), 'day', v.local_date,
                             'personas', jsonb_array_length(coalesce(p_rows, '[]'::jsonb))));
end $$;

-- D-261 / D-278: el registro automático es solo para W-2 sin acceso.
create or replace function fill_auto_work() returns int
language plpgsql security definer set search_path = public as $$
declare
  n int;
begin
  insert into work_entries (visit_id, profile_id, clock_in, clock_out, in_status, out_status, unscheduled)
  select v.id, s.profile_id, v.starts_at, v.starts_at + make_interval(mins => v.minutes), 'auto', 'auto', false
    from visit_staff s join visits v on v.id = s.visit_id join profiles p on p.id = s.profile_id
   where not v.removed and v.approved_at is null and not s.no_show and p.active and not p.has_app_access
     and p.worker_type is distinct from '1099'
     and v.starts_at + make_interval(mins => v.minutes) <= now()
     and not exists (select 1 from work_entries w where w.visit_id = v.id and w.profile_id = s.profile_id)
  on conflict (visit_id, profile_id) do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

-- D-279: "Mis horas" solo para W-2.
create or replace function my_hours(p_month date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  me uuid := current_profile_id();
  m0 date := date_trunc('month', p_month)::date;
  rows jsonb;
begin
  if me is null then raise exception 'Sin sesión' using errcode = '42501'; end if;
  if is_contractor(me) then raise exception 'contractor_no_hours' using errcode = '42501'; end if;
  if p_month is null then raise exception 'Mes no válido' using errcode = '22023'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('date', x.local_date, 'account', x.account, 'worked_minutes', x.worked,
                                               'insured_minutes', x.insured) order by x.local_date desc, x.clock_in desc), '[]'::jsonb)
    into rows
    from (
      select v.local_date, j.name as account, w.clock_in,
             round(extract(epoch from (w.clock_out - w.clock_in)) / 60)::int as worked,
             -- D-200: sin pay_minutes guardado (no debería pasar al aprobar) se toman las horas trabajadas.
             coalesce(w.pay_minutes, round(extract(epoch from (w.clock_out - w.clock_in)) / 60)::int) as insured
        from work_entries w join visits v on v.id = w.visit_id join jobsites j on j.id = v.jobsite_id
       where w.profile_id = me and w.clock_out is not null and v.approved_at is not null and not v.removed
         and v.local_date >= m0 and v.local_date < (m0 + interval '1 month')::date
    ) x;
  return jsonb_build_object('month', m0, 'rows', rows,
    'worked_minutes', coalesce((select sum((r->>'worked_minutes')::int) from jsonb_array_elements(rows) r), 0),
    'insured_minutes', coalesce((select sum((r->>'insured_minutes')::int) from jsonb_array_elements(rows) r), 0));
end $$;

-- 4. Estado de la visita ----------------------------------------------------------------------------------------------

-- Parte W-2 por aprobar: horas registradas, o la visita terminó y hay W-2 programados que no son No show.
create function visit_w2_pending(v visits) returns boolean
language sql stable security definer set search_path = public as $$
  select v.approved_at is null
     and (exists (select 1 from work_entries w where w.visit_id = v.id)
          or (v.starts_at + make_interval(mins => v.minutes) <= now()
              and exists (select 1 from visit_staff s join profiles p on p.id = s.profile_id
                           where s.visit_id = v.id and not s.no_show and p.worker_type is distinct from '1099')))
$$;

-- Parte 1099 por aprobar: un día sin aprobar, o la visita terminó y un 1099 programado no tiene día ni es No show.
create function visit_days_pending(v visits) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from service_days d where d.visit_id = v.id and d.status <> 'approved')
      or (v.approved_at is null and v.starts_at + make_interval(mins => v.minutes) <= now()
          and exists (select 1 from visit_staff s join profiles p on p.id = s.profile_id
                       where s.visit_id = v.id and not s.no_show and p.worker_type = '1099'
                         and not exists (select 1 from service_days d where d.visit_id = v.id and d.profile_id = s.profile_id)))
$$;

create or replace function visit_pending_approval(v visits) returns boolean
language sql stable security definer set search_path = public as $$
  select not v.removed and (visit_w2_pending(v) or visit_days_pending(v))
$$;

-- Cierra la visita cuando ya no queda nada por aprobar y no hay horas de W-2 (esas las cierra "Approve").
create function visit_close_if_done(p_visit uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v visits;
begin
  select * into v from visits where id = p_visit;
  if v.id is null or v.approved_at is not null or v.removed then return; end if;
  if exists (select 1 from work_entries w where w.visit_id = v.id)
     or exists (select 1 from visit_staff s join profiles p on p.id = s.profile_id
                 where s.visit_id = v.id and not s.no_show and p.worker_type is distinct from '1099')
     or exists (select 1 from visit_staff s where s.visit_id = v.id and not s.no_show
                  and not exists (select 1 from service_days d where d.visit_id = v.id and d.profile_id = s.profile_id))
     or exists (select 1 from service_days d where d.visit_id = v.id and d.status <> 'approved')
     or not exists (select 1 from service_days d where d.visit_id = v.id) then
    return;
  end if;
  update visits set approved_at = now(), approved_by = current_profile_id() where id = v.id;
end $$;

create or replace function approve_visit(p_visit uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v visits;
  w work_entries;
  pay record;
begin
  if not has_permission('work_aprobar') then
    raise exception 'No tienes permiso para aprobar trabajo' using errcode = '42501';
  end if;
  perform fill_auto_work();
  select * into v from visits where id = p_visit for update;
  if v.id is null then raise exception 'La visita no existe' using errcode = 'P0002'; end if;
  if v.approved_at is not null then return; end if;
  if not exists (select 1 from work_entries where visit_id = v.id)
     and not exists (select 1 from service_days where visit_id = v.id and status = 'approved') then
    raise exception 'no_work' using errcode = '22023';
  end if;
  if exists (select 1 from work_entries where visit_id = v.id and clock_out is null) then
    raise exception 'open_shift' using errcode = '22023';
  end if;
  if exists (select 1 from visit_staff s join profiles p on p.id = s.profile_id
              where s.visit_id = v.id and not s.no_show and p.worker_type is distinct from '1099'
                and not exists (select 1 from work_entries w2 where w2.visit_id = v.id and w2.profile_id = s.profile_id)) then
    raise exception 'missing_time' using errcode = '22023';
  end if;
  if exists (select 1 from work_entries x where x.visit_id = v.id and work_gps_pending(x)) then
    raise exception 'gps_pending' using errcode = '22023';
  end if;
  -- Los 1099 se aprueban uno por uno (D-286); la visita se cierra cuando ya no queda ninguno.
  if visit_days_pending(v) then raise exception 'service_days_pending' using errcode = '22023'; end if;
  for w in select * from work_entries where visit_id = v.id loop
    select * into pay from work_pay(w);
    update work_entries set pay_minutes = pay.pay_minutes, pay_amount = pay.pay_amount where id = w.id;
  end loop;
  update visits set approved_at = now(), approved_by = current_profile_id() where id = v.id;
  insert into change_log (actor_id, action, entity, entity_id, detail)
  values (current_profile_id(), 'trabajo_aprobado', 'visits', v.id,
          jsonb_build_object('name', (select name from jobsites where id = v.jobsite_id), 'day', v.local_date,
                             'personas', (select count(*) from work_entries where visit_id = v.id)));
end $$;

-- 5. Funciones de los días de servicio --------------------------------------------------------------------------------

create function service_day_log(p_action text, d service_days, p_extra jsonb default '{}'::jsonb) returns void
language sql security definer set search_path = public as $$
  insert into change_log (actor_id, action, entity, entity_id, detail)
  select current_profile_id(), p_action, 'service_days', d.id,
         jsonb_build_object('name', j.name, 'day', v.local_date, 'employee', p.full_name, 'status', d.status) || coalesce(p_extra, '{}'::jsonb)
    from visits v join jobsites j on j.id = v.jobsite_id, profiles p
   where v.id = d.visit_id and p.id = d.profile_id
$$;

-- El 1099 con acceso marca su día como Completado (fecha y sitio salen de la visita; sin horas).
create function complete_service_day(p_visit uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := current_profile_id();
  pr profiles;
  v visits;
  d service_days;
  sched boolean;
begin
  if me is null then raise exception 'Sin sesión' using errcode = '42501'; end if;
  select * into pr from profiles where id = me;
  if pr.worker_type is distinct from '1099' then raise exception 'not_contractor' using errcode = '42501'; end if;
  select * into v from visits where id = p_visit and not removed for update;
  if v.id is null then raise exception 'La visita no existe' using errcode = 'P0002'; end if;
  if v.local_date > cc_today() then raise exception 'not_yet' using errcode = '22023'; end if;
  sched := exists (select 1 from visit_staff s where s.visit_id = v.id and s.profile_id = me);
  if not sched and not exists (select 1 from jobsite_assignments a where a.jobsite_id = v.jobsite_id and a.profile_id = me
                                 and a.start_date <= v.local_date and (a.end_date is null or a.end_date >= v.local_date)) then
    raise exception 'No estás asignado a este jobsite' using errcode = '42501';
  end if;
  select * into d from service_days where visit_id = v.id and profile_id = me for update;
  if d.id is not null and d.status in ('pending', 'approved') then
    return jsonb_build_object('id', d.id, 'status', d.status);
  end if;
  -- Ya cerrada por el admin (sin el día de esta persona): solo el admin la corrige.
  if d.id is null and v.approved_at is not null then raise exception 'La visita ya está aprobada' using errcode = '22023'; end if;
  update visit_staff set no_show = false where visit_id = v.id and profile_id = me and no_show;
  insert into service_days (visit_id, profile_id, status, unscheduled, marked_by, marked_at)
  values (v.id, me, 'pending', not sched, me, now())
  on conflict (visit_id, profile_id) do update
     set status = 'pending', marked_by = me, marked_at = now(), updated_at = now()
  returning * into d;
  perform service_day_log('dia_marcado', d);
  return jsonb_build_object('id', d.id, 'status', d.status);
end $$;

create function approve_service_day(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  d service_days;
  v visits;
begin
  if not has_permission('work_aprobar') then
    raise exception 'No tienes permiso para aprobar trabajo' using errcode = '42501';
  end if;
  select * into d from service_days where id = p_id for update;
  if d.id is null then raise exception 'El día no existe' using errcode = 'P0002'; end if;
  if d.status = 'approved' then return; end if;
  if d.status = 'needs_correction' then raise exception 'needs_correction' using errcode = '22023'; end if;
  select * into v from visits where id = d.visit_id;
  update service_days set status = 'approved', reviewed_by = current_profile_id(), reviewed_at = now(), updated_at = now(),
         amount = case when amount_edited then amount else service_day_pay(d.visit_id, d.profile_id) end
   where id = d.id returning * into d;
  perform service_day_log('dia_aprobado', d, jsonb_build_object('monto', d.amount));
  perform visit_close_if_done(d.visit_id);
end $$;

create function return_service_day(p_id uuid, p_note text) returns void
language plpgsql security definer set search_path = public as $$
declare
  d service_days;
begin
  if not has_permission('work_aprobar') then
    raise exception 'No tienes permiso para aprobar trabajo' using errcode = '42501';
  end if;
  if btrim(coalesce(p_note, '')) = '' then raise exception 'note_required' using errcode = '22023'; end if;
  select * into d from service_days where id = p_id for update;
  if d.id is null then raise exception 'El día no existe' using errcode = 'P0002'; end if;
  -- D-262: un día aprobado solo lo corrige el Super Admin.
  if d.status = 'approved' and not is_super_admin() then raise exception 'already_approved' using errcode = '22023'; end if;
  update service_days set status = 'needs_correction', note = btrim(p_note), reviewed_by = current_profile_id(), reviewed_at = now(),
         updated_at = now(), amount = case when amount_edited then amount end
   where id = d.id returning * into d;
  perform service_day_log('dia_devuelto', d, jsonb_build_object('nota', d.note));
  begin
    perform notify_profiles(array[d.profile_id], 'service_day_returned',
      jsonb_build_object('jobsite', (select j.name from visits v join jobsites j on j.id = v.jobsite_id where v.id = d.visit_id),
                         'day', (select local_date from visits where id = d.visit_id)),
      jsonb_build_object('pathname', '/my-service-days'), false, 'sdret:' || d.id || ':' || extract(epoch from now())::bigint);
  exception when others then null;
  end;
end $$;

-- El admin registra y aprueba en un paso: quien no tiene acceso, quien no marcó o el sustituto (D-266 (3)).
create function record_and_approve_service_day(p_visit uuid, p_profile uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v visits;
  d service_days;
  me uuid := current_profile_id();
begin
  if not (has_permission('work_registrar_por_otros') and has_permission('work_aprobar')) then
    raise exception 'No tienes permiso para registrar y aprobar' using errcode = '42501';
  end if;
  select * into v from visits where id = p_visit and not removed for update;
  if v.id is null then raise exception 'La visita no existe' using errcode = 'P0002'; end if;
  if not work_can_change(v) then raise exception 'La visita ya está aprobada' using errcode = '22023'; end if;
  if v.local_date > cc_today() then raise exception 'La visita todavía no ocurre' using errcode = '22023'; end if;
  if not exists (select 1 from profiles where id = p_profile and active and worker_type = '1099') then
    raise exception 'not_contractor' using errcode = '22023';
  end if;
  update visit_staff set no_show = false where visit_id = v.id and profile_id = p_profile and no_show;
  insert into service_days (visit_id, profile_id, status, unscheduled, marked_by, marked_at, reviewed_by, reviewed_at, amount)
  values (v.id, p_profile, 'approved',
          not exists (select 1 from visit_staff s where s.visit_id = v.id and s.profile_id = p_profile),
          me, now(), me, now(), service_day_pay(v.id, p_profile))
  on conflict (visit_id, profile_id) do update
     set status = 'approved', reviewed_by = me, reviewed_at = now(), updated_at = now(),
         marked_by = coalesce(service_days.marked_by, me), marked_at = coalesce(service_days.marked_at, now()),
         amount = case when service_days.amount_edited then service_days.amount else excluded.amount end
  returning * into d;
  perform service_day_log('dia_registrado_aprobado', d, jsonb_build_object('monto', d.amount));
  perform visit_close_if_done(v.id);
  return d.id;
end $$;

-- Casos especiales (D-276): otro monto para un día; queda en el historial con antes y después.
create function edit_service_day_amount(p_id uuid, p_amount numeric, p_note text) returns void
language plpgsql security definer set search_path = public as $$
declare
  d service_days;
  antes numeric;
begin
  if not (has_permission('work_editar') and has_permission('empleados_ver_pagos')) then
    raise exception 'No tienes permiso para editar el monto' using errcode = '42501';
  end if;
  if p_amount is null or p_amount < 0 then raise exception 'Monto no válido' using errcode = '22023'; end if;
  if btrim(coalesce(p_note, '')) = '' then raise exception 'note_required' using errcode = '22023'; end if;
  select * into d from service_days where id = p_id for update;
  if d.id is null then raise exception 'El día no existe' using errcode = 'P0002'; end if;
  if d.status = 'approved' and not is_super_admin() then raise exception 'already_approved' using errcode = '22023'; end if;
  antes := d.amount;
  update service_days set amount = round(p_amount, 2), amount_edited = true, amount_note = btrim(p_note), updated_at = now()
   where id = d.id returning * into d;
  perform service_day_log('dia_monto_editado', d, jsonb_build_object('antes', antes, 'despues', d.amount, 'nota', d.amount_note));
end $$;

-- No show (D-266): también quita el día de servicio de esa persona.
create or replace function mark_no_show(p_visit uuid, p_profile uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v visits;
  w work_entries;
  d service_days;
  scheduled boolean;
begin
  if not has_permission('work_registrar_por_otros') then
    raise exception 'No tienes permiso para registrar trabajo por otros' using errcode = '42501';
  end if;
  select * into v from visits where id = p_visit and not removed for update;
  if v.id is null then raise exception 'La visita no existe' using errcode = 'P0002'; end if;
  if not work_can_change(v) then raise exception 'La visita ya está aprobada' using errcode = '22023'; end if;
  scheduled := exists (select 1 from visit_staff where visit_id = v.id and profile_id = p_profile);
  select * into w from work_entries where visit_id = v.id and profile_id = p_profile;
  select * into d from service_days where visit_id = v.id and profile_id = p_profile;
  if not scheduled and w.id is null and d.id is null then raise exception 'La persona no está en la visita' using errcode = 'P0002'; end if;
  if d.status = 'approved' and not is_super_admin() then raise exception 'already_approved' using errcode = '22023'; end if;
  update visit_staff set no_show = true where visit_id = v.id and profile_id = p_profile;
  if w.id is not null then delete from work_entries where id = w.id; end if;
  if d.id is not null then delete from service_days where id = d.id; end if;
  insert into change_log (actor_id, action, entity, entity_id, detail)
  values (current_profile_id(), case when v.approved_at is null then 'no_show' else 'trabajo_corregido' end, 'visits', v.id,
          jsonb_build_object('name', (select name from jobsites where id = v.jobsite_id), 'day', v.local_date,
                             'employee', (select full_name from profiles where id = p_profile), 'no_show', true,
                             'registro_borrado', case when w.id is null then null else jsonb_build_object(
                               'in', w.clock_in, 'out', w.clock_out, 'in_status', w.in_status,
                               'del_telefono', w.recorded_by is null and w.in_status <> 'auto') end,
                             'dia_borrado', case when d.id is null then null else jsonb_build_object(
                               'status', d.status, 'monto', d.amount, 'del_telefono', d.marked_by = d.profile_id) end));
  perform visit_close_if_done(v.id);
end $$;

-- "Mis días de servicio" del 1099 (D-279, D-286 (2)): sin horas ni dinero.
create function my_service_days(p_month date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  me uuid := current_profile_id();
  m0 date := date_trunc('month', p_month)::date;
  rows jsonb;
begin
  if me is null then raise exception 'Sin sesión' using errcode = '42501'; end if;
  if p_month is null then raise exception 'Mes no válido' using errcode = '22023'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'visit_id', v.id, 'date', v.local_date, 'account', j.name,
                                               'status', d.status, 'note', case when d.status = 'needs_correction' then d.note end)
                            order by v.local_date desc, v.starts_at desc), '[]'::jsonb)
    into rows
    from service_days d join visits v on v.id = d.visit_id join jobsites j on j.id = v.jobsite_id
   where d.profile_id = me and not v.removed
     and v.local_date >= m0 and v.local_date < (m0 + interval '1 month')::date;
  return jsonb_build_object('month', m0, 'rows', rows,
    'approved', (select count(*) from jsonb_array_elements(rows) r where r->>'status' = 'approved'),
    'pending', (select count(*) from jsonb_array_elements(rows) r where r->>'status' = 'pending'),
    'needs_correction', (select count(*) from jsonb_array_elements(rows) r where r->>'status' = 'needs_correction'));
end $$;

-- Horario del staff: al 1099 se le muestra su día de servicio en vez del registro de horas.
create or replace function my_schedule() returns jsonb
language plpgsql security definer set search_path = public as $$
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
                  from work_entries w where w.visit_id = v.id and w.profile_id = me),
      'service_day', (select jsonb_build_object('id', d.id, 'status', d.status, 'note', d.note)
                        from service_days d where d.visit_id = v.id and d.profile_id = me))
      order by v.starts_at)
      from visits v join jobsites j on j.id = v.jobsite_id
     where not v.removed and (v.local_date between mon and mon + 13
            or exists (select 1 from work_entries w where w.visit_id = v.id and w.profile_id = me and w.clock_out is null))
       and (exists (select 1 from visit_staff s where s.visit_id = v.id and s.profile_id = me)
            or (v.local_date = cc_today() and exists (select 1 from jobsite_assignments a where a.jobsite_id = v.jobsite_id and a.profile_id = me
                                                     and a.start_date <= v.local_date and (a.end_date is null or a.end_date >= v.local_date)))
            or exists (select 1 from work_entries w where w.visit_id = v.id and w.profile_id = me)
            or exists (select 1 from service_days d where d.visit_id = v.id and d.profile_id = me))), '[]'::jsonb);
end $$;

-- 6. "To approve" del admin -------------------------------------------------------------------------------------------

create or replace function visit_card(v visits) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', v.id, 'jobsite_id', v.jobsite_id, 'jobsite', j.name, 'client', c.name, 'day', v.local_date,
    'starts_at', v.starts_at, 'minutes', v.minutes, 'approved', v.approved_at is not null,
    'w2_pending', visit_w2_pending(v),
    'ended', v.starts_at + make_interval(mins => v.minutes) <= now(),
    'urgent', visit_pending_approval(v) and v.local_date < cc_today() - 1,
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object(
        'profile_id', p.id, 'name', p.full_name, 'worker_type', p.worker_type, 'entry_id', w.id,
        'clock_in', w.clock_in, 'clock_out', w.clock_out,
        'in_status', w.in_status, 'out_status', w.out_status,
        'status', case when p.worker_type = '1099' then
                         case when d.id is null then 'day_missing' when d.status = 'approved' then 'day_approved'
                              when d.status = 'needs_correction' then 'day_correction' else 'day_pending' end
                       when w.id is null then 'missing'
                       when w.in_status = 'auto' then 'auto'
                       when w.unscheduled then 'unscheduled'
                       when w.in_status in ('out_of_range', 'no_location') or w.out_status in ('out_of_range', 'no_location') then 'gps'
                       when w.in_offline or w.out_offline then 'offline'
                       when w.recorded_by is not null or w.in_status = 'manual' then 'manual'
                       else 'ok' end,
        'distance_m', greatest(w.in_distance_m, w.out_distance_m), 'offline', coalesce(w.in_offline or w.out_offline, false),
        'unscheduled', coalesce(w.unscheduled, d.unscheduled, false), 'manual', w.recorded_by is not null,
        'gps_pending', coalesce(work_gps_pending(w), false), 'gps_reviewed', w.gps_reviewed_at is not null,
        'has_app_access', p.has_app_access, 'has_pay', visit_has_pay(v.id, p.id),
        'pay_amount', case when p.worker_type = '1099' then d.amount else w.pay_amount end,
        'service_day', case when d.id is null then null else jsonb_build_object(
          'id', d.id, 'status', d.status, 'note', d.note, 'marked_at', d.marked_at,
          'self_marked', d.marked_by = d.profile_id, 'amount', d.amount, 'amount_edited', d.amount_edited,
          'expected_amount', service_day_pay(v.id, p.id)) end)
        order by p.full_name)
        from profiles p
        left join work_entries w on w.visit_id = v.id and w.profile_id = p.id
        left join service_days d on d.visit_id = v.id and d.profile_id = p.id
       where p.id in (select s.profile_id from visit_staff s where s.visit_id = v.id and not s.no_show
                      union select x.profile_id from work_entries x where x.visit_id = v.id
                      union select y.profile_id from service_days y where y.visit_id = v.id)), '[]'::jsonb),
    'no_show', coalesce((select jsonb_agg(jsonb_build_object('profile_id', p.id, 'name', p.full_name) order by p.full_name)
        from visit_staff s join profiles p on p.id = s.profile_id
       where s.visit_id = v.id and s.no_show
         and not exists (select 1 from work_entries x where x.visit_id = v.id and x.profile_id = s.profile_id)
         and not exists (select 1 from service_days y where y.visit_id = v.id and y.profile_id = s.profile_id)), '[]'::jsonb))
  from jobsites j join clients c on c.id = j.client_id where j.id = v.jobsite_id
$$;

create or replace function work_addable_staff(p_visit uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not has_permission('work_registrar_por_otros') then
    raise exception 'No tienes permiso para registrar trabajo por otros' using errcode = '42501';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.full_name, 'worker_type', p.worker_type,
                                                       'has_pay', visit_has_pay(p_visit, p.id)) order by p.full_name)
    from profiles p where p.active
     and not exists (select 1 from work_entries w where w.visit_id = p_visit and w.profile_id = p.id)
     and not exists (select 1 from service_days d where d.visit_id = p_visit and d.profile_id = p.id)
     and not exists (select 1 from visit_staff s where s.visit_id = p_visit and s.profile_id = p.id and not s.no_show)), '[]'::jsonb);
end $$;

create or replace function notify_work_approved() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.approved_at is not null or new.approved_at is null then return new; end if;
  begin
    perform notify_profiles(array(select profile_id from work_entries where visit_id = new.id
                                  union select profile_id from service_days where visit_id = new.id and status = 'approved'),
      'work_approved', jsonb_build_object('jobsite', (select name from jobsites where id = new.jobsite_id), 'day', new.local_date),
      jsonb_build_object('pathname', '/'), false, 'approved:' || new.id);
  exception when others then null;
  end;
  return new;
end $$;

create or replace function work_home_pending() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  approve int := 0;
  urgent int := 0;
  gps int := 0;
  forgot int := 0;
  open_shifts int := 0;
begin
  if has_permission('work_aprobar') then
    select count(*), count(*) filter (where v.local_date < cc_today() - 1) into approve, urgent
      from visits v where visit_pending_approval(v);
  end if;
  if has_permission('work_revisar_gps') then
    select count(*) into gps from work_entries w join visits v on v.id = w.visit_id where v.approved_at is null and work_gps_pending(w);
  end if;
  if has_permission('schedule_ver_editar') or has_permission('work_registrar_por_otros') then
    -- Solo W-2: el 1099 no marca entrada (D-275).
    select count(*) into forgot from visit_staff s join visits v on v.id = s.visit_id join profiles p on p.id = s.profile_id
     where not v.removed and not s.no_show and p.has_app_access and p.worker_type is distinct from '1099' and v.local_date = cc_today()
       and v.starts_at + interval '30 minutes' <= now()
       and not exists (select 1 from work_entries w where w.visit_id = v.id and w.profile_id = s.profile_id);
  end if;
  if has_permission('work_editar') then
    select count(*) into open_shifts from work_entries w join visits v on v.id = w.visit_id
     where w.clock_out is null and v.local_date < cc_today();
  end if;
  return jsonb_build_object('to_approve', approve, 'urgent', urgent, 'gps_out', gps, 'forgot_clock_in', forgot, 'open_shifts', open_shifts);
end $$;

-- 7. Costo, Accounting y Estadísticas: los 1099 cuentan días aprobados ----------------------------------------------

drop function staff_cost_rows(date, date, uuid);
create function staff_cost_rows(p_from date, p_to date, p_jobsite uuid default null)
returns table (month date, profile_id uuid, jobsite_id uuid, minutes int, amount numeric, days int)
language sql stable security definer set search_path = public as $$
  with rng as (select month_start(p_from) f, month_end(p_to) t),
  approved as (
    select w.profile_id, v.jobsite_id, v.local_date, coalesce(w.pay_minutes, 0) minutes, coalesce(w.pay_amount, 0) amount, 0 days
      from work_entries w join visits v on v.id = w.visit_id, rng
     where v.approved_at is not null and v.local_date between rng.f and rng.t
       and (p_jobsite is null or v.jobsite_id = p_jobsite)
    union all
    -- D-275: solo los días aprobados cuentan para el pago, aunque la visita siga abierta por otra persona.
    select d.profile_id, v.jobsite_id, v.local_date, 0, coalesce(d.amount, 0), 1
      from service_days d join visits v on v.id = d.visit_id, rng
     where d.status = 'approved' and not v.removed and v.local_date between rng.f and rng.t
       and (p_jobsite is null or v.jobsite_id = p_jobsite)
  ),
  per_entry as (
    select month_start(a.local_date) as month, a.profile_id, a.jobsite_id, a.minutes, a.amount, a.days from approved a
  ),
  segs as (
    select a.id assignment_id, a.profile_id, a.jobsite_id, p.fixed_amount, p.fixed_period,
           greatest(p.effective_from, a.start_date) seg_from,
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
    select month, profile_id, jobsite_id, minutes, amount, days from per_entry
    union all select month, profile_id, jobsite_id, 0, amount, 0 from monthly
    union all select month, profile_id, jobsite_id, 0, amount, 0 from weekly
  )
  select r.month, r.profile_id, r.jobsite_id, sum(r.minutes)::int, round(sum(r.amount), 2), sum(r.days)::int
    from all_rows r
   group by 1, 2, 3
  having sum(r.amount) > 0 or sum(r.minutes) > 0 or sum(r.days) > 0
$$;
revoke execute on function staff_cost_rows(date, date, uuid) from public, anon, authenticated;

create or replace function staff_cost(p_from date, p_to date, p_jobsite uuid default null) returns jsonb
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
        'minutes', sum(s.minutes), 'days', sum(s.days), 'amount', sum(s.amount),
        'jobsites', jsonb_agg(jsonb_build_object('jobsite_id', s.jobsite_id, 'jobsite', j.name, 'month', s.month,
                                                 'minutes', s.minutes, 'days', s.days, 'amount', s.amount) order by s.month, j.name)) x
        from staff_cost_rows(p_from, p_to, p_jobsite) s
        join profiles p on p.id = s.profile_id
        join jobsites j on j.id = s.jobsite_id
       group by s.profile_id, p.full_name, p.worker_type) z), '[]'::jsonb);
end $$;

-- Exporte de personal: los 1099 con días en vez de horas.
create or replace function accounting_export(p_kind text, p_from date, p_to date) returns jsonb
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
                                                 'jobsite', j.name,
                                                 'hours', case when p.worker_type = '1099' then null else round(s.minutes / 60.0, 2) end,
                                                 'days', case when p.worker_type = '1099' then s.days end, 'amount', s.amount)
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

-- Estadísticas: el día de servicio cuenta como turno trabajado (sin minutos ni puntualidad).
create or replace function stats_entries(p_from date, p_to date)
returns table (entry_id uuid, visit_id uuid, jobsite_id uuid, profile_id uuid, local_date date, approved boolean,
               worked_minutes int, pay_minutes int, pay_amount numeric, self_marked boolean, on_time boolean)
language sql stable security definer set search_path = public as $$
  select w.id, v.id, v.jobsite_id, w.profile_id, v.local_date, v.approved_at is not null,
         case when w.clock_out is not null then round(extract(epoch from (w.clock_out - w.clock_in)) / 60)::int end,
         w.pay_minutes, w.pay_amount, w.recorded_by is null, w.clock_in <= v.starts_at + interval '5 minutes'
    from work_entries w join visits v on v.id = w.visit_id
   where v.local_date between p_from and p_to
  union all
  select d.id, v.id, v.jobsite_id, d.profile_id, v.local_date, d.status = 'approved', null, null, d.amount, false, null
    from service_days d join visits v on v.id = d.visit_id
   where not v.removed and v.local_date between p_from and p_to
$$;

create or replace function stats_shifts(p_from date, p_to date)
returns table (visit_id uuid, jobsite_id uuid, profile_id uuid, local_date date, worked boolean)
language sql stable security definer set search_path = public as $$
  select v.id, v.jobsite_id, s.profile_id, v.local_date,
         exists (select 1 from work_entries w where w.visit_id = v.id and w.profile_id = s.profile_id)
         or exists (select 1 from service_days d where d.visit_id = v.id and d.profile_id = s.profile_id)
    from visit_staff s join visits v on v.id = s.visit_id
   where not v.removed and v.local_date between p_from and least(p_to, cc_today() - 1)
$$;

create or replace function stats_entry_figures(p_from date, p_to date, p_jobsite uuid, p_profile uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'visits', count(distinct e.visit_id),
    'shifts', count(*),
    'service_days', count(*) filter (where e.approved and e.worked_minutes is null and e.pay_minutes is null and not e.self_marked
                                       and e.on_time is null),
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

-- Inicio del admin: por aprobar cuenta visitas con horas o días pendientes; horas de la semana solo W-2;
-- hoy muestra el estado del día de servicio de cada 1099.
create or replace function admin_home() returns jsonb
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
    select jsonb_build_object('visits', count(*),
             'shifts', coalesce(sum((select count(*) from work_entries w where w.visit_id = v.id and v.approved_at is null)
                                    + (select count(*) from service_days d where d.visit_id = v.id and d.status <> 'approved')), 0),
             'service_days', coalesce(sum((select count(*) from service_days d where d.visit_id = v.id and d.status = 'pending')), 0),
             'urgent', count(*) filter (where v.local_date < v_today - 1))
      into v_approve
      from visits v where visit_pending_approval(v);
  end if;

  if has_permission('schedule_ver_editar') or has_permission('work_registrar_por_otros') then
    select coalesce(jsonb_agg(jsonb_build_object('id', v.id, 'jobsite', j.name, 'starts_at', v.starts_at, 'minutes', v.minutes,
             'staff', coalesce((
               select jsonb_agg(jsonb_build_object('profile_id', p.id, 'name', p.full_name, 'worker_type', p.worker_type,
                                                   'clock_in', w.clock_in, 'clock_out', w.clock_out, 'service_day', d.status)
                                order by p.full_name)
                 from profiles p left join work_entries w on w.visit_id = v.id and w.profile_id = p.id
                 left join service_days d on d.visit_id = v.id and d.profile_id = p.id
                where p.id in (select s.profile_id from visit_staff s where s.visit_id = v.id
                               union select x.profile_id from work_entries x where x.visit_id = v.id
                               union select y.profile_id from service_days y where y.visit_id = v.id)), '[]'::jsonb))
             order by v.starts_at), '[]'::jsonb)
      into v_visits
      from visits v join jobsites j on j.id = v.jobsite_id
     where not v.removed and v.local_date = v_today;
  end if;

  -- Horas de esta semana: solo W-2 (D-275); tope 32 h.
  if has_permission('schedule_ver_editar') then
    select coalesce(jsonb_agg(jsonb_build_object('profile_id', z.id, 'name', z.full_name, 'programmed_minutes', z.prog,
             'worked_minutes', z.worked) order by z.prog desc, z.full_name), '[]'::jsonb)
      into v_hours
      from (select p.id, p.full_name, programmed_minutes(p.id, v_week) prog,
                   coalesce((select sum(round(extract(epoch from (w.clock_out - w.clock_in)) / 60))::int
                               from work_entries w join visits v on v.id = w.visit_id
                              where w.profile_id = p.id and w.clock_out is not null
                                and v.local_date between v_week and v_week + 6), 0) worked
              from profiles p where p.active and p.worker_type is distinct from '1099') z
     where z.prog > 0 or z.worked > 0;
  end if;

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

-- 8. Estado de cuenta del mes (D-286): cierre el último día del mes, pago 7 días después ----------------------------

create function service_day_statement(p_month date) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  m0 date := month_start(p_month);
  rows jsonb;
begin
  if not has_permission('personal_ver_costo') then
    raise exception 'No tienes permiso para ver el costo de personal' using errcode = '42501';
  end if;
  if p_month is null then raise exception 'Mes no válido' using errcode = '22023'; end if;
  insert into change_log (actor_id, action, entity, entity_id, detail)
  values (current_profile_id(), 'estado_cuenta_abierto', 'profiles', null, jsonb_build_object('mes', m0));
  select coalesce(jsonb_agg(z.doc order by z.name), '[]'::jsonb) into rows
    from (
      select p.full_name name, jsonb_build_object(
               'profile_id', p.id, 'name', p.full_name,
               'days', coalesce(dd.days, 0), 'edited', coalesce(dd.edited, 0), 'days_amount', coalesce(dd.amount, 0),
               'fixed_amount', greatest(coalesce(c.total, 0) - coalesce(dd.amount, 0), 0),
               'amount', coalesce(c.total, 0),
               'jobsites', coalesce(c.jobsites, '[]'::jsonb)) doc
        from profiles p
        left join lateral (
          select count(*)::int days, count(*) filter (where d.amount_edited)::int edited, sum(coalesce(d.amount, 0)) amount
            from service_days d join visits v on v.id = d.visit_id
           where d.profile_id = p.id and d.status = 'approved' and not v.removed
             and v.local_date between m0 and month_end(m0)) dd on true
        left join lateral (
          select sum(r.amount) total,
                 jsonb_agg(jsonb_build_object('jobsite_id', r.jobsite_id, 'jobsite', j.name, 'days', r.days, 'amount', r.amount)
                           order by j.name) jobsites
            from staff_cost_rows(m0, m0) r join jobsites j on j.id = r.jobsite_id
           where r.profile_id = p.id) c on true
       where p.worker_type = '1099' and (coalesce(dd.days, 0) > 0 or coalesce(c.total, 0) > 0)
    ) z;
  return jsonb_build_object('month', m0, 'closes_on', month_end(m0), 'due_on', month_end(m0) + 7, 'rows', rows,
    'days', coalesce((select sum((r->>'days')::int) from jsonb_array_elements(rows) r), 0),
    'amount', coalesce((select sum((r->>'amount')::numeric) from jsonb_array_elements(rows) r), 0));
end $$;

-- 9. Avisos: el olvido de clock in solo para W-2; por aprobar también los días pendientes -------------------------

do $$
declare
  src text;
begin
  select pg_get_functiondef('notifications_scan'::regproc) into src;
  src := replace(src, 'and not s.no_show and p.has_app_access
       and not exists (select 1 from work_entries w where w.visit_id = v.id and w.profile_id = s.profile_id)',
                      'and not s.no_show and p.has_app_access and p.worker_type is distinct from ''1099''
       and not exists (select 1 from work_entries w where w.visit_id = v.id and w.profile_id = s.profile_id)');
  src := replace(src, 'where v.approved_at is null and exists (select 1 from work_entries w where w.visit_id = v.id)
       and not exists (select 1 from work_entries w where w.visit_id = v.id and w.clock_out is null)',
                      'where (v.approved_at is null and exists (select 1 from work_entries w where w.visit_id = v.id)
       and not exists (select 1 from work_entries w where w.visit_id = v.id and w.clock_out is null))
        or exists (select 1 from service_days d where d.visit_id = v.id and d.status = ''pending'')');
  if src not like '%worker_type is distinct from ''1099''%' or src not like '%service_days d where d.visit_id%' then
    raise exception 'notifications_scan no se pudo actualizar';
  end if;
  execute src;
end $$;

-- Texto del aviso al 1099 cuando el admin devuelve su día (D-200).
do $$
declare
  src text;
begin
  select pg_get_functiondef('notification_text'::regproc) into src;
  src := replace(src, '    when ''work_approved'' then',
    '    when ''service_day_returned'' then
      title := case when es then ''Día de servicio: requiere corrección'' else ''Service day: needs correction'' end;
      detail := concat_ws('' · '', d->>''jobsite'', day);
    when ''work_approved'' then');
  if src not like '%service_day_returned%' then raise exception 'notification_text no se pudo actualizar'; end if;
  execute src;
end $$;

-- 10. Permisos de ejecución -------------------------------------------------------------------------------------------

revoke execute on function is_contractor(uuid), service_day_pay(uuid, uuid), visit_w2_pending(visits), visit_days_pending(visits),
  visit_close_if_done(uuid), service_day_log(text, service_days, jsonb) from public, anon, authenticated;
revoke execute on function complete_service_day(uuid), approve_service_day(uuid), return_service_day(uuid, text),
  record_and_approve_service_day(uuid, uuid), edit_service_day_amount(uuid, numeric, text), my_service_days(date),
  service_day_statement(date) from public, anon;
grant execute on function complete_service_day(uuid), approve_service_day(uuid), return_service_day(uuid, text),
  record_and_approve_service_day(uuid, uuid), edit_service_day_amount(uuid, numeric, text), my_service_days(date),
  service_day_statement(date) to authenticated;
