-- Hito 5, Operaciones A: Clientes, Jobsites y pago del personal por jobsite.
-- Amplía el modelo básico de Cliente y Jobsite de 20261024000001_quotes.sql (hito 4) sin rehacerlo.
-- Fuente: current/flujo.md ("Operaciones 1" y "Operaciones 2"), current/permisos.md, D-009, D-010, D-055, D-056,
-- D-059 a D-061, D-082, D-096, D-097, D-100, D-125, D-208, D-210, D-211.
-- Permisos: clientes_ver (ver), clientes_editar_datos (datos y contactos; alta de clientes previos con
-- clientes_ver_tarifa), clientes_editar_walkthrough_sow (SOW), clientes_ver_tarifa (tarifa y contrato),
-- clientes_cambiar_estado (estado), empleados_ver_pagos (ver pagos), empleados_asignar_pago (asignar y definir pago).

-- Datos del Cliente (pantalla simple con datos de la empresa, D-210) -----------------------------------------
alter table clients add column phone text;
alter table clients add column email text;
alter table clients add column address text;
alter table clients add column notes text;

-- Datos del Jobsite -------------------------------------------------------------------------------------
alter table jobsites add column plus_code text;                 -- D-211: "66G8+4P Naples, Florida"
alter table jobsites add column emergency_name text;            -- D-210: nombre, teléfono, relación y correo
alter table jobsites add column emergency_phone text;
alter table jobsites add column emergency_relation text;
alter table jobsites add column emergency_email text;
alter table jobsites add column start_date date;                -- inicio del contrato (D-215: ingreso esperado)
-- Horas estimadas por empleado y por visita, del walkthrough (D-210: alerta de margen hasta que exista el Schedule).
alter table jobsites add column est_hours_per_visit numeric(6, 2) check (est_hours_per_visit is null or est_hours_per_visit between 0 and 24);
-- Visitas por mes cuando la frecuencia es "Otra" (texto libre, D-080): la escribe quien edita los datos.
alter table jobsites add column visits_per_month numeric(6, 2) check (visits_per_month is null or visits_per_month between 0 and 62);
alter table jobsites add column status_changed_at timestamptz;

-- Documentos versionados (D-055: SOW, contrato y otros). Cada subida nueva reemplaza a la anterior del mismo tipo
-- (y del mismo título, para "otros") y la anterior se conserva.
alter table jobsite_documents add column title text;
alter table jobsite_documents add column replaced_at timestamptz;

-- Asignaciones y pago por jobsite (D-009, D-059, D-100, D-210) -------------------------------------------------
-- La asignación no lleva cifras: el supervisor la ve y la hace sin ver pagos.
create table jobsite_assignments (
  id          uuid primary key default gen_random_uuid(),
  jobsite_id  uuid not null references jobsites(id) on delete cascade,
  profile_id  uuid not null references profiles(id),
  start_date  date not null,
  end_date    date,
  created_by  uuid references profiles(id),
  created_at  timestamptz not null default now(),
  constraint jobsite_assignments_dates check (end_date is null or end_date >= start_date)
);
-- Un empleado una sola vez abierto en el mismo jobsite.
create unique index jobsite_assignments_open on jobsite_assignments (jobsite_id, profile_id) where end_date is null;

-- Pago de una asignación: cada cambio es una fila nueva con fecha de inicio (sin efecto retroactivo, D-210).
create table assignment_pay (
  id               uuid primary key default gen_random_uuid(),
  assignment_id    uuid not null references jobsite_assignments(id) on delete cascade,
  kind             text not null check (kind in ('hourly', 'fixed')),
  hourly_rate      numeric(10, 2) check (hourly_rate is null or hourly_rate >= 0),
  guaranteed_hours numeric(6, 2) check (guaranteed_hours is null or guaranteed_hours > 0),
  fixed_amount     numeric(12, 2) check (fixed_amount is null or fixed_amount >= 0),
  fixed_period     text check (fixed_period in ('visit', 'week', 'month')),
  effective_from   date not null,
  created_by       uuid references profiles(id),
  created_at       timestamptz not null default now(),
  constraint assignment_pay_shape check (
    (kind = 'hourly' and hourly_rate is not null and fixed_amount is null and fixed_period is null)
    or (kind = 'fixed' and fixed_amount is not null and fixed_period is not null and hourly_rate is null and guaranteed_hours is null)),
  unique (assignment_id, effective_from)
);

alter table jobsite_assignments enable row level security;
alter table assignment_pay enable row level security;
-- Asignaciones: las ve quien ve clientes o la lista de empleados. Pago: solo por funciones (cada apertura se registra).
create policy jobsite_assignments_read on jobsite_assignments for select to authenticated
  using (has_permission('clientes_ver') or has_permission('empleados_ver'));
revoke all on jobsite_assignments, assignment_pay from anon;
revoke insert, update, delete, truncate, references, trigger on jobsite_assignments from authenticated;
revoke all on assignment_pay from authenticated;

-- La tarifa al cliente tampoco se lee directo: cada apertura con cifras queda en el historial (D-125, D-210).
drop policy jobsite_rates_read on jobsite_rates;
revoke all on jobsite_rates from authenticated;

-- El contrato tampoco se firma directo desde Storage: lo abre la Edge Function open-jobsite-document y registra
-- cada apertura (D-210). SOW y otros se siguen leyendo con clientes_ver.
drop policy jobsite_docs_read on storage.objects;
create policy jobsite_docs_read on storage.objects for select to authenticated
  using (bucket_id = 'jobsite-docs' and has_permission('clientes_ver')
         and exists (select 1 from jobsite_documents d where d.file_path = storage.objects.name and d.kind <> 'contract'));
-- Subir: <jobsite>/<tipo>/<nombre>.pdf. El registro (register_jobsite_document) valida el permiso de cada tipo.
create policy jobsite_docs_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'jobsite-docs'
              and name ~ '^[0-9a-f-]{36}/(sow|contract|other)/[A-Za-z0-9_-]+\.pdf$'
              and exists (select 1 from jobsites j where j.id::text = split_part(name, '/', 1))
              and ((split_part(name, '/', 2) = 'sow' and has_permission('clientes_editar_walkthrough_sow'))
                or (split_part(name, '/', 2) = 'contract' and has_permission('clientes_editar_datos') and has_permission('clientes_ver_tarifa'))
                or (split_part(name, '/', 2) = 'other' and has_permission('clientes_editar_datos'))));
drop policy jobsite_documents_read on jobsite_documents;
create policy jobsite_documents_read on jobsite_documents for select to authenticated
  using (has_permission('clientes_ver') and (kind <> 'contract' or has_permission('clientes_ver_tarifa')));

-- Reglas de cálculo (puras) ---------------------------------------------------------------------------------

-- Visitas por mes según la frecuencia (D-075, D-080, D-105): diaria 7 por semana, semanal los días marcados,
-- "Otra" la cifra escrita en el jobsite. Una semana = 52/12 de un mes.
create function jobsite_visits_per_month(p_frequency jsonb, p_override numeric) returns numeric
language sql immutable set search_path = public as $$
  select case p_frequency->>'kind'
           when 'daily' then round(7 * 52 / 12.0, 2)
           when 'weekly' then round(coalesce(jsonb_array_length(p_frequency->'days'), 0) * 52 / 12.0, 2)
           else p_override
         end
$$;

-- Costo mensual proyectado de un pago (D-009, D-010): por hora con las horas estimadas (o las garantizadas si son más)
-- por visita; tarifa fija por visita, por semana (52/12) o por mes.
create function pay_monthly_cost(p_kind text, p_hourly numeric, p_guaranteed numeric, p_amount numeric, p_period text,
                                 p_hours numeric, p_visits numeric) returns numeric
language sql immutable set search_path = public as $$
  select round(case
    when p_kind = 'hourly' then p_hourly * greatest(coalesce(p_hours, 0), coalesce(p_guaranteed, 0)) * coalesce(p_visits, 0)
    when p_period = 'visit' then p_amount * coalesce(p_visits, 0)
    when p_period = 'week' then p_amount * 52 / 12.0
    else p_amount
  end, 2)
$$;

-- Tarifa fija que empieza o termina a mitad de periodo: se prorratea por días (D-210). Devuelve lo que corresponde
-- de una semana o de un mes entre p_from y p_to (inclusive) dentro del periodo que empieza en p_period_start.
create function prorate_fixed(p_amount numeric, p_period text, p_period_start date, p_from date, p_to date) returns numeric
language plpgsql immutable set search_path = public as $$
declare
  v_end date;
  v_days int;
  v_used int;
begin
  if p_period = 'visit' then return p_amount; end if;
  v_end := case p_period when 'week' then p_period_start + 6 else (p_period_start + interval '1 month' - interval '1 day')::date end;
  v_days := v_end - p_period_start + 1;
  v_used := least(coalesce(p_to, v_end), v_end) - greatest(coalesce(p_from, p_period_start), p_period_start) + 1;
  if v_used <= 0 then return 0; end if;
  return round(p_amount * v_used / v_days, 2);
end $$;

-- Lectura con cifras (cada apertura queda en el historial, D-125, D-210) ------------------------------------------

-- Tarifa al cliente de un jobsite.
create function get_jobsite_rate(p_jobsite uuid) returns numeric
language plpgsql security definer set search_path = public as $$
declare
  v numeric;
begin
  if not has_permission('clientes_ver_tarifa') then
    raise exception 'No tienes permiso para ver la tarifa' using errcode = '42501';
  end if;
  select monthly_rate into v from jobsite_rates where jobsite_id = p_jobsite;
  insert into change_log (actor_id, action, entity, entity_id, detail)
  values (current_profile_id(), 'tarifa_abierta', 'jobsites', p_jobsite,
          jsonb_build_object('name', (select name from jobsites where id = p_jobsite)));
  return v;
end $$;

-- Tarifas de todos los jobsites (lista de Cuentas, D-082): una sola fila de historial por apertura de la lista.
create function list_jobsite_rates() returns table (jobsite_id uuid, monthly_rate numeric)
language plpgsql security definer set search_path = public as $$
begin
  if not has_permission('clientes_ver_tarifa') then
    raise exception 'No tienes permiso para ver la tarifa' using errcode = '42501';
  end if;
  insert into change_log (actor_id, action, entity, entity_id, detail)
  values (current_profile_id(), 'tarifas_abiertas', 'jobsites', null, '{}'::jsonb);
  return query select r.jobsite_id, r.monthly_rate from jobsite_rates r;
end $$;

-- Pago vigente de cada asignación de un jobsite o de un empleado (para Personal del jobsite y Pagos del empleado).
-- Sin empleados_ver_pagos no hay cifras (D-194). Con cifras, la apertura se registra.
create function get_assignment_pay(p_jobsite uuid, p_profile uuid)
returns table (assignment_id uuid, kind text, hourly_rate numeric, guaranteed_hours numeric, fixed_amount numeric,
               fixed_period text, effective_from date, next_change date)
language plpgsql security definer set search_path = public as $$
begin
  if not has_permission('empleados_ver_pagos') then
    raise exception 'No tienes permiso para ver pagos' using errcode = '42501';
  end if;
  if (p_jobsite is null) = (p_profile is null) then
    raise exception 'Indica un jobsite o un empleado' using errcode = '22023';
  end if;
  insert into change_log (actor_id, action, entity, entity_id, detail)
  values (current_profile_id(), 'pagos_abiertos', case when p_jobsite is not null then 'jobsites' else 'profiles' end,
          coalesce(p_jobsite, p_profile), '{}'::jsonb);
  return query
    select a.id, p.kind, p.hourly_rate, p.guaranteed_hours, p.fixed_amount, p.fixed_period, p.effective_from,
           (select min(f.effective_from) from assignment_pay f where f.assignment_id = a.id and f.effective_from > current_date)
      from jobsite_assignments a
      left join lateral (
        select * from assignment_pay x
         where x.assignment_id = a.id
         order by (x.effective_from <= current_date) desc,
                  case when x.effective_from <= current_date then x.effective_from end desc nulls last,
                  x.effective_from asc
         limit 1) p on true
     where (p_jobsite is null or a.jobsite_id = p_jobsite) and (p_profile is null or a.profile_id = p_profile);
end $$;

-- Cálculo del margen (sin permisos ni historial; solo lo usan las dos funciones de abajo).
-- Costo mensual proyectado del personal asignado hoy (D-010, sin suministros ni equipo) contra la tarifa.
create function jobsite_margin_calc(p_jobsite uuid, out cost numeric, out rate numeric, out incomplete boolean)
language plpgsql stable security definer set search_path = public as $$
declare
  j jobsites;
  v_visits numeric;
  r record;
begin
  cost := 0;
  incomplete := false;
  select * into j from jobsites where id = p_jobsite;
  select monthly_rate into rate from jobsite_rates where jobsite_id = p_jobsite;
  v_visits := jobsite_visits_per_month(j.frequency, j.visits_per_month);
  for r in
    select p.* from jobsite_assignments a
      join lateral (select * from assignment_pay x where x.assignment_id = a.id and x.effective_from <= current_date
                     order by x.effective_from desc limit 1) p on true
     where a.jobsite_id = p_jobsite and a.start_date <= current_date and (a.end_date is null or a.end_date >= current_date)
  loop
    if r.kind = 'hourly' and j.est_hours_per_visit is null and r.guaranteed_hours is null then incomplete := true; end if;
    if (r.kind = 'hourly' or r.fixed_period = 'visit') and v_visits is null then incomplete := true; end if;
    cost := cost + pay_monthly_cost(r.kind, r.hourly_rate, r.guaranteed_hours, r.fixed_amount, r.fixed_period,
                                    j.est_hours_per_visit, v_visits);
  end loop;
end $$;

-- Margen del jobsite (D-060): las cifras exigen ver tarifa y ver pagos (y se registran); la ficha "Margen en riesgo"
-- (sin cifras) basta con ver tarifa.
create function jobsite_margin(p_jobsite uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  m record;
  v_name text;
begin
  if not has_permission('clientes_ver_tarifa') then
    raise exception 'No tienes permiso para ver la tarifa' using errcode = '42501';
  end if;
  select name into v_name from jobsites where id = p_jobsite;
  if v_name is null then raise exception 'El jobsite no existe' using errcode = 'P0002'; end if;
  select * into m from jobsite_margin_calc(p_jobsite);
  if has_permission('empleados_ver_pagos') then
    insert into change_log (actor_id, action, entity, entity_id, detail)
    values (current_profile_id(), 'margen_abierto', 'jobsites', p_jobsite, jsonb_build_object('name', v_name));
    return jsonb_build_object('at_risk', m.rate is not null and m.cost > 0 and m.cost >= m.rate, 'cost', m.cost,
                              'rate', m.rate, 'incomplete', m.incomplete);
  end if;
  return jsonb_build_object('at_risk', m.rate is not null and m.cost > 0 and m.cost >= m.rate, 'incomplete', m.incomplete);
end $$;

-- Jobsites activos con margen en riesgo (ficha de la lista de Cuentas, D-097): solo los ids, sin cifras.
create function jobsites_at_risk() returns setof uuid
language plpgsql security definer set search_path = public as $$
begin
  if not has_permission('clientes_ver_tarifa') then return; end if;
  return query
    select j.id from jobsites j, lateral jobsite_margin_calc(j.id) m
     where j.status = 'active' and m.rate is not null and m.cost > 0 and m.cost >= m.rate;
end $$;

-- Escrituras ------------------------------------------------------------------------------------------------

-- Alta manual de un Cliente previo a la app (D-210).
create function create_legacy_client(p_name text, p_phone text, p_email text, p_address text, p_notes text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  if not (has_permission('clientes_editar_datos') and has_permission('clientes_ver_tarifa')) then
    raise exception 'No tienes permiso para dar de alta clientes' using errcode = '42501';
  end if;
  if btrim(coalesce(p_name, '')) = '' then raise exception 'El nombre es obligatorio' using errcode = '22023'; end if;
  insert into clients (name, legacy, phone, email, address, notes, created_by)
  values (btrim(p_name), true, nullif(btrim(p_phone), ''), nullif(lower(btrim(p_email)), ''), nullif(btrim(p_address), ''),
          nullif(btrim(p_notes), ''), current_profile_id())
  returning id into v_id;
  insert into change_log (actor_id, action, entity, entity_id, detail)
  values (current_profile_id(), 'cliente_creado', 'clients', v_id, jsonb_build_object('company', btrim(p_name), 'legacy', true));
  return v_id;
end $$;

create function update_client(p_client uuid, p_name text, p_phone text, p_email text, p_address text, p_notes text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not has_permission('clientes_editar_datos') then
    raise exception 'No tienes permiso para editar clientes' using errcode = '42501';
  end if;
  if btrim(coalesce(p_name, '')) = '' then raise exception 'El nombre es obligatorio' using errcode = '22023'; end if;
  update clients set name = btrim(p_name), phone = nullif(btrim(p_phone), ''), email = nullif(lower(btrim(p_email)), ''),
         address = nullif(btrim(p_address), ''), notes = nullif(btrim(p_notes), '')
   where id = p_client;
  if not found then raise exception 'El cliente no existe' using errcode = 'P0002'; end if;
end $$;

-- Frecuencia válida (D-075, D-080, D-105).
create function frequency_valid(p jsonb) returns boolean
language sql immutable set search_path = public as $$
  select p is not null and jsonb_typeof(p) = 'object' and p->>'kind' in ('daily', 'weekly', 'other')
     and (p->>'kind' <> 'weekly' or (jsonb_typeof(p->'days') = 'array'
          and not exists (select 1 from jsonb_array_elements(p->'days') d where jsonb_typeof(d) <> 'number' or d::int not between 0 and 6)))
$$;

-- Jobsite de un Cliente previo a la app: datos, tarifa y frecuencia (D-210). Solo en clientes previos.
create function create_legacy_jobsite(p_client uuid, p_data jsonb, p_rate numeric) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  if not (has_permission('clientes_editar_datos') and has_permission('clientes_ver_tarifa')) then
    raise exception 'No tienes permiso para dar de alta jobsites' using errcode = '42501';
  end if;
  if not exists (select 1 from clients where id = p_client and legacy) then
    raise exception 'Solo los clientes previos a la app se dan de alta a mano' using errcode = '22023';
  end if;
  if btrim(coalesce(p_data->>'name', '')) = '' or btrim(coalesce(p_data->>'address', '')) = '' then
    raise exception 'Faltan el nombre o la dirección' using errcode = '22023';
  end if;
  if p_rate is null or p_rate < 0 then raise exception 'Tarifa no válida' using errcode = '22023'; end if;
  if not frequency_valid(p_data->'frequency') then raise exception 'Frecuencia no válida' using errcode = '22023'; end if;
  insert into jobsites (client_id, name, address, plus_code, contact_name, contact_phone, contact_email,
                        emergency_name, emergency_phone, emergency_relation, emergency_email, frequency,
                        est_hours_per_visit, visits_per_month, start_date, created_by)
  values (p_client, btrim(p_data->>'name'), btrim(p_data->>'address'), nullif(btrim(p_data->>'plus_code'), ''),
          nullif(btrim(p_data->>'contact_name'), ''), nullif(btrim(p_data->>'contact_phone'), ''),
          nullif(lower(btrim(p_data->>'contact_email')), ''),
          nullif(btrim(p_data->>'emergency_name'), ''), nullif(btrim(p_data->>'emergency_phone'), ''),
          nullif(btrim(p_data->>'emergency_relation'), ''), nullif(lower(btrim(p_data->>'emergency_email')), ''),
          p_data->'frequency', (p_data->>'est_hours_per_visit')::numeric, (p_data->>'visits_per_month')::numeric,
          (p_data->>'start_date')::date, current_profile_id())
  returning id into v_id;
  insert into jobsite_rates (jobsite_id, monthly_rate, set_by) values (v_id, round(p_rate, 2), current_profile_id());
  insert into change_log (actor_id, action, entity, entity_id, detail)
  values (current_profile_id(), 'jobsite_creado', 'jobsites', v_id,
          jsonb_build_object('company', (select name from clients where id = p_client), 'name', btrim(p_data->>'name'), 'legacy', true));
  return v_id;
end $$;

-- Datos y contactos del jobsite (clientes_editar_datos). La tarifa y el estado van aparte.
create function update_jobsite(p_jobsite uuid, p_data jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not has_permission('clientes_editar_datos') then
    raise exception 'No tienes permiso para editar jobsites' using errcode = '42501';
  end if;
  if btrim(coalesce(p_data->>'name', '')) = '' or btrim(coalesce(p_data->>'address', '')) = '' then
    raise exception 'Faltan el nombre o la dirección' using errcode = '22023';
  end if;
  if not frequency_valid(p_data->'frequency') then raise exception 'Frecuencia no válida' using errcode = '22023'; end if;
  update jobsites set
    name = btrim(p_data->>'name'), address = btrim(p_data->>'address'), plus_code = nullif(btrim(p_data->>'plus_code'), ''),
    contact_name = nullif(btrim(p_data->>'contact_name'), ''), contact_phone = nullif(btrim(p_data->>'contact_phone'), ''),
    contact_email = nullif(lower(btrim(p_data->>'contact_email')), ''),
    emergency_name = nullif(btrim(p_data->>'emergency_name'), ''), emergency_phone = nullif(btrim(p_data->>'emergency_phone'), ''),
    emergency_relation = nullif(btrim(p_data->>'emergency_relation'), ''),
    emergency_email = nullif(lower(btrim(p_data->>'emergency_email')), ''),
    frequency = p_data->'frequency', est_hours_per_visit = (p_data->>'est_hours_per_visit')::numeric,
    visits_per_month = (p_data->>'visits_per_month')::numeric, start_date = (p_data->>'start_date')::date
   where id = p_jobsite;
  if not found then raise exception 'El jobsite no existe' using errcode = 'P0002'; end if;
end $$;

-- Tarifa al cliente: se edita directo solo en clientes previos (D-210); en los demás cambia con un quote nuevo.
create function set_jobsite_rate(p_jobsite uuid, p_rate numeric) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_old numeric;
begin
  if not (has_permission('clientes_editar_datos') and has_permission('clientes_ver_tarifa')) then
    raise exception 'No tienes permiso para cambiar la tarifa' using errcode = '42501';
  end if;
  if not exists (select 1 from jobsites j join clients c on c.id = j.client_id where j.id = p_jobsite and c.legacy) then
    raise exception 'La tarifa de este jobsite cambia con un quote nuevo' using errcode = '22023';
  end if;
  if p_rate is null or p_rate < 0 then raise exception 'Tarifa no válida' using errcode = '22023'; end if;
  select monthly_rate into v_old from jobsite_rates where jobsite_id = p_jobsite;
  insert into jobsite_rates (jobsite_id, monthly_rate, set_by, set_at) values (p_jobsite, round(p_rate, 2), current_profile_id(), now())
  on conflict (jobsite_id) do update set monthly_rate = excluded.monthly_rate, set_by = excluded.set_by, set_at = now(),
                                         quote_version_id = null;
  insert into change_log (actor_id, action, entity, entity_id, detail)
  values (current_profile_id(), 'tarifa_cambiada', 'jobsites', p_jobsite,
          jsonb_build_object('name', (select name from jobsites where id = p_jobsite), 'antes', v_old, 'despues', round(p_rate, 2)));
end $$;

-- Estado (D-056, D-210): Pausado conserva el personal; Terminado cierra las asignaciones abiertas hoy.
create function set_jobsite_status(p_jobsite uuid, p_status jobsite_status) returns void
language plpgsql security definer set search_path = public as $$
declare
  j jobsites;
begin
  if not has_permission('clientes_cambiar_estado') then
    raise exception 'No tienes permiso para cambiar el estado' using errcode = '42501';
  end if;
  select * into j from jobsites where id = p_jobsite for update;
  if j.id is null then raise exception 'El jobsite no existe' using errcode = 'P0002'; end if;
  if j.status = p_status then return; end if;
  if j.status = 'terminated' then
    raise exception 'Un jobsite terminado no se reabre' using errcode = '22023';
  end if;
  update jobsites set status = p_status, status_changed_at = now() where id = p_jobsite;
  if p_status = 'terminated' then
    update jobsite_assignments set end_date = greatest(start_date, current_date)
     where jobsite_id = p_jobsite and (end_date is null or end_date > current_date);
  end if;
  insert into change_log (actor_id, action, entity, entity_id, detail)
  values (current_profile_id(), 'jobsite_estado_cambiado', 'jobsites', p_jobsite,
          jsonb_build_object('name', j.name, 'antes', j.status, 'despues', p_status));
end $$;

-- Asignar un empleado al jobsite (sin cifras: también el supervisor) y, si quien asigna puede, su pago.
create function assign_employee(p_jobsite uuid, p_profile uuid, p_start date) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  if not (has_permission('empleados_asignar_pago') or has_permission('schedule_ver_editar')) then
    raise exception 'No tienes permiso para asignar personal' using errcode = '42501';
  end if;
  if p_start is null or p_start < current_date then
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
end $$;

-- Quitar a un empleado del jobsite con fecha de fin (D-210).
create function end_assignment(p_assignment uuid, p_end date) returns void
language plpgsql security definer set search_path = public as $$
declare
  a jobsite_assignments;
begin
  if not (has_permission('empleados_asignar_pago') or has_permission('schedule_ver_editar')) then
    raise exception 'No tienes permiso para quitar personal' using errcode = '42501';
  end if;
  select * into a from jobsite_assignments where id = p_assignment for update;
  if a.id is null then raise exception 'La asignación no existe' using errcode = 'P0002'; end if;
  if p_end is null or p_end < greatest(a.start_date, current_date) then
    raise exception 'La fecha de fin no puede ser anterior a hoy' using errcode = '22023';
  end if;
  update jobsite_assignments set end_date = p_end where id = p_assignment;
  insert into change_log (actor_id, action, entity, entity_id, detail)
  values (current_profile_id(), 'personal_quitado', 'jobsites', a.jobsite_id,
          jsonb_build_object('name', (select name from jobsites where id = a.jobsite_id),
                             'employee', (select full_name from profiles where id = a.profile_id), 'hasta', p_end));
end $$;

-- Pago de una asignación desde una fecha (D-059, D-061, D-096, D-100, D-210): sin efecto retroactivo; un W-2 pagado
-- por hora no baja de $15.00 (D-016); quien lo pone necesita empleados_asignar_pago y ver pagos.
create function set_assignment_pay(p_assignment uuid, p_kind text, p_hourly numeric, p_guaranteed numeric,
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
  if p_from is null or p_from < current_date then
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
end $$;

-- Documento del jobsite ya subido a jobsite-docs: queda como la versión siguiente de su tipo (y título, en "otros").
create function register_jobsite_document(p_jobsite uuid, p_kind text, p_path text, p_title text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_title text := nullif(btrim(coalesce(p_title, '')), '');
  v_version int;
  v_id uuid;
begin
  if p_kind = 'sow' and not has_permission('clientes_editar_walkthrough_sow')
     or p_kind = 'contract' and not (has_permission('clientes_editar_datos') and has_permission('clientes_ver_tarifa'))
     or p_kind = 'other' and not has_permission('clientes_editar_datos') then
    raise exception 'No tienes permiso para subir este documento' using errcode = '42501';
  end if;
  if p_kind not in ('sow', 'contract', 'other') then raise exception 'Tipo no válido' using errcode = '22023'; end if;
  if p_kind = 'other' and v_title is null then raise exception 'Falta el nombre del documento' using errcode = '22023'; end if;
  if p_path is null or p_path !~ ('^' || p_jobsite || '/' || p_kind || '/[A-Za-z0-9_-]+\.pdf$') then
    raise exception 'Ruta no válida' using errcode = '22023';
  end if;
  if not exists (select 1 from storage.objects where bucket_id = 'jobsite-docs' and name = p_path) then
    raise exception 'El archivo no está en el almacenamiento' using errcode = '22023';
  end if;
  select coalesce(max(version), 0) + 1 into v_version from jobsite_documents
   where jobsite_id = p_jobsite and kind = p_kind and (p_kind <> 'other' or title = v_title);
  update jobsite_documents set replaced_at = now()
   where jobsite_id = p_jobsite and kind = p_kind and replaced_at is null and (p_kind <> 'other' or title = v_title);
  insert into jobsite_documents (jobsite_id, kind, file_path, version, title, uploaded_by)
  values (p_jobsite, p_kind, p_path, v_version, v_title, current_profile_id()) returning id into v_id;
  insert into change_log (actor_id, action, entity, entity_id, detail)
  values (current_profile_id(), 'documento_subido', 'jobsites', p_jobsite,
          jsonb_build_object('name', (select name from jobsites where id = p_jobsite), 'kind', p_kind, 'title', v_title,
                             'version', v_version));
  return v_id;
end $$;

-- Abrir el contrato (u otro documento) registra quién y cuándo; devuelve la ruta para firmar (Edge Function).
create function open_jobsite_document(p_doc uuid) returns text
language plpgsql security definer set search_path = public as $$
declare
  d jobsite_documents;
begin
  select * into d from jobsite_documents where id = p_doc;
  if d.id is null then raise exception 'El documento no existe' using errcode = 'P0002'; end if;
  if not has_permission('clientes_ver') or (d.kind = 'contract' and not has_permission('clientes_ver_tarifa')) then
    raise exception 'No tienes permiso para abrir este documento' using errcode = '42501';
  end if;
  insert into change_log (actor_id, action, entity, entity_id, detail)
  values (current_profile_id(), 'documento_abierto', 'jobsites', d.jobsite_id,
          jsonb_build_object('name', (select name from jobsites where id = d.jobsite_id), 'kind', d.kind,
                             'title', d.title, 'version', d.version));
  return d.file_path;
end $$;

-- Listas con nombres (los perfiles solo los lee quien ve empleados; aquí basta con el permiso de cada pantalla) ----

-- Personal del jobsite (pestaña Personal): asignaciones abiertas y futuras, sin cifras.
create function list_jobsite_staff(p_jobsite uuid)
returns table (assignment_id uuid, profile_id uuid, full_name text, worker_type worker_type, start_date date, end_date date)
language plpgsql stable security definer set search_path = public as $$
begin
  if not has_permission('clientes_ver') then
    raise exception 'No tienes permiso para ver jobsites' using errcode = '42501';
  end if;
  return query
    select a.id, p.id, p.full_name, p.worker_type, a.start_date, a.end_date
      from jobsite_assignments a join profiles p on p.id = a.profile_id
     where a.jobsite_id = p_jobsite and (a.end_date is null or a.end_date >= current_date)
     order by p.full_name;
end $$;

-- Jobsites de un empleado (pestaña Pagos del perfil, D-194): abiertas y futuras, sin cifras.
create function list_profile_assignments(p_profile uuid)
returns table (assignment_id uuid, jobsite_id uuid, jobsite_name text, client_name text, start_date date, end_date date)
language plpgsql stable security definer set search_path = public as $$
begin
  if not has_permission('empleados_ver') then
    raise exception 'No tienes permiso para ver empleados' using errcode = '42501';
  end if;
  return query
    select a.id, j.id, j.name, c.name, a.start_date, a.end_date
      from jobsite_assignments a join jobsites j on j.id = a.jobsite_id join clients c on c.id = j.client_id
     where a.profile_id = p_profile and (a.end_date is null or a.end_date >= current_date)
     order by c.name, j.name;
end $$;

-- A quién se puede asignar: empleados activos (no el Super Admin), para el campo Empleado.
create function assignable_employees() returns table (profile_id uuid, full_name text, worker_type worker_type)
language plpgsql stable security definer set search_path = public as $$
begin
  if not (has_permission('empleados_asignar_pago') or has_permission('schedule_ver_editar')) then
    raise exception 'No tienes permiso para asignar personal' using errcode = '42501';
  end if;
  return query select p.id, p.full_name, p.worker_type from profiles p where p.active and not p.is_super_admin order by p.full_name;
end $$;

-- Jobsites activos para asignar desde el perfil del empleado.
create function assignable_jobsites() returns table (jobsite_id uuid, jobsite_name text, client_name text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not (has_permission('empleados_asignar_pago') or has_permission('schedule_ver_editar')) then
    raise exception 'No tienes permiso para asignar personal' using errcode = '42501';
  end if;
  return query select j.id, j.name, c.name from jobsites j join clients c on c.id = j.client_id
                where j.status <> 'terminated' order by c.name, j.name;
end $$;

revoke execute on function list_jobsite_staff(uuid), list_profile_assignments(uuid), assignable_employees(), assignable_jobsites()
  from public, anon;
grant execute on function list_jobsite_staff(uuid), list_profile_assignments(uuid), assignable_employees(), assignable_jobsites()
  to authenticated;

revoke execute on function jobsite_margin_calc(uuid) from public, anon, authenticated;
revoke execute on function jobsite_visits_per_month(jsonb, numeric), pay_monthly_cost(text, numeric, numeric, numeric, text, numeric, numeric),
  prorate_fixed(numeric, text, date, date, date), frequency_valid(jsonb) from public, anon;
grant execute on function jobsite_visits_per_month(jsonb, numeric), pay_monthly_cost(text, numeric, numeric, numeric, text, numeric, numeric),
  prorate_fixed(numeric, text, date, date, date), frequency_valid(jsonb) to authenticated;
revoke execute on function get_jobsite_rate(uuid), list_jobsite_rates(), get_assignment_pay(uuid, uuid), jobsite_margin(uuid),
  jobsites_at_risk(), create_legacy_client(text, text, text, text, text), update_client(uuid, text, text, text, text, text),
  create_legacy_jobsite(uuid, jsonb, numeric), update_jobsite(uuid, jsonb), set_jobsite_rate(uuid, numeric),
  set_jobsite_status(uuid, jobsite_status), assign_employee(uuid, uuid, date), end_assignment(uuid, date),
  set_assignment_pay(uuid, text, numeric, numeric, numeric, text, date), register_jobsite_document(uuid, text, text, text),
  open_jobsite_document(uuid) from public, anon;
grant execute on function get_jobsite_rate(uuid), list_jobsite_rates(), get_assignment_pay(uuid, uuid), jobsite_margin(uuid),
  jobsites_at_risk(), create_legacy_client(text, text, text, text, text), update_client(uuid, text, text, text, text, text),
  create_legacy_jobsite(uuid, jsonb, numeric), update_jobsite(uuid, jsonb), set_jobsite_rate(uuid, numeric),
  set_jobsite_status(uuid, jobsite_status), assign_employee(uuid, uuid, date), end_assignment(uuid, date),
  set_assignment_pay(uuid, text, numeric, numeric, numeric, text, date), register_jobsite_document(uuid, text, text, text),
  open_jobsite_document(uuid) to authenticated;
