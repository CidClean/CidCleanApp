-- Orden 62 (legal rev. 3, fase C, D-283): contrato del cliente (Commercial Service Agreement + SOW, plantilla 1.0 de
-- legal/rev3/4_SOW_and_Service_Agreement_EN.pdf) por quote aceptado. El Super Admin lo prepara (completa los campos que
-- la app no tiene) y lo envía; el cliente firma en el portal (link por correo con token de un solo uso y 15 días de
-- vida, código de 6 dígitos al correo, nombre, cargo y casilla de consentimiento, como el W-9 de D-255/D-268); el Super
-- Admin contrafirma y el PDF firmado, con la hoja de certificado al final, queda en los documentos del jobsite. Al
-- quedar "Firmado por ambas partes" se habilita el Schedule del jobsite (migración 20261030000012).
-- Retención (D-281): 5 años; `retain_until` nace en la fecha de aceptación + 5 años y se recalcula cuando exista la
-- "fecha de fin de la relación" del cliente.
-- Las tablas no tienen políticas: todo pasa por funciones (Super Admin con su JWT; portal con la service role).

create sequence contract_number_seq;

create table client_contracts (
  id                  uuid primary key default gen_random_uuid(),
  number              bigint not null unique default nextval('contract_number_seq'),
  jobsite_id          uuid not null references jobsites(id) on delete restrict,
  quote_version_id    uuid not null references quote_versions(id) on delete restrict,
  template_version    text not null default '1.0',
  status              text not null default 'draft' check (status in ('draft', 'sent', 'client_signed', 'signed', 'void')),
  fields              jsonb not null default '{}'::jsonb check (jsonb_typeof(fields) = 'object'),
  -- PDF sin firmar (el que se envía; en jobsite-docs/<jobsite>/contract-draft/, sin fila en jobsite_documents).
  unsigned_path       text,
  unsigned_sha256     text check (unsigned_sha256 is null or unsigned_sha256 ~ '^[0-9a-f]{64}$'),
  -- Link del portal: solo el hash del token.
  token_hash          text unique check (token_hash is null or token_hash ~ '^[0-9a-f]{64}$'),
  email               text,
  sent_by             uuid references profiles(id),
  sent_at             timestamptz,
  expires_at          timestamptz,
  viewed_at           timestamptz,
  -- Firma del cliente.
  client_signer_name  text check (client_signer_name is null or length(client_signer_name) <= 120),
  client_signer_title text check (client_signer_title is null or length(client_signer_title) <= 120),
  client_signer_email text,
  client_signed_at    timestamptz,
  client_ip           text,
  client_user_agent   text,
  client_consent      boolean,
  client_signature_id uuid,
  -- Contrafirma de Cid Clean (solo el Super Admin).
  cc_signer_id        uuid references profiles(id),
  cc_signer_name      text,
  cc_signer_title     text,
  cc_signed_at        timestamptz,
  cc_ip               text,
  cc_user_agent       text,
  cc_signature_id     uuid,
  -- PDF firmado por ambas partes con la hoja de certificado (jobsite-docs/<jobsite>/contract/…, en jobsite_documents).
  signed_path         text,
  signed_sha256       text check (signed_sha256 is null or signed_sha256 ~ '^[0-9a-f]{64}$'),
  document_id         uuid references jobsite_documents(id),
  retain_until        date not null,
  legal_hold          boolean not null default false,
  created_by          uuid references profiles(id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint client_contracts_client_sig check (status not in ('client_signed', 'signed') or
    (client_signer_name is not null and client_signer_title is not null and client_signed_at is not null and client_consent)),
  constraint client_contracts_cc_sig check (status <> 'signed' or (cc_signer_id is not null and cc_signed_at is not null and signed_path is not null))
);
-- Un contrato vivo por versión aceptada.
create unique index client_contracts_open on client_contracts (quote_version_id) where status <> 'void';
create index client_contracts_jobsite on client_contracts (jobsite_id, number desc);
create trigger client_contracts_touch before update on client_contracts for each row execute function touch_updated_at();

create table contract_portal_codes (
  id          uuid primary key default gen_random_uuid(),
  seq         bigint generated always as identity,
  contract_id uuid not null references client_contracts(id) on delete cascade,
  email       text not null,
  code_hash   text not null,
  attempts    int not null default 0,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  used_at     timestamptz
);
create index contract_portal_codes_lookup on contract_portal_codes (contract_id, email, seq desc);

create table contract_portal_sessions (
  token_hash  text primary key,
  contract_id uuid not null references client_contracts(id) on delete cascade,
  email       text not null,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null
);

alter table client_contracts enable row level security;
alter table contract_portal_codes enable row level security;
alter table contract_portal_sessions enable row level security;
revoke all on client_contracts, contract_portal_codes, contract_portal_sessions from anon, authenticated;

create function contract_label(p_prefix text, p_number bigint) returns text
language sql immutable as $$ select p_prefix || '-' || lpad(p_number::text, 4, '0') $$;

-- Campos de la plantilla 1.0 ---------------------------------------------------------------------------------------
-- Las llaves son las de supabase/functions/_shared/legal/csa-sow-1.0.ts. Los que la app no tiene quedan vacíos para
-- que el Super Admin los complete antes de enviar. Los de A3 llevan como valor inicial el texto de la plantilla.
create function contract_editable_keys() returns text[]
language sql immutable as $$
  select array['date', 'effective_date', 'client_company', 'client_legal_name', 'client_entity', 'client_address',
    'client_contact', 'client_email', 'site_address', 'area_sqft', 'floors_rooms', 'facility_type', 'walkthrough_date',
    'frequency', 'service_window', 'start_date', 'holidays',
    'a3_offices_area', 'a3_offices_freq', 'a3_restrooms_area', 'a3_restrooms_freq', 'a3_breakroom_area', 'a3_breakroom_freq',
    'a3_floors_area', 'a3_floors_freq', 'a3_entrances_area', 'a3_entrances_freq', 'a3_periodic_area', 'a3_periodic_task',
    'a3_periodic_freq', 'a3_addons_area', 'a3_addons_task', 'a3_addons_freq',
    'supplies_cc', 'supplies_client', 'storage', 'access_method', 'keys_count', 'restricted_areas', 'inspections',
    'price', 'a9_name', 'a9_title', 'a9_datetime', 'cc_title']
$$;

create function contract_mmddyyyy(p timestamptz) returns text
language sql stable set search_path = public as $$ select to_char(p at time zone cc_tz(), 'MM/DD/YYYY') $$;

-- Frecuencia en inglés (días con el lunes en 0, como _shared/quotes.ts).
create function contract_frequency_text(f jsonb) returns text
language sql immutable as $$
  select case
    when f is null then ''
    when f->>'kind' = 'other' then coalesce(f->>'other', '')
    when f->>'kind' = 'daily' then '7 days per week, Monday–Sunday'
    else (select count(*)::text || case when count(*) = 1 then ' day' else ' days' end || ' per week: ' ||
                 string_agg((array['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'])[d::int + 1], ', ' order by d::int)
            from jsonb_array_elements_text(coalesce(f->'days', '[]'::jsonb)) d)
  end
$$;

create function contract_default_fields(p_jobsite uuid, p_version uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  j jobsites; v quote_versions; q quotes; l leads; d quote_decisions; wv walkthrough_versions;
begin
  select * into j from jobsites where id = p_jobsite;
  select * into v from quote_versions where id = p_version;
  select * into q from quotes where id = v.quote_id;
  select * into l from leads where id = q.lead_id;
  select * into d from quote_decisions where version_id = v.id and kind = 'accepted';
  select * into wv from walkthrough_versions where walkthrough_id = j.walkthrough_id and version = j.walkthrough_version;
  return jsonb_build_object(
    'date', contract_mmddyyyy(now()), 'effective_date', '',
    'client_company', coalesce(l.company, ''), 'client_legal_name', coalesce(l.company, ''), 'client_entity', '',
    'client_address', '',
    'client_contact', concat_ws(', ', d.signer_name, d.signer_title, d.email, j.contact_phone),
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

-- Campos vacíos que faltan para enviar.
create function contract_missing_fields(p jsonb) returns text[]
language sql immutable as $$
  select coalesce(array_agg(k order by k), '{}') from unnest(contract_editable_keys()) k where btrim(coalesce(p->>k, '')) = ''
$$;

-- Lo que ve el Super Admin y lo que necesita la función para armar el PDF (sin el hash del token).
create function contract_json(c client_contracts) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', c.id, 'jobsite_id', c.jobsite_id, 'quote_version_id', c.quote_version_id, 'status', c.status,
    'csa', contract_label('CSA', c.number), 'sow', contract_label('SOW', c.number), 'template_version', c.template_version,
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

-- "Requiere actualización" también cierra el contrato que no llegó a firmarse (su link deja de servir).
create or replace function jobsite_contracts_expire() returns int
language plpgsql security definer set search_path = public as $$
declare
  n int;
begin
  with x as (
    update jobsites set contract_status = 'needs_update'
     where contract_status = 'pending' and contract_accepted_at is not null
       and contract_accepted_at + interval '15 days' <= now()
    returning id, name),
  c as (update client_contracts set status = 'void', token_hash = null
         where jobsite_id in (select id from x) and status in ('draft', 'sent') returning id)
  insert into change_log (actor_id, action, entity, entity_id, detail)
  select null, 'contrato_requiere_actualizacion', 'jobsites', x.id, jsonb_build_object('name', x.name) from x;
  get diagnostics n = row_count;
  return n;
end $$;

-- Funciones del Super Admin (con su JWT, por la Edge Function contract-admin) ---------------------------------------

-- Contrato del jobsite: el vivo si existe; si el jobsite está "contrato pendiente", crea el borrador con los campos.
create function contract_prepare(p_jobsite uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  j jobsites; c client_contracts; v_version uuid; v_accepted timestamptz;
begin
  if not is_super_admin() then raise exception 'Solo el Super Admin prepara contratos' using errcode = '42501'; end if;
  perform jobsite_contracts_expire();
  select * into j from jobsites where id = p_jobsite for update;
  if j.id is null then raise exception 'El jobsite no existe' using errcode = 'P0002'; end if;
  select quote_version_id into v_version from jobsite_rates where jobsite_id = j.id;
  select * into c from client_contracts where jobsite_id = j.id and status <> 'void' order by number desc limit 1;
  if c.id is not null and (c.quote_version_id = v_version or c.status = 'signed') then return contract_json(c); end if;
  if j.contract_status <> 'pending' then raise exception 'El jobsite no tiene un contrato pendiente' using errcode = '22023'; end if;
  if v_version is null or not exists (select 1 from quote_versions where id = v_version and status = 'accepted') then
    raise exception 'El jobsite no tiene un quote aceptado' using errcode = '22023';
  end if;
  select created_at into v_accepted from quote_decisions where version_id = v_version and kind = 'accepted';
  insert into client_contracts (jobsite_id, quote_version_id, fields, retain_until, created_by)
  values (j.id, v_version, contract_default_fields(j.id, v_version),
          (local_day(coalesce(v_accepted, now())) + interval '5 years')::date, current_profile_id())
  returning * into c;
  insert into change_log (actor_id, action, entity, entity_id, detail)
  values (current_profile_id(), 'contrato_preparado', 'jobsites', j.id,
          jsonb_build_object('name', j.name, 'csa', contract_label('CSA', c.number)));
  return contract_json(c);
end $$;

-- Guardar campos (solo llaves de la plantilla, texto de hasta 2000). Si ya se había enviado, vuelve a borrador y el link
-- deja de servir: hay que enviarlo otra vez.
create function contract_save_fields(p_contract uuid, p_fields jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  c client_contracts; k text; merged jsonb;
begin
  if not is_super_admin() then raise exception 'Solo el Super Admin prepara contratos' using errcode = '42501'; end if;
  perform jobsite_contracts_expire();
  select * into c from client_contracts where id = p_contract for update;
  if c.id is null then raise exception 'El contrato no existe' using errcode = 'P0002'; end if;
  if c.status not in ('draft', 'sent') then raise exception 'El contrato ya no se edita' using errcode = '22023'; end if;
  if p_fields is null or jsonb_typeof(p_fields) <> 'object' then raise exception 'Campos no válidos' using errcode = '22023'; end if;
  for k in select jsonb_object_keys(p_fields) loop
    if not (k = any (contract_editable_keys())) or jsonb_typeof(p_fields->k) <> 'string' or length(p_fields->>k) > 2000 then
      raise exception 'Campo no válido: %', k using errcode = '22023';
    end if;
  end loop;
  merged := c.fields || (select jsonb_object_agg(key, btrim(value)) from jsonb_each_text(p_fields));
  update client_contracts set fields = merged, status = 'draft', token_hash = null, unsigned_path = null, unsigned_sha256 = null
   where id = c.id returning * into c;
  return contract_json(c);
end $$;

-- Envío, paso 1: comprueba que no falte nada y devuelve los datos para el PDF.
create function contract_send_prepare(p_contract uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  c client_contracts; j jobsites;
begin
  if not is_super_admin() then raise exception 'Solo el Super Admin envía contratos' using errcode = '42501'; end if;
  perform jobsite_contracts_expire();
  select * into c from client_contracts where id = p_contract;
  if c.id is null then raise exception 'El contrato no existe' using errcode = 'P0002'; end if;
  select * into j from jobsites where id = c.jobsite_id;
  if c.status not in ('draft', 'sent') or j.contract_status <> 'pending' then
    raise exception 'El contrato no se puede enviar' using errcode = '22023';
  end if;
  if cardinality(contract_missing_fields(c.fields)) > 0 then
    raise exception 'missing_fields:%', array_to_string(contract_missing_fields(c.fields), ',') using errcode = '22023';
  end if;
  return contract_json(c);
end $$;

-- Envío, paso 2 (después de guardar el PDF sin firmar): guarda el hash del token, el correo y la vigencia de 15 días.
create function contract_send_confirm(p_contract uuid, p_path text, p_sha256 text, p_token_hash text, p_email text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  c client_contracts; e text := lower(btrim(coalesce(p_email, '')));
begin
  if not is_super_admin() then raise exception 'Solo el Super Admin envía contratos' using errcode = '42501'; end if;
  select * into c from client_contracts where id = p_contract for update;
  if c.id is null or c.status not in ('draft', 'sent') then raise exception 'El contrato no se puede enviar' using errcode = '22023'; end if;
  if e !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' or length(e) > 200 then raise exception 'Correo no válido' using errcode = '22023'; end if;
  if p_token_hash !~ '^[0-9a-f]{64}$' or p_path !~ ('^' || c.jobsite_id || '/contract-draft/[A-Za-z0-9_.-]+\.pdf$') then
    raise exception 'Datos no válidos' using errcode = '22023';
  end if;
  update client_contracts
     set status = 'sent', unsigned_path = p_path, unsigned_sha256 = p_sha256, token_hash = p_token_hash, email = e,
         sent_by = current_profile_id(), sent_at = now(), expires_at = now() + interval '15 days', viewed_at = null
   where id = c.id returning * into c;
  delete from contract_portal_sessions where contract_id = c.id;
  insert into change_log (actor_id, action, entity, entity_id, detail)
  values (current_profile_id(), 'contrato_enviado', 'jobsites', c.jobsite_id,
          jsonb_build_object('csa', contract_label('CSA', c.number), 'email', e));
  return contract_json(c) || jsonb_build_object('company', c.fields->>'client_legal_name', 'name', split_part(c.fields->>'client_contact', ',', 1));
end $$;

-- Contrafirma, paso 1: datos para el PDF final (solo con la firma del cliente).
create function contract_countersign_prepare(p_contract uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  c client_contracts;
begin
  if not is_super_admin() then raise exception 'Solo el Super Admin contrafirma' using errcode = '42501'; end if;
  select * into c from client_contracts where id = p_contract;
  if c.id is null then raise exception 'El contrato no existe' using errcode = 'P0002'; end if;
  if c.status <> 'client_signed' then raise exception 'Falta la firma del cliente' using errcode = '22023'; end if;
  return contract_json(c) || jsonb_build_object(
    'cc_name', (select full_name from profiles where id = current_profile_id()),
    'cc_email', (select email from profiles where id = current_profile_id()),
    'sent_by_name', (select full_name from profiles where id = c.sent_by));
end $$;

-- Contrafirma, paso 2 (después de guardar el PDF firmado): documento del jobsite, "Firmado por ambas partes" y el
-- Schedule habilitado.
create function contract_countersign_confirm(p_contract uuid, p_path text, p_sha256 text, p_signature_id uuid,
                                             p_signed_at timestamptz, p_ip text, p_user_agent text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  c client_contracts; v_doc uuid; me uuid := current_profile_id();
begin
  if not is_super_admin() then raise exception 'Solo el Super Admin contrafirma' using errcode = '42501'; end if;
  select * into c from client_contracts where id = p_contract for update;
  if c.id is null or c.status <> 'client_signed' then raise exception 'Falta la firma del cliente' using errcode = '22023'; end if;
  if p_path !~ ('^' || c.jobsite_id || '/contract/[A-Za-z0-9_.-]+\.pdf$') or p_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'Datos no válidos' using errcode = '22023';
  end if;
  insert into jobsite_documents (jobsite_id, kind, file_path, version, source_quote_version, uploaded_by)
  values (c.jobsite_id, 'contract', p_path, coalesce((select max(version) + 1 from jobsite_documents where jobsite_id = c.jobsite_id and kind = 'contract'), 1),
          c.quote_version_id, me)
  returning id into v_doc;
  update client_contracts
     set status = 'signed', cc_signer_id = me, cc_signer_name = (select full_name from profiles where id = me),
         cc_signer_title = coalesce(nullif(btrim(fields->>'cc_title'), ''), 'Managing Member'), cc_signed_at = coalesce(p_signed_at, now()),
         cc_ip = left(p_ip, 100), cc_user_agent = left(p_user_agent, 400), cc_signature_id = p_signature_id,
         signed_path = p_path, signed_sha256 = p_sha256, document_id = v_doc, token_hash = null
   where id = c.id returning * into c;
  update jobsites set contract_status = 'both_signed', contract_signed_at = c.cc_signed_at where id = c.jobsite_id;
  insert into change_log (actor_id, action, entity, entity_id, detail)
  values (me, 'contrato_firmado', 'jobsites', c.jobsite_id, jsonb_build_object('csa', contract_label('CSA', c.number)));
  return contract_json(c) || jsonb_build_object('company', c.fields->>'client_legal_name',
    'cc_email', (select email from profiles where id = me));
end $$;

-- Funciones del portal de firma (solo la Edge Function contract-portal, con la service role) ------------------------

create function contract_portal_state(p_token_hash text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  c client_contracts;
begin
  perform jobsite_contracts_expire();
  select * into c from client_contracts where token_hash = p_token_hash;
  if c.id is null then return jsonb_build_object('state', 'not_found'); end if;
  return jsonb_build_object('state', case when c.status in ('client_signed', 'signed') then 'signed'
                                          when c.status <> 'sent' then 'closed'
                                          when c.expires_at <= now() then 'expired' else 'open' end);
end $$;

create function contract_portal_request_code(p_token_hash text, p_email text, p_code_hash text) returns text
language plpgsql security definer set search_path = public as $$
declare
  c client_contracts; e text := lower(btrim(coalesce(p_email, '')));
begin
  perform jobsite_contracts_expire();
  select * into c from client_contracts where token_hash = p_token_hash for update;
  if c.id is null or c.status <> 'sent' or c.expires_at <= now() then return 'closed'; end if;
  if e <> c.email then return 'not_recipient'; end if;
  if (select count(*) from contract_portal_codes where contract_id = c.id and email = e
       and created_at > now() - interval '1 hour') >= 5 then
    return 'rate_limited';
  end if;
  insert into contract_portal_codes (contract_id, email, code_hash, expires_at) values (c.id, e, p_code_hash, now() + interval '10 minutes');
  return 'sent';
end $$;

create function contract_portal_verify_code(p_token_hash text, p_email text, p_code_hash text, p_session_hash text) returns text
language plpgsql security definer set search_path = public as $$
declare
  c client_contracts; k contract_portal_codes; e text := lower(btrim(coalesce(p_email, '')));
begin
  select * into c from client_contracts where token_hash = p_token_hash for update;
  if c.id is null or c.status <> 'sent' or c.expires_at <= now() then return 'closed'; end if;
  select * into k from contract_portal_codes where contract_id = c.id and email = e order by seq desc limit 1 for update;
  if k.id is null or k.used_at is not null then return 'expired'; end if;
  if k.attempts >= 5 then return 'locked'; end if;
  if k.expires_at <= now() then return 'expired'; end if;
  if k.code_hash <> p_code_hash then
    update contract_portal_codes set attempts = attempts + 1 where id = k.id;
    return case when k.attempts + 1 >= 5 then 'locked' else 'wrong' end;
  end if;
  update contract_portal_codes set used_at = now() where id = k.id;
  insert into contract_portal_sessions (token_hash, contract_id, email, expires_at)
  values (p_session_hash, c.id, e, least(now() + interval '2 hours', c.expires_at));
  if c.viewed_at is null then update client_contracts set viewed_at = now() where id = c.id; end if;
  return 'ok';
end $$;

-- Lo que ve el cliente: números, empresa, sitio y su firma si ya firmó (sin datos internos).
create function contract_portal_data(p_session_hash text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  ses contract_portal_sessions; c client_contracts;
begin
  select * into ses from contract_portal_sessions where token_hash = p_session_hash and expires_at > now();
  if ses.token_hash is null then return null; end if;
  select * into c from client_contracts where id = ses.contract_id;
  return jsonb_build_object(
    'status', c.status, 'csa', contract_label('CSA', c.number), 'sow', contract_label('SOW', c.number),
    'template_version', c.template_version, 'company', c.fields->>'client_legal_name', 'site', c.fields->>'site_address',
    'email', ses.email, 'expires_at', c.expires_at, 'unsigned_path', c.unsigned_path,
    'signed', case when c.client_signed_at is null then null
                   else jsonb_build_object('name', c.client_signer_name, 'title', c.client_signer_title, 'at', c.client_signed_at) end);
end $$;

-- Firma del cliente: nombre, cargo y consentimiento; queda "Firmado por el cliente" (falta la contrafirma).
create function contract_portal_sign(p_session_hash text, p_name text, p_title text, p_consent boolean, p_ip text,
                                     p_user_agent text, p_signature_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  ses contract_portal_sessions; c client_contracts; j jobsites;
  n text := btrim(coalesce(p_name, '')); t text := btrim(coalesce(p_title, ''));
begin
  perform jobsite_contracts_expire();
  select * into ses from contract_portal_sessions where token_hash = p_session_hash and expires_at > now();
  if ses.token_hash is null then raise exception 'Sesión vencida' using errcode = '42501'; end if;
  select * into c from client_contracts where id = ses.contract_id for update;
  select * into j from jobsites where id = c.jobsite_id for update;
  if c.status <> 'sent' or c.expires_at <= now() or j.contract_status <> 'pending' then
    raise exception 'El contrato ya no se puede firmar' using errcode = '22023';
  end if;
  if n = '' or t = '' or length(n) > 120 or length(t) > 120 or not coalesce(p_consent, false) then
    raise exception 'Faltan datos para firmar' using errcode = '22023';
  end if;
  update client_contracts
     set status = 'client_signed', client_signer_name = n, client_signer_title = t, client_signer_email = ses.email,
         client_signed_at = now(), client_ip = left(p_ip, 100), client_user_agent = left(p_user_agent, 400),
         client_consent = true, client_signature_id = coalesce(p_signature_id, gen_random_uuid()), token_hash = null
   where id = c.id returning * into c;
  delete from contract_portal_sessions where contract_id = c.id and token_hash <> p_session_hash;
  update jobsites set contract_status = 'client_signed' where id = j.id;
  insert into change_log (actor_id, action, entity, entity_id, detail)
  values (null, 'contrato_firmado_cliente', 'jobsites', j.id, jsonb_build_object('csa', contract_label('CSA', c.number), 'name', n));
  return jsonb_build_object('signed_at', c.client_signed_at, 'csa', contract_label('CSA', c.number), 'company', c.fields->>'client_legal_name',
    'site', j.name, 'sent_by_email', (select email from profiles where id = c.sent_by));
end $$;

-- Permisos de ejecución.
revoke execute on function contract_label(text, bigint), contract_editable_keys(), contract_mmddyyyy(timestamptz),
  contract_frequency_text(jsonb), contract_default_fields(uuid, uuid), contract_missing_fields(jsonb), contract_json(client_contracts),
  contract_prepare(uuid), contract_save_fields(uuid, jsonb), contract_send_prepare(uuid),
  contract_send_confirm(uuid, text, text, text, text), contract_countersign_prepare(uuid),
  contract_countersign_confirm(uuid, text, text, uuid, timestamptz, text, text),
  contract_portal_state(text), contract_portal_request_code(text, text, text), contract_portal_verify_code(text, text, text, text),
  contract_portal_data(text), contract_portal_sign(text, text, text, boolean, text, text, uuid)
  from public, anon, authenticated;
grant execute on function contract_prepare(uuid), contract_save_fields(uuid, jsonb), contract_send_prepare(uuid),
  contract_send_confirm(uuid, text, text, text, text), contract_countersign_prepare(uuid),
  contract_countersign_confirm(uuid, text, text, uuid, timestamptz, text, text) to authenticated;
grant execute on function contract_portal_state(text), contract_portal_request_code(text, text, text),
  contract_portal_verify_code(text, text, text, text), contract_portal_data(text),
  contract_portal_sign(text, text, text, boolean, text, text, uuid) to service_role;
