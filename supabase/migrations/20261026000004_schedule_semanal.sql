-- D-232: el horario se arma semana por semana y se guarda cada semana. Las visitas ya no se generan solas 4 semanas
-- adelante (reemplaza esa parte de D-214): se detiene el trabajo programado diario y el generador queda sin efecto.
-- Las visitas que ya existen se conservan.

-- 1. Sin generación automática ------------------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from cron.job where jobname = 'cidclean-generar-visitas') then
    perform cron.unschedule('cidclean-generar-visitas');
  end if;
end $$;

-- Se conserva la firma porque la llaman schedule_range, my_schedule y jobsite_visits; ya no crea nada (D-232).
create or replace function generate_visits(p_jobsite uuid default null) returns int
language plpgsql security definer set search_path = public as $$
begin
  return 0;
end $$;
comment on function generate_visits(uuid) is 'Sin efecto desde D-232: las visitas salen de cada semana guardada (save_week).';

-- Cambiar la frecuencia, la hora o la duración ya no rehace visitas (salen de la semana guardada). Pausado y
-- Terminado siguen deteniendo las visitas futuras sin trabajo (D-210).
create or replace function jobsites_schedule_changed() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status and new.status <> 'active' then
    delete from visits v
     where v.jobsite_id = new.id and v.starts_at > now()
       and not exists (select 1 from work_entries w where w.visit_id = v.id);
  end if;
  return new;
end $$;

-- 2. Semana por semana ---------------------------------------------------------------------------------------------

-- ¿El jobsite trabaja ese día? Diaria todos; semanal los días marcados; "Otra" cualquier día (se arma a mano, D-200).
create function jobsite_works_on(p_jobsite uuid, p_day date) returns boolean
language sql stable security definer set search_path = public as $$
  select f is not null and (f->>'kind' = 'other' or frequency_hits(f, p_day))
    from (select jobsite_frequency_on(p_jobsite, p_day) f) x
$$;

-- La visita del jobsite en ese día que maneja la semana: la primera que no está quitada.
create function week_visit(p_jobsite uuid, p_day date) returns visits
language sql stable security definer set search_path = public as $$
  select * from visits where jobsite_id = p_jobsite and local_date = p_day and not removed order by starts_at, created_at limit 1
$$;

-- Plan de una semana (domingo a sábado, D-231): por jobsite activo, los días que trabaja, quién puede ir (asignados al
-- jobsite y quien ya esté en sus visitas de esa semana) y quién va cada día. Una semana sin guardar viene vacía.
create function week_plan(p_sunday date) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not has_permission('schedule_ver_editar') then
    raise exception 'No tienes permiso para ver el schedule' using errcode = '42501';
  end if;
  if p_sunday is null or week_monday(p_sunday) <> p_sunday then
    raise exception 'La semana empieza en domingo' using errcode = '22023';
  end if;
  return jsonb_build_object(
    'sunday', p_sunday,
    'staff', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.full_name) order by p.full_name)
                         from profiles p where p.active and not p.is_super_admin), '[]'::jsonb),
    'jobsites', coalesce((select jsonb_agg(x order by x->>'client', x->>'name') from (
      select jsonb_build_object(
        'id', j.id, 'name', j.name, 'client', c.name,
        'start_time', j.visit_start_time, 'minutes', j.visit_minutes,
        'days', (select coalesce(jsonb_agg(i order by i), '[]'::jsonb) from generate_series(0, 6) i
                  where jobsite_works_on(j.id, p_sunday + i)),
        'locked', (select coalesce(jsonb_agg(i order by i), '[]'::jsonb) from generate_series(0, 6) i
                    where p_sunday + i < cc_today()
                       or exists (select 1 from visits v where v.id = (week_visit(j.id, p_sunday + i)).id
                                    and (v.approved_at is not null or exists (select 1 from work_entries w where w.visit_id = v.id)))),
        'cells', (select jsonb_object_agg(i::text, coalesce((select jsonb_agg(s.profile_id order by s.profile_id) from visit_staff s
                                                             where s.visit_id = (week_visit(j.id, p_sunday + i)).id), '[]'::jsonb))
                    from generate_series(0, 6) i),
        'people', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.full_name, 'assigned', t.assigned)
                                             order by t.assigned desc, p.full_name)
            from (select profile_id, bool_or(assigned) assigned from (
                    select a.profile_id, true assigned from jobsite_assignments a
                     where a.jobsite_id = j.id and a.start_date <= p_sunday + 6 and (a.end_date is null or a.end_date >= p_sunday)
                    union all
                    select s.profile_id, false from visit_staff s join visits v on v.id = s.visit_id
                     where v.jobsite_id = j.id and not v.removed and v.local_date between p_sunday and p_sunday + 6) u
                  group by profile_id) t
            join profiles p on p.id = t.profile_id and p.active), '[]'::jsonb)) x
        from jobsites j join clients c on c.id = j.client_id
       where j.status = 'active') t), '[]'::jsonb));
end $$;

-- Guardar una semana (D-232). p_plan: [{"jobsite": uuid, "days": {"0": [personas], …, "6": [...]}}], 0 = domingo.
-- Por cada día de cada jobsite: con personas, crea la visita (hora y duración del jobsite) o cambia su personal; sin
-- personas, quita la visita si no tiene trabajo. No toca días pasados ni visitas con trabajo o aprobadas. Con más de
-- 32 h en la semana no guarda nada; devuelve quién queda desde 28 h para el aviso (D-214).
create function save_week(p_sunday date, p_plan jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := current_profile_id();
  item jsonb;
  j jobsites;
  i int;
  d date;
  ids uuid[];
  v visits;
  pid uuid;
  total int;
  warn jsonb := '[]'::jsonb;
  touched uuid[] := '{}';
  names text[] := '{}';
begin
  if not has_permission('schedule_ver_editar') then
    raise exception 'No tienes permiso para editar el schedule' using errcode = '42501';
  end if;
  if p_sunday is null or week_monday(p_sunday) <> p_sunday then
    raise exception 'La semana empieza en domingo' using errcode = '22023';
  end if;
  if jsonb_typeof(p_plan) is distinct from 'array' then raise exception 'Plan no válido' using errcode = '22023'; end if;

  for item in select * from jsonb_array_elements(p_plan) loop
    select * into j from jobsites where id = (item->>'jobsite')::uuid for update;
    if j.id is null then raise exception 'El jobsite no existe' using errcode = 'P0002'; end if;
    if j.status <> 'active' then raise exception 'El jobsite no está activo' using errcode = '22023'; end if;
    names := names || j.name;
    for i in 0..6 loop
      d := p_sunday + i;
      select coalesce(array_agg(distinct x::uuid), '{}') into ids from jsonb_array_elements_text(coalesce(item->'days'->(i::text), '[]'::jsonb)) x;
      if d < cc_today() then continue; end if;
      v := week_visit(j.id, d);
      if v.id is not null and (v.approved_at is not null or exists (select 1 from work_entries w where w.visit_id = v.id)) then
        continue;
      end if;
      if cardinality(ids) > 0 then
        if not jobsite_works_on(j.id, d) then raise exception 'no_day' using errcode = '22023'; end if;
        if j.visit_start_time is null or j.visit_minutes is null then raise exception 'no_time' using errcode = '22023'; end if;
        if exists (select 1 from unnest(ids) x where not exists (select 1 from profiles p where p.id = x and p.active)) then
          raise exception 'Alguien no existe o está inactivo' using errcode = '22023';
        end if;
        if v.id is null then
          -- Si hay una visita generada que se quitó ese día, se recupera; si no, se crea.
          select * into v from visits where jobsite_id = j.id and local_date = d and generated and removed limit 1;
          if v.id is not null then
            update visits set removed = false, starts_at = (d + j.visit_start_time) at time zone cc_tz(), minutes = j.visit_minutes
             where id = v.id;
          else
            insert into visits (jobsite_id, starts_at, minutes, local_date, generated, created_by)
            values (j.id, (d + j.visit_start_time) at time zone cc_tz(), j.visit_minutes, d, false, me) returning * into v;
          end if;
        end if;
        delete from visit_staff where visit_id = v.id and profile_id <> all(ids);
        insert into visit_staff (visit_id, profile_id) select v.id, x from unnest(ids) x on conflict do nothing;
        touched := touched || ids;
      elsif v.id is not null then
        if v.generated then
          update visits set removed = true where id = v.id;
          delete from visit_staff where visit_id = v.id;
        else
          delete from visits where id = v.id;
        end if;
      end if;
    end loop;
  end loop;

  -- 32 h (D-214): se mira la semana completa de cada persona, en todos los jobsites.
  foreach pid in array (select coalesce(array_agg(distinct x), '{}') from unnest(touched) x) loop
    total := programmed_minutes(pid, p_sunday);
    if total > 32 * 60 then
      raise exception 'over_32:%', (select full_name from profiles where id = pid) using errcode = '22023';
    end if;
    if total >= 28 * 60 then
      warn := warn || jsonb_build_object('id', pid, 'name', (select full_name from profiles where id = pid), 'week_minutes', total);
    end if;
  end loop;

  insert into change_log (actor_id, action, entity, entity_id, detail)
  values (me, 'semana_guardada', 'visits', null, jsonb_build_object('semana', p_sunday, 'jobsites', to_jsonb(names)));
  return warn;
end $$;

revoke execute on function jobsite_works_on(uuid, date), week_visit(uuid, date) from public, anon, authenticated;
revoke execute on function week_plan(date), save_week(date, jsonb) from public, anon;
grant execute on function week_plan(date), save_week(date, jsonb) to authenticated;
