-- Orden 44: "To approve" por visita (D-266), registro automático de quien no tiene acceso a la app (D-261 (1),
-- D-266 (1)), "No show", sustitutos y correcciones del Super Admin en una visita aprobada (D-262).

-- No show (D-266 (3)): quien estaba programado y no vino. Se conserva la fila para poder deshacerlo (D-200).
alter table visit_staff add column no_show boolean not null default false;

-- Estado nuevo 'auto' (D-261 (1)): registro hecho solo con la hora programada para quien no tiene acceso a la app.
alter table work_entries drop constraint work_entries_in_status_check;
alter table work_entries drop constraint work_entries_out_status_check;
alter table work_entries add constraint work_entries_in_status_check check (in_status in ('ok', 'out_of_range', 'no_location', 'manual', 'auto'));
alter table work_entries add constraint work_entries_out_status_check check (out_status in ('ok', 'out_of_range', 'no_location', 'manual', 'auto'));

-- ¿Tiene pago asignado vigente ese día en el jobsite de la visita? (para el aviso ámbar, D-200)
create function visit_has_pay(p_visit uuid, p_profile uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from visits v join jobsite_assignments a on a.jobsite_id = v.jobsite_id
                   join assignment_pay x on x.assignment_id = a.id
                  where v.id = p_visit and a.profile_id = p_profile and a.start_date <= v.local_date
                    and (a.end_date is null or a.end_date >= v.local_date) and x.effective_from <= v.local_date)
$$;

-- Registro automático (D-261 (1), D-266 (1)): al terminar la hora programada, cada persona programada sin acceso a la
-- app, activa, sin No show y sin registro, queda con entrada y salida programadas y estado 'auto'. Idempotente: lo
-- corre pg_cron cada 5 minutos y también "To approve" al cargarse. Solo visitas sin aprobar.
create function fill_auto_work() returns int
language plpgsql security definer set search_path = public as $$
declare
  n int;
begin
  insert into work_entries (visit_id, profile_id, clock_in, clock_out, in_status, out_status, unscheduled)
  select v.id, s.profile_id, v.starts_at, v.starts_at + make_interval(mins => v.minutes), 'auto', 'auto', false
    from visit_staff s join visits v on v.id = s.visit_id join profiles p on p.id = s.profile_id
   where not v.removed and v.approved_at is null and not s.no_show and p.active and not p.has_app_access
     and v.starts_at + make_interval(mins => v.minutes) <= now()
     and not exists (select 1 from work_entries w where w.visit_id = v.id and w.profile_id = s.profile_id)
  on conflict (visit_id, profile_id) do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

-- Vuelve a calcular el pago de un registro si la visita ya está aprobada (D-262).
create function work_repay(p_entry uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  w work_entries;
  pay record;
begin
  select * into w from work_entries where id = p_entry;
  if w.id is null or w.clock_out is null or (select approved_at from visits where id = w.visit_id) is null then return; end if;
  select * into pay from work_pay(w);
  update work_entries set pay_minutes = pay.pay_minutes, pay_amount = pay.pay_amount where id = w.id;
end $$;

-- Quién puede tocar el trabajo de una visita: sin aprobar, con el permiso; aprobada, solo el Super Admin (D-262).
create function work_can_change(v visits) returns boolean
language sql stable security definer set search_path = public as $$
  select v.approved_at is null or is_super_admin()
$$;

-- Registro por otros (D-052, D-266 (3)): cualquier empleado activo, también quien no estaba programado (sustituto,
-- unscheduled). Registrar a quien estaba en No show se lo quita (D-200). En una visita aprobada solo el Super Admin
-- (D-262): se recalcula el pago y queda "trabajo_corregido" en el historial.
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

-- Editar las horas de un registro ("Edit", D-109, D-266) o cerrar un turno olvidado (D-214). Un registro automático
-- editado pasa a manual (D-200). En una visita aprobada solo el Super Admin, y se recalcula el pago (D-262).
create or replace function edit_work_entry(p_entry uuid, p_in timestamptz, p_out timestamptz) returns void
language plpgsql security definer set search_path = public as $$
declare
  w work_entries;
  v visits;
begin
  if not has_permission('work_editar') then
    raise exception 'No tienes permiso para editar registros de trabajo' using errcode = '42501';
  end if;
  select * into w from work_entries where id = p_entry for update;
  if w.id is null then raise exception 'El registro no existe' using errcode = 'P0002'; end if;
  select * into v from visits where id = w.visit_id;
  if not work_can_change(v) then raise exception 'La visita ya está aprobada' using errcode = '22023'; end if;
  if p_in is null or (p_out is not null and p_out <= p_in) then raise exception 'Horas no válidas' using errcode = '22023'; end if;
  if v.approved_at is not null and p_out is null then raise exception 'open_shift' using errcode = '22023'; end if;
  update work_entries set clock_in = p_in, clock_out = p_out,
         in_status = case when w.in_status = 'auto' then 'manual' else w.in_status end,
         out_status = case when p_out is null then null when w.clock_out is null or w.out_status = 'auto' then 'manual' else w.out_status end,
         updated_at = now() where id = w.id;
  perform work_repay(w.id);
  insert into change_log (actor_id, action, entity, entity_id, detail)
  values (current_profile_id(), case when v.approved_at is null then 'trabajo_editado' else 'trabajo_corregido' end, 'work_entries', w.id,
          jsonb_build_object('employee', (select full_name from profiles where id = w.profile_id),
                             'antes', jsonb_build_object('in', w.clock_in, 'out', w.clock_out),
                             'despues', jsonb_build_object('in', p_in, 'out', p_out)));
end $$;

-- No show (D-266 (3)): quita a quien no vino. Borra su registro (automático, manual o marcado desde el teléfono; lo
-- borrado queda en el historial). A quien no estaba programado solo se le borra el registro.
create function mark_no_show(p_visit uuid, p_profile uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v visits;
  w work_entries;
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
  if not scheduled and w.id is null then raise exception 'La persona no está en la visita' using errcode = 'P0002'; end if;
  update visit_staff set no_show = true where visit_id = v.id and profile_id = p_profile;
  if w.id is not null then delete from work_entries where id = w.id; end if;
  insert into change_log (actor_id, action, entity, entity_id, detail)
  values (current_profile_id(), case when v.approved_at is null then 'no_show' else 'trabajo_corregido' end, 'visits', v.id,
          jsonb_build_object('name', (select name from jobsites where id = v.jobsite_id), 'day', v.local_date,
                             'employee', (select full_name from profiles where id = p_profile), 'no_show', true,
                             'registro_borrado', case when w.id is null then null else jsonb_build_object(
                               'in', w.clock_in, 'out', w.clock_out, 'in_status', w.in_status,
                               'del_telefono', w.recorded_by is null and w.in_status <> 'auto') end));
end $$;

-- Deshacer el No show (D-200). Si no tiene acceso a la app y la visita terminó, el registro automático vuelve solo.
create function undo_no_show(p_visit uuid, p_profile uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v visits;
begin
  if not has_permission('work_registrar_por_otros') then
    raise exception 'No tienes permiso para registrar trabajo por otros' using errcode = '42501';
  end if;
  select * into v from visits where id = p_visit and not removed for update;
  if v.id is null then raise exception 'La visita no existe' using errcode = 'P0002'; end if;
  if not work_can_change(v) then raise exception 'La visita ya está aprobada' using errcode = '22023'; end if;
  update visit_staff set no_show = false where visit_id = v.id and profile_id = p_profile and no_show;
  if not found then raise exception 'No estaba en No show' using errcode = 'P0002'; end if;
  insert into change_log (actor_id, action, entity, entity_id, detail)
  values (current_profile_id(), case when v.approved_at is null then 'no_show_deshecho' else 'trabajo_corregido' end, 'visits', v.id,
          jsonb_build_object('name', (select name from jobsites where id = v.jobsite_id), 'day', v.local_date,
                             'employee', (select full_name from profiles where id = p_profile), 'no_show', false));
  if v.approved_at is null then perform fill_auto_work(); end if;
end $$;

-- Aprobar (D-109, D-266 (5)): una visita a la vez. Bloquea sin trabajo, con un turno abierto, con alguien programado
-- (sin No show) sin entrada y salida (missing_time) y con GPS fuera de rango sin revisar.
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
  if not exists (select 1 from work_entries where visit_id = v.id) then
    raise exception 'no_work' using errcode = '22023';
  end if;
  if exists (select 1 from work_entries where visit_id = v.id and clock_out is null) then
    raise exception 'open_shift' using errcode = '22023';
  end if;
  if exists (select 1 from visit_staff s where s.visit_id = v.id and not s.no_show
               and not exists (select 1 from work_entries w2 where w2.visit_id = v.id and w2.profile_id = s.profile_id)) then
    raise exception 'missing_time' using errcode = '22023';
  end if;
  if exists (select 1 from work_entries x where x.visit_id = v.id and work_gps_pending(x)) then
    raise exception 'gps_pending' using errcode = '22023';
  end if;
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

-- Una visita por aprobar: con trabajo registrado, o ya terminada con alguien programado sin No show (D-261 (2)).
create function visit_pending_approval(v visits) returns boolean
language sql stable security definer set search_path = public as $$
  select v.approved_at is null and not v.removed
     and (exists (select 1 from work_entries w where w.visit_id = v.id)
          or (v.starts_at + make_interval(mins => v.minutes) <= now()
              and exists (select 1 from visit_staff s where s.visit_id = v.id and not s.no_show)))
$$;

-- Tarjeta de una visita (D-266 (2)): cuenta, jobsite, fecha y una fila por persona = programados sin No show ∪
-- registros. Hora null = missing. Estado: ok, auto, manual, gps, offline, unscheduled o missing (sin registro).
create function visit_card(v visits) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', v.id, 'jobsite_id', v.jobsite_id, 'jobsite', j.name, 'client', c.name, 'day', v.local_date,
    'starts_at', v.starts_at, 'minutes', v.minutes, 'approved', v.approved_at is not null,
    'ended', v.starts_at + make_interval(mins => v.minutes) <= now(),
    -- Urgente (D-131): más de 1 día esperando.
    'urgent', v.approved_at is null and v.local_date < cc_today() - 1,
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object(
        'profile_id', p.id, 'name', p.full_name, 'entry_id', w.id, 'clock_in', w.clock_in, 'clock_out', w.clock_out,
        'in_status', w.in_status, 'out_status', w.out_status,
        'status', case when w.id is null then 'missing'
                       when w.in_status = 'auto' then 'auto'
                       when w.unscheduled then 'unscheduled'
                       when w.in_status in ('out_of_range', 'no_location') or w.out_status in ('out_of_range', 'no_location') then 'gps'
                       when w.in_offline or w.out_offline then 'offline'
                       when w.recorded_by is not null or w.in_status = 'manual' then 'manual'
                       else 'ok' end,
        'distance_m', greatest(w.in_distance_m, w.out_distance_m), 'offline', coalesce(w.in_offline or w.out_offline, false),
        'unscheduled', coalesce(w.unscheduled, false), 'manual', w.recorded_by is not null,
        'gps_pending', coalesce(work_gps_pending(w), false), 'gps_reviewed', w.gps_reviewed_at is not null,
        'has_app_access', p.has_app_access, 'has_pay', visit_has_pay(v.id, p.id), 'pay_amount', w.pay_amount)
        order by p.full_name)
        from profiles p
        left join work_entries w on w.visit_id = v.id and w.profile_id = p.id
       where p.id in (select s.profile_id from visit_staff s where s.visit_id = v.id and not s.no_show
                      union select x.profile_id from work_entries x where x.visit_id = v.id)), '[]'::jsonb),
    'no_show', coalesce((select jsonb_agg(jsonb_build_object('profile_id', p.id, 'name', p.full_name) order by p.full_name)
        from visit_staff s join profiles p on p.id = s.profile_id
       where s.visit_id = v.id and s.no_show
         and not exists (select 1 from work_entries x where x.visit_id = v.id and x.profile_id = s.profile_id)), '[]'::jsonb))
  from jobsites j join clients c on c.id = j.client_id where j.id = v.jobsite_id
$$;

-- "To approve" (D-266): una tarjeta por visita, la más antigua primero. Antes llena los registros automáticos que
-- falten para no esperar al cron.
create or replace function work_to_approve() returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not (has_permission('work_aprobar') or has_permission('work_editar') or has_permission('work_revisar_gps')) then
    raise exception 'No tienes permiso para ver el trabajo por aprobar' using errcode = '42501';
  end if;
  perform fill_auto_work();
  return coalesce((select jsonb_agg(visit_card(v) order by v.starts_at) from visits v where visit_pending_approval(v)), '[]'::jsonb);
end $$;

-- Detalle de una visita: la misma tarjeta (también aprobada, para el Super Admin, D-262).
create or replace function visit_work(p_visit uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v visits;
begin
  if not (has_permission('work_aprobar') or has_permission('work_editar') or has_permission('work_revisar_gps')
          or has_permission('work_registrar_por_otros')) then
    raise exception 'No tienes permiso para ver el trabajo' using errcode = '42501';
  end if;
  perform fill_auto_work();
  select * into v from visits where id = p_visit;
  if v.id is null then raise exception 'La visita no existe' using errcode = 'P0002'; end if;
  return visit_card(v);
end $$;

-- "+ Agregar persona" (D-266 (3)): cualquier empleado activo que aún no está en la visita.
create function work_addable_staff(p_visit uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not has_permission('work_registrar_por_otros') then
    raise exception 'No tienes permiso para registrar trabajo por otros' using errcode = '42501';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.full_name, 'has_pay', visit_has_pay(p_visit, p.id))
                                    order by p.full_name)
    from profiles p where p.active
     and not exists (select 1 from work_entries w where w.visit_id = p_visit and w.profile_id = p.id)
     and not exists (select 1 from visit_staff s where s.visit_id = p_visit and s.profile_id = p.id and not s.no_show)), '[]'::jsonb);
end $$;

-- Pendientes del Inicio: igual que antes, con "por aprobar" contado como en "To approve" y la entrada olvidada solo
-- para quien tiene acceso a la app y no está en No show (D-261).
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
    select count(*) into forgot from visit_staff s join visits v on v.id = s.visit_id join profiles p on p.id = s.profile_id
     where not v.removed and not s.no_show and p.has_app_access and v.local_date = cc_today()
       and v.starts_at + interval '30 minutes' <= now()
       and not exists (select 1 from work_entries w where w.visit_id = v.id and w.profile_id = s.profile_id);
  end if;
  if has_permission('work_editar') then
    select count(*) into open_shifts from work_entries w join visits v on v.id = w.visit_id
     where w.clock_out is null and v.local_date < cc_today();
  end if;
  return jsonb_build_object('to_approve', approve, 'urgent', urgent, 'gps_out', gps, 'forgot_clock_in', forgot, 'open_shifts', open_shifts);
end $$;

-- Registro automático cada 5 minutos (como cidclean-avisos).
select cron.schedule('cidclean-registro-automatico', '*/5 * * * *', $$select public.fill_auto_work()$$);

revoke execute on function visit_has_pay(uuid, uuid), fill_auto_work(), work_repay(uuid), work_can_change(visits),
  visit_pending_approval(visits), visit_card(visits) from public, anon, authenticated;
revoke execute on function mark_no_show(uuid, uuid), undo_no_show(uuid, uuid), work_addable_staff(uuid) from public, anon;
grant execute on function mark_no_show(uuid, uuid), undo_no_show(uuid, uuid), work_addable_staff(uuid) to authenticated;

-- Aviso de entrada olvidada (D-214): no para quien está en No show ni para quien no tiene acceso a la app (D-261).
-- El resto de la función no cambia (copia de 20261027000011).
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
       and not s.no_show and p.has_app_access
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
