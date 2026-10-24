-- D-241: fechas pasadas solo en jobsites de clientes "Previo a la app" (D-210), para cargar lo histórico: asignación de
-- personal, su pago y las visitas (agregar o cambiar). En los clientes nuevos sigue sin dejar. El registro de trabajo
-- por otros ya aceptaba visitas pasadas; el turno que cruza la medianoche ya lo aceptaba el servidor (salida > entrada).
-- El resto de validaciones no cambia.

create or replace function jobsite_is_legacy(p_jobsite uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select c.legacy from jobsites j join clients c on c.id = j.client_id where j.id = p_jobsite), false)
$$;
revoke execute on function jobsite_is_legacy(uuid) from public, anon, authenticated;


CREATE OR REPLACE FUNCTION public.assign_employee(p_jobsite uuid, p_profile uuid, p_start date)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_id uuid;
begin
  if not (has_permission('empleados_asignar_pago') or has_permission('schedule_ver_editar')) then
    raise exception 'No tienes permiso para asignar personal' using errcode = '42501';
  end if;
  if p_start is null or (p_start < current_date and not jobsite_is_legacy(p_jobsite)) then
    raise exception 'La fecha de inicio no puede ser anterior a hoy' using errcode = '22023';
  end if;
  if not exists (select 1 from jobsites where id = p_jobsite and status <> 'terminated') then
    raise exception 'El jobsite no existe o está terminado' using errcode = '22023';
  end if;
  if not exists (select 1 from profiles where id = p_profile and active and not is_super_admin) then
    raise exception 'El empleado no existe o está inactivo' using errcode = '22023';
  end if;
  insert into jobsite_assignments (jobsite_id, profile_id, start_date, created_by)
  values (p_jobsite, p_profile, p_start, current_profile_id()) returning id into v_id;
  insert into change_log (actor_id, action, entity, entity_id, detail)
  values (current_profile_id(), 'personal_asignado', 'jobsites', p_jobsite,
          jsonb_build_object('name', (select name from jobsites where id = p_jobsite),
                             'employee', (select full_name from profiles where id = p_profile), 'desde', p_start));
  return v_id;
end $function$;

CREATE OR REPLACE FUNCTION public.set_assignment_pay(p_assignment uuid, p_kind text, p_hourly numeric, p_guaranteed numeric, p_amount numeric, p_period text, p_from date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  if p_kind = 'hourly' then
    if p_hourly is null or p_hourly < 0 or (p_guaranteed is not null and p_guaranteed <= 0) then
      raise exception 'Pago por hora no válido' using errcode = '22023';
    end if;
    select worker_type into v_type from profiles where id = a.profile_id;
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
end $function$;

CREATE OR REPLACE FUNCTION public.add_visit(p_jobsite uuid, p_starts_at timestamp with time zone, p_minutes integer, p_profiles uuid[] DEFAULT '{}'::uuid[])
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_id uuid;
  j jobsites;
begin
  if not has_permission('schedule_ver_editar') then
    raise exception 'No tienes permiso para editar el schedule' using errcode = '42501';
  end if;
  select * into j from jobsites where id = p_jobsite;
  if j.id is null or j.status <> 'active' then raise exception 'El jobsite no existe o no está activo' using errcode = '22023'; end if;
  if p_starts_at is null or (local_day(p_starts_at) < cc_today() and not jobsite_is_legacy(p_jobsite)) or p_minutes is null or p_minutes not between 15 and 1440 then
    raise exception 'Fecha, hora o duración no válidas' using errcode = '22023';
  end if;
  insert into visits (jobsite_id, starts_at, minutes, local_date, generated, edited, created_by)
  values (p_jobsite, p_starts_at, p_minutes, local_day(p_starts_at), false, true, current_profile_id()) returning id into v_id;
  perform check_week_limit(v_id, p_profiles, p_minutes, local_day(p_starts_at));
  insert into visit_staff (visit_id, profile_id) select v_id, x from (select distinct unnest(coalesce(p_profiles, '{}')) x) t;
  insert into change_log (actor_id, action, entity, entity_id, detail)
  values (current_profile_id(), 'visita_agregada', 'visits', v_id,
          jsonb_build_object('name', j.name, 'day', local_day(p_starts_at), 'starts_at', p_starts_at, 'minutos', p_minutes));
  return v_id;
end $function$;

CREATE OR REPLACE FUNCTION public.update_visit(p_visit uuid, p_starts_at timestamp with time zone, p_minutes integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v visits;
  warn jsonb;
begin
  if not has_permission('schedule_ver_editar') then
    raise exception 'No tienes permiso para editar el schedule' using errcode = '42501';
  end if;
  select * into v from visits where id = p_visit for update;
  if v.id is null then raise exception 'La visita no existe' using errcode = 'P0002'; end if;
  if v.approved_at is not null or exists (select 1 from work_entries where visit_id = v.id) then
    raise exception 'La visita ya tiene trabajo registrado' using errcode = '22023';
  end if;
  if p_starts_at is null or (local_day(p_starts_at) < cc_today() and not jobsite_is_legacy(v.jobsite_id)) or p_minutes is null or p_minutes not between 15 and 1440 then
    raise exception 'Fecha, hora o duración no válidas' using errcode = '22023';
  end if;
  warn := check_week_limit(v.id, (select array_agg(profile_id) from visit_staff where visit_id = v.id), p_minutes, local_day(p_starts_at));
  update visits set starts_at = p_starts_at, minutes = p_minutes, local_date = local_day(p_starts_at), edited = true where id = v.id;
  insert into change_log (actor_id, action, entity, entity_id, detail)
  values (current_profile_id(), 'visita_cambiada', 'visits', v.id,
          jsonb_build_object('name', (select name from jobsites where id = v.jobsite_id),
                             'antes', jsonb_build_object('starts_at', v.starts_at, 'minutos', v.minutes),
                             'despues', jsonb_build_object('starts_at', p_starts_at, 'minutos', p_minutes)));
  return warn;
end $function$;

