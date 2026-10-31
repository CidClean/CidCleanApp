-- Orden 66 (legal rev. 3, fase D, D-285): ofertas de trabajo para los 1099 y advertencias escritas.
-- Ofertas: el admin ofrece a un 1099 un jobsite (franja de acceso del cliente, frecuencia y pago por día, desde una
-- fecha) o una visita puntual; el 1099 la acepta o la rechaza en la app, o el admin registra la respuesta si el 1099 no
-- tiene acceso. Aceptar crea la asignación (con su pago fijo por visita) o lo agrega a la visita; rechazar no tiene
-- consecuencias (ICA §1). Estados: pending, accepted, declined, withdrawn. Ofrecer exige la regla de D-285
-- (ica_check, 20261031000002) y el contrato del jobsite firmado por ambas partes.
-- Advertencias escritas (ICA §10): por persona, con fecha, motivo y documento opcional (bucket privado contractor-docs).
-- Solo el Super Admin las crea o anula; las ve el Super Admin y quien edita y desactiva empleados (D-200, la regla más
-- estricta). Al llegar a 3 vigentes, aviso al Super Admin "{nombre} tiene 3 advertencias escritas" (no desactiva solo).
-- Todo queda en el historial. Las tablas no tienen políticas: todo pasa por funciones.

-- 1. Ofertas ----------------------------------------------------------------------------------------------------------

create table job_offers (
  id              uuid primary key default gen_random_uuid(),
  profile_id      uuid not null references profiles(id),
  kind            text not null check (kind in ('jobsite', 'visit')),
  jobsite_id      uuid not null references jobsites(id) on delete cascade,
  visit_id        uuid references visits(id) on delete cascade,
  start_date      date,
  -- Lo ofrecido, tal como se ofreció (la franja de acceso, la frecuencia y la fecha de la visita).
  window_start    time,
  window_minutes  int,
  frequency       jsonb,
  visit_date      date,
  rate            numeric(12, 2) not null check (rate > 0),
  note            text check (note is null or length(note) <= 500),
  status          text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'withdrawn')),
  offered_by      uuid references profiles(id),
  offered_at      timestamptz not null default now(),
  responded_by    uuid references profiles(id),
  responded_at    timestamptz,
  response_source text check (response_source in ('app', 'admin')),
  assignment_id   uuid references jobsite_assignments(id) on delete set null,
  withdrawn_by    uuid references profiles(id),
  withdrawn_at    timestamptz,
  constraint job_offers_shape check ((kind = 'jobsite' and visit_id is null and start_date is not null)
                                  or (kind = 'visit' and visit_id is not null))
);
create unique index job_offers_one_pending on job_offers (profile_id, jobsite_id, coalesce(visit_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where status = 'pending';
create index job_offers_profile on job_offers (profile_id, offered_at desc);
alter table job_offers enable row level security;
revoke all on job_offers from anon, authenticated;

create function job_offer_json(o job_offers) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', o.id, 'profile_id', o.profile_id, 'contractor', (select full_name from profiles where id = o.profile_id),
    'kind', o.kind, 'jobsite_id', o.jobsite_id, 'jobsite', j.name, 'client', (select name from clients where id = j.client_id),
    'address', j.address, 'visit_id', o.visit_id, 'visit_date', o.visit_date, 'start_date', o.start_date,
    'window_start', to_char(o.window_start, 'HH24:MI'),
    'window_end', to_char(o.window_start + make_interval(mins => coalesce(o.window_minutes, 0)), 'HH24:MI'),
    'frequency', o.frequency, 'frequency_text', contract_frequency_text(o.frequency), 'rate', o.rate, 'note', o.note,
    'status', o.status, 'offered_at', o.offered_at, 'offered_by', (select full_name from profiles where id = o.offered_by),
    'responded_at', o.responded_at, 'response_source', o.response_source,
    'responded_by', (select full_name from profiles where id = o.responded_by), 'withdrawn_at', o.withdrawn_at)
    from jobsites j where j.id = o.jobsite_id
$$;

create function job_offer_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select has_permission('empleados_asignar_pago') and has_permission('empleados_ver_pagos')
$$;

create function create_job_offer(p_profile uuid, p_jobsite uuid, p_visit uuid, p_rate numeric, p_start date, p_note text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  p profiles; j jobsites; v visits; o job_offers; me uuid := current_profile_id();
begin
  if not job_offer_admin() then raise exception 'No tienes permiso para ofrecer trabajo' using errcode = '42501'; end if;
  select * into p from profiles where id = p_profile;
  if p.id is null or not p.active or p.worker_type is distinct from '1099' then
    raise exception 'not_contractor' using errcode = '22023';
  end if;
  select * into j from jobsites where id = p_jobsite;
  if j.id is null or j.status <> 'active' then raise exception 'El jobsite no existe o no está activo' using errcode = '22023'; end if;
  if j.contract_status <> 'both_signed' then raise exception 'contract_pending:%', j.name using errcode = '22023'; end if;
  if p_rate is null or p_rate <= 0 then raise exception 'El pago por día no es válido' using errcode = '22023'; end if;
  perform ica_check(p.id, j.id);
  if p_visit is not null then
    select * into v from visits where id = p_visit and jobsite_id = j.id and not removed;
    if v.id is null then raise exception 'La visita no existe' using errcode = 'P0002'; end if;
    if v.local_date < cc_today() or v.approved_at is not null then raise exception 'La visita ya pasó' using errcode = '22023'; end if;
    if exists (select 1 from visit_staff where visit_id = v.id and profile_id = p.id) then
      raise exception 'already_in' using errcode = '22023';
    end if;
    insert into job_offers (profile_id, kind, jobsite_id, visit_id, window_start, window_minutes, visit_date, rate, note, offered_by)
    values (p.id, 'visit', j.id, v.id, (v.starts_at at time zone cc_tz())::time, v.minutes, v.local_date, round(p_rate, 2),
            nullif(btrim(coalesce(p_note, '')), ''), me)
    returning * into o;
  else
    if p_start is null or p_start < cc_today() then raise exception 'La fecha de inicio no puede ser anterior a hoy' using errcode = '22023'; end if;
    if exists (select 1 from jobsite_assignments where jobsite_id = j.id and profile_id = p.id and (end_date is null or end_date >= p_start)) then
      raise exception 'already_in' using errcode = '22023';
    end if;
    insert into job_offers (profile_id, kind, jobsite_id, start_date, window_start, window_minutes, frequency, rate, note, offered_by)
    values (p.id, 'jobsite', j.id, p_start, j.visit_start_time, j.visit_minutes, j.frequency, round(p_rate, 2),
            nullif(btrim(coalesce(p_note, '')), ''), me)
    returning * into o;
  end if;
  insert into change_log (actor_id, action, entity, entity_id, detail)
  values (me, 'oferta_creada', 'profiles', p.id, jsonb_build_object('name', p.full_name, 'jobsite', j.name, 'kind', o.kind,
          'day', o.visit_date, 'desde', o.start_date, 'rate', o.rate));
  begin
    perform notify_profiles(array[p.id], 'job_offer', jsonb_build_object('jobsite', j.name, 'day', o.visit_date, 'offer', o.id),
                            null, false, 'job_offer:' || o.id);
  exception when others then null;
  end;
  return job_offer_json(o);
end $$;

-- Respuesta: el propio 1099 en la app, o el admin si el 1099 no tiene acceso a la app.
create function respond_job_offer(p_offer uuid, p_accept boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  o job_offers; p profiles; v visits; me uuid := current_profile_id(); src text; a uuid; d date;
begin
  select * into o from job_offers where id = p_offer for update;
  if o.id is null then raise exception 'La oferta no existe' using errcode = 'P0002'; end if;
  select * into p from profiles where id = o.profile_id;
  if me is not null and me = o.profile_id then src := 'app';
  elsif job_offer_admin() and not p.has_app_access then src := 'admin';
  else raise exception 'No puedes responder esta oferta' using errcode = '42501';
  end if;
  if o.status <> 'pending' then raise exception 'La oferta ya no está pendiente' using errcode = '22023'; end if;
  if p_accept is null then raise exception 'Respuesta no válida' using errcode = '22023'; end if;
  if p_accept then
    if not p.active then raise exception 'not_contractor' using errcode = '22023'; end if;
    if o.kind = 'jobsite' then
      d := greatest(o.start_date, cc_today());
      insert into jobsite_assignments (jobsite_id, profile_id, start_date, created_by)
      values (o.jobsite_id, o.profile_id, d, me) returning id into a;
      insert into assignment_pay (assignment_id, kind, fixed_amount, fixed_period, effective_from, created_by)
      values (a, 'fixed', o.rate, 'visit', d, me);
      insert into change_log (actor_id, action, entity, entity_id, detail)
      values (me, 'personal_asignado', 'jobsites', o.jobsite_id,
              jsonb_build_object('name', (select name from jobsites where id = o.jobsite_id), 'employee', p.full_name, 'desde', d, 'oferta', o.id));
    else
      select * into v from visits where id = o.visit_id and not removed for update;
      if v.id is null or v.local_date < cc_today() or v.approved_at is not null then
        raise exception 'La visita ya pasó' using errcode = '22023';
      end if;
      insert into visit_staff (visit_id, profile_id) values (v.id, o.profile_id) on conflict do nothing;
    end if;
  end if;
  update job_offers set status = case when p_accept then 'accepted' else 'declined' end, responded_by = me, responded_at = now(),
         response_source = src, assignment_id = a
   where id = o.id returning * into o;
  insert into change_log (actor_id, action, entity, entity_id, detail)
  values (me, case when p_accept then 'oferta_aceptada' else 'oferta_rechazada' end, 'profiles', o.profile_id,
          jsonb_build_object('name', p.full_name, 'jobsite', (select name from jobsites where id = o.jobsite_id), 'kind', o.kind,
                             'registrada_por_admin', src = 'admin'));
  return job_offer_json(o);
end $$;

create function withdraw_job_offer(p_offer uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  o job_offers;
begin
  if not job_offer_admin() then raise exception 'No tienes permiso para ofrecer trabajo' using errcode = '42501'; end if;
  select * into o from job_offers where id = p_offer for update;
  if o.id is null then raise exception 'La oferta no existe' using errcode = 'P0002'; end if;
  if o.status <> 'pending' then raise exception 'La oferta ya no está pendiente' using errcode = '22023'; end if;
  update job_offers set status = 'withdrawn', withdrawn_by = current_profile_id(), withdrawn_at = now() where id = o.id returning * into o;
  insert into change_log (actor_id, action, entity, entity_id, detail)
  values (current_profile_id(), 'oferta_retirada', 'profiles', o.profile_id,
          jsonb_build_object('name', (select full_name from profiles where id = o.profile_id),
                             'jobsite', (select name from jobsites where id = o.jobsite_id)));
  return job_offer_json(o);
end $$;

-- Las del 1099 que entra (pendientes primero).
create function my_job_offers() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(job_offer_json(o) order by (o.status = 'pending') desc, o.offered_at desc), '[]'::jsonb)
    from job_offers o where o.profile_id = current_profile_id()
$$;

-- Las de un contratista, para el admin.
create function job_offers_for(p_profile uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not job_offer_admin() then raise exception 'No tienes permiso para ver ofertas' using errcode = '42501'; end if;
  return (select coalesce(jsonb_agg(job_offer_json(o) order by (o.status = 'pending') desc, o.offered_at desc), '[]'::jsonb)
            from job_offers o where o.profile_id = p_profile);
end $$;

-- El día de servicio de una visita puntual aceptada se paga con la tarifa de la oferta (si no hay asignación con pago).
create or replace function service_day_pay(p_visit uuid, p_profile uuid) returns numeric
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
  if p.id is null then
    return (select rate from job_offers where visit_id = p_visit and profile_id = p_profile and status = 'accepted' limit 1);
  end if;
  if p.kind = 'fixed' then
    return case when p.fixed_period = 'visit' then p.fixed_amount else 0 end;
  end if;
  return round(p.hourly_rate * coalesce(p.guaranteed_hours, 4), 2);
end $$;

-- 2. Advertencias escritas --------------------------------------------------------------------------------------------

create table written_warnings (
  id            uuid primary key default gen_random_uuid(),
  profile_id    uuid not null references profiles(id),
  issued_on     date not null,
  reason        text not null check (btrim(reason) <> '' and length(reason) <= 2000),
  document_path text,
  document_mime text,
  status        text not null default 'active' check (status in ('active', 'voided')),
  created_by    uuid references profiles(id),
  created_at    timestamptz not null default now(),
  voided_by     uuid references profiles(id),
  voided_at     timestamptz,
  void_reason   text check (void_reason is null or length(void_reason) <= 500),
  constraint written_warnings_void check (status <> 'voided' or (voided_at is not null and btrim(coalesce(void_reason, '')) <> ''))
);
create index written_warnings_profile on written_warnings (profile_id, issued_on desc);
alter table written_warnings enable row level security;
revoke all on written_warnings from anon, authenticated;

create function warnings_can_view() returns boolean
language sql stable security definer set search_path = public as $$
  select is_super_admin() or has_permission('empleados_editar_desactivar')
$$;

create function warning_json(w written_warnings) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', w.id, 'profile_id', w.profile_id, 'issued_on', w.issued_on, 'reason', w.reason,
    'has_document', w.document_path is not null, 'document_mime', w.document_mime, 'status', w.status,
    'created_at', w.created_at, 'created_by', (select full_name from profiles where id = w.created_by),
    'voided_at', w.voided_at, 'voided_by', (select full_name from profiles where id = w.voided_by), 'void_reason', w.void_reason)
$$;

create function create_written_warning(p_profile uuid, p_issued_on date, p_reason text, p_path text, p_mime text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  p profiles; w written_warnings; n int; me uuid := current_profile_id();
begin
  if not is_super_admin() then raise exception 'Solo el Super Admin crea advertencias' using errcode = '42501'; end if;
  select * into p from profiles where id = p_profile;
  if p.id is null or p.is_super_admin then raise exception 'El perfil no existe' using errcode = 'P0002'; end if;
  if p_issued_on is null or p_issued_on > cc_today() then raise exception 'Fecha no válida' using errcode = '22023'; end if;
  if btrim(coalesce(p_reason, '')) = '' or length(p_reason) > 2000 then raise exception 'Falta el motivo' using errcode = '22023'; end if;
  if p_path is not null and (p_path !~ ('^' || p.id || '/warnings/[A-Za-z0-9_.-]+\.(pdf|jpg|png|heic|webp)$')
     or p_mime not in ('application/pdf', 'image/jpeg', 'image/png', 'image/heic', 'image/webp')) then
    raise exception 'Documento no válido' using errcode = '22023';
  end if;
  insert into written_warnings (profile_id, issued_on, reason, document_path, document_mime, created_by)
  values (p.id, p_issued_on, btrim(p_reason), p_path, case when p_path is not null then p_mime end, me) returning * into w;
  select count(*) into n from written_warnings where profile_id = p.id and status = 'active';
  insert into change_log (actor_id, action, entity, entity_id, detail)
  values (me, 'advertencia_creada', 'profiles', p.id,
          jsonb_build_object('name', p.full_name, 'fecha', p_issued_on, 'motivo', w.reason, 'vigentes', n, 'documento', p_path is not null));
  if n >= 3 then
    begin
      perform notify_profiles(array(select id from profiles where is_super_admin and active), 'warnings_3',
                              jsonb_build_object('name', p.full_name, 'count', n, 'profile', p.id),
                              jsonb_build_object('pathname', '/employees/[id]', 'params', jsonb_build_object('id', p.id)),
                              false, 'warnings_3:' || w.id);
    exception when others then null;
    end;
  end if;
  return warning_json(w) || jsonb_build_object('active_count', n);
end $$;

create function void_written_warning(p_warning uuid, p_reason text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  w written_warnings;
begin
  if not is_super_admin() then raise exception 'Solo el Super Admin anula advertencias' using errcode = '42501'; end if;
  select * into w from written_warnings where id = p_warning for update;
  if w.id is null then raise exception 'La advertencia no existe' using errcode = 'P0002'; end if;
  if w.status <> 'active' then raise exception 'La advertencia ya está anulada' using errcode = '22023'; end if;
  if btrim(coalesce(p_reason, '')) = '' or length(p_reason) > 500 then raise exception 'note_required' using errcode = '22023'; end if;
  update written_warnings set status = 'voided', voided_by = current_profile_id(), voided_at = now(), void_reason = btrim(p_reason)
   where id = w.id returning * into w;
  insert into change_log (actor_id, action, entity, entity_id, detail)
  values (current_profile_id(), 'advertencia_anulada', 'profiles', w.profile_id,
          jsonb_build_object('name', (select full_name from profiles where id = w.profile_id), 'fecha', w.issued_on, 'motivo', w.void_reason));
  return warning_json(w);
end $$;

create function written_warnings_for(p_profile uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not warnings_can_view() then raise exception 'No tienes permiso para ver advertencias' using errcode = '42501'; end if;
  return jsonb_build_object(
    'active_count', (select count(*) from written_warnings where profile_id = p_profile and status = 'active'),
    'can_manage', is_super_admin(),
    'items', (select coalesce(jsonb_agg(warning_json(w) order by w.issued_on desc, w.created_at desc), '[]'::jsonb)
                from written_warnings w where w.profile_id = p_profile));
end $$;

-- Abrir el documento (la función warnings-admin firma la URL con la service role); queda en el historial.
create function open_warning_document(p_warning uuid) returns text
language plpgsql security definer set search_path = public as $$
declare
  w written_warnings;
begin
  if not warnings_can_view() then raise exception 'No tienes permiso para ver advertencias' using errcode = '42501'; end if;
  select * into w from written_warnings where id = p_warning;
  if w.id is null or w.document_path is null then raise exception 'No hay documento' using errcode = 'P0002'; end if;
  insert into change_log (actor_id, action, entity, entity_id, detail)
  values (current_profile_id(), 'advertencia_documento_abierto', 'profiles', w.profile_id, jsonb_build_object('fecha', w.issued_on));
  return w.document_path;
end $$;

-- 3. Textos de los avisos nuevos (D-200) ------------------------------------------------------------------------------
do $$
declare
  src text;
begin
  select pg_get_functiondef('notification_text'::regproc) into src;
  src := replace(src, '    when ''work_approved'' then',
    '    when ''job_offer'' then
      title := case when es then ''Nueva oferta de trabajo'' else ''New job offer'' end;
      detail := concat_ws('' · '', d->>''jobsite'', day);
    when ''warnings_3'' then
      title := case when es then (d->>''name'') || '' tiene '' || (d->>''count'') || '' advertencias escritas''
                    else (d->>''name'') || '' has '' || (d->>''count'') || '' written warnings'' end;
      detail := case when es then ''Revisa si corresponde terminar el contrato por escrito.''
                     else ''Review whether to end the agreement by written notice.'' end;
    when ''work_approved'' then');
  if src not like '%warnings_3%' then raise exception 'notification_text no se pudo actualizar'; end if;
  execute src;
end $$;

-- Permisos de ejecución.
revoke execute on function job_offer_json(job_offers), job_offer_admin(), create_job_offer(uuid, uuid, uuid, numeric, date, text),
  respond_job_offer(uuid, boolean), withdraw_job_offer(uuid), my_job_offers(), job_offers_for(uuid),
  warnings_can_view(), warning_json(written_warnings), create_written_warning(uuid, date, text, text, text),
  void_written_warning(uuid, text), written_warnings_for(uuid), open_warning_document(uuid) from public, anon, authenticated;
grant execute on function create_job_offer(uuid, uuid, uuid, numeric, date, text), respond_job_offer(uuid, boolean),
  withdraw_job_offer(uuid), my_job_offers(), job_offers_for(uuid), create_written_warning(uuid, date, text, text, text),
  void_written_warning(uuid, text), written_warnings_for(uuid), open_warning_document(uuid) to authenticated;
