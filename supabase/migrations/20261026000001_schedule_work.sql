-- Hito 6, Operaciones B: Schedule y Work registration.
-- Fuente: current/flujo.md ("Operaciones 3: Schedule y Work registration"), D-011, D-012, D-048 a D-054, D-093,
-- D-109, D-165, D-211, D-214, D-223 (el staff nunca ve sus horas contra el tope de 32 h) y D-227 (la frecuencia del
-- plan vigente alimenta el Schedule: mientras no exista el motor de planes se usa la frecuencia del jobsite, ver
-- jobsite_frequency_on).
-- Permisos (current/permisos.md): schedule_ver_editar (ver y editar el schedule, programar personal),
-- work_registrar_por_otros (registro por otros, D-052), work_editar (editar registros y cerrar turnos abiertos),
-- work_aprobar (aprobar, D-109), work_revisar_gps (revisar el GPS fuera de rango antes de aprobar, D-214).
-- Todo empleado ve su propio horario (semana actual y siguiente) y marca su entrada y salida sin permisos.
-- Nada se lee ni se escribe directo: todo por funciones que validan el permiso y dejan el historial.

-- Hora local de Cid Clean (Naples, Florida).
create function cc_tz() returns text language sql immutable as $$ select 'America/New_York' $$;
create function cc_today() returns date language sql stable set search_path = public as $$
  select (now() at time zone cc_tz())::date
$$;
create function local_day(p timestamptz) returns date language sql stable set search_path = public as $$
  select (p at time zone cc_tz())::date
$$;
-- Lunes de la semana de un día (las semanas van de lunes a domingo, D-214).
create function week_monday(p date) returns date language sql immutable as $$
  select p - (extract(isodow from p)::int - 1)
$$;

-- Distancia en metros entre dos puntos (fórmula del semiverseno).
create function distance_m(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
returns integer language sql immutable as $$
  select round(2 * 6371000 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2))))::int
$$;

-- Jobsite: hora y duración de las visitas (D-214) y punto del Plus Code convertido en la app (D-211) -----------
alter table jobsites add column visit_start_time time;
alter table jobsites add column visit_minutes int check (visit_minutes is null or visit_minutes between 15 and 1440);
alter table jobsites add column latitude double precision check (latitude is null or latitude between -90 and 90);
alter table jobsites add column longitude double precision check (longitude is null or longitude between -180 and 180);

-- Geocerca (D-214): 150 m alrededor del Plus Code.
create function geofence_m() returns int language sql immutable as $$ select 150 $$;

-- Visitas ------------------------------------------------------------------------------------------------
create table visits (
  id          uuid primary key default gen_random_uuid(),
  jobsite_id  uuid not null references jobsites(id) on delete cascade,
  starts_at   timestamptz not null,
  minutes     int not null check (minutes between 15 and 1440),
  local_date  date not null,
  -- La creó el generador por la frecuencia; edited = se cambió a mano (el generador ya no la toca).
  generated   boolean not null default false,
  edited      boolean not null default false,
  -- Una visita generada que se quita queda marcada (no se borra) para que el generador no la vuelva a crear.
  removed     boolean not null default false,
  approved_at timestamptz,
  approved_by uuid references profiles(id),
  created_by  uuid references profiles(id),
  created_at  timestamptz not null default now()
);
create unique index visits_generated_day on visits (jobsite_id, local_date) where generated;
create index visits_by_day on visits (local_date);

-- Personal programado en cada visita (el Schedule; el Work va aparte, D-011).
create table visit_staff (
  visit_id   uuid not null references visits(id) on delete cascade,
  profile_id uuid not null references profiles(id),
  primary key (visit_id, profile_id)
);

-- Registro del trabajo: entrada y salida de cada persona en una visita (D-011, D-214).
create table work_entries (
  id              uuid primary key default gen_random_uuid(),
  -- Id que genera el teléfono: la cola sin conexión reintenta sin duplicar.
  client_id       uuid unique,
  visit_id        uuid not null references visits(id) on delete restrict,
  profile_id      uuid not null references profiles(id),
  clock_in        timestamptz not null,
  clock_out       timestamptz,
  -- ok, out_of_range (fuera de los 150 m), no_location (sin permiso, sin señal o el jobsite sin punto), manual
  -- (lo registró otra persona, D-052).
  in_status       text not null check (in_status in ('ok', 'out_of_range', 'no_location', 'manual')),
  in_distance_m   int,
  out_status      text check (out_status in ('ok', 'out_of_range', 'no_location', 'manual')),
  out_distance_m  int,
  in_offline      boolean not null default false,
  out_offline     boolean not null default false,
  unscheduled     boolean not null default false,
  recorded_by     uuid references profiles(id),
  gps_reviewed_by uuid references profiles(id),
  gps_reviewed_at timestamptz,
  -- Al aprobar (D-109): minutos que se pagan (horas reales o garantizadas) y monto, si el pago es por hora o por
  -- visita. Las tarifas fijas por semana o por mes se calculan por periodo en Accounting (hito 7).
  pay_minutes     int,
  pay_amount      numeric(12, 2),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (visit_id, profile_id),
  constraint work_entries_order check (clock_out is null or clock_out > clock_in)
);

alter table visits enable row level security;
alter table visit_staff enable row level security;
alter table work_entries enable row level security;
revoke all on visits, visit_staff, work_entries from anon, authenticated;

-- Necesita revisión del admin (D-214): GPS fuera de rango, sin ubicación, marcado sin conexión o sin estar programado.
create function work_needs_review(w work_entries) returns boolean language sql immutable as $$
  select w.in_status in ('out_of_range', 'no_location') or coalesce(w.out_status in ('out_of_range', 'no_location'), false)
      or w.in_offline or w.out_offline or w.unscheduled
$$;
-- GPS fuera de rango sin revisar (lo revisa quien tiene work_revisar_gps antes de aprobar, D-214).
create function work_gps_pending(w work_entries) returns boolean language sql immutable as $$
  select (w.in_status = 'out_of_range' or w.out_status = 'out_of_range') and w.gps_reviewed_at is null
$$;

-- Generador de visitas --------------------------------------------------------------------------------------

-- D-227: punto de enganche. Cuando exista el motor de planes por temporada, la frecuencia del día sale del plan
-- vigente; hoy es la frecuencia del jobsite.
create function jobsite_frequency_on(p_jobsite uuid, p_day date) returns jsonb
language sql stable security definer set search_path = public as $$
  select frequency from jobsites where id = p_jobsite
$$;

-- ¿Le toca visita a ese día? Diaria todos; semanal los días marcados (0 = lunes ... 6 = domingo); "Otra" a mano.
create function frequency_hits(p_frequency jsonb, p_day date) returns boolean language sql immutable as $$
  select case p_frequency->>'kind'
    when 'daily' then true
    when 'weekly' then exists (select 1 from jsonb_array_elements(p_frequency->'days') d where d::int = extract(isodow from p_day)::int - 1)
    else false end
$$;

-- Horas programadas de una persona en la semana (lunes a domingo, todos los jobsites), sin contar una visita.
create function programmed_minutes(p_profile uuid, p_monday date, p_except uuid default null) returns int
language sql stable security definer set search_path = public as $$
  select coalesce(sum(v.minutes), 0)::int from visit_staff s join visits v on v.id = s.visit_id
   where not v.removed and s.profile_id = p_profile and v.local_date between p_monday and p_monday + 6
     and (p_except is null or v.id <> p_except)
$$;

-- Genera las visitas de las próximas 4 semanas (D-214) de un jobsite o de todos los activos, sin repetir días.
-- Al crear una visita programa al personal asignado ese día, salvo a quien pasaría de 32 h en esa semana.
create function generate_visits(p_jobsite uuid default null) returns int
language plpgsql security definer set search_path = public as $$
declare
  j jobsites;
  d date;
  v_id uuid;
  n int := 0;
  freq jsonb;
begin
  for j in select * from jobsites where status = 'active' and visit_start_time is not null and visit_minutes is not null
                                    and (p_jobsite is null or id = p_jobsite) loop
    for d in select generate_series(greatest(cc_today(), coalesce(j.start_date, cc_today())), cc_today() + 27, interval '1 day')::date loop
      freq := jobsite_frequency_on(j.id, d);
      if freq is null or not frequency_hits(freq, d) then continue; end if;
      insert into visits (jobsite_id, starts_at, minutes, local_date, generated)
      values (j.id, (d + j.visit_start_time) at time zone cc_tz(), j.visit_minutes, d, true)
      on conflict (jobsite_id, local_date) where generated do nothing
      returning id into v_id;
      if v_id is null then continue; end if;
      n := n + 1;
      insert into visit_staff (visit_id, profile_id)
      select v_id, a.profile_id from jobsite_assignments a join profiles p on p.id = a.profile_id and p.active
       where a.jobsite_id = j.id and a.start_date <= d and (a.end_date is null or a.end_date >= d)
         and programmed_minutes(a.profile_id, week_monday(d)) + j.visit_minutes <= 32 * 60;
      v_id := null;
    end loop;
  end loop;
  return n;
end $$;

-- Si cambian la frecuencia, la hora o la duración, o el jobsite se pausa o termina, las visitas futuras generadas
-- y sin cambios a mano ni trabajo se rehacen (o se quitan: Pausado y Terminado detienen visitas, D-210).
create function jobsites_schedule_changed() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (old.frequency, old.visit_start_time, old.visit_minutes, old.status, old.start_date)
     is not distinct from (new.frequency, new.visit_start_time, new.visit_minutes, new.status, new.start_date) then
    return new;
  end if;
  delete from visits v
   where v.jobsite_id = new.id and v.starts_at > now()
     and (new.status <> 'active' or (v.generated and not v.edited))
     and not exists (select 1 from work_entries w where w.visit_id = v.id);
  if new.status = 'active' then perform generate_visits(new.id); end if;
  return new;
end $$;
create trigger jobsites_schedule_changed after update on jobsites for each row execute function jobsites_schedule_changed();

-- Personal: quitar a alguien del jobsite lo saca de sus visitas futuras (D-210: con fecha de fin).
create function assignment_ended() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.end_date is not null and new.end_date is distinct from old.end_date then
    delete from visit_staff s using visits v
     where s.visit_id = v.id and s.profile_id = new.profile_id and v.jobsite_id = new.jobsite_id and v.local_date > new.end_date;
  end if;
  return new;
end $$;
create trigger jobsite_assignments_ended after update on jobsite_assignments for each row execute function assignment_ended();

-- Hora, duración y punto del jobsite ----------------------------------------------------------------------------

create function set_jobsite_visit_time(p_jobsite uuid, p_start time, p_minutes int) returns void
language plpgsql security definer set search_path = public as $$
declare
  j jobsites;
begin
  if not (has_permission('schedule_ver_editar') or has_permission('clientes_editar_datos')) then
    raise exception 'No tienes permiso para cambiar la hora de las visitas' using errcode = '42501';
  end if;
  if p_start is null or p_minutes is null or p_minutes not between 15 and 1440 then
    raise exception 'Hora o duración no válidas' using errcode = '22023';
  end if;
  select * into j from jobsites where id = p_jobsite;
  if j.id is null then raise exception 'El jobsite no existe' using errcode = 'P0002'; end if;
  update jobsites set visit_start_time = p_start, visit_minutes = p_minutes where id = p_jobsite;
  insert into change_log (actor_id, action, entity, entity_id, detail)
  values (current_profile_id(), 'horario_jobsite_cambiado', 'jobsites', p_jobsite,
          jsonb_build_object('name', j.name, 'antes', jsonb_build_object('hora', j.visit_start_time, 'minutos', j.visit_minutes),
                             'despues', jsonb_build_object('hora', p_start, 'minutos', p_minutes)));
end $$;

-- La app convierte el Plus Code a coordenadas (D-211) y las guarda aquí; el servidor mide la distancia.
create function set_jobsite_location(p_jobsite uuid, p_lat double precision, p_lng double precision) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not has_permission('clientes_editar_datos') then
    raise exception 'No tienes permiso para editar jobsites' using errcode = '42501';
  end if;
  if (p_lat is null) <> (p_lng is null) or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    raise exception 'Ubicación no válida' using errcode = '22023';
  end if;
  update jobsites set latitude = p_lat, longitude = p_lng where id = p_jobsite;
  if not found then raise exception 'El jobsite no existe' using errcode = 'P0002'; end if;
end $$;

-- Schedule del admin: lista por día (D-214) ----------------------------------------------------------------------

-- Visitas de un rango de días con su jobsite, el personal programado y el estado del trabajo. Las horas de la semana
-- de cada persona (aviso desde 28 h, D-214) salen aquí y solo aquí: el staff nunca las ve (D-223).
create function schedule_range(p_from date, p_to date) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not has_permission('schedule_ver_editar') then
    raise exception 'No tienes permiso para ver el schedule' using errcode = '42501';
  end if;
  if p_to < p_from or p_to - p_from > 62 then raise exception 'Rango no válido' using errcode = '22023'; end if;
  perform generate_visits();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', v.id, 'jobsite_id', j.id, 'jobsite', j.name, 'client', c.name, 'day', v.local_date, 'starts_at', v.starts_at,
      'minutes', v.minutes, 'generated', v.generated, 'approved', v.approved_at is not null,
      'worked', exists (select 1 from work_entries w where w.visit_id = v.id),
      'staff', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.full_name,
                          'week_minutes', programmed_minutes(p.id, week_monday(v.local_date))) order by p.full_name)
                         from visit_staff s join profiles p on p.id = s.profile_id where s.visit_id = v.id), '[]'::jsonb))
      order by v.starts_at, j.name)
      from visits v join jobsites j on j.id = v.jobsite_id join clients c on c.id = j.client_id
     where not v.removed and v.local_date between p_from and p_to), '[]'::jsonb);
end $$;

-- Personas que se pueden programar en una visita: las asignadas al jobsite ese día primero; luego el resto activo.
create function schedulable_staff(p_visit uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v visits;
begin
  if not has_permission('schedule_ver_editar') then
    raise exception 'No tienes permiso para ver el schedule' using errcode = '42501';
  end if;
  select * into v from visits where id = p_visit;
  if v.id is null then raise exception 'La visita no existe' using errcode = 'P0002'; end if;
  return coalesce((select jsonb_agg(x order by (x->>'assigned')::boolean desc, x->>'name') from (
    select jsonb_build_object('id', p.id, 'name', p.full_name,
             'assigned', exists (select 1 from jobsite_assignments a where a.jobsite_id = v.jobsite_id and a.profile_id = p.id
                                   and a.start_date <= v.local_date and (a.end_date is null or a.end_date >= v.local_date)),
             'week_minutes', programmed_minutes(p.id, week_monday(v.local_date), v.id)) x
      from profiles p where p.active and not p.is_super_admin) t), '[]'::jsonb);
end $$;

-- Revisa las 32 h (D-214): con más de 32 h no deja programar; devuelve quién queda desde 28 h para el aviso.
create function check_week_limit(p_visit uuid, p_profiles uuid[], p_minutes int, p_day date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  pid uuid;
  total int;
  warn jsonb := '[]'::jsonb;
begin
  foreach pid in array coalesce(p_profiles, '{}') loop
    total := programmed_minutes(pid, week_monday(p_day), p_visit) + p_minutes;
    if total > 32 * 60 then
      raise exception 'over_32:%', (select full_name from profiles where id = pid) using errcode = '22023';
    end if;
    if total >= 28 * 60 then
      warn := warn || jsonb_build_object('id', pid, 'name', (select full_name from profiles where id = pid), 'week_minutes', total);
    end if;
  end loop;
  return warn;
end $$;

-- Programar el personal de una visita (cambios y reemplazos, sin cifras: también el supervisor, D-210).
create function set_visit_staff(p_visit uuid, p_profiles uuid[]) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v visits;
  warn jsonb;
  antes jsonb;
begin
  if not has_permission('schedule_ver_editar') then
    raise exception 'No tienes permiso para editar el schedule' using errcode = '42501';
  end if;
  select * into v from visits where id = p_visit for update;
  if v.id is null then raise exception 'La visita no existe' using errcode = 'P0002'; end if;
  if v.approved_at is not null then raise exception 'La visita ya está aprobada' using errcode = '22023'; end if;
  if exists (select 1 from unnest(coalesce(p_profiles, '{}')) x where not exists (select 1 from profiles p where p.id = x and p.active)) then
    raise exception 'Alguien no existe o está inactivo' using errcode = '22023';
  end if;
  warn := check_week_limit(v.id, p_profiles, v.minutes, v.local_date);
  select coalesce(jsonb_agg(p.full_name order by p.full_name), '[]'::jsonb) into antes
    from visit_staff s join profiles p on p.id = s.profile_id where s.visit_id = v.id;
  delete from visit_staff where visit_id = v.id;
  insert into visit_staff (visit_id, profile_id) select v.id, x from (select distinct unnest(coalesce(p_profiles, '{}')) x) t;
  insert into change_log (actor_id, action, entity, entity_id, detail)
  values (current_profile_id(), 'visita_personal_cambiado', 'visits', v.id,
          jsonb_build_object('name', (select name from jobsites where id = v.jobsite_id), 'day', v.local_date, 'antes', antes,
                             'despues', (select coalesce(jsonb_agg(full_name order by full_name), '[]'::jsonb) from profiles where id = any(p_profiles))));
  return warn;
end $$;

-- Visita a mano (frecuencia "Otra" o un día extra, D-214).
create function add_visit(p_jobsite uuid, p_starts_at timestamptz, p_minutes int, p_profiles uuid[] default '{}') returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  j jobsites;
begin
  if not has_permission('schedule_ver_editar') then
    raise exception 'No tienes permiso para editar el schedule' using errcode = '42501';
  end if;
  select * into j from jobsites where id = p_jobsite;
  if j.id is null or j.status <> 'active' then raise exception 'El jobsite no existe o no está activo' using errcode = '22023'; end if;
  if p_starts_at is null or local_day(p_starts_at) < cc_today() or p_minutes is null or p_minutes not between 15 and 1440 then
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
end $$;

-- Cambiar la hora o la duración de una visita (D-214: se cambian por visita).
create function update_visit(p_visit uuid, p_starts_at timestamptz, p_minutes int) returns jsonb
language plpgsql security definer set search_path = public as $$
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
  if p_starts_at is null or local_day(p_starts_at) < cc_today() or p_minutes is null or p_minutes not between 15 and 1440 then
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
end $$;

-- Quitar una visita (las visitas siempre se hacen: si una no se hará, se quita, D-011). Con trabajo no se quita.
create function delete_visit(p_visit uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v visits;
begin
  if not has_permission('schedule_ver_editar') then
    raise exception 'No tienes permiso para editar el schedule' using errcode = '42501';
  end if;
  select * into v from visits where id = p_visit for update;
  if v.id is null then raise exception 'La visita no existe' using errcode = 'P0002'; end if;
  if exists (select 1 from work_entries where visit_id = v.id) then
    raise exception 'La visita ya tiene trabajo registrado' using errcode = '22023';
  end if;
  insert into change_log (actor_id, action, entity, entity_id, detail)
  values (current_profile_id(), 'visita_quitada', 'visits', v.id,
          jsonb_build_object('name', (select name from jobsites where id = v.jobsite_id), 'day', v.local_date, 'starts_at', v.starts_at));
  if v.generated then
    delete from visit_staff where visit_id = v.id;
    update visits set removed = true, edited = true where id = v.id;
  else
    delete from visits where id = v.id;
  end if;
end $$;

-- Horario del staff (D-012, D-048, D-093, D-165) -----------------------------------------------------------------

-- Mis visitas de la semana actual y la siguiente (no más). Sin cifras de horas (D-223).
create function my_schedule() returns jsonb
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
                  from work_entries w where w.visit_id = v.id and w.profile_id = me))
      order by v.starts_at)
      from visits v join jobsites j on j.id = v.jobsite_id
     where not v.removed and v.local_date between mon and mon + 13
       and (exists (select 1 from visit_staff s where s.visit_id = v.id and s.profile_id = me)
            -- Hoy también las visitas de sus jobsites aunque no esté programado (D-214: queda para revisión).
            or (v.local_date = cc_today() and exists (select 1 from jobsite_assignments a where a.jobsite_id = v.jobsite_id and a.profile_id = me
                                                     and a.start_date <= v.local_date and (a.end_date is null or a.end_date >= v.local_date)))
            or exists (select 1 from work_entries w where w.visit_id = v.id and w.profile_id = me))), '[]'::jsonb);
end $$;

-- Marcar entrada y salida (D-049 a D-051, D-214) ----------------------------------------------------------------

-- Distancia al jobsite antes de marcar (D-051: "Estás a X m del sitio"). No guarda nada.
create function visit_distance(p_visit uuid, p_lat double precision, p_lng double precision) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  j jobsites;
  d int;
begin
  if current_profile_id() is null then raise exception 'Sin sesión' using errcode = '42501'; end if;
  select jb.* into j from visits v join jobsites jb on jb.id = v.jobsite_id where v.id = p_visit;
  if j.id is null then raise exception 'La visita no existe' using errcode = 'P0002'; end if;
  if p_lat is null or j.latitude is null then return jsonb_build_object('status', 'no_location'); end if;
  d := distance_m(p_lat, p_lng, j.latitude, j.longitude);
  return jsonb_build_object('status', case when d <= geofence_m() then 'ok' else 'out_of_range' end, 'distance_m', d);
end $$;

create function location_status(p_visit uuid, p_lat double precision, p_lng double precision, out status text, out dist int)
language plpgsql stable security definer set search_path = public as $$
declare
  j jobsites;
begin
  select jb.* into j from visits v join jobsites jb on jb.id = v.jobsite_id where v.id = p_visit;
  if p_lat is null or p_lng is null or j.latitude is null then status := 'no_location'; return; end if;
  dist := distance_m(p_lat, p_lng, j.latitude, j.longitude);
  status := case when dist <= geofence_m() then 'ok' else 'out_of_range' end;
end $$;

-- Entrada: a cualquier hora del día de la visita (D-214). Sin conexión, el teléfono manda la hora en que se marcó.
create function clock_in(p_visit uuid, p_client_id uuid, p_at timestamptz, p_lat double precision, p_lng double precision,
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
  if local_day(v_at) <> v.local_date then raise exception 'not_today' using errcode = '22023'; end if;
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
end $$;

-- Salida: se valida igual que la entrada (D-214).
create function clock_out(p_entry uuid, p_at timestamptz, p_lat double precision, p_lng double precision, p_offline boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := current_profile_id();
  w work_entries;
  v_at timestamptz;
  loc record;
begin
  if me is null then raise exception 'Sin sesión' using errcode = '42501'; end if;
  select * into w from work_entries where id = p_entry for update;
  if w.id is null or w.profile_id <> me then raise exception 'El registro no existe' using errcode = 'P0002'; end if;
  if w.clock_out is not null then
    return jsonb_build_object('id', w.id, 'status', w.out_status, 'clock_out', w.clock_out);
  end if;
  v_at := case when coalesce(p_offline, false) and p_at is not null and p_at <= now() + interval '5 minutes' then p_at else now() end;
  if v_at <= w.clock_in then raise exception 'La salida debe ser después de la entrada' using errcode = '22023'; end if;
  select * into loc from location_status(w.visit_id, p_lat, p_lng);
  update work_entries set clock_out = v_at, out_status = loc.status, out_distance_m = loc.dist, out_offline = coalesce(p_offline, false),
         updated_at = now() where id = w.id returning * into w;
  return jsonb_build_object('id', w.id, 'status', w.out_status, 'distance_m', w.out_distance_m, 'clock_out', w.clock_out);
end $$;

-- Registro por otros (D-052): una fila por persona con entrada y salida. Parte de lo programado y se ajusta.
create function record_work(p_visit uuid, p_rows jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  v visits;
  r jsonb;
  pid uuid;
  cin timestamptz;
  cout timestamptz;
begin
  if not has_permission('work_registrar_por_otros') then
    raise exception 'No tienes permiso para registrar trabajo por otros' using errcode = '42501';
  end if;
  select * into v from visits where id = p_visit and not removed for update;
  if v.id is null then raise exception 'La visita no existe' using errcode = 'P0002'; end if;
  if v.approved_at is not null then raise exception 'La visita ya está aprobada' using errcode = '22023'; end if;
  if v.local_date > cc_today() then raise exception 'La visita todavía no ocurre' using errcode = '22023'; end if;
  for r in select * from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) loop
    pid := (r->>'profile_id')::uuid;
    cin := (r->>'clock_in')::timestamptz;
    cout := nullif(r->>'clock_out', '')::timestamptz;
    if pid is null or cin is null or (cout is not null and cout <= cin) or not exists (select 1 from profiles where id = pid and active) then
      raise exception 'Fila no válida' using errcode = '22023';
    end if;
    insert into work_entries (visit_id, profile_id, clock_in, clock_out, in_status, out_status, recorded_by, unscheduled)
    values (v.id, pid, cin, cout, 'manual', case when cout is null then null else 'manual' end, current_profile_id(),
            not exists (select 1 from visit_staff s where s.visit_id = v.id and s.profile_id = pid))
    on conflict (visit_id, profile_id) do update
      set clock_in = excluded.clock_in, clock_out = excluded.clock_out, recorded_by = excluded.recorded_by, updated_at = now(),
          in_status = case when work_entries.recorded_by is null then work_entries.in_status else 'manual' end,
          out_status = case when excluded.clock_out is null then null
                            when work_entries.recorded_by is null and work_entries.clock_out is not null then work_entries.out_status
                            else 'manual' end;
  end loop;
  insert into change_log (actor_id, action, entity, entity_id, detail)
  values (current_profile_id(), 'trabajo_registrado', 'visits', v.id,
          jsonb_build_object('name', (select name from jobsites where id = v.jobsite_id), 'day', v.local_date,
                             'personas', jsonb_array_length(coalesce(p_rows, '[]'::jsonb))));
end $$;

-- Editar las horas de un registro (lápiz de D-109) o cerrar un turno olvidado (D-214: lo cierra un supervisor).
create function edit_work_entry(p_entry uuid, p_in timestamptz, p_out timestamptz) returns void
language plpgsql security definer set search_path = public as $$
declare
  w work_entries;
begin
  if not has_permission('work_editar') then
    raise exception 'No tienes permiso para editar registros de trabajo' using errcode = '42501';
  end if;
  select * into w from work_entries where id = p_entry for update;
  if w.id is null then raise exception 'El registro no existe' using errcode = 'P0002'; end if;
  if (select approved_at from visits where id = w.visit_id) is not null then
    raise exception 'La visita ya está aprobada' using errcode = '22023';
  end if;
  if p_in is null or (p_out is not null and p_out <= p_in) then raise exception 'Horas no válidas' using errcode = '22023'; end if;
  update work_entries set clock_in = p_in, clock_out = p_out,
         out_status = case when p_out is null then null when w.clock_out is null then 'manual' else w.out_status end,
         updated_at = now() where id = w.id;
  insert into change_log (actor_id, action, entity, entity_id, detail)
  values (current_profile_id(), 'trabajo_editado', 'work_entries', w.id,
          jsonb_build_object('employee', (select full_name from profiles where id = w.profile_id),
                             'antes', jsonb_build_object('in', w.clock_in, 'out', w.clock_out),
                             'despues', jsonb_build_object('in', p_in, 'out', p_out)));
end $$;

-- Revisar el GPS fuera de rango (D-214: antes de aprobar, con work_revisar_gps).
create function review_work_gps(p_entry uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  w work_entries;
begin
  if not has_permission('work_revisar_gps') then
    raise exception 'No tienes permiso para revisar el GPS' using errcode = '42501';
  end if;
  select * into w from work_entries where id = p_entry for update;
  if w.id is null then raise exception 'El registro no existe' using errcode = 'P0002'; end if;
  update work_entries set gps_reviewed_by = current_profile_id(), gps_reviewed_at = now() where id = w.id;
  insert into change_log (actor_id, action, entity, entity_id, detail)
  values (current_profile_id(), 'gps_revisado', 'work_entries', w.id,
          jsonb_build_object('employee', (select full_name from profiles where id = w.profile_id),
                             'distancia', greatest(w.in_distance_m, w.out_distance_m)));
end $$;

-- Pago de un registro al aprobar (D-009, D-214): horas al minuto; horas garantizadas por visita; tarifa fija por
-- visita. Por semana o por mes se calcula por periodo en Accounting (hito 7).
create function work_pay(w work_entries, out pay_minutes int, out pay_amount numeric)
language plpgsql stable security definer set search_path = public as $$
declare
  v visits;
  p assignment_pay;
  worked int;
begin
  select * into v from visits where id = w.visit_id;
  worked := round(extract(epoch from (w.clock_out - w.clock_in)) / 60)::int;
  pay_minutes := worked;
  select x.* into p from jobsite_assignments a join assignment_pay x on x.assignment_id = a.id
   where a.jobsite_id = v.jobsite_id and a.profile_id = w.profile_id and a.start_date <= v.local_date
     and (a.end_date is null or a.end_date >= v.local_date) and x.effective_from <= v.local_date
   order by x.effective_from desc limit 1;
  if p.id is null then return; end if;
  if p.kind = 'hourly' then
    pay_minutes := greatest(worked, coalesce(round(p.guaranteed_hours * 60)::int, 0));
    pay_amount := round(p.hourly_rate * pay_minutes / 60.0, 2);
  elsif p.fixed_period = 'visit' then
    pay_amount := p.fixed_amount;
  end if;
end $$;

-- Aprobar (D-109): todo cerrado y el GPS fuera de rango revisado. Solo lo aprobado cuenta para nómina y Accounting.
create function approve_visit(p_visit uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v visits;
  w work_entries;
  pay record;
begin
  if not has_permission('work_aprobar') then
    raise exception 'No tienes permiso para aprobar trabajo' using errcode = '42501';
  end if;
  select * into v from visits where id = p_visit for update;
  if v.id is null then raise exception 'La visita no existe' using errcode = 'P0002'; end if;
  if v.approved_at is not null then return; end if;
  if not exists (select 1 from work_entries where visit_id = v.id) then
    raise exception 'no_work' using errcode = '22023';
  end if;
  if exists (select 1 from work_entries where visit_id = v.id and clock_out is null) then
    raise exception 'open_shift' using errcode = '22023';
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

-- Trabajos por aprobar (D-053, D-054): visitas con trabajo sin aprobar, la más antigua primero.
create function work_to_approve() returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not (has_permission('work_aprobar') or has_permission('work_editar') or has_permission('work_revisar_gps')) then
    raise exception 'No tienes permiso para ver el trabajo por aprobar' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', v.id, 'jobsite', j.name, 'day', v.local_date, 'starts_at', v.starts_at,
      'people', (select count(*) from work_entries w where w.visit_id = v.id),
      'minutes', (select coalesce(sum(round(extract(epoch from (w.clock_out - w.clock_in)) / 60)), 0)::int
                    from work_entries w where w.visit_id = v.id and w.clock_out is not null),
      'open', exists (select 1 from work_entries w where w.visit_id = v.id and w.clock_out is null),
      'gps_out', exists (select 1 from work_entries w where w.visit_id = v.id and work_gps_pending(w)),
      'review', exists (select 1 from work_entries w where w.visit_id = v.id and work_needs_review(w)),
      -- Urgente (D-131): más de 1 día esperando.
      'urgent', v.local_date < cc_today() - 1)
      order by v.starts_at)
      from visits v join jobsites j on j.id = v.jobsite_id
     where v.approved_at is null and exists (select 1 from work_entries w where w.visit_id = v.id)), '[]'::jsonb);
end $$;

-- Detalle de un trabajo (D-109): una fila por persona con su horario, horas y avisos; programados sin registro.
create function visit_work(p_visit uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v visits;
begin
  if not (has_permission('work_aprobar') or has_permission('work_editar') or has_permission('work_revisar_gps')
          or has_permission('work_registrar_por_otros')) then
    raise exception 'No tienes permiso para ver el trabajo' using errcode = '42501';
  end if;
  select * into v from visits where id = p_visit;
  if v.id is null then raise exception 'La visita no existe' using errcode = 'P0002'; end if;
  return jsonb_build_object(
    'id', v.id, 'jobsite', (select name from jobsites where id = v.jobsite_id), 'day', v.local_date, 'starts_at', v.starts_at,
    'minutes', v.minutes, 'approved', v.approved_at is not null,
    'entries', coalesce((select jsonb_agg(jsonb_build_object(
        'id', w.id, 'profile_id', w.profile_id, 'name', p.full_name, 'clock_in', w.clock_in, 'clock_out', w.clock_out,
        'in_status', w.in_status, 'out_status', w.out_status, 'distance_m', greatest(w.in_distance_m, w.out_distance_m),
        'offline', w.in_offline or w.out_offline, 'unscheduled', w.unscheduled, 'manual', w.recorded_by is not null,
        'gps_pending', work_gps_pending(w), 'gps_reviewed', w.gps_reviewed_at is not null) order by p.full_name)
      from work_entries w join profiles p on p.id = w.profile_id where w.visit_id = v.id), '[]'::jsonb),
    'scheduled', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.full_name) order by p.full_name)
      from visit_staff s join profiles p on p.id = s.profile_id where s.visit_id = v.id), '[]'::jsonb));
end $$;

-- Pendientes del Inicio (D-111, D-131, D-214): por aprobar, GPS fuera de rango, entradas olvidadas a los 30 min y
-- turnos abiertos de días anteriores. Cada cifra solo con su permiso.
create function work_home_pending() returns jsonb
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
      from visits v where v.approved_at is null and exists (select 1 from work_entries w where w.visit_id = v.id);
  end if;
  if has_permission('work_revisar_gps') then
    select count(*) into gps from work_entries w join visits v on v.id = w.visit_id where v.approved_at is null and work_gps_pending(w);
  end if;
  if has_permission('schedule_ver_editar') or has_permission('work_registrar_por_otros') then
    select count(*) into forgot from visit_staff s join visits v on v.id = s.visit_id
     where not v.removed and v.local_date = cc_today() and v.starts_at + interval '30 minutes' <= now()
       and not exists (select 1 from work_entries w where w.visit_id = v.id and w.profile_id = s.profile_id);
  end if;
  if has_permission('work_editar') then
    select count(*) into open_shifts from work_entries w join visits v on v.id = w.visit_id
     where w.clock_out is null and v.local_date < cc_today();
  end if;
  return jsonb_build_object('to_approve', approve, 'urgent', urgent, 'gps_out', gps, 'forgot_clock_in', forgot, 'open_shifts', open_shifts);
end $$;

-- Pestaña Horario del jobsite (D-055): sus próximas visitas con el personal programado.
create function jobsite_visits(p_jobsite uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not (has_permission('clientes_ver') or has_permission('schedule_ver_editar')) then
    raise exception 'No tienes permiso para ver el jobsite' using errcode = '42501';
  end if;
  perform generate_visits(p_jobsite);
  return jsonb_build_object(
    'start_time', (select visit_start_time from jobsites where id = p_jobsite),
    'minutes', (select visit_minutes from jobsites where id = p_jobsite),
    'visits', coalesce((select jsonb_agg(jsonb_build_object('id', v.id, 'day', v.local_date, 'starts_at', v.starts_at, 'minutes', v.minutes,
        'staff', coalesce((select jsonb_agg(p.full_name order by p.full_name) from visit_staff s join profiles p on p.id = s.profile_id
                           where s.visit_id = v.id), '[]'::jsonb)) order by v.starts_at)
      from visits v where v.jobsite_id = p_jobsite and not v.removed and v.local_date between cc_today() and cc_today() + 27), '[]'::jsonb));
end $$;

-- Permisos de ejecución -------------------------------------------------------------------------------------
revoke execute on function cc_tz(), cc_today(), local_day(timestamptz), week_monday(date), distance_m(double precision, double precision, double precision, double precision),
  geofence_m(), work_needs_review(work_entries), work_gps_pending(work_entries), jobsite_frequency_on(uuid, date),
  frequency_hits(jsonb, date), programmed_minutes(uuid, date, uuid), generate_visits(uuid), jobsites_schedule_changed(),
  assignment_ended(), check_week_limit(uuid, uuid[], int, date), location_status(uuid, double precision, double precision),
  work_pay(work_entries) from public, anon, authenticated;
revoke execute on function set_jobsite_visit_time(uuid, time, int), set_jobsite_location(uuid, double precision, double precision),
  schedule_range(date, date), schedulable_staff(uuid), set_visit_staff(uuid, uuid[]), add_visit(uuid, timestamptz, int, uuid[]),
  update_visit(uuid, timestamptz, int), delete_visit(uuid), my_schedule(),
  visit_distance(uuid, double precision, double precision), clock_in(uuid, uuid, timestamptz, double precision, double precision, boolean),
  clock_out(uuid, timestamptz, double precision, double precision, boolean), record_work(uuid, jsonb),
  edit_work_entry(uuid, timestamptz, timestamptz), review_work_gps(uuid), approve_visit(uuid), work_to_approve(), visit_work(uuid),
  work_home_pending(), jobsite_visits(uuid) from public, anon;
grant execute on function set_jobsite_visit_time(uuid, time, int), set_jobsite_location(uuid, double precision, double precision),
  schedule_range(date, date), schedulable_staff(uuid), set_visit_staff(uuid, uuid[]), add_visit(uuid, timestamptz, int, uuid[]),
  update_visit(uuid, timestamptz, int), delete_visit(uuid), my_schedule(),
  visit_distance(uuid, double precision, double precision), clock_in(uuid, uuid, timestamptz, double precision, double precision, boolean),
  clock_out(uuid, timestamptz, double precision, double precision, boolean), record_work(uuid, jsonb),
  edit_work_entry(uuid, timestamptz, timestamptz), review_work_gps(uuid), approve_visit(uuid), work_to_approve(), visit_work(uuid),
  work_home_pending(), jobsite_visits(uuid) to authenticated;
grant execute on function generate_visits(uuid) to service_role;
