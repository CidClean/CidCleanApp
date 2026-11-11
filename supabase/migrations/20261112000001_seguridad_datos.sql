-- Orden 80 (revisión de seguridad del hito 8): datos que no deben salir.
-- A1: visit_work() y work_to_approve() quitan los montos a quien no tiene empleados_ver_pagos (como work_approved).
-- M4: prepare_send_quote() y quote_mail_data() no devuelven líneas, subtotal, tax, total ni pdf_path sin
--     quotes_ver_precios. La Edge Function send-quote valida con ellas (JWT de quien envía) y arma el PDF y el
--     correo con send_quote_data() / quote_mail_data_full(), que solo ejecuta la service role.
-- B1 / D-304: solo el Super Admin da o quita el rol admin (save_employee_permissions y create_employee).
-- B9: visit_distance() solo para quien está asignado a la visita o tiene work_revisar_gps / work_editar.

-- A1 ------------------------------------------------------------------------------------------------------------
create or replace function visit_work(p_visit uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v visits;
  v_pay boolean := has_permission('empleados_ver_pagos');
begin
  if not (has_permission('work_aprobar') or has_permission('work_editar') or has_permission('work_revisar_gps')
          or has_permission('work_registrar_por_otros')) then
    raise exception 'No tienes permiso para ver el trabajo' using errcode = '42501';
  end if;
  perform fill_auto_work();
  select * into v from visits where id = p_visit;
  if v.id is null then raise exception 'La visita no existe' using errcode = 'P0002'; end if;
  return case when v_pay then visit_card(v) else work_card_strip_pay(visit_card(v)) end;
end $$;

create or replace function work_to_approve() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_pay boolean := has_permission('empleados_ver_pagos');
begin
  if not (has_permission('work_aprobar') or has_permission('work_editar') or has_permission('work_revisar_gps')) then
    raise exception 'No tienes permiso para ver el trabajo por aprobar' using errcode = '42501';
  end if;
  perform fill_auto_work();
  return coalesce((select jsonb_agg(case when v_pay then visit_card(v) else work_card_strip_pay(visit_card(v)) end
                                    order by v.starts_at)
                     from visits v where visit_pending_approval(v)), '[]'::jsonb);
end $$;

-- M4 ------------------------------------------------------------------------------------------------------------
-- Montos y archivo con precios que solo ve quien tiene quotes_ver_precios.
create function quote_strip_prices(p jsonb) returns jsonb
language sql immutable set search_path = public as $$
  select p - array['lines', 'tax_rate', 'subtotal', 'discount', 'tax', 'total', 'pdf_path', 'token']
$$;

-- Datos completos para armar el PDF y el correo al enviar (antes prepare_send_quote). Sin comprobación de permiso:
-- solo la ejecuta la service role, después de que prepare_send_quote validó con el JWT de quien envía.
create function send_quote_data(p_version uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v quote_versions;
  q quotes;
  l leads;
  s lead_sites;
  wv walkthrough_versions;
  j jobsites;
  c clients;
  v_to text[];
begin
  select * into v from quote_versions where id = p_version;
  if v.id is null then raise exception 'El quote no existe' using errcode = 'P0002'; end if;
  if v.status <> 'draft' then raise exception 'Este quote ya se envió' using errcode = '22023'; end if;
  if jsonb_array_length(coalesce(v.lines->'services', '[]'::jsonb)) = 0 then
    raise exception 'El quote necesita al menos un servicio' using errcode = '22023';
  end if;
  -- D-239: el quote de un extra va sin SOW.
  if v.sow_path is null and not exists (select 1 from quotes x where x.id = v.quote_id and x.kind = 'extra') then
    raise exception 'Falta el SOW' using errcode = '22023';
  end if;
  select array_agg(distinct e) into v_to from unnest(array_append(v.recipients, v.contact_email)) e where e is not null;
  if v_to is null or cardinality(v_to) = 0 then
    raise exception 'El quote no tiene a quién enviarse' using errcode = '22023';
  end if;
  select * into q from quotes where id = v.quote_id;
  if q.kind = 'extra' then
    select * into j from jobsites where id = q.jobsite_id;
    select * into c from clients where id = j.client_id;
    return jsonb_build_object(
      'version_id', v.id, 'quote_id', v.quote_id, 'version', quote_version_label(v.minor),
      'language', coalesce((select language from leads where id = c.lead_id), 'en'),
      'company', c.name, 'site', j.name, 'address', j.address, 'frequency', null, 'extra', true, 'service_date', v.service_date,
      'contact_name', nullif(btrim(j.contact_name), ''),
      'lines', v.lines, 'tax_rate', v.tax_rate, 'subtotal', v.subtotal, 'discount', v.discount, 'tax', v.tax, 'total', v.total,
      'valid_days', v.valid_days, 'expires_at', now() + make_interval(days => v.valid_days), 'recipients', to_jsonb(v_to));
  end if;
  select * into l from leads where id = q.lead_id;
  select * into s from lead_sites where id = q.site_id;
  select * into wv from walkthrough_versions where walkthrough_id = q.walkthrough_id and version = v.walkthrough_version;
  return jsonb_build_object(
    'version_id', v.id, 'quote_id', v.quote_id, 'version', quote_version_label(v.minor), 'language', l.language,
    'company', l.company, 'site', coalesce(nullif(btrim(s.name), ''), s.address),
    'address', coalesce(nullif(btrim(wv.data->'contact'->>'address'), ''), s.address),
    'frequency', wv.data->'frequency', 'extra', false, 'service_date', null, 'lines', v.lines, 'tax_rate', v.tax_rate,
    'contact_name', coalesce(nullif(btrim(wv.data->'contact'->>'contactName'), ''), nullif(btrim(l.contact_name), '')),
    'subtotal', v.subtotal, 'discount', v.discount, 'tax', v.tax, 'total', v.total, 'valid_days', v.valid_days,
    'expires_at', now() + make_interval(days => v.valid_days), 'recipients', to_jsonb(v_to));
end $$;

create or replace function prepare_send_quote(p_version uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r jsonb;
begin
  if not has_permission('quotes_enviar') then
    raise exception 'No tienes permiso para enviar quotes' using errcode = '42501';
  end if;
  r := send_quote_data(p_version);
  return case when has_permission('quotes_ver_precios') then r else quote_strip_prices(r) end;
end $$;

-- Datos completos para reenviar el correo de una versión enviada. Solo la service role.
create function quote_mail_data_full(p_version uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v quote_versions;
  q quotes;
  v_to text[];
  v_contact text;
begin
  perform expire_quotes();
  select * into v from quote_versions where id = p_version;
  if v.id is null then raise exception 'El quote no existe' using errcode = 'P0002'; end if;
  if v.status not in ('sent', 'viewed') then raise exception 'Este quote no está abierto' using errcode = '22023'; end if;
  select array_agg(distinct e) into v_to from unnest(array_append(v.recipients, v.contact_email)) e where e is not null;
  select * into q from quotes where id = v.quote_id;
  if q.kind = 'extra' then
    select nullif(btrim(contact_name), '') into v_contact from jobsites where id = q.jobsite_id;
  else
    select coalesce(nullif(btrim(wv.data->'contact'->>'contactName'), ''), nullif(btrim(l.contact_name), '')) into v_contact
      from leads l
      left join walkthrough_versions wv on wv.walkthrough_id = q.walkthrough_id and wv.version = v.walkthrough_version
     where l.id = q.lead_id;
  end if;
  return jsonb_build_object('token', v.public_token, 'expires_at', v.expires_at, 'language', v.snapshot->>'language',
    'company', v.snapshot->>'company', 'site', v.snapshot->>'site', 'version', quote_version_label(v.minor),
    'address', v.snapshot->>'address', 'frequency', v.snapshot->'frequency',
    'extra', coalesce((v.snapshot->>'extra')::boolean, false), 'service_date', v.snapshot->>'service_date',
    'contact_name', v_contact, 'lines', v.lines, 'total', v.total, 'pdf_path', v.pdf_path,
    'recipients', to_jsonb(v_to));
end $$;

create or replace function quote_mail_data(p_version uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r jsonb;
begin
  if not has_permission('quotes_enviar') then
    raise exception 'No tienes permiso para enviar quotes' using errcode = '42501';
  end if;
  r := quote_mail_data_full(p_version);
  -- El token del enlace nunca sale hacia quien llama (B5).
  return case when has_permission('quotes_ver_precios') then r - 'token' else quote_strip_prices(r) end;
end $$;

revoke all on function quote_strip_prices(jsonb) from public, anon, authenticated;
revoke all on function send_quote_data(uuid), quote_mail_data_full(uuid) from public, anon, authenticated;
grant execute on function send_quote_data(uuid), quote_mail_data_full(uuid) to service_role;

-- B1 / D-304 ----------------------------------------------------------------------------------------------------
create or replace function save_employee_permissions(p_profile uuid, p_grant text[], p_revoke text[],
                                                     p_role role_template default null) returns void
language plpgsql security definer set search_path = public as $$
declare
  me uuid := current_profile_id();
  target profiles;
  k text;
  to_grant text[] := coalesce(p_grant, '{}');
  to_revoke text[] := coalesce(p_revoke, '{}');
begin
  if not has_permission('empleados_gestionar_permisos') then
    raise exception 'No tienes permiso para gestionar permisos' using errcode = '42501';
  end if;
  if p_profile = me then
    raise exception 'No puedes cambiar tus propios permisos' using errcode = '42501';
  end if;
  select * into target from profiles where id = p_profile;
  if not found then
    raise exception 'Empleado no encontrado' using errcode = 'P0002';
  end if;
  if target.is_super_admin then
    raise exception 'El Super Admin tiene todos los permisos y nadie los cambia' using errcode = '42501';
  end if;
  -- D-304: solo el Super Admin da o quita el rol admin.
  if p_role is not null and p_role is distinct from target.role and 'admin' in (p_role, target.role)
     and not is_super_admin() then
    raise exception 'Solo el Super Admin da o quita el rol de admin' using errcode = '42501';
  end if;
  if to_grant && to_revoke then
    raise exception 'Un permiso no puede darse y quitarse a la vez' using errcode = '22023';
  end if;
  foreach k in array to_grant || to_revoke loop
    if not exists (select 1 from permissions where key = k) then
      raise exception 'Permiso desconocido: %', k using errcode = '22023';
    end if;
    if not has_permission(k) then
      raise exception 'No puedes dar ni quitar un permiso que no tienes: %', k using errcode = '42501';
    end if;
  end loop;

  insert into profile_permissions (profile_id, permission_key, granted_by)
  select p_profile, g, me from unnest(to_grant) g
  on conflict do nothing;
  delete from profile_permissions where profile_id = p_profile and permission_key = any (to_revoke);

  if p_role is not null and p_role is distinct from target.role then
    update profiles set role = p_role where id = p_profile;
  end if;
end $$;

create or replace function create_employee(
  p_first_name text, p_last_name text, p_phone text, p_worker_type worker_type, p_role role_template,
  p_language app_language, p_has_app_access boolean, p_email text, p_address_line1 text default null,
  p_address_line2 text default null, p_state text default null, p_city text default null, p_zip text default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  new_id uuid;
  clean_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
begin
  if not has_permission('empleados_invitar_crear') then
    raise exception 'No tienes permiso para crear empleados' using errcode = '42501';
  end if;
  -- D-304: solo el Super Admin da el rol admin.
  if p_role = 'admin' and not is_super_admin() then
    raise exception 'Solo el Super Admin da el rol de admin' using errcode = '42501';
  end if;
  if btrim(coalesce(p_first_name, '')) = '' or btrim(coalesce(p_last_name, '')) = '' then
    raise exception 'Nombre y Apellidos son obligatorios' using errcode = '22023';
  end if;
  if p_worker_type is null then
    raise exception 'El tipo de trabajador es obligatorio' using errcode = '22023';
  end if;
  if p_has_app_access and clean_email is null then
    raise exception 'El correo es obligatorio con acceso a la app' using errcode = '22023';
  end if;

  begin
    insert into profiles (first_name, last_name, full_name, phone, worker_type, role, language, has_app_access, email,
                          address_line1, address_line2, state, city, zip)
    values (btrim(p_first_name), btrim(p_last_name), btrim(p_first_name) || ' ' || btrim(p_last_name),
            nullif(btrim(coalesce(p_phone, '')), ''), p_worker_type, p_role, p_language, p_has_app_access, clean_email,
            nullif(btrim(coalesce(p_address_line1, '')), ''), nullif(btrim(coalesce(p_address_line2, '')), ''),
            nullif(upper(btrim(coalesce(p_state, ''))), ''), nullif(btrim(coalesce(p_city, '')), ''),
            nullif(btrim(coalesce(p_zip, '')), ''))
    returning id into new_id;
  exception when check_violation then
    raise exception 'Datos no válidos' using errcode = '22023';
  end;

  insert into profile_permissions (profile_id, permission_key, granted_by)
  select new_id, k, current_profile_id() from unnest(role_template_permissions(p_role)) k where has_permission(k);

  return new_id;
end $$;

-- B9 ------------------------------------------------------------------------------------------------------------
create or replace function visit_distance(p_visit uuid, p_lat double precision, p_lng double precision) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  me uuid := current_profile_id();
  v visits;
  j jobsites;
  d int;
begin
  if me is null then raise exception 'Sin sesión' using errcode = '42501'; end if;
  select * into v from visits where id = p_visit;
  if v.id is null then raise exception 'La visita no existe' using errcode = 'P0002'; end if;
  if not (has_permission('work_revisar_gps') or has_permission('work_editar')) then
    if is_contractor(me) then raise exception 'contractor_no_hours' using errcode = '42501'; end if;
    -- La misma comprobación que clock_in: programado en la visita o asignado al jobsite ese día.
    if not exists (select 1 from visit_staff s where s.visit_id = v.id and s.profile_id = me)
       and not exists (select 1 from jobsite_assignments a where a.jobsite_id = v.jobsite_id and a.profile_id = me
                         and a.start_date <= v.local_date and (a.end_date is null or a.end_date >= v.local_date)) then
      raise exception 'No estás asignado a este jobsite' using errcode = '42501';
    end if;
  end if;
  select * into j from jobsites where id = v.jobsite_id;
  if p_lat is null or j.latitude is null then return jsonb_build_object('status', 'no_location'); end if;
  d := distance_m(p_lat, p_lng, j.latitude, j.longitude);
  return jsonb_build_object('status', case when d <= geofence_m() then 'ok' else 'out_of_range' end, 'distance_m', d);
end $$;
