-- Orden 113 (D-318 3 y 4, D-319 5 y 6, D-320 3): "Preparar contrato" con todo lo ya llenado.
--  · Contacto = una sola persona: nombre, cargo, correo y teléfono de quien aceptó el quote.
--  · Dirección del cliente precargada (la del cliente, que nace con la del primer sitio).
--  · Nombre legal y empresa con una sola llave: client_legal_name y client_company quedan siempre iguales.
--  · Fecha de vigencia = fecha de inicio del servicio, editable.
--  · El portal del contrato precarga nombre y cargo de quien aceptó el quote (editables).

create or replace function contract_default_fields_base(p_jobsite uuid, p_version uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  j jobsites; v quote_versions; q quotes; l leads; d quote_decisions; wv walkthrough_versions; cl clients; v_phone text;
begin
  select * into j from jobsites where id = p_jobsite;
  select * into v from quote_versions where id = p_version;
  select * into q from quotes where id = v.quote_id;
  select * into l from leads where id = q.lead_id;
  select * into d from quote_decisions where version_id = v.id and kind = 'accepted';
  select * into wv from walkthrough_versions where walkthrough_id = j.walkthrough_id and version = j.walkthrough_version;
  select * into cl from clients where id = j.client_id;
  -- D-319 (5): el contacto es una sola persona, quien aceptó el quote. Su teléfono, si su correo es el del contacto
  -- del jobsite o el del lead (no se mezcla el teléfono de otra persona, D-200).
  v_phone := case when lower(d.email) = lower(j.contact_email) then j.contact_phone
                  when lower(d.email) = lower(l.email) then l.phone end;
  return jsonb_build_object(
    -- D-318 (4): vigencia = fecha de inicio del servicio (editable).
    'date', contract_mmddyyyy(now()), 'effective_date', coalesce(to_char(j.start_date, 'MM/DD/YYYY'), ''),
    'client_company', coalesce(nullif(btrim(coalesce(l.company, '')), ''), cl.name, ''),
    'client_legal_name', coalesce(nullif(btrim(coalesce(l.company, '')), ''), cl.name, ''), 'client_entity', '',
    -- D-319 (3, 5): la dirección del cliente (nace con la del primer sitio).
    'client_address', coalesce(format_address(cl.address_line1, cl.address_line2, cl.city, cl.state, cl.zip), cl.address, ''),
    'client_contact', concat_ws(', ', nullif(btrim(coalesce(d.signer_name, '')), ''), nullif(btrim(coalesce(d.signer_title, '')), ''),
                                nullif(btrim(coalesce(d.email, '')), ''), nullif(btrim(coalesce(v_phone, '')), '')),
    'client_email', coalesce(d.email, j.contact_email, ''),
    'site_address', coalesce(j.address, ''), 'area_sqft', '',
    'floors_rooms', coalesce((select string_agg(nullif(btrim(a->>'name'), ''), ', ') from jsonb_array_elements(coalesce(wv.data->'areas', '[]'::jsonb)) a), ''),
    'facility_type', '', 'walkthrough_date', coalesce(contract_mmddyyyy(wv.created_at), ''),
    'frequency', contract_frequency_text(j.frequency),
    'service_window', coalesce('after ' || to_char(j.visit_start_time, 'FMHH12:MI AM'), ''),
    'start_date', coalesce(to_char(j.start_date, 'MM/DD/YYYY'), ''),
    'holidays', 'New Year''s Day, Memorial Day, Independence Day, Labor Day, Thanksgiving Day, Christmas Day',
    'a3_offices_area', 'Offices / workstations', 'a3_offices_freq', 'Each visit',
    'a3_restrooms_area', 'Restrooms', 'a3_restrooms_freq', 'Each visit',
    'a3_breakroom_area', 'Break room / kitchen', 'a3_breakroom_freq', 'Each visit',
    'a3_floors_area', 'Hard floors', 'a3_floors_freq', 'Each visit',
    'a3_entrances_area', 'Entrances / lobby', 'a3_entrances_freq', 'Each visit',
    'a3_periodic_area', 'Periodic', 'a3_periodic_task', 'High dusting, baseboards, vents, interior glass',
    'a3_periodic_freq', 'Weekly / monthly',
    'a3_addons_area', 'Add-on services', 'a3_addons_task', 'Carpet extraction, floor stripping and waxing, window washing, post-construction',
    'a3_addons_freq', 'Quoted separately',
    'supplies_cc', 'standard', 'supplies_client', 'restroom paper products, hand soap, trash liners',
    'storage', '', 'access_method', '', 'keys_count', '', 'restricted_areas', '', 'inspections', '',
    'price', '$' || to_char(v.subtotal - v.discount, 'FM999,999,990.00') || ' per month',
    'a9_name', coalesce(d.signer_name, ''), 'a9_title', coalesce(d.signer_title, ''),
    'a9_datetime', coalesce(contract_mmddyyyy(d.created_at) || ' ' || to_char(d.created_at at time zone cc_tz(), 'FMHH12:MI AM'), ''),
    'cc_title', 'Managing Member');
end $$;

-- Sobre los datos del SOW aceptado (orden 112), pero el contacto y el correo son los de quien aceptó (D-319 5) y el
-- nombre legal es uno solo.
create or replace function contract_default_fields(p_jobsite uuid, p_version uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  base jsonb := contract_default_fields_base(p_jobsite, p_version);
  sow jsonb;
  k text;
  v_legal text;
begin
  select sow_fields into sow from quote_versions where id = p_version;
  if sow is not null then
    for k in select unnest(sow_editable_keys()) loop
      if k in ('client_contact', 'client_email') then continue; end if;
      if k in ('date', 'start_date', 'service_window') and btrim(coalesce(base->>k, '')) <> '' then continue; end if;
      if sow ? k and (k <> 'client_company' or btrim(coalesce(sow->>k, '')) <> '') then
        base := base || jsonb_build_object(k, coalesce(sow->>k, ''));
      end if;
    end loop;
  end if;
  v_legal := coalesce(nullif(btrim(base->>'client_company'), ''), base->>'client_legal_name', '');
  return base || jsonb_build_object('client_company', v_legal, 'client_legal_name', v_legal);
end $$;
revoke execute on function contract_default_fields(uuid, uuid), contract_default_fields_base(uuid, uuid) from public, anon, authenticated;

-- Guardar: el nombre legal se escribe en las dos llaves (una sola en la pantalla).
create or replace function contract_save_fields(p_contract uuid, p_fields jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  c client_contracts; k text; merged jsonb; f jsonb := p_fields;
begin
  if not is_super_admin() then raise exception 'Solo el Super Admin prepara contratos' using errcode = '42501'; end if;
  perform jobsite_contracts_expire();
  select * into c from client_contracts where id = p_contract for update;
  if c.id is null then raise exception 'El contrato no existe' using errcode = 'P0002'; end if;
  if c.status not in ('draft', 'sent') then raise exception 'El contrato ya no se edita' using errcode = '22023'; end if;
  if f is null or jsonb_typeof(f) <> 'object' then raise exception 'Campos no válidos' using errcode = '22023'; end if;
  for k in select jsonb_object_keys(f) loop
    if not (k = any (contract_editable_keys())) or jsonb_typeof(f->k) <> 'string' or length(f->>k) > 2000 then
      raise exception 'Campo no válido: %', k using errcode = '22023';
    end if;
  end loop;
  if f ? 'client_legal_name' then f := f || jsonb_build_object('client_company', f->>'client_legal_name');
  elsif f ? 'client_company' then f := f || jsonb_build_object('client_legal_name', f->>'client_company');
  end if;
  merged := c.fields || (select jsonb_object_agg(key, btrim(value)) from jsonb_each_text(f));
  update client_contracts set fields = merged, status = 'draft', token_hash = null, unsigned_path = null, unsigned_sha256 = null
   where id = c.id returning * into c;
  return contract_json(c);
end $$;

-- Portal: nombre y cargo de quien aceptó el quote para precargar el formulario (D-319 6); el SOW con su número.
create or replace function contract_portal_data(p_session_hash text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  ses contract_portal_sessions; c client_contracts; d quote_decisions; v quote_versions; q quotes;
begin
  select * into ses from contract_portal_sessions where token_hash = p_session_hash and expires_at > now();
  if ses.token_hash is null then return null; end if;
  select * into c from client_contracts where id = ses.contract_id;
  select * into d from quote_decisions where version_id = c.quote_version_id and kind = 'accepted';
  select * into v from quote_versions where id = c.quote_version_id;
  select * into q from quotes where id = v.quote_id;
  return jsonb_build_object(
    'status', c.status, 'csa', contract_label('CSA', c.number),
    'sow', case when v.sow_fields is not null then sow_label(q.number) else contract_label('SOW', c.number) end,
    'template_version', c.template_version, 'company', c.fields->>'client_legal_name', 'site', c.fields->>'site_address',
    'email', ses.email, 'expires_at', c.expires_at, 'unsigned_path', c.unsigned_path,
    'prefill_name', coalesce(d.signer_name, ''), 'prefill_title', coalesce(d.signer_title, ''),
    'signed', case when c.client_signed_at is null then null
                   else jsonb_build_object('name', c.client_signer_name, 'title', c.client_signer_title, 'at', c.client_signed_at) end);
end $$;
