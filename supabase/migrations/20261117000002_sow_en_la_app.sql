-- Orden 112 (D-317 2, D-318 1 y 5, D-320 2): el SOW de cada quote se arma en la app con la Parte A de la plantilla del
-- abogado (supabase/functions/_shared/legal/csa-sow-1.0.ts, la misma que usa el contrato), llenado desde el walkthrough,
-- el lead y el quote, editable antes de enviar y guardado con la versión del quote (quote_versions.sow_fields). Al enviar,
-- send-quote genera el PDF (estilo D-293, nombre D-296) y lo guarda como sow_path: el portal sigue exigiendo abrirlo
-- (D-042) y al aceptar se copia al jobsite como antes. Ya no se sube un PDF de SOW (reemplaza esa parte de D-209); los
-- quotes con SOW subido siguen mostrando su PDF. El quote de un extra sigue sin SOW (D-239). El contrato usa los datos
-- del SOW de la versión aceptada como su Parte A (no se vuelven a pedir).

alter table quote_versions add column sow_fields jsonb check (sow_fields is null or jsonb_typeof(sow_fields) = 'object');

-- Número del SOW: el del quote ("Q-0007" → "SOW-0007"); la versión del SOW es la del quote.
create function sow_label(p_number bigint) returns text
language sql immutable as $$ select 'SOW-' || lpad(p_number::text, 4, '0') $$;

-- Llaves de la Parte A (A1 a A8, sin precio ni A9) que se editan en la pantalla "Scope of Work".
create function sow_editable_keys() returns text[]
language sql immutable as $$
  select array['date', 'client_company', 'client_contact', 'client_email', 'site_address', 'area_sqft', 'floors_rooms',
    'facility_type', 'walkthrough_date', 'frequency', 'service_window', 'start_date', 'holidays',
    'a3_offices_area', 'a3_offices_freq', 'a3_restrooms_area', 'a3_restrooms_freq', 'a3_breakroom_area', 'a3_breakroom_freq',
    'a3_floors_area', 'a3_floors_freq', 'a3_entrances_area', 'a3_entrances_freq', 'a3_periodic_area', 'a3_periodic_task',
    'a3_periodic_freq', 'a3_addons_area', 'a3_addons_task', 'a3_addons_freq', 'a4_clarifications',
    'supplies_cc', 'supplies_client', 'storage', 'access_method', 'keys_count', 'restricted_areas', 'inspections']
$$;

-- Opcionales (D-318 5 y orden 112): vacío = "None" en el PDF (A6, A7), sin aclaraciones (A4), fila de A3 omitida si su
-- área está vacía, inicio "To be defined" mientras no se acepte el quote.
create function sow_optional_keys() returns text[]
language sql immutable as $$
  select array['a4_clarifications', 'access_method', 'keys_count', 'restricted_areas', 'inspections', 'start_date',
    'a3_offices_area', 'a3_offices_freq', 'a3_restrooms_area', 'a3_restrooms_freq', 'a3_breakroom_area', 'a3_breakroom_freq',
    'a3_floors_area', 'a3_floors_freq', 'a3_entrances_area', 'a3_entrances_freq', 'a3_periodic_area', 'a3_periodic_task',
    'a3_periodic_freq', 'a3_addons_area', 'a3_addons_task', 'a3_addons_freq']
$$;

create function sow_missing_fields(p jsonb) returns text[]
language sql immutable as $$
  select coalesce(array_agg(k order by k), '{}') from unnest(sow_editable_keys()) k
   where not (k = any (sow_optional_keys())) and btrim(coalesce(p->>k, '')) = ''
$$;

-- Tipo de lugar en inglés (las mismas etiquetas del sitio web, D-318).
create function facility_type_label(p text) returns text
language sql immutable as $$
  select case p when 'office' then 'Office' when 'medical' then 'Medical / dental office' when 'retail' then 'Retail / showroom'
    when 'warehouse' then 'Warehouse' when 'light_industrial' then 'Light industrial' when 'gym' then 'Gym / fitness'
    when 'other' then 'Other commercial' else '' end
$$;

-- "11 areas: 3 restrooms, 1 kitchen, 4 offices" (conteo por tipo, en el orden de los tipos del walkthrough).
create function sow_areas_text(p_areas jsonb) returns text
language sql immutable as $$
  with a as (
    select x->>'type' t, count(*) n from jsonb_array_elements(coalesce(p_areas, '[]'::jsonb)) x group by 1),
  o as (
    select a.n, a.t, array_position(array['bathroom','office','lobby','kitchen','conference','hallway','reception','stairs','storage','other'], a.t) pos,
           case a.t when 'bathroom' then 'restroom' when 'office' then 'office' when 'lobby' then 'lobby' when 'kitchen' then 'kitchen'
             when 'conference' then 'conference room' when 'hallway' then 'hallway' when 'reception' then 'reception area'
             when 'stairs' then 'stairway' when 'storage' then 'storage room' else 'other area' end s
      from a)
  select case when (select sum(n) from o) is null then ''
    else (select sum(n)::text || case when sum(n) = 1 then ' area: ' else ' areas: ' end ||
                 string_agg(n::text || ' ' || case when n = 1 then s when s = 'lobby' then 'lobbies' else s || 's' end, ', ' order by coalesce(pos, 99))
            from o) end
$$;

-- Lo que el SOW arma solo, desde el walkthrough, el lead y el quote (D-318 1).
create function sow_default_fields(p_version uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v quote_versions; q quotes; l leads; s lead_sites; wv walkthrough_versions; d jsonb; a jsonb; n_off int; n_rest int;
  n_kit int; n_ent int; v_addr record; v_clar text;
begin
  select * into v from quote_versions where id = p_version;
  select * into q from quotes where id = v.quote_id;
  select * into l from leads where id = q.lead_id;
  select * into s from lead_sites where id = q.site_id;
  select * into wv from walkthrough_versions where walkthrough_id = q.walkthrough_id and version = v.walkthrough_version;
  d := coalesce(wv.data, '{}'::jsonb);
  a := coalesce(d->'areas', '[]'::jsonb);
  select count(*) filter (where x->>'type' in ('office', 'conference')), count(*) filter (where x->>'type' = 'bathroom'),
         count(*) filter (where x->>'type' = 'kitchen'), count(*) filter (where x->>'type' in ('lobby', 'reception'))
    into n_off, n_rest, n_kit, n_ent from jsonb_array_elements(a) x;
  v_addr := walkthrough_address_parts(d, s);
  -- D-200: los pedidos especiales de cada área entran como aclaraciones de este sitio (A4), editables.
  select string_agg(btrim(x->>'name') || ': ' || btrim(x->>'specialRequest'), E'\n')
    into v_clar from jsonb_array_elements(a) x where btrim(coalesce(x->>'specialRequest', '')) <> '';
  return jsonb_build_object(
    'date', contract_mmddyyyy(now()),
    'client_company', coalesce(nullif(btrim(coalesce(l.company, '')), ''), ''),
    'client_contact', concat_ws(', ', nullif(btrim(coalesce(d->'contact'->>'contactName', l.contact_name, '')), ''),
                                nullif(btrim(coalesce(d->'contact'->>'phone', l.phone, '')), '')),
    'client_email', coalesce(nullif(lower(btrim(d->'contact'->>'email')), ''), v.contact_email, l.email, ''),
    'site_address', coalesce(format_address(v_addr.line1, v_addr.line2, v_addr.city, v_addr.state, v_addr.zip),
                             nullif(btrim(d->'contact'->>'address'), ''), s.address, ''),
    'area_sqft', coalesce(to_char(coalesce(walkthrough_site_int(d, 'sqft'), s.sqft), 'FM999,999,999'), ''),
    'floors_rooms', sow_areas_text(a),
    'facility_type', facility_type_label(coalesce(nullif(d->'site'->>'facilityType', ''), s.facility_type)),
    'walkthrough_date', coalesce(contract_mmddyyyy(wv.created_at), ''),
    'frequency', contract_frequency_text(d->'frequency'),
    'service_window', coalesce(nullif(btrim(d->'site'->>'schedule'), ''), ''),
    'start_date', '',
    'holidays', 'New Year''s Day, Memorial Day, Independence Day, Labor Day, Thanksgiving Day, Christmas Day',
    -- A3 desde las áreas del walkthrough (sin áreas, las filas de la plantilla): fila omitida si no hay ese tipo.
    'a3_offices_area', case when n_off > 0 or jsonb_array_length(a) = 0 then 'Offices / workstations' else '' end,
    'a3_offices_freq', case when n_off > 0 or jsonb_array_length(a) = 0 then 'Each visit' else '' end,
    'a3_restrooms_area', case when n_rest > 0 or jsonb_array_length(a) = 0 then 'Restrooms' else '' end,
    'a3_restrooms_freq', case when n_rest > 0 or jsonb_array_length(a) = 0 then 'Each visit' else '' end,
    'a3_breakroom_area', case when n_kit > 0 or jsonb_array_length(a) = 0 then 'Break room / kitchen' else '' end,
    'a3_breakroom_freq', case when n_kit > 0 or jsonb_array_length(a) = 0 then 'Each visit' else '' end,
    'a3_floors_area', 'Hard floors', 'a3_floors_freq', 'Each visit',
    'a3_entrances_area', case when n_ent > 0 or jsonb_array_length(a) = 0 then 'Entrances / lobby' else '' end,
    'a3_entrances_freq', case when n_ent > 0 or jsonb_array_length(a) = 0 then 'Each visit' else '' end,
    'a3_periodic_area', 'Periodic', 'a3_periodic_task', 'High dusting, baseboards, vents, interior glass',
    'a3_periodic_freq', 'Weekly / monthly',
    'a3_addons_area', 'Add-on services', 'a3_addons_task', 'Carpet extraction, floor stripping and waxing, window washing, post-construction',
    'a3_addons_freq', 'Quoted separately',
    'a4_clarifications', coalesce(v_clar, ''),
    'supplies_cc', 'standard', 'supplies_client', 'restroom paper products, hand soap, trash liners',
    'storage', '', 'access_method', '', 'keys_count', '', 'restricted_areas', '', 'inspections', '');
end $$;

-- Lo vigente del SOW de una versión: lo guardado sobre lo armado solo.
create function sow_effective_fields(p_version uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select sow_default_fields(p_version) || coalesce((select sow_fields from quote_versions where id = p_version), '{}'::jsonb)
$$;

-- Una versión nueva parte del SOW de la anterior (lo que se corrigió no se pierde).
create function quote_versions_copy_sow() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.sow_fields is null then
    select x.sow_fields into new.sow_fields from quote_versions x
     where x.quote_id = new.quote_id and x.id <> new.id and x.sow_fields is not null
     order by x.minor desc limit 1;
  end if;
  return new;
end $$;
revoke execute on function quote_versions_copy_sow() from public, anon, authenticated;
create trigger quote_versions_copy_sow before insert on quote_versions
  for each row execute function quote_versions_copy_sow();

-- Pantalla "Scope of Work" (D-320 2): datos, faltantes y si la versión tiene un SOW subido antes (se sigue mostrando).
create function quote_sow(p_version uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v quote_versions; q quotes; f jsonb;
begin
  if not (has_permission('quotes_ver') or has_permission('sow_contratos_subir_ver')) then
    raise exception 'Sin permiso para ver quotes' using errcode = '42501';
  end if;
  select * into v from quote_versions where id = p_version;
  if v.id is null then raise exception 'El quote no existe' using errcode = 'P0002'; end if;
  select * into q from quotes where id = v.quote_id;
  if q.kind = 'extra' then raise exception 'El quote de un extra no lleva SOW' using errcode = '22023'; end if;
  f := sow_effective_fields(v.id);
  return jsonb_build_object('version_id', v.id, 'quote_id', q.id, 'status', v.status, 'fields', f,
    'missing', to_jsonb(sow_missing_fields(f)), 'optional', to_jsonb(sow_optional_keys()),
    'sow_no', sow_label(q.number), 'quote_no', quote_number_label(q.number), 'quote_version', quote_version_label(v.minor),
    'cleaning_type', (select cleaning_type from leads where id = q.lead_id),
    'generated', v.sow_fields is not null, 'sow_path', v.sow_path,
    'editable', v.status = 'draft' and has_permission('quotes_editar') and has_permission('sow_contratos_subir_ver'));
end $$;

-- Guardar lo corregido (solo llaves del SOW, texto de hasta 2000) en el borrador.
create function save_quote_sow(p_version uuid, p_fields jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v quote_versions; k text;
begin
  if not (has_permission('quotes_editar') and has_permission('sow_contratos_subir_ver')) then
    raise exception 'Sin permiso para editar el SOW' using errcode = '42501';
  end if;
  select * into v from quote_versions where id = p_version for update;
  if v.id is null then raise exception 'El quote no existe' using errcode = 'P0002'; end if;
  if v.status <> 'draft' then raise exception 'Este quote ya se envió' using errcode = '22023'; end if;
  if exists (select 1 from quotes where id = v.quote_id and kind = 'extra') then
    raise exception 'El quote de un extra no lleva SOW' using errcode = '22023';
  end if;
  if p_fields is null or jsonb_typeof(p_fields) <> 'object' then raise exception 'Campos no válidos' using errcode = '22023'; end if;
  for k in select jsonb_object_keys(p_fields) loop
    if not (k = any (sow_editable_keys())) or jsonb_typeof(p_fields->k) <> 'string' or length(p_fields->>k) > 2000 then
      raise exception 'Campo no válido: %', k using errcode = '22023';
    end if;
  end loop;
  update quote_versions
     set sow_fields = coalesce(sow_fields, '{}'::jsonb) || (select jsonb_object_agg(key, btrim(value)) from jsonb_each_text(p_fields))
   where id = v.id;
  return quote_sow(v.id);
end $$;

-- Al enviar, la service role guarda lo que se usó (armado + corregido) y la ruta del PDF generado.
create function confirm_quote_sow(p_version uuid, p_fields jsonb, p_path text) returns void
language sql security definer set search_path = public as $$
  update quote_versions set sow_fields = p_fields, sow_path = p_path where id = p_version and status = 'draft'
$$;

revoke execute on function sow_default_fields(uuid), sow_effective_fields(uuid), confirm_quote_sow(uuid, jsonb, text)
  from public, anon, authenticated;
grant execute on function confirm_quote_sow(uuid, jsonb, text) to service_role;
revoke execute on function quote_sow(uuid), save_quote_sow(uuid, jsonb) from public, anon;
grant execute on function quote_sow(uuid), save_quote_sow(uuid, jsonb) to authenticated;

-- Contrato: la Parte A son los datos del SOW de la versión aceptada (orden 112 4) ---------------------------------

-- Las aclaraciones de A4 entran a las llaves del contrato; las opcionales no bloquean el envío (D-318 5).
create or replace function contract_editable_keys() returns text[]
language sql immutable as $$
  select array['date', 'effective_date', 'client_company', 'client_legal_name', 'client_entity', 'client_address',
    'client_contact', 'client_email', 'site_address', 'area_sqft', 'floors_rooms', 'facility_type', 'walkthrough_date',
    'frequency', 'service_window', 'start_date', 'holidays',
    'a3_offices_area', 'a3_offices_freq', 'a3_restrooms_area', 'a3_restrooms_freq', 'a3_breakroom_area', 'a3_breakroom_freq',
    'a3_floors_area', 'a3_floors_freq', 'a3_entrances_area', 'a3_entrances_freq', 'a3_periodic_area', 'a3_periodic_task',
    'a3_periodic_freq', 'a3_addons_area', 'a3_addons_task', 'a3_addons_freq', 'a4_clarifications',
    'supplies_cc', 'supplies_client', 'storage', 'access_method', 'keys_count', 'restricted_areas', 'inspections',
    'price', 'a9_name', 'a9_title', 'a9_datetime', 'cc_title']
$$;

create or replace function contract_missing_fields(p jsonb) returns text[]
language sql immutable as $$
  select coalesce(array_agg(k order by k), '{}') from unnest(contract_editable_keys()) k
   where btrim(coalesce(p->>k, '')) = '' and not (k = any (sow_optional_keys()) and k <> 'start_date')
$$;

-- Los campos del contrato toman los del SOW aceptado encima de los armados (contacto, dirección, sq ft, tipo, horario,
-- tareas, aclaraciones, suministros, acceso…). La fecha de inicio y la franja del jobsite mandan si existen.
alter function contract_default_fields(uuid, uuid) rename to contract_default_fields_base;
revoke execute on function contract_default_fields_base(uuid, uuid) from public, anon, authenticated;
create function contract_default_fields(p_jobsite uuid, p_version uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  base jsonb := contract_default_fields_base(p_jobsite, p_version);
  sow jsonb;
  k text;
begin
  select sow_fields into sow from quote_versions where id = p_version;
  if sow is null then return base; end if;
  for k in select unnest(sow_editable_keys()) loop
    if k in ('date', 'start_date', 'service_window') and btrim(coalesce(base->>k, '')) <> '' then continue; end if;
    if sow ? k then base := base || jsonb_build_object(k, coalesce(sow->>k, '')); end if;
  end loop;
  if btrim(coalesce(base->>'client_legal_name', '')) = '' then
    base := base || jsonb_build_object('client_legal_name', coalesce(sow->>'client_company', ''));
  end if;
  return base;
end $$;
revoke execute on function contract_default_fields(uuid, uuid) from public, anon, authenticated;

-- El número del SOW dentro del contrato es el del SOW que el cliente leyó (el del quote) si la versión lo generó.
create or replace function contract_json(c client_contracts) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', c.id, 'jobsite_id', c.jobsite_id, 'quote_version_id', c.quote_version_id, 'status', c.status,
    'csa', contract_label('CSA', c.number),
    'sow', case when v.sow_fields is not null then sow_label(q.number) else contract_label('SOW', c.number) end,
    'template_version', c.template_version,
    'quote_number', quote_number_label(q.number), 'quote_version', quote_version_label(v.minor), 'cleaning_type', j.cleaning_type,
    'fields', c.fields, 'editable', to_jsonb(contract_editable_keys()), 'missing', to_jsonb(contract_missing_fields(c.fields)),
    'email', c.email, 'sent_at', c.sent_at, 'expires_at', c.expires_at, 'viewed_at', c.viewed_at,
    'client_signer_name', c.client_signer_name, 'client_signer_title', c.client_signer_title,
    'client_signer_email', c.client_signer_email, 'client_signed_at', c.client_signed_at, 'client_ip', c.client_ip,
    'client_user_agent', c.client_user_agent, 'client_signature_id', c.client_signature_id,
    'cc_signer_name', c.cc_signer_name, 'cc_signer_title', c.cc_signer_title, 'cc_signed_at', c.cc_signed_at,
    'cc_ip', c.cc_ip, 'cc_user_agent', c.cc_user_agent, 'cc_signature_id', c.cc_signature_id,
    'unsigned_sha256', c.unsigned_sha256, 'signed_path', c.signed_path, 'retain_until', c.retain_until,
    'contract_status', j.contract_status, 'accepted_at', j.contract_accepted_at,
    'sign_until', j.contract_accepted_at + interval '15 days')
    from quote_versions v join quotes q on q.id = v.quote_id join jobsites j on j.id = c.jobsite_id
   where v.id = c.quote_version_id
$$;

-- Envío del quote: el SOW completo en vez del PDF subido -------------------------------------------------------------
create or replace function send_quote_data(p_version uuid) returns jsonb
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
  -- D-318 (reemplaza de D-209 la subida del PDF): el SOW se arma en la app; no se envía si le falta un dato
  -- obligatorio. D-239: el quote de un extra sigue sin SOW.
  if not exists (select 1 from quotes x where x.id = v.quote_id and x.kind = 'extra')
     and cardinality(sow_missing_fields(sow_effective_fields(v.id))) > 0 then
    raise exception 'Falta completar el SOW' using errcode = '22023';
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
    'company', lead_display_name(l.company, l.contact_name), 'site', lead_site_label(s.name, s.address),
    'address', coalesce(nullif(btrim(wv.data->'contact'->>'address'), ''), s.address, 'Naples, FL'),
    'frequency', wv.data->'frequency', 'extra', false, 'service_date', null, 'lines', v.lines, 'tax_rate', v.tax_rate,
    'contact_name', coalesce(nullif(btrim(wv.data->'contact'->>'contactName'), ''), nullif(btrim(l.contact_name), '')),
    'subtotal', v.subtotal, 'discount', v.discount, 'tax', v.tax, 'total', v.total, 'valid_days', v.valid_days,
    'expires_at', now() + make_interval(days => v.valid_days), 'recipients', to_jsonb(v_to),
    -- Lo que necesita send-quote para armar el PDF del SOW (D-318) y guardarlo con la versión.
    'sow', jsonb_build_object('fields', sow_effective_fields(v.id), 'sow_no', sow_label(q.number),
                              'quote_no', quote_number_label(q.number), 'quote_version', quote_version_label(v.minor),
                              'cleaning_type', l.cleaning_type));
end $$;