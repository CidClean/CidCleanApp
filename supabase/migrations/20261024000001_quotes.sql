-- Hito 4, Ventas C: quote por sitio con versiones, SOW, portal del cliente y Cliente con Jobsite al aceptar.
-- Fuente: current/flujo.md ("Ventas 3"), current/seguridad.md ("Portal del quote"), current/permisos.md,
-- D-005 a D-008, D-041 a D-047, D-077, D-094, D-095, D-108, D-122, D-129, D-208, D-209.
-- Permisos: quotes_ver (ver estado y versiones), quotes_ver_precios (ver montos), quotes_editar (armar borradores,
-- con precios), quotes_enviar (enviar), sow_contratos_subir_ver (subir y ver el SOW del quote).
-- La app lee y escribe solo con funciones; el portal del cliente, solo con la Edge Function quote-portal (service role).

-- Idioma del lead (D-209): el del correo y del portal del cliente. Inglés por defecto.
alter table leads add column language app_language not null default 'en';

create type quote_status as enum ('draft', 'sent', 'viewed', 'accepted', 'rejected', 'changes_requested', 'expired', 'superseded');
create type jobsite_status as enum ('active', 'paused', 'terminated');

-- Cliente y Jobsite (modelo básico; el hito 5 lo completa) ------------------------------------------------
-- Un Cliente por lead; los demás sitios aceptados del mismo lead cuelgan de él (D-209).
create table clients (
  id          uuid primary key default gen_random_uuid(),
  lead_id     uuid unique references leads(id) on delete set null,
  name        text not null check (btrim(name) <> ''),
  legacy      boolean not null default false, -- "Previo a la app" (D-210, hito 5)
  created_by  uuid references profiles(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table jobsites (
  id                  uuid primary key default gen_random_uuid(),
  client_id           uuid not null references clients(id) on delete restrict,
  site_id             uuid unique references lead_sites(id) on delete set null,
  name                text not null check (btrim(name) <> ''),
  address             text not null,
  contact_name        text,
  contact_phone       text,
  contact_email       text,
  frequency           jsonb,
  walkthrough_id      uuid references walkthroughs(id) on delete set null,
  walkthrough_version int,
  status              jobsite_status not null default 'active',
  created_by          uuid references profiles(id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- Tarifa al cliente aparte: solo la ve quien tiene clientes_ver_tarifa (D-125).
create table jobsite_rates (
  jobsite_id        uuid primary key references jobsites(id) on delete cascade,
  monthly_rate      numeric(12, 2) not null check (monthly_rate >= 0),
  quote_version_id  uuid,
  set_by            uuid references profiles(id),
  set_at            timestamptz not null default now()
);

create table jobsite_documents (
  id                   uuid primary key default gen_random_uuid(),
  jobsite_id           uuid not null references jobsites(id) on delete cascade,
  kind                 text not null check (kind in ('sow', 'contract', 'other')),
  file_path            text not null,
  version              int not null default 1,
  source_quote_version uuid,
  uploaded_by          uuid references profiles(id),
  uploaded_at          timestamptz not null default now()
);

-- Quote por sitio y sus versiones ----------------------------------------------------------------------
create table quotes (
  id             uuid primary key default gen_random_uuid(),
  site_id        uuid not null unique references lead_sites(id) on delete cascade,
  lead_id        uuid not null references leads(id) on delete cascade,
  walkthrough_id uuid not null references walkthroughs(id),
  created_by     uuid references profiles(id),
  created_at     timestamptz not null default now()
);

-- Una versión por envío (1.0, 1.1, 1.2...; D-007). Los montos los calcula la base de datos.
create table quote_versions (
  id                  uuid primary key default gen_random_uuid(),
  quote_id            uuid not null references quotes(id) on delete cascade,
  minor               int not null check (minor >= 0),
  status              quote_status not null default 'draft',
  walkthrough_version int not null,
  lines               jsonb not null default '{"services": [], "addons": [], "discounts": []}'::jsonb,
  tax_rate            numeric(6, 3) not null default 6 check (tax_rate >= 0 and tax_rate <= 100),
  valid_days          int not null default 30 check (valid_days between 1 and 365),
  contact_email       text,                       -- contacto del sitio (del walkthrough)
  recipients          text[] not null default '{}', -- correos opcionales además del contacto (D-209)
  subtotal            numeric(12, 2) not null default 0,
  discount            numeric(12, 2) not null default 0,
  tax                 numeric(12, 2) not null default 0,
  total               numeric(12, 2) not null default 0,
  sow_path            text,
  pdf_path            text,
  public_token        text unique,
  snapshot            jsonb,                      -- empresa, sitio, dirección, frecuencia e idioma al enviar
  sent_at             timestamptz,
  sent_by             uuid references profiles(id),
  expires_at          timestamptz,
  viewed_at           timestamptz,
  decided_at          timestamptz,
  decision_seen_at    timestamptz,
  created_by          uuid references profiles(id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (quote_id, minor)
);
create index quote_versions_status on quote_versions (status);

-- Decisión del cliente en el portal (D-007, D-045, D-046, D-095, flujo "Legal").
create table quote_decisions (
  id                uuid primary key default gen_random_uuid(),
  version_id        uuid not null unique references quote_versions(id) on delete cascade,
  kind              text not null check (kind in ('accepted', 'rejected', 'changes_requested')),
  email             text not null,
  signer_name       text,
  signer_title      text,
  reason_id         uuid references lost_reasons(id),
  note              text,
  sow_read_at       timestamptz,
  read_confirmed    boolean not null default false,
  terms_document_id uuid references terms_documents(id),
  ip                text,
  user_agent        text,
  created_at        timestamptz not null default now(),
  constraint quote_decisions_accept check (kind <> 'accepted' or (signer_name is not null and signer_title is not null
                                           and sow_read_at is not null and read_confirmed))
);

-- Códigos y sesiones del portal (D-129, D-209). Solo se guarda el hash del código y del token de sesión.
create table quote_portal_codes (
  id          uuid primary key default gen_random_uuid(),
  seq         bigint generated always as identity, -- orden de llegada (el último código es el que vale)
  version_id  uuid not null references quote_versions(id) on delete cascade,
  email       text not null,
  code_hash   text not null,
  attempts    int not null default 0,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  used_at     timestamptz
);
create index quote_portal_codes_lookup on quote_portal_codes (version_id, email, seq desc);

create table quote_portal_sessions (
  token_hash    text primary key,
  version_id    uuid not null references quote_versions(id) on delete cascade,
  email         text not null,
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null,
  sow_opened_at timestamptz
);

create trigger clients_touch before update on clients for each row execute function touch_updated_at();
create trigger jobsites_touch before update on jobsites for each row execute function touch_updated_at();
create trigger quote_versions_touch before update on quote_versions for each row execute function touch_updated_at();

-- RLS: Clientes y Jobsites se leen con clientes_ver (tarifa con clientes_ver_tarifa, D-125); los quotes, solo por
-- funciones (los montos se ocultan sin quotes_ver_precios). Nada se escribe directo.
alter table clients enable row level security;
alter table jobsites enable row level security;
alter table jobsite_rates enable row level security;
alter table jobsite_documents enable row level security;
alter table quotes enable row level security;
alter table quote_versions enable row level security;
alter table quote_decisions enable row level security;
alter table quote_portal_codes enable row level security;
alter table quote_portal_sessions enable row level security;
create policy clients_read on clients for select to authenticated using (has_permission('clientes_ver'));
create policy jobsites_read on jobsites for select to authenticated using (has_permission('clientes_ver'));
create policy jobsite_rates_read on jobsite_rates for select to authenticated using (has_permission('clientes_ver_tarifa'));
-- D-210: el SOW se ve con ver clientes; el contrato exige ver tarifa.
create policy jobsite_documents_read on jobsite_documents for select to authenticated
  using (has_permission('clientes_ver') and (kind <> 'contract' or has_permission('clientes_ver_tarifa')));
revoke all on clients, jobsites, jobsite_rates, jobsite_documents, quotes, quote_versions, quote_decisions,
  quote_portal_codes, quote_portal_sessions from anon;
revoke insert, update, delete, truncate, references, trigger on clients, jobsites, jobsite_rates, jobsite_documents
  from authenticated;
revoke all on quotes, quote_versions, quote_decisions, quote_portal_codes, quote_portal_sessions from authenticated;

-- Archivos: SOW y PDF del quote (privado) y documentos del jobsite (privado). Solo PDF, hasta 10 MB.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('quote-files', 'quote-files', false, 10485760, array['application/pdf']),
       ('jobsite-docs', 'jobsite-docs', false, 10485760, array['application/pdf'])
on conflict (id) do nothing;

-- quote-files: <quote>/<versión>/sow-<algo>.pdf (lo sube la app) y <quote>/<versión>/quote-<algo>.pdf (lo genera el servidor).
create policy quote_files_sow_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'quote-files' and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/sow-[A-Za-z0-9_-]+\.pdf$'
              and has_permission('quotes_editar') and has_permission('sow_contratos_subir_ver'));
create policy quote_files_read on storage.objects for select to authenticated
  using (bucket_id = 'quote-files' and (
           (name ~ '/sow-[A-Za-z0-9_-]+\.pdf$' and has_permission('sow_contratos_subir_ver'))
        or (name ~ '/quote-[A-Za-z0-9_.-]+\.pdf$' and has_permission('quotes_ver_precios'))));
-- jobsite-docs: SOW copiado al aceptar (D-209). El contrato y los demás llegan en el hito 5.
create policy jobsite_docs_read on storage.objects for select to authenticated
  using (bucket_id = 'jobsite-docs' and has_permission('clientes_ver')
         and exists (select 1 from jobsite_documents d where d.file_path = storage.objects.name
                       and (d.kind <> 'contract' or has_permission('clientes_ver_tarifa'))));

-- Cálculos ---------------------------------------------------------------------------------------------

-- Valida los renglones (texto libre, D-209): servicios y add-ons con monto y Gravable (D-077); descuentos en monto
-- o porcentaje (D-209).
create function quote_lines_valid(p jsonb) returns boolean
language plpgsql immutable set search_path = public as $$
declare
  item jsonb;
  sec text;
begin
  if p is null or jsonb_typeof(p) <> 'object' then return false; end if;
  foreach sec in array array['services', 'addons', 'discounts'] loop
    if jsonb_typeof(coalesce(p->sec, '[]'::jsonb)) <> 'array' then return false; end if;
    if jsonb_array_length(coalesce(p->sec, '[]'::jsonb)) > 50 then return false; end if;
    for item in select * from jsonb_array_elements(coalesce(p->sec, '[]'::jsonb)) loop
      if jsonb_typeof(item) <> 'object' or jsonb_typeof(item->'label') <> 'string'
         or btrim(item->>'label') = '' or length(item->>'label') > 120 then return false; end if;
      if sec = 'discounts' then
        if coalesce(item->>'kind', '') not in ('amount', 'percent') or jsonb_typeof(item->'value') <> 'number' then return false; end if;
        if (item->>'value')::numeric < 0 or (item->>'kind' = 'percent' and (item->>'value')::numeric > 100)
           or (item->>'value')::numeric > 10000000 then return false; end if;
      else
        if jsonb_typeof(item->'amount') <> 'number' or jsonb_typeof(item->'taxable') <> 'boolean' then return false; end if;
        if (item->>'amount')::numeric < 0 or (item->>'amount')::numeric > 10000000 then return false; end if;
      end if;
    end loop;
  end loop;
  return true;
end $$;

-- Totales (D-077, D-122, D-209): subtotal de servicios y add-ons; descuentos restados antes del tax y repartidos en
-- proporción sobre lo gravable; tax sobre la parte gravable; total mensual. Redondeo a centavos.
create function quote_totals(p jsonb, p_tax_rate numeric)
returns table (subtotal numeric, discount numeric, tax numeric, total numeric)
language plpgsql immutable set search_path = public as $$
declare
  v_sub numeric := 0;
  v_taxable numeric := 0;
  v_disc numeric := 0;
  item jsonb;
begin
  for item in select * from jsonb_array_elements(coalesce(p->'services', '[]'::jsonb) || coalesce(p->'addons', '[]'::jsonb)) loop
    v_sub := v_sub + (item->>'amount')::numeric;
    if (item->>'taxable')::boolean then v_taxable := v_taxable + (item->>'amount')::numeric; end if;
  end loop;
  v_sub := round(v_sub, 2);
  v_taxable := round(v_taxable, 2);
  for item in select * from jsonb_array_elements(coalesce(p->'discounts', '[]'::jsonb)) loop
    v_disc := v_disc + case when item->>'kind' = 'percent' then v_sub * (item->>'value')::numeric / 100
                            else (item->>'value')::numeric end;
  end loop;
  v_disc := round(least(v_disc, v_sub), 2);
  subtotal := v_sub;
  discount := v_disc;
  tax := case when v_sub > 0 then round((v_taxable - v_disc * v_taxable / v_sub) * p_tax_rate / 100, 2) else 0 end;
  total := v_sub - v_disc + tax;
  return next;
end $$;

-- Estado vigente: un quote enviado o visto pasa a Expirado al vencer (D-006, D-129).
create function expire_quotes() returns void
language sql security definer set search_path = public as $$
  update quote_versions set status = 'expired'
   where status in ('sent', 'viewed') and expires_at is not null and expires_at <= now();
$$;

create function quote_version_label(p_minor int) returns text
language sql immutable as $$ select '1.' || p_minor::text $$;

-- Funciones de la app ----------------------------------------------------------------------------------

-- Crea el quote del sitio con su borrador 1.0, desde el walkthrough cerrado (hito 3). Si ya existe, devuelve su id.
create function ensure_quote(p_site uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_quote uuid;
  w walkthroughs;
  v_lead uuid;
  v_contact text;
begin
  if not (has_permission('quotes_editar') and has_permission('quotes_ver_precios')) then
    raise exception 'No tienes permiso para armar quotes' using errcode = '42501';
  end if;
  select id into v_quote from quotes where site_id = p_site;
  if v_quote is not null then return v_quote; end if;
  select lead_id into v_lead from lead_sites where id = p_site;
  if v_lead is null then
    raise exception 'El sitio no existe' using errcode = 'P0002';
  end if;
  select * into w from walkthroughs where site_id = p_site;
  if w.id is null or w.current_version < 1 then
    raise exception 'El walkthrough del sitio no está cerrado' using errcode = '22023';
  end if;
  select nullif(btrim(lower(data->'contact'->>'email')), '') into v_contact
    from walkthrough_versions where walkthrough_id = w.id and version = w.current_version;
  insert into quotes (site_id, lead_id, walkthrough_id, created_by)
  values (p_site, v_lead, w.id, current_profile_id()) returning id into v_quote;
  insert into quote_versions (quote_id, minor, walkthrough_version, contact_email, created_by)
  values (v_quote, 0, w.current_version, v_contact, current_profile_id());
  insert into change_log (actor_id, action, entity, entity_id, detail)
  values (current_profile_id(), 'quote_creado', 'quotes', v_quote,
          jsonb_build_object('lead_id', v_lead, 'site_id', p_site));
  return v_quote;
end $$;

-- Guarda el borrador: renglones, tax, vigencia y correos opcionales. Los totales los calcula la base.
create function save_quote_draft(p_version uuid, p_lines jsonb, p_tax_rate numeric, p_valid_days int, p_recipients text[])
returns void
language plpgsql security definer set search_path = public as $$
declare
  v quote_versions;
  t record;
  clean text[];
begin
  if not (has_permission('quotes_editar') and has_permission('quotes_ver_precios')) then
    raise exception 'No tienes permiso para armar quotes' using errcode = '42501';
  end if;
  select * into v from quote_versions where id = p_version for update;
  if v.id is null then raise exception 'El quote no existe' using errcode = 'P0002'; end if;
  if v.status <> 'draft' then raise exception 'Solo se edita un borrador' using errcode = '22023'; end if;
  if not quote_lines_valid(p_lines) then raise exception 'Renglones no válidos' using errcode = '22023'; end if;
  if p_tax_rate is null or p_tax_rate < 0 or p_tax_rate > 100 then raise exception 'Tax no válido' using errcode = '22023'; end if;
  if p_valid_days is null or p_valid_days < 1 or p_valid_days > 365 then raise exception 'Vigencia no válida' using errcode = '22023'; end if;
  select coalesce(array_agg(distinct e), '{}') into clean
    from (select lower(btrim(x)) e from unnest(coalesce(p_recipients, '{}')) x) s where e <> '';
  if exists (select 1 from unnest(clean) e where e !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$') or cardinality(clean) > 10 then
    raise exception 'Correo no válido' using errcode = '22023';
  end if;
  select * into t from quote_totals(p_lines, p_tax_rate);
  update quote_versions
     set lines = p_lines, tax_rate = p_tax_rate, valid_days = p_valid_days, recipients = clean,
         subtotal = t.subtotal, discount = t.discount, tax = t.tax, total = t.total
   where id = p_version;
end $$;

-- Registra el SOW subido a quote-files para esta versión (obligatorio para enviar, D-005, D-209).
create function set_quote_sow(p_version uuid, p_path text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v quote_versions;
begin
  if not (has_permission('quotes_editar') and has_permission('sow_contratos_subir_ver')) then
    raise exception 'No tienes permiso para subir el SOW' using errcode = '42501';
  end if;
  select * into v from quote_versions where id = p_version for update;
  if v.id is null then raise exception 'El quote no existe' using errcode = 'P0002'; end if;
  if v.status <> 'draft' then raise exception 'Solo se cambia el SOW de un borrador' using errcode = '22023'; end if;
  if p_path is null or p_path !~ ('^' || v.quote_id || '/' || v.id || '/sow-[A-Za-z0-9_-]+\.pdf$') then
    raise exception 'Ruta del SOW no válida' using errcode = '22023';
  end if;
  if not exists (select 1 from storage.objects where bucket_id = 'quote-files' and name = p_path) then
    raise exception 'El SOW no está en el almacenamiento' using errcode = '22023';
  end if;
  update quote_versions set sow_path = p_path where id = p_version;
end $$;

-- Versión nueva (negociación o renovar un vencido; D-007, D-209): copia la última y queda en borrador.
create function new_quote_version(p_quote uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  last quote_versions;
  w walkthroughs;
  v_new uuid;
begin
  if not (has_permission('quotes_editar') and has_permission('quotes_ver_precios')) then
    raise exception 'No tienes permiso para armar quotes' using errcode = '42501';
  end if;
  perform expire_quotes();
  select * into last from quote_versions where quote_id = p_quote order by minor desc limit 1 for update;
  if last.id is null then raise exception 'El quote no existe' using errcode = 'P0002'; end if;
  if last.status in ('draft', 'accepted') then
    raise exception 'Este quote no admite una versión nueva' using errcode = '22023';
  end if;
  select wk.* into w from quotes q join walkthroughs wk on wk.id = q.walkthrough_id where q.id = p_quote;
  insert into quote_versions (quote_id, minor, walkthrough_version, lines, tax_rate, valid_days, contact_email,
                              recipients, subtotal, discount, tax, total, sow_path, created_by)
  values (p_quote, last.minor + 1, w.current_version, last.lines, last.tax_rate, last.valid_days, last.contact_email,
          last.recipients, last.subtotal, last.discount, last.tax, last.total, last.sow_path, current_profile_id())
  returning id into v_new;
  insert into change_log (actor_id, action, entity, entity_id, detail)
  values (current_profile_id(), 'quote_version_nueva', 'quotes', p_quote,
          jsonb_build_object('version', quote_version_label(last.minor + 1)));
  return v_new;
end $$;

-- Paso 1 del envío (con el JWT de quien envía): valida y devuelve lo que necesitan el PDF y el correo. No cambia nada.
create function prepare_send_quote(p_version uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v quote_versions;
  q quotes;
  l leads;
  s lead_sites;
  wv walkthrough_versions;
  v_to text[];
begin
  if not has_permission('quotes_enviar') then
    raise exception 'No tienes permiso para enviar quotes' using errcode = '42501';
  end if;
  select * into v from quote_versions where id = p_version;
  if v.id is null then raise exception 'El quote no existe' using errcode = 'P0002'; end if;
  if v.status <> 'draft' then raise exception 'Este quote ya se envió' using errcode = '22023'; end if;
  if jsonb_array_length(coalesce(v.lines->'services', '[]'::jsonb)) = 0 then
    raise exception 'El quote necesita al menos un servicio' using errcode = '22023';
  end if;
  if v.sow_path is null then raise exception 'Falta el SOW' using errcode = '22023'; end if;
  select array_agg(distinct e) into v_to from unnest(array_append(v.recipients, v.contact_email)) e where e is not null;
  if v_to is null or cardinality(v_to) = 0 then
    raise exception 'El quote no tiene a quién enviarse' using errcode = '22023';
  end if;
  select * into q from quotes where id = v.quote_id;
  select * into l from leads where id = q.lead_id;
  select * into s from lead_sites where id = q.site_id;
  select * into wv from walkthrough_versions where walkthrough_id = q.walkthrough_id and version = v.walkthrough_version;
  return jsonb_build_object(
    'version_id', v.id, 'quote_id', v.quote_id, 'version', quote_version_label(v.minor), 'language', l.language,
    'company', l.company, 'site', coalesce(nullif(btrim(s.name), ''), s.address),
    'address', coalesce(nullif(btrim(wv.data->'contact'->>'address'), ''), s.address),
    'frequency', wv.data->'frequency', 'lines', v.lines, 'tax_rate', v.tax_rate, 'subtotal', v.subtotal,
    'discount', v.discount, 'tax', v.tax, 'total', v.total, 'valid_days', v.valid_days,
    'expires_at', now() + make_interval(days => v.valid_days), 'recipients', to_jsonb(v_to));
end $$;

-- Paso 2 del envío (servidor, después de guardar el PDF): marca Enviado, crea el enlace y reemplaza la versión anterior.
create function confirm_send_quote(p_version uuid, p_actor uuid, p_pdf_path text, p_snapshot jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v quote_versions;
  q quotes;
  v_token text;
  v_expires timestamptz;
begin
  select * into v from quote_versions where id = p_version for update;
  if v.id is null or v.status <> 'draft' then raise exception 'Este quote ya se envió' using errcode = '22023'; end if;
  select * into q from quotes where id = v.quote_id;
  v_token := translate(rtrim(encode(extensions.gen_random_bytes(24), 'base64'), '='), '+/', '-_');
  v_expires := now() + make_interval(days => v.valid_days);
  -- Una versión nueva reemplaza a la anterior (D-209).
  update quote_versions set status = 'superseded'
   where quote_id = v.quote_id and id <> v.id and status in ('sent', 'viewed', 'changes_requested', 'expired');
  update quote_versions
     set status = 'sent', sent_at = now(), sent_by = p_actor, expires_at = v_expires, public_token = v_token,
         pdf_path = p_pdf_path, snapshot = p_snapshot
   where id = v.id;
  update leads set status = 'quote_sent'
   where id = q.lead_id and status in ('new', 'contacted', 'walkthrough_scheduled', 'walkthrough_done');
  insert into change_log (actor_id, action, entity, entity_id, detail)
  values (p_actor, 'quote_enviado', 'quotes', q.id, jsonb_build_object('version', quote_version_label(v.minor)));
  return jsonb_build_object('token', v_token, 'expires_at', v_expires);
end $$;

-- Reenviar el correo de una versión enviada (por ejemplo si falló el envío): devuelve los datos del correo.
create function quote_mail_data(p_version uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v quote_versions;
  v_to text[];
begin
  if not has_permission('quotes_enviar') then
    raise exception 'No tienes permiso para enviar quotes' using errcode = '42501';
  end if;
  perform expire_quotes();
  select * into v from quote_versions where id = p_version;
  if v.id is null then raise exception 'El quote no existe' using errcode = 'P0002'; end if;
  if v.status not in ('sent', 'viewed') then raise exception 'Este quote no está abierto' using errcode = '22023'; end if;
  select array_agg(distinct e) into v_to from unnest(array_append(v.recipients, v.contact_email)) e where e is not null;
  return jsonb_build_object('token', v.public_token, 'expires_at', v.expires_at, 'language', v.snapshot->>'language',
    'company', v.snapshot->>'company', 'site', v.snapshot->>'site', 'version', quote_version_label(v.minor),
    'recipients', to_jsonb(v_to));
end $$;

-- Detalle del quote de un sitio para la app (D-208): todas sus versiones. Sin quotes_ver_precios no hay montos.
create function get_site_quote(p_site uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  q quotes;
  prices boolean := has_permission('quotes_ver_precios');
  sow boolean := has_permission('sow_contratos_subir_ver');
  w walkthroughs;
  res jsonb;
begin
  if not (has_permission('quotes_ver') or has_permission('quotes_editar') or has_permission('quotes_enviar')) then
    raise exception 'No tienes permiso para ver quotes' using errcode = '42501';
  end if;
  perform expire_quotes();
  select * into w from walkthroughs where site_id = p_site;
  select * into q from quotes where site_id = p_site;
  if q.id is null then
    return jsonb_build_object('quote_id', null, 'walkthrough_closed', coalesce(w.current_version, 0) > 0, 'versions', '[]'::jsonb);
  end if;
  -- Quien ve el quote decidido lo da por visto en el Inicio (D-209: pendiente en el Inicio).
  update quote_versions set decision_seen_at = now()
   where quote_id = q.id and decided_at is not null and decision_seen_at is null;
  select jsonb_build_object(
    'quote_id', q.id, 'walkthrough_closed', coalesce(w.current_version, 0) > 0,
    'versions', coalesce(jsonb_agg(jsonb_build_object(
      'id', v.id, 'version', quote_version_label(v.minor), 'minor', v.minor, 'status', v.status,
      'lines', case when prices then v.lines else (
          select jsonb_build_object(
            'services', coalesce((select jsonb_agg(x - 'amount') from jsonb_array_elements(v.lines->'services') x), '[]'),
            'addons', coalesce((select jsonb_agg(x - 'amount') from jsonb_array_elements(v.lines->'addons') x), '[]'),
            'discounts', coalesce((select jsonb_agg(x - 'value') from jsonb_array_elements(v.lines->'discounts') x), '[]'))) end,
      'tax_rate', v.tax_rate, 'valid_days', v.valid_days,
      'subtotal', case when prices then v.subtotal end, 'discount', case when prices then v.discount end,
      'tax', case when prices then v.tax end, 'total', case when prices then v.total end,
      'contact_email', v.contact_email, 'recipients', to_jsonb(v.recipients),
      'has_sow', v.sow_path is not null, 'sow_path', case when sow then v.sow_path end,
      'pdf_path', case when prices then v.pdf_path end,
      'sent_at', v.sent_at, 'expires_at', v.expires_at, 'viewed_at', v.viewed_at, 'decided_at', v.decided_at,
      'sent_by', (select full_name from profiles where id = v.sent_by),
      'decision', (select jsonb_build_object('kind', d.kind, 'name', d.signer_name, 'title', d.signer_title,
                     'reason_es', r.label_es, 'reason_en', r.label_en, 'note', d.note, 'at', d.created_at, 'email', d.email)
                     from quote_decisions d left join lost_reasons r on r.id = d.reason_id where d.version_id = v.id)
    ) order by v.minor desc), '[]'::jsonb))
    into res
    from quote_versions v where v.quote_id = q.id;
  return res;
end $$;

-- Estado del quote de cada sitio de un lead, para la pestaña Sitios.
create function lead_quotes(p_lead uuid)
returns table (site_id uuid, walkthrough_closed boolean, status quote_status, version text)
language plpgsql security definer set search_path = public as $$
begin
  if not (has_permission('quotes_ver') or has_permission('quotes_editar') or has_permission('quotes_enviar')) then
    raise exception 'No tienes permiso para ver quotes' using errcode = '42501';
  end if;
  perform expire_quotes();
  return query
    select s.id, coalesce(w.current_version, 0) > 0, lv.status, quote_version_label(lv.minor)
      from lead_sites s
      left join walkthroughs w on w.site_id = s.id
      left join quotes q on q.site_id = s.id
      left join lateral (select * from quote_versions v where v.quote_id = q.id order by v.minor desc limit 1) lv on true
     where s.lead_id = p_lead
     order by s.created_at;
end $$;

-- Sugerencias para los renglones: lo que ya se usó antes (D-209).
create function quote_label_suggestions() returns table (section text, label text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not has_permission('quotes_editar') then
    raise exception 'No tienes permiso para armar quotes' using errcode = '42501';
  end if;
  return query
    select x.sec, x.lbl from (
      select sec, btrim(item->>'label') lbl, count(*) n
        from quote_versions v, unnest(array['services', 'addons', 'discounts']) sec,
             jsonb_array_elements(coalesce(v.lines->sec, '[]'::jsonb)) item
       group by 1, 2) x
     order by x.sec, x.n desc, x.lbl
     limit 300;
end $$;

-- Pendientes del Inicio (D-209, D-131): decisiones del cliente sin ver y quotes que vencen en 3 días o menos (Urgente).
create function home_quote_pending()
returns table (kind text, version_id uuid, lead_id uuid, company text, site text, at timestamptz)
language plpgsql security definer set search_path = public as $$
begin
  if not (has_permission('quotes_ver') or has_permission('quotes_editar') or has_permission('quotes_enviar')) then
    return;
  end if;
  perform expire_quotes();
  return query
    select (case when v.decided_at is not null and v.decision_seen_at is null then v.status::text else 'expiring' end),
           v.id, q.lead_id, l.company, coalesce(nullif(btrim(s.name), ''), s.address),
           coalesce(v.decided_at, v.expires_at)
      from quote_versions v
      join quotes q on q.id = v.quote_id
      join leads l on l.id = q.lead_id
      join lead_sites s on s.id = q.site_id
     where (v.decided_at is not null and v.decision_seen_at is null)
        or (v.status in ('sent', 'viewed') and v.expires_at <= now() + interval '3 days')
     order by coalesce(v.decided_at, v.expires_at) desc;
end $$;

-- Un lead o sitio con un quote enviado no se borra: es la historia del cliente.
create function quote_block_delete() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from quotes q join quote_versions v on v.quote_id = q.id
              where (case when tg_table_name = 'leads' then q.lead_id else q.site_id end) = old.id and v.status <> 'draft') then
    raise exception 'Tiene un quote enviado y no se puede eliminar' using errcode = '23514';
  end if;
  return old;
end $$;
create trigger leads_quote_block before delete on leads for each row execute function quote_block_delete();
create trigger lead_sites_quote_block before delete on lead_sites for each row execute function quote_block_delete();

-- Funciones del portal (solo la Edge Function quote-portal, con la service role) --------------------------

-- Versión por su enlace y su estado para el portal.
create function portal_state(p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v quote_versions;
begin
  perform expire_quotes();
  select * into v from quote_versions where public_token = p_token;
  if v.id is null then return jsonb_build_object('state', 'not_found'); end if;
  return jsonb_build_object(
    'state', case v.status when 'sent' then 'open' when 'viewed' then 'open' when 'superseded' then 'superseded'
                           when 'expired' then 'expired' when 'changes_requested' then 'changes_requested'
                           else 'decided' end,
    'language', v.snapshot->>'language');
end $$;

-- Pedir código: solo para los correos del quote (D-209); 5 códigos por hora; vale 10 minutos (D-129).
create function portal_request_code(p_token text, p_email text, p_code_hash text) returns text
language plpgsql security definer set search_path = public as $$
declare
  v quote_versions;
  e text := lower(btrim(coalesce(p_email, '')));
begin
  perform expire_quotes();
  select * into v from quote_versions where public_token = p_token for update;
  if v.id is null or v.status not in ('sent', 'viewed') then return 'closed'; end if;
  if not (e = v.contact_email or e = any (v.recipients)) then return 'not_recipient'; end if;
  if (select count(*) from quote_portal_codes where version_id = v.id and email = e
       and created_at > now() - interval '1 hour') >= 5 then
    return 'rate_limited';
  end if;
  insert into quote_portal_codes (version_id, email, code_hash, expires_at)
  values (v.id, e, p_code_hash, now() + interval '10 minutes');
  return 'sent';
end $$;

-- Verificar el código: tras 5 intentos fallidos queda bloqueado hasta pedir uno nuevo (D-209). Si es correcto abre
-- una sesión (se guarda el hash del token) y el quote pasa a Visto.
create function portal_verify_code(p_token text, p_email text, p_code_hash text, p_session_hash text) returns text
language plpgsql security definer set search_path = public as $$
declare
  v quote_versions;
  c quote_portal_codes;
  e text := lower(btrim(coalesce(p_email, '')));
begin
  perform expire_quotes();
  select * into v from quote_versions where public_token = p_token for update;
  if v.id is null or v.status not in ('sent', 'viewed') then return 'closed'; end if;
  select * into c from quote_portal_codes where version_id = v.id and email = e order by seq desc limit 1 for update;
  if c.id is null or c.used_at is not null then return 'expired'; end if;
  if c.attempts >= 5 then return 'locked'; end if;
  if c.expires_at <= now() then return 'expired'; end if;
  if c.code_hash <> p_code_hash then
    update quote_portal_codes set attempts = attempts + 1 where id = c.id;
    return case when c.attempts + 1 >= 5 then 'locked' else 'wrong' end;
  end if;
  update quote_portal_codes set used_at = now() where id = c.id;
  insert into quote_portal_sessions (token_hash, version_id, email, expires_at)
  values (p_session_hash, v.id, e, least(now() + interval '2 hours', v.expires_at));
  if v.status = 'sent' then
    update quote_versions set status = 'viewed', viewed_at = now() where id = v.id;
    insert into change_log (actor_id, action, entity, entity_id, detail)
    values (null, 'quote_visto', 'quotes', v.quote_id, jsonb_build_object('version', quote_version_label(v.minor)));
  end if;
  return 'ok';
end $$;

-- Lo que ve el cliente (sin datos internos: ni notas internas, ni quién lo armó, ni montos de otros).
create function portal_quote(p_session_hash text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  ses quote_portal_sessions;
  v quote_versions;
  t terms_documents;
begin
  perform expire_quotes();
  select * into ses from quote_portal_sessions where token_hash = p_session_hash and expires_at > now();
  if ses.token_hash is null then return null; end if;
  select * into v from quote_versions where id = ses.version_id;
  select * into t from terms_documents where kind = 'portal' order by version desc limit 1;
  return jsonb_build_object(
    'status', v.status, 'version', quote_version_label(v.minor), 'language', v.snapshot->>'language',
    'company', v.snapshot->>'company', 'site', v.snapshot->>'site', 'address', v.snapshot->>'address',
    'frequency', v.snapshot->'frequency', 'lines', v.lines, 'tax_rate', v.tax_rate,
    'subtotal', v.subtotal, 'discount', v.discount, 'tax', v.tax, 'total', v.total,
    'sent_at', v.sent_at, 'expires_at', v.expires_at, 'sow_opened', ses.sow_opened_at is not null,
    'terms_version', t.version,
    'reasons', (select coalesce(jsonb_agg(jsonb_build_object('id', r.id,
                  'label', case when v.snapshot->>'language' = 'es' then r.label_es else r.label_en end) order by r.sort), '[]')
                  from lost_reasons r where r.active),
    'decision', (select jsonb_build_object('kind', d.kind, 'name', d.signer_name, 'at', d.created_at)
                   from quote_decisions d where d.version_id = v.id));
end $$;

-- Archivo para el cliente: el SOW (marca la lectura, D-042) o el PDF del quote o los términos del portal.
create function portal_file(p_session_hash text, p_kind text) returns text
language plpgsql security definer set search_path = public as $$
declare
  ses quote_portal_sessions;
  v quote_versions;
begin
  select * into ses from quote_portal_sessions where token_hash = p_session_hash and expires_at > now() for update;
  if ses.token_hash is null then return null; end if;
  select * into v from quote_versions where id = ses.version_id;
  if p_kind = 'sow' then
    update quote_portal_sessions set sow_opened_at = coalesce(sow_opened_at, now()) where token_hash = p_session_hash;
    return v.sow_path;
  elsif p_kind = 'pdf' then
    return v.pdf_path;
  elsif p_kind = 'terms' then
    return (select file_path from terms_documents where kind = 'portal' order by version desc limit 1);
  end if;
  return null;
end $$;

-- Decisión del cliente (D-007, D-045, D-046, D-095, D-209). Aceptar exige haber abierto el SOW en esta sesión,
-- la casilla, nombre y cargo; rechazar exige un motivo; pedir cambios, una nota o un motivo.
create function portal_decide(p_session_hash text, p_kind text, p_name text, p_title text, p_reason uuid,
                              p_note text, p_read_confirmed boolean, p_ip text, p_user_agent text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  ses quote_portal_sessions;
  v quote_versions;
  q quotes;
  l leads;
  s lead_sites;
  wv walkthrough_versions;
  v_client uuid;
  v_jobsite uuid;
  v_terms uuid;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_open int;
begin
  perform expire_quotes();
  select * into ses from quote_portal_sessions where token_hash = p_session_hash and expires_at > now();
  if ses.token_hash is null then raise exception 'Sesión vencida' using errcode = '42501'; end if;
  select * into v from quote_versions where id = ses.version_id for update;
  if v.status not in ('sent', 'viewed') then raise exception 'El quote ya no está abierto' using errcode = '22023'; end if;
  if p_kind not in ('accepted', 'rejected', 'changes_requested') then raise exception 'Decisión no válida' using errcode = '22023'; end if;
  if v_note is not null and length(v_note) > 2000 then raise exception 'Nota muy larga' using errcode = '22023'; end if;
  if p_reason is not null and not exists (select 1 from lost_reasons where id = p_reason and active) then
    raise exception 'Motivo no válido' using errcode = '22023';
  end if;
  if p_kind = 'accepted' then
    if ses.sow_opened_at is null then raise exception 'Abre el SOW para poder continuar' using errcode = '22023'; end if;
    if not coalesce(p_read_confirmed, false) or btrim(coalesce(p_name, '')) = '' or btrim(coalesce(p_title, '')) = ''
       or length(p_name) > 120 or length(p_title) > 120 then
      raise exception 'Faltan datos para aceptar' using errcode = '22023';
    end if;
  elsif p_kind = 'rejected' and p_reason is null then
    raise exception 'Falta el motivo' using errcode = '22023';
  elsif p_kind = 'changes_requested' and p_reason is null and v_note is null then
    raise exception 'Falta el motivo o la nota' using errcode = '22023';
  end if;

  select id into v_terms from terms_documents where kind = 'portal' order by version desc limit 1;
  insert into quote_decisions (version_id, kind, email, signer_name, signer_title, reason_id, note, sow_read_at,
                               read_confirmed, terms_document_id, ip, user_agent)
  values (v.id, p_kind, ses.email, nullif(btrim(coalesce(p_name, '')), ''), nullif(btrim(coalesce(p_title, '')), ''),
          p_reason, v_note, ses.sow_opened_at, coalesce(p_read_confirmed, false),
          case when p_kind = 'accepted' then v_terms end, left(p_ip, 100), left(p_user_agent, 400));
  update quote_versions set status = p_kind::quote_status, decided_at = now() where id = v.id;

  select * into q from quotes where id = v.quote_id;
  select * into l from leads where id = q.lead_id for update;
  select * into s from lead_sites where id = q.site_id;

  if p_kind = 'accepted' then
    -- Nace el Cliente (uno por lead) con este Jobsite (D-209).
    select id into v_client from clients where lead_id = l.id;
    if v_client is null then
      insert into clients (lead_id, name, created_by) values (l.id, l.company, v.sent_by) returning id into v_client;
      insert into change_log (actor_id, action, entity, entity_id, detail)
      values (null, 'cliente_creado', 'clients', v_client, jsonb_build_object('company', l.company));
    end if;
    select * into wv from walkthrough_versions where walkthrough_id = q.walkthrough_id and version = v.walkthrough_version;
    insert into jobsites (client_id, site_id, name, address, contact_name, contact_phone, contact_email, frequency,
                          walkthrough_id, walkthrough_version, created_by)
    values (v_client, s.id, coalesce(nullif(btrim(s.name), ''), s.address),
            coalesce(nullif(btrim(wv.data->'contact'->>'address'), ''), s.address),
            nullif(btrim(wv.data->'contact'->>'contactName'), ''), nullif(btrim(wv.data->'contact'->>'phone'), ''),
            coalesce(nullif(lower(btrim(wv.data->'contact'->>'email')), ''), v.contact_email),
            wv.data->'frequency', q.walkthrough_id, v.walkthrough_version, v.sent_by)
    returning id into v_jobsite;
    insert into jobsite_rates (jobsite_id, monthly_rate, quote_version_id, set_by) values (v_jobsite, v.total, v.id, v.sent_by);
    insert into change_log (actor_id, action, entity, entity_id, detail)
    values (null, 'jobsite_creado', 'jobsites', v_jobsite, jsonb_build_object('company', l.company, 'name', s.name));
    if l.status <> 'won' then
      update leads set status = 'won' where id = l.id;
    end if;
  elsif p_kind = 'changes_requested' then
    if l.status not in ('won', 'lost') then update leads set status = 'negotiation' where id = l.id; end if;
  else
    -- Perdido solo cuando no queda ningún sitio abierto (D-209): todos con su último quote rechazado.
    select count(*) into v_open
      from lead_sites ls
      left join quotes qq on qq.site_id = ls.id
      left join lateral (select status from quote_versions x where x.quote_id = qq.id order by x.minor desc limit 1) lv on true
     where ls.lead_id = l.id and (lv.status is null or lv.status <> 'rejected');
    if v_open = 0 and l.status not in ('won', 'lost') then
      update leads set status = 'lost', lost_reason_id = p_reason, lost_note = v_note where id = l.id;
    end if;
  end if;

  insert into change_log (actor_id, action, entity, entity_id, detail)
  values (null, case p_kind when 'accepted' then 'quote_aceptado' when 'rejected' then 'quote_rechazado'
                            else 'quote_cambios_pedidos' end,
          'quotes', q.id, jsonb_build_object('version', quote_version_label(v.minor), 'company', l.company));

  return jsonb_build_object(
    'kind', p_kind, 'company', l.company, 'site', coalesce(nullif(btrim(s.name), ''), s.address),
    'version', quote_version_label(v.minor), 'lead_id', l.id, 'quote_id', q.id, 'jobsite_id', v_jobsite,
    'sow_path', v.sow_path,
    'sender_email', (select email from profiles where id = v.sent_by),
    'sender_language', (select language from profiles where id = v.sent_by));
end $$;

-- El SOW copiado al Jobsite al aceptar (D-209); lo llama la Edge Function después de copiar el archivo.
create function portal_attach_jobsite_sow(p_jobsite uuid, p_path text, p_version uuid) returns void
language sql security definer set search_path = public as $$
  insert into jobsite_documents (jobsite_id, kind, file_path, version, source_quote_version)
  values (p_jobsite, 'sow', p_path, 1, p_version);
$$;

-- Permisos de ejecución.
revoke execute on function quote_lines_valid(jsonb), quote_totals(jsonb, numeric), expire_quotes(),
  quote_version_label(int), confirm_send_quote(uuid, uuid, text, jsonb), quote_block_delete(),
  portal_state(text), portal_request_code(text, text, text), portal_verify_code(text, text, text, text),
  portal_quote(text), portal_file(text, text),
  portal_decide(text, text, text, text, uuid, text, boolean, text, text),
  portal_attach_jobsite_sow(uuid, text, uuid) from public, anon, authenticated;
grant execute on function quote_lines_valid(jsonb), quote_totals(jsonb, numeric), quote_version_label(int) to authenticated;
revoke execute on function ensure_quote(uuid), save_quote_draft(uuid, jsonb, numeric, int, text[]),
  set_quote_sow(uuid, text), new_quote_version(uuid), prepare_send_quote(uuid), quote_mail_data(uuid),
  get_site_quote(uuid), lead_quotes(uuid), quote_label_suggestions(), home_quote_pending() from public, anon;
grant execute on function ensure_quote(uuid), save_quote_draft(uuid, jsonb, numeric, int, text[]),
  set_quote_sow(uuid, text), new_quote_version(uuid), prepare_send_quote(uuid), quote_mail_data(uuid),
  get_site_quote(uuid), lead_quotes(uuid), quote_label_suggestions(), home_quote_pending() to authenticated;
